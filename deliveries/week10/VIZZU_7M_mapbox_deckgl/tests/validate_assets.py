"""Validate exported samples against the complete pre-existing population summaries."""
import json
import math
import importlib.util
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
spec = importlib.util.spec_from_file_location("explorer", ROOT / "scripts/build_explorer.py")
explorer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(explorer)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def check(path, state, county=None, city=None):
    payload = read(path)
    columns = payload["columns"]
    counts = Counter()
    ids = set()
    for values in payload["rows"]:
        assert len(values) == len(columns), path
        row = dict(zip(columns, values))
        assert row["State"] == state, path
        if county is not None:
            assert explorer.slugify(row["County"]) == explorer.slugify(county), path
        if city is not None:
            assert row["City"] == city, path
        assert row["ID"] not in ids, path
        ids.add(row["ID"])
        counts[(row["Source"], row["year"])] += 1
        for key in columns[9:]:
            value = row[key]
            assert value is None or isinstance(value, (int, float)) and math.isfinite(value), (path,key,value)
        for key in ["Traffic_Signal", "Crossing", "Junction", "Stop", "Station", "Amenity", "Railway"]:
            assert row[key] in [None,0,1], (path,key)
    assert not counts or max(counts.values()) <= payload["limit_per_stratum"], path
    return len(payload["rows"]), path.stat().st_size, payload["population"]


def main():
    summary = read(DATA / "processed/manifest.json")
    manifest = read(DATA / "explorer/manifest.json")
    assert summary["rows_processed"] == manifest["rows_processed"]
    states = sorted({r["State"] for r in read(DATA / "processed/states_summary.json")})
    files = records = byte_count = counties = cities = 0
    for state in states:
        state_base = DATA / "explorer/states" / state
        n, size, _ = check(state_base / "sample.json", state)
        records += n; byte_count += size; files += 1
        county_groups = {}
        for row in read(DATA / "processed/states" / state / "counties_summary.json"):
            county_groups.setdefault(row["county_slug"], {"name":row["County"], "total":0})["total"] += row["total"]
        for slug, county in county_groups.items():
            base = state_base / "counties" / slug
            n, size, population = check(base / "sample.json", state, county["name"])
            assert population == county["total"], (state,slug,population,county["total"])
            records += n; byte_count += size; files += 1; counties += 1
            city_counts = Counter()
            for row in read(DATA / "processed/states" / state / "counties" / slug / "cities_summary.json"):
                city_counts[row["City"]] += row["total"]
            index = read(base / "cities.json")
            assert set(index) == set(city_counts), (state,slug)
            for city, city_id in index.items():
                n, size, population = check(base / "cities" / f"{city_id}.json", state, county["name"], city)
                assert population == city_counts[city], (state,slug,city)
                records += n; byte_count += size; files += 1; cities += 1
    print(json.dumps({"source_rows":manifest["rows_processed"],"states":len(states),"counties":counties,"cities":cities,"sample_files":files,"sample_records":records,"sample_MiB":round(byte_count/1024/1024,2)},indent=2))


if __name__ == "__main__":
    main()
