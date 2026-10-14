"""Bounded, deterministic samples from the full CSV; existing exact summaries stay intact."""
from __future__ import annotations
import argparse
import json
import re
import tempfile
import unicodedata
from pathlib import Path
import pandas as pd

CLIMATE = ["Temperature(F)", "Humidity(%)", "Pressure(in)", "Visibility(mi)", "Wind_Speed(mph)", "Precipitation(in)"]
ROAD = ["Distance(mi)", "Traffic_Signal", "Crossing", "Junction", "Stop", "Station", "Amenity", "Railway"]
COLUMNS = ["ID", "State", "County", "City", "Source", "year", "Severity", "Start_Lat", "Start_Lng"] + CLIMATE + ROAD + ["hour", "weekday"]
STRATA = ["Source", "year"]
WEEKDAYS = {name: index for index, name in enumerate(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])}


def add_temporal(frame):
    """Use recorded hour/day; derive from Start_Time only when fields are absent."""
    times = None
    if ("hour" not in frame or not ({"weekday", "day_of_week"} & set(frame.columns))) and "Start_Time" in frame:
        times = pd.to_datetime(frame.Start_Time, format="mixed", errors="coerce", utc=True)
    hour = pd.to_numeric(frame.hour, errors="coerce") if "hour" in frame else (times.dt.hour if times is not None else pd.Series(float("nan"), index=frame.index))
    if "weekday" in frame:
        weekday = pd.to_numeric(frame.weekday, errors="coerce")
    elif "day_of_week" in frame:
        weekday = frame.day_of_week.astype("string").str.strip().str.title().map(WEEKDAYS)
    else:
        weekday = times.dt.dayofweek if times is not None else pd.Series(float("nan"), index=frame.index)
    frame["hour"] = hour.where(hour.between(0,23) & hour.eq(hour.round()))
    frame["weekday"] = weekday.where(weekday.between(0,6) & weekday.eq(weekday.round()))
    return frame


