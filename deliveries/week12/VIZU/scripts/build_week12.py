from __future__ import annotations

import argparse
import json
import re
import shutil
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

FLAGS = ["Traffic_Signal", "Crossing", "Junction", "Stop", "Station", "Amenity"]
WEATHER = ["Clear/Fair", "Cloudy", "Rain", "Snow/Ice", "Fog/Low visibility", "Storm", "Other", "Sin dato"]
SOURCES = ["Source1", "Source2", "Source3"]
START_YEAR = 2016
COLUMNS = ["ID", "Source", "Severity", "Start_Time", "State", "County", "City", "Weather_Condition"] + FLAGS
LEVELS = {"usa": [], "state": ["State"], "county": ["State", "cslug"]}


def slugify(value):
    value = "" if value is None else str(value)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c)).lower().strip()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return re.sub(r"_+", "_", value).strip("_") or "sin_nombre"


def weather_group(series):
    text = series.fillna("").astype("string").str.lower()
    out = pd.Series("Other", index=series.index, dtype="string")
    out[text.str.contains(r"rain|drizzle|shower", regex=True)] = "Rain"
    out[text.str.contains(r"snow|sleet|wintry|ice", regex=True)] = "Snow/Ice"
    out[text.str.contains(r"fog|mist|haze|smoke", regex=True)] = "Fog/Low visibility"
    out[text.str.contains(r"thunder|storm|tornado", regex=True)] = "Storm"
    out[text.str.contains(r"cloud|overcast", regex=True)] = "Cloudy"
    out[text.str.contains(r"clear|fair", regex=True)] = "Clear/Fair"
    out[text.eq("")] = "Sin dato"
    return out


def as_bool(series):
    return series.astype("string").str.strip().str.lower().isin(["true", "1", "t", "yes", "y"])


def clean(df):
    df = df[df["State"].notna() & df["State"].ne("") & df["Start_Time"].notna()].copy()
    time = df["Start_Time"].astype("string")
    year = pd.to_numeric(time.str.slice(0, 4), errors="coerce")
    month = pd.to_numeric(time.str.slice(5, 7), errors="coerce")
    df["m"] = (year - START_YEAR) * 12 + month - 1
    df["d"] = pd.to_datetime(time.str.slice(0, 10), format="%Y-%m-%d", errors="coerce").dt.day_of_week
    df["hr"] = pd.to_numeric(time.str.slice(11, 13), errors="coerce")
    df = df[df["m"].ge(0) & df["d"].notna() & df["hr"].between(0, 23)].copy()

    df["s"] = df["Source"].map({name: i for i, name in enumerate(SOURCES)})
    df = df[df["s"].notna()].copy()
    for column in ["m", "d", "hr", "s"]:
        df[column] = df[column].astype("int16")

    df["h"] = pd.to_numeric(df["Severity"], errors="coerce").ge(3).astype("int32")
    df["t"] = np.int32(1)
    df["w"] = weather_group(df["Weather_Condition"]).map({name: i for i, name in enumerate(WEATHER)}).astype("int16")

    county = df["County"].fillna("")
    df["cslug"] = county.map(slugify).where(county.ne(""), "")
    df["City"] = df["City"].fillna("").astype("string").str.strip()
    for flag in FLAGS:
        df[flag] = as_bool(df[flag])
    return df


def tables(df):
    out = {}
    for level, keys in LEVELS.items():
        base = df[df["cslug"].ne("")] if level == "county" else df
        out[(level, "T")] = base.groupby(keys + ["s", "m"])[["t", "h"]].sum()
        out[(level, "W")] = base.groupby(keys + ["s", "m", "w"])[["t", "h"]].sum()
        out[(level, "H")] = base[base["h"].eq(1)].groupby(keys + ["s", "m", "d", "hr"])[["h"]].sum()

        per_flag = []
        for i, flag in enumerate(FLAGS):
            group = base[base[flag]].groupby(keys + ["s", "m"])[["t", "h"]].sum()
            group["f"] = i
            per_flag.append(group.set_index("f", append=True))
        out[(level, "I")] = pd.concat(per_flag)

    cities = df[df["cslug"].ne("") & df["City"].ne("")]
    out[("city", "T")] = cities.groupby(["State", "cslug", "City", "s", "m"])[["t", "h"]].sum()
    return out


