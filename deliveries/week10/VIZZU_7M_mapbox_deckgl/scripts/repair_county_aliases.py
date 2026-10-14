"""Recover city summaries overwritten by spelling aliases in the original exporter."""
import argparse
import json
from collections import Counter
from pathlib import Path
import pandas as pd
from build_explorer import slugify


def repair(source, root):
    aliases = {}
    canonical = {}
    for path in (root / "processed/states").glob("*/counties_summary.json"):
        names = {}
        for row in json.loads(path.read_text(encoding="utf-8")):
            names.setdefault(row["county_slug"], set()).add(row["County"])
        for slug, variants in names.items():
            if len(variants) < 2:
                continue
            state = path.parent.name
            canonical[(state,slug)] = sorted(variants)[0]
            for name in variants:
                aliases[state + "|" + name] = slug
    if not aliases:
        print("No se encontraron aliases con carpetas compartidas.")
        return
    print(f"Reconstruyendo {len(canonical)} condados con aliases.",flush=True)
    counts, high, lat, lng, coord_n = [Counter() for _ in range(5)]
    needed = {"State","County","City","Source","year","Start_Time","Severity","high_impact","Start_Lat","Start_Lng"}
    for index, frame in enumerate(pd.read_csv(source,usecols=lambda c:c in needed,chunksize=250000,low_memory=False),1):
        for c in ["State","County","City","Source"]:
            frame[c] = frame[c].fillna("").astype(str).str.strip()
        keys = frame.State + "|" + frame.County
        frame = frame[keys.isin(aliases)].copy()
        if frame.empty:
            continue
        frame["slug"] = (frame.State + "|" + frame.County).map(aliases)
        if "year" not in frame:
            frame["year"] = pd.to_datetime(frame.Start_Time,format="mixed",errors="coerce",utc=True).dt.year
        frame = frame[frame.City.ne("")].copy()
        frame["year"] = pd.to_numeric(frame.year,errors="coerce").fillna(-1).astype(int)
        frame["_high"] = frame.high_impact.astype(str).str.lower().isin(["true","1","t","yes","y"]) if "high_impact" in frame else pd.to_numeric(frame.Severity,errors="coerce").ge(3)
        group = ["State","slug","City","Source","year"]
        for key, amount in frame.groupby(group,dropna=False).size().items():
            counts[key] += int(amount)
        for key, amount in frame.groupby(group,dropna=False)["_high"].sum().items():
            high[key] += int(amount)
        frame["Start_Lat"] = pd.to_numeric(frame.Start_Lat,errors="coerce")
        frame["Start_Lng"] = pd.to_numeric(frame.Start_Lng,errors="coerce")
        valid = frame[frame.Start_Lat.notna() & frame.Start_Lng.notna()]
        for key, amount in valid.groupby(group,dropna=False).size().items():
            coord_n[key] += int(amount)
        for key, amount in valid.groupby(group,dropna=False).Start_Lat.sum().items():
            lat[key] += float(amount)
        for key, amount in valid.groupby(group,dropna=False).Start_Lng.sum().items():
            lng[key] += float(amount)
        if index % 5 == 0:
            print(f"Bloques revisados: {index}",flush=True)
    by_county = {}
    for key,total in counts.items():
        state,slug,city,source,year = key
        n = coord_n[key]
        by_county.setdefault((state,slug),[]).append({"State":state,"County":canonical[(state,slug)],"City":city,"Source":source,"year":year if year != -1 else "","total":total,"high":high[key],"lat":lat[key]/n if n else None,"lng":lng[key]/n if n else None,"coord_n":n})
    for (state,slug), rows in by_county.items():
        path = root / "processed/states" / state / "counties" / slug / "cities_summary.json"
        backup = root / "summary_backup" / state / f"{slug}.json"
        if not backup.exists():
            backup.parent.mkdir(parents=True,exist_ok=True)
            backup.write_bytes(path.read_bytes())
        staging = path.with_suffix(".json.tmp")
        staging.write_text(json.dumps(rows,ensure_ascii=False,allow_nan=False,separators=(",",":")),encoding="utf-8")
        staging.replace(path)
    print(f"Resúmenes recuperados: {len(by_county)}. Copias previas: {root / 'summary_backup'}",flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",required=True)
    parser.add_argument("--data-root",default="data")
    args = parser.parse_args()
    repair(args.input,Path(args.data_root))