def slugify(value):
    value = unicodedata.normalize("NFKD", str(value))
    value = "".join(c for c in value if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", value)).strip("_") or "sin_nombre"


def bottom(frame, keys, limit):
    return frame.sort_values("_rank").groupby(keys, dropna=False, sort=False).head(limit)


def county_sample(frame, county_limit, city_limit):
    # Union preserves unbiased county bottom-k as well as separate city bottom-k.
    return pd.concat([bottom(frame, STRATA, county_limit), bottom(frame, ["City"] + STRATA, city_limit)]).drop_duplicates("_rank")


def write_sample(path, frame, limit, population):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = frame[COLUMNS].astype(object).where(pd.notna(frame[COLUMNS]), None)
    payload = {"columns": COLUMNS, "rows": data.values.tolist(), "sampling": "bottom-k hash of ID per Source/year", "limit_per_stratum": limit, "population": population}
    staging = path.with_suffix(".json.tmp")
    staging.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
    staging.replace(path)


def build(args):
    if min(args.chunksize, args.state_limit, args.county_limit, args.city_limit) < 1:
        raise ValueError("Los tamaños de bloque y muestra deben ser positivos")
    source, output = Path(args.input), Path(args.output)
    header = pd.read_csv(source, nrows=0).columns
    required = {"ID", "State", "County", "City", "Source", "Severity", "Start_Lat", "Start_Lng"}
    missing = required - set(header)
    if missing:
        raise ValueError(f"Faltan columnas: {sorted(missing)}")
    columns = [c for c in COLUMNS if c in header]
    columns += [c for c in ["day_of_week", "Start_Time"] if c in header and c not in columns]
    if "year" not in header:
        if "Start_Time" not in header:
            raise ValueError("Se requiere year o Start_Time")
        if "Start_Time" not in columns:
            columns.append("Start_Time")
    output.mkdir(parents=True, exist_ok=True)
    state_frames = {}
    population, city_population = {}, {}
    processed = 0
    # Unique owned temporary directory; cleanup never touches data/processed.
    with tempfile.TemporaryDirectory(prefix="explorer-", dir=output) as temp:
        temp = Path(temp)
        for number, frame in enumerate(pd.read_csv(source, usecols=columns, chunksize=args.chunksize, low_memory=False), 1):
            processed += len(frame)
            for c in ["ID", "State", "County", "City", "Source"]:
                frame[c] = frame[c].fillna("").astype(str).str.strip()
            if "year" not in frame:
                frame["year"] = pd.to_datetime(frame["Start_Time"], format="mixed", errors="coerce", utc=True).dt.year
            frame = add_temporal(frame)
            for c in COLUMNS:
                if c not in frame:
                    frame[c] = None
            for c in CLIMATE + ["Distance(mi)", "Severity", "Start_Lat", "Start_Lng", "year"]:
                frame[c] = pd.to_numeric(frame[c], errors="coerce").replace([float("inf"), float("-inf")], float("nan"))
            for c in ROAD[1:]:
                values = frame[c].astype("string").str.lower()
                frame[c] = values.map({"true": 1, "false": 0, "1": 1, "0": 0, "1.0": 1, "0.0": 0})
            frame = frame[frame.State.ne("")].copy()
            frame["_rank"] = pd.util.hash_pandas_object(frame.ID, index=False).to_numpy()
            for state, group in frame.groupby("State", sort=False):
                combined = pd.concat([state_frames[state], bottom(group, STRATA, args.state_limit)]) if state in state_frames else group
                state_frames[state] = bottom(combined, STRATA, args.state_limit).copy()
            frame["_county_slug"] = frame.County.map(slugify)
            for (state, county), group in frame[frame.County.ne("")].groupby(["State", "_county_slug"], sort=False):
                key = (state, county)
                population[key] = population.get(key, 0) + len(group)
                for city, size in group.groupby("City", sort=False).size().items():
                    city_key = (state, county, city)
                    city_population[city_key] = city_population.get(city_key, 0) + int(size)
                path = temp / state / f"{county}.csv"
                path.parent.mkdir(parents=True, exist_ok=True)
                subset = county_sample(group, args.county_limit, args.city_limit)
                subset[COLUMNS + ["_rank"]].to_csv(path, mode="a", header=not path.exists(), index=False)
            print(f"Lectura {number}: {processed:,} registros", flush=True)
        for state, frame in state_frames.items():
            write_sample(output / "states" / state / "sample.json", frame, args.state_limit, None)
        del state_frames
        for index, ((state, county), total) in enumerate(population.items(), 1):
            path = temp / state / f"{county}.csv"
            selected = None
            for frame in pd.read_csv(path, chunksize=args.chunksize, dtype={"_rank": "uint64"}, keep_default_na=False, na_values=[""], low_memory=False):
                for c in ["ID", "State", "County", "City", "Source"]:
                    frame[c] = frame[c].fillna("")
                selected = county_sample(pd.concat([selected, frame]) if selected is not None else frame, args.county_limit, args.city_limit)
            base = output / "states" / state / "counties" / county
            write_sample(base / "sample.json", bottom(selected, STRATA, args.county_limit), args.county_limit, total)
            # Collision-free city filenames: manifest maps exact city names to sequential IDs.
            cities = {}
            for city_id, (city, frame) in enumerate(selected.groupby("City", sort=True)):
                if not city:
                    continue
                cities[city] = str(city_id)
                write_sample(base / "cities" / f"{city_id}.json", bottom(frame, STRATA, args.city_limit), args.city_limit, city_population.get((state, county, city), 0))
            (base / "cities.json").write_text(json.dumps(cities, ensure_ascii=False), encoding="utf-8")
            if index % 100 == 0:
                print(f"Áreas exportadas: {index}/{len(population)}", flush=True)
    manifest = {"version": 2, "rows_processed": processed, "columns": COLUMNS, "climate": CLIMATE, "road": ROAD, "state_limit": args.state_limit, "county_limit": args.county_limit, "city_limit": args.city_limit}
    staging = output / "manifest.json.tmp"
    staging.write_text(json.dumps(manifest), encoding="utf-8")
    staging.replace(output / "manifest.json")
    print(f"Listo: {processed:,} filas; {len(population):,} condados. {output.resolve()}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="data/explorer")
    parser.add_argument("--chunksize", type=int, default=250000)
    parser.add_argument("--state-limit", type=int, default=300)
    parser.add_argument("--county-limit", type=int, default=200)
    parser.add_argument("--city-limit", type=int, default=64)
    build(parser.parse_args())
