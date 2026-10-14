import importlib.util
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]


def module(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / "scripts" / file)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


explorer = module("explorer", "build_explorer.py")
original = module("original", "preprocess_7m.py")


class PreprocessingTests(unittest.TestCase):
    def test_bottom_k_is_independent_of_chunk_size_and_preserves_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            records = []
            for i in range(150):
                row = dict(ID=f"A-{i}", State="CA", County="Los Angeles", City="Large" if i < 110 else "Small", Source="Source1" if i % 3 else "Source2", year=2023 if i % 2 else 2022, Severity=i % 4 + 1, Start_Lat=34.12345, Start_Lng=-118.23456)
                row.update({key:float(i % 15) for key in explorer.CLIMATE})
                row["Humidity(%)"] = None if i % 7 == 0 else 50
                row.update({key:bool(i % 2) for key in explorer.ROAD[1:]})
                row["Distance(mi)"] = .02
                records.append(row)
            pd.DataFrame(records).to_csv(base / "input.csv", index=False)
            runs = []
            for chunk in [17,43]:
                output = base / f"output-{chunk}"
                explorer.build(SimpleNamespace(input=base / "input.csv", output=output, chunksize=chunk, state_limit=9, county_limit=7, city_limit=3))
                runs.append(output)
            for relative in ["states/CA/sample.json", "states/CA/counties/los_angeles/sample.json"]:
                first, second = [json.loads((run / relative).read_text()) for run in runs]
                self.assertEqual({r[0] for r in first["rows"]}, {r[0] for r in second["rows"]})
                columns = first["columns"]
                source, year = columns.index("Source"), columns.index("year")
                counts = Counter((r[source], r[year]) for r in first["rows"])
                self.assertLessEqual(max(counts.values()), first["limit_per_stratum"])
                self.assertIn(None, [r[columns.index("Humidity(%)")] for r in first["rows"]])
                self.assertTrue(all(r[columns.index("Traffic_Signal")] in [0,1] for r in first["rows"]))
            city_index = json.loads((runs[0] / "states/CA/counties/los_angeles/cities.json").read_text())
            self.assertEqual(set(city_index), {"Large", "Small"})
            for city, city_id in city_index.items():
                payload = json.loads((runs[0] / f"states/CA/counties/los_angeles/cities/{city_id}.json").read_text())
                self.assertTrue(all(row[3] == city for row in payload["rows"]))
                self.assertEqual(payload["population"], 110 if city == "Large" else 40)

    def test_coordinate_sums_preserve_fractional_values(self):
        frame = pd.DataFrame([{"State":"CA","Start_Lat":34.21},{"State":"CA","Start_Lat":34.29}])
        counter = Counter()
        original.add_counts(counter, frame, ["State"], "Start_Lat")
        self.assertAlmostEqual(counter[("CA",)],68.5)

    def test_temporal_fields_use_recorded_values_and_keep_missing(self):
        frame = pd.DataFrame({"hour":[0,23,24,None],"day_of_week":["Monday","Saturday","Sunday",None]})
        result = explorer.add_temporal(frame)
        self.assertEqual(result.hour.iloc[0],0)
        self.assertEqual(result.hour.iloc[1],23)
        self.assertTrue(pd.isna(result.hour.iloc[2]))
        self.assertTrue(pd.isna(result.hour.iloc[3]))
        self.assertEqual(result.weekday.iloc[1],5)
        self.assertTrue(pd.isna(result.weekday.iloc[3]))
        result = explorer.add_temporal(pd.DataFrame({"Start_Time":["2023-01-01 23:35:00+00:00"]}))
        self.assertEqual(result.hour.iloc[0],23)
        self.assertEqual(result.weekday.iloc[0],6)

    def test_county_spelling_aliases_share_samples_and_population(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            records = [dict(ID=f"A-{i}",State="AL",County="DeKalb" if i%2 else "Dekalb",City="Rainsville",Source="Source1",year=2023,Severity=2,Start_Lat=34.12,Start_Lng=-85.94) for i in range(20)]
            pd.DataFrame(records).to_csv(base / "input.csv", index=False)
            explorer.build(SimpleNamespace(input=base / "input.csv",output=base / "output",chunksize=3,state_limit=5,county_limit=5,city_limit=4))
            county_base = base / "output/states/AL/counties/dekalb"
            payload = json.loads((county_base / "sample.json").read_text())
            self.assertEqual(payload["population"],20)
            self.assertEqual(len(payload["rows"]),5)
            city_id = json.loads((county_base / "cities.json").read_text())["Rainsville"]
            city = json.loads((county_base / f"cities/{city_id}.json").read_text())
            self.assertEqual(city["population"],20)
            self.assertEqual(len(city["rows"]),4)


if __name__ == "__main__":
    unittest.main()
