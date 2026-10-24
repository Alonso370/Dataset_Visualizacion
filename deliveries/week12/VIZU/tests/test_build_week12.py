import json, subprocess, sys, tempfile
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
HEADER = "ID,Source,Severity,Start_Time,State,County,City,Weather_Condition,Start_Lat,Start_Lng,Traffic_Signal,Crossing,Junction,Stop,Station,Amenity"
ROWS = [
    "A-1,Source2,3,2016-02-08 05:46:00+00:00,OH,Montgomery,Dayton,Light Rain,39.865,-84.058,False,False,True,False,False,False",
    "A-2,Source2,2,2016-02-08 06:07:59+00:00,OH,Franklin,Columbus,Clear,39.928,-82.831,True,False,False,False,False,False",
    "A-5,Source1,4,2023-03-31 23:10:00,CA,Los Angeles,Pasadena,Fair,34.1478,-118.1445,False,False,True,False,False,False",
    "A-7,Source1,1,2023-03-31 22:00:00,CA,Los Angeles,,Cloudy,34.1479,-118.1446,False,False,False,False,False,False",
    "A-9,Source3,3,2020-07-04 12:00:00,CA,,,,,,False,False,False,False,False,False",
]

def main():
    with tempfile.TemporaryDirectory() as tmp:
        csv, out = Path(tmp)/"mini.csv", Path(tmp)/"w12"
        csv.write_text("\n".join([HEADER,*ROWS])+"\n",encoding="utf-8")
        subprocess.run([sys.executable,str(ROOT/"scripts"/"build_week12.py"),"--input",str(csv),"--output",str(out)],check=True,capture_output=True)
        usa = json.loads((out/"usa.json").read_text())
        assert usa["meta"]["months"][0] == "2016-01" and usa["meta"]["months"][-1] == "2023-03"
        assert sum(usa["T"]["t"]) == 5 and sum(usa["T"]["h"]) == 3
        assert sum(usa["H"]["h"]) == 3
        j = usa["meta"]["flags"].index("Junction")
        assert sum(t for f,t in zip(usa["I"]["f"],usa["I"]["t"]) if f == j) == 2
        ca = json.loads((out/"states"/"CA.json").read_text())
        assert sum(ca["T"]["t"]) == 3 and sum(ca["areas"]["t"]) == 2
        la = json.loads((out/"states"/"CA"/"counties"/"los_angeles.json").read_text())
        assert la["areas"]["names"] == ["Pasadena"] and sum(la["T"]["t"]) == 2
        cells = json.loads((out/"states"/"CA"/"counties"/"los_angeles.cells.json").read_text())
        assert cells["cell"] == 0.002 and len(cells["t"]) == 1 and cells["t"] == [2] and cells["h"] == [1] and cells["y"] == [7]
        ids = np.fromfile(out/"id_month.bin",dtype=np.uint8)
        assert ids[1] == 1 and ids[5] == 86 and ids[9] == 54 and ids[3] == 255
        mon = json.loads((out/"usa.json").read_text())["H"]
        assert (0 in mon["d"]) and (4 in mon["d"])
    print("OK: totales, niveles, accidentes sin condado, infraestructura, heatmap, día de la semana, índice ID → mes y celdas de vía.")

if __name__ == "__main__":
    main()
