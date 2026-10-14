"""Add compact temporal bundles to existing US Accidents samples without changing IDs."""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from build_explorer import add_temporal


def ids_to_numbers(ids):
    values = pd.Series(ids, dtype="string").str.extract(r"^A-(\d+)$", expand=False)
    if values.isna().any():
        raise ValueError("Esta migración requiere IDs A-<número>. Para otros IDs, usa build_explorer.py que incluye hora/día directamente.")
    return values.astype("int64").to_numpy()


def migrate(source, output):
    header = pd.read_csv(source, nrows=0).columns
    needed = [c for c in ["ID", "hour", "weekday", "day_of_week"] if c in header]
    if "hour" not in header or not ({"weekday", "day_of_week"} & set(header)):
        if "Start_Time" not in header:
            raise ValueError("Se requiere hora/día o Start_Time")
        needed.append("Start_Time")
    # US Accidents uses dense A-N IDs. 3 bytes per ID keeps memory below ~32 MiB
    # for this dataset rather than constructing millions of Python dictionaries.
    capacity = 8_000_000
    table = np.full((capacity,2),255,dtype="uint8")
    present = np.zeros(capacity,dtype="bool")
    processed = 0
    for index, frame in enumerate(pd.read_csv(source,usecols=needed,chunksize=250000,low_memory=False),1):
        ids = ids_to_numbers(frame.ID)
        maximum = int(ids.max())
        if maximum > 50_000_000:
            raise ValueError("IDs demasiado dispersos: genera muestras temporales con build_explorer.py")
        if maximum >= capacity:
            capacity = maximum + 1
            extended = np.full((capacity,2),255,dtype="uint8"); extended[:len(table)] = table; table = extended
            extended_present = np.zeros(capacity,dtype="bool"); extended_present[:len(present)] = present; present = extended_present
        frame = add_temporal(frame)
        table[ids] = frame[["hour","weekday"]].fillna(255).to_numpy(dtype="uint8")
        present[ids] = True
        processed += len(frame)
        if index % 5 == 0:
            print(f"Horas/días leídos: {processed:,}",flush=True)
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["rows_processed"] != processed:
        raise ValueError("El CSV y las muestras no corresponden a la misma cantidad de registros")
    def bundle(base, files):
        unique = {}
        for path in files:
            sample = json.loads(path.read_text(encoding="utf-8"))
            ids = [row[sample["columns"].index("ID")] for row in sample["rows"]]
            numbers = ids_to_numbers(ids)
            if len(numbers) and (numbers.max() >= len(present) or not present[numbers].all()):
                raise ValueError(f"IDs de muestra ausentes en el CSV: {path}")
            for record_id, (hour,weekday) in zip(ids,table[numbers]):
                unique[record_id] = [None if hour == 255 else int(hour), None if weekday == 255 else int(weekday)]
        payload = {"columns":["ID","hour","weekday"],"rows":[[key,*values] for key,values in unique.items()]}
        path = base / "temporal.json"
        staging = path.with_suffix(".json.tmp")
        staging.write_text(json.dumps(payload,separators=(",",":"),allow_nan=False),encoding="utf-8")
        staging.replace(path)
        return len(unique)
    bundles = records = 0
    for state in sorted((output / "states").iterdir()):
        if not state.is_dir():
            continue
        records += bundle(state,[state / "sample.json"]); bundles += 1
        for county in sorted((state / "counties").iterdir()):
            if not county.is_dir():
                continue
            records += bundle(county,[county / "sample.json",*sorted((county / "cities").glob("*.json"))]); bundles += 1
            if bundles % 100 == 0:
                print(f"Paquetes temporales: {bundles}",flush=True)
    manifest["version"] = 2
    manifest["temporal_bundles"] = True
    manifest["temporal_columns"] = ["hour","weekday"]
    staging = manifest_path.with_suffix(".json.tmp")
    staging.write_text(json.dumps(manifest,separators=(",",":")),encoding="utf-8")
    staging.replace(manifest_path)
    print(f"Listo: {processed:,} registros originales; {bundles:,} paquetes; {records:,} IDs temporales.",flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input",required=True)
    parser.add_argument("--output",default="data/explorer")
    args = parser.parse_args()
    migrate(args.input,Path(args.output))
