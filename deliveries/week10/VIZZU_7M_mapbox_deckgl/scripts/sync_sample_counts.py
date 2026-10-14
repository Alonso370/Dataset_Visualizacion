"""Migrate population metadata for old samples where county spelling aliases shared a file."""
import json
from collections import Counter
from pathlib import Path


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def sync(root=Path("data")):
    explorer, processed = root / "explorer", root / "processed"
    assert read(explorer / "manifest.json")["rows_processed"] == read(processed / "manifest.json")["rows_processed"]
    corrected = 0
    def update(path, total):
        nonlocal corrected
        payload = read(path)
        if payload["population"] == total:
            return
        payload["population"] = total
        staging = path.with_suffix(".json.tmp")
        staging.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
        staging.replace(path)
        corrected += 1
    for state in sorted({r["State"] for r in read(processed / "states_summary.json")}):
        counties = Counter()
        variants = {}
        for row in read(processed / "states" / state / "counties_summary.json"):
            counties[row["county_slug"]] += row["total"]
            variants.setdefault(row["county_slug"],set()).add(row["County"])
        for slug, total in counties.items():
            if len(variants[slug]) < 2:
                continue
            base = explorer / "states" / state / "counties" / slug
            update(base / "sample.json", total)
            cities = Counter()
            for row in read(processed / "states" / state / "counties" / slug / "cities_summary.json"):
                cities[row["City"]] += row["total"]
            for city, city_id in read(base / "cities.json").items():
                update(base / "cities" / f"{city_id}.json", cities[city])
    print(f"Metadatos corregidos: {corrected}")


if __name__ == "__main__":
    sync()