def merge(acc, new):
    for key, frame in new.items():
        acc[key] = frame if key not in acc else pd.concat([acc[key], frame])
    return acc


def compact(acc):
    return {key: frame.groupby(level=list(range(frame.index.nlevels))).sum() for key, frame in acc.items()}


def sub(frame, key):
    if not key:
        return frame
    try:
        return frame.xs(key, level=tuple(range(len(key))), drop_level=True)
    except KeyError:
        return frame.iloc[:0].droplevel(list(range(len(key))))


def columns(frame, names):
    frame = frame.reset_index()
    return {name: frame[name].astype(int).tolist() for name in names}


def payload(acc, level, key, children):
    def part(name, cols):
        return columns(sub(acc[(level, name)], key), cols)

    body = {
        "T": part("T", ["s", "m", "t", "h"]),
        "I": part("I", ["s", "m", "f", "t", "h"]),
        "H": part("H", ["s", "m", "d", "hr", "h"]),
        "W": part("W", ["s", "m", "w", "t", "h"]),
    }
    names, frame = children
    frame = frame.reset_index()
    index = {name: i for i, name in enumerate(names)}
    body["areas"] = {
        "names": names,
        "a": frame[frame.columns[0]].map(index).astype(int).tolist(),
        **{name: frame[name].astype(int).tolist() for name in ["s", "m", "t", "h"]},
    }
    return body


def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="data/w12")
    parser.add_argument("--chunksize", type=int, default=500000)
    args = parser.parse_args()

    src = Path(args.input)
    out = Path(args.output)
    if not src.exists():
        raise FileNotFoundError(src)
    if out.exists():
        shutil.rmtree(out)

    acc = {}
    months = 0
    rows = 0
    id_month = np.full(8_000_000, 255, dtype=np.uint8)
    reader = pd.read_csv(src, usecols=COLUMNS, dtype={c: "string[pyarrow]" for c in COLUMNS}, chunksize=args.chunksize)
    for n, raw in enumerate(reader, 1):
        df = clean(raw)
        rows += len(df)
        months = max(months, int(df["m"].max()) + 1)

        number = pd.to_numeric(df["ID"].str.slice(2), errors="coerce")
        ok = number.notna() & number.lt(len(id_month)) & df["m"].lt(255)
        id_month[number[ok].astype(np.int64).to_numpy()] = df.loc[ok, "m"].astype(np.uint8).to_numpy()

        acc = merge(acc, tables(df))
        if n % 4 == 0:
            acc = compact(acc)
        print(f"Bloque {n:02d}: {rows:,} filas", flush=True)

    acc = compact(acc)
    labels = [f"{START_YEAR + i // 12}-{i % 12 + 1:02d}" for i in range(months)]
    last_id = int(np.flatnonzero(id_month != 255).max()) + 1
    out.mkdir(parents=True, exist_ok=True)
    (out / "id_month.bin").write_bytes(id_month[:last_id].tobytes())

    states = acc[("state", "T")].groupby(level=[0, 1, 2]).sum()
    state_names = sorted(states.index.get_level_values(0).unique())
    meta = {"months": labels, "sources": SOURCES, "flags": FLAGS, "weather": WEATHER, "rows": rows, "high_rule": "Severity >= 3"}
    write_json(out / "usa.json", {"meta": meta, **payload(acc, "usa", None, (state_names, states))})

    counties = acc[("county", "T")]
    cities = acc[("city", "T")]
    for state in state_names:
        local = sub(counties, (state,))
        slugs = sorted(local.index.get_level_values(0).unique())
        write_json(out / "states" / f"{state}.json", payload(acc, "state", (state,), (slugs, local)))
        for slug in slugs:
            city = sub(cities, (state, slug))
            names = sorted(city.index.get_level_values(0).unique())
            write_json(out / "states" / state / "counties" / f"{slug}.json", payload(acc, "county", (state, slug), (names, city)))

    print(f"Listo: {rows:,} filas, {months} meses, IDs hasta {last_id - 1:,}. Salida: {out.resolve()}")


if __name__ == "__main__":
    main()
