"""Monthly exact aggregates for the week 12 views plus an ID -> month index for the samples."""
from __future__ import annotations
import argparse, json, re, shutil, unicodedata
from pathlib import Path
import numpy as np
import pandas as pd

FLAGS=["Traffic_Signal","Crossing","Junction","Stop","Station","Amenity"]
WEATHER=["Clear/Fair","Cloudy","Rain","Snow/Ice","Fog/Low visibility","Storm","Other","Sin dato"]
START_YEAR=2016
COLUMNS=["ID","Source","Severity","Start_Time","State","County","City","Weather_Condition"]+FLAGS

def slugify(v):
    v="" if v is None else str(v)
    v=unicodedata.normalize("NFKD",v)
    v="".join(c for c in v if not unicodedata.combining(c)).lower().strip()
    v=re.sub(r"[^a-z0-9]+","_",v)
    return re.sub(r"_+","_",v).strip("_") or "sin_nombre"

def weather_group(s):
    x=s.fillna("").astype("string").str.lower()
    out=pd.Series("Other",index=s.index,dtype="string")
    out[x.str.contains(r"rain|drizzle|shower",regex=True)]="Rain"
    out[x.str.contains(r"snow|sleet|wintry|ice",regex=True)]="Snow/Ice"
    out[x.str.contains(r"fog|mist|haze|smoke",regex=True)]="Fog/Low visibility"
    out[x.str.contains(r"thunder|storm|tornado",regex=True)]="Storm"
    out[x.str.contains(r"cloud|overcast",regex=True)]="Cloudy"
    out[x.str.contains(r"clear|fair",regex=True)]="Clear/Fair"
    out[x.eq("")]="Sin dato"
    return out

def as_bool(s):
    return s.astype("string").str.strip().str.lower().isin(["true","1","t","yes","y"])

def clean(df,sources):
    df=df[df["State"].notna() & df["State"].ne("") & df["Start_Time"].notna()].copy()
    t=df["Start_Time"].astype("string")
    year=pd.to_numeric(t.str.slice(0,4),errors="coerce"); month=pd.to_numeric(t.str.slice(5,7),errors="coerce")
    df["m"]=(year-START_YEAR)*12+month-1
    df["d"]=pd.to_datetime(t.str.slice(0,10),format="%Y-%m-%d",errors="coerce").dt.day_of_week
    df["hr"]=pd.to_numeric(t.str.slice(11,13),errors="coerce")
    df=df[df["m"].ge(0) & df["d"].notna() & df["hr"].between(0,23)].copy()
    df["s"]=df["Source"].map({v:i for i,v in enumerate(sources)})
    df=df[df["s"].notna()].copy()
    for c in ["m","d","hr","s"]: df[c]=df[c].astype("int16")
    df["h"]=pd.to_numeric(df["Severity"],errors="coerce").ge(3).astype("int32")
    df["t"]=np.int32(1)
    df["w"]=weather_group(df["Weather_Condition"]).map({v:i for i,v in enumerate(WEATHER)}).astype("int16")
    df["cslug"]=df["County"].fillna("").map(slugify).where(df["County"].fillna("").ne(""),"")
    df["City"]=df["City"].fillna("").astype("string").str.strip()
    for f in FLAGS: df[f]=as_bool(df[f])
    return df

LEVELS={"usa":[],"state":["State"],"county":["State","cslug"]}

def tables(df):
    out={}
    for level,keys in LEVELS.items():
        base=df if level!="county" else df[df["cslug"].ne("")]
        out[(level,"T")]=base.groupby(keys+["s","m"])[["t","h"]].sum()
        out[(level,"W")]=base.groupby(keys+["s","m","w"])[["t","h"]].sum()
        out[(level,"H")]=base[base["h"].eq(1)].groupby(keys+["s","m","d","hr"])[["h"]].sum()
        frames=[]
        for i,f in enumerate(FLAGS):
            g=base[base[f]].groupby(keys+["s","m"])[["t","h"]].sum()
            g["f"]=i; frames.append(g.set_index("f",append=True))
        out[(level,"I")]=pd.concat(frames)
    city=df[df["cslug"].ne("") & df["City"].ne("")]
    out[("city","T")]=city.groupby(["State","cslug","City","s","m"])[["t","h"]].sum()
    return out

def merge(acc,new):
    for k,v in new.items():
        acc[k]=v if k not in acc else pd.concat([acc[k],v])
    return acc

def compact(acc):
    return {k:v.groupby(level=list(range(v.index.nlevels))).sum() for k,v in acc.items()}

def columns(frame,names):
    frame=frame.reset_index()
    return {n:frame[n].astype(int).tolist() for n in names}

def sub(frame,key):
    if not key: return frame
    try: return frame.xs(key,level=tuple(range(len(key))),drop_level=True)
    except KeyError: return frame.iloc[:0].droplevel(list(range(len(key))))

def payload(acc,level,key,child):
    def part(name,cols): return columns(sub(acc[(level,name)],key),cols)
    body={"T":part("T",["s","m","t","h"]),"I":part("I",["s","m","f","t","h"]),"H":part("H",["s","m","d","hr","h"]),"W":part("W",["s","m","w","t","h"])}
    if child is not None:
        names,frame=child
        frame=frame.reset_index()
        index={n:i for i,n in enumerate(names)}
        body["areas"]={"names":names,"a":frame[frame.columns[0]].map(index).astype(int).tolist(),**{n:frame[n].astype(int).tolist() for n in ["s","m","t","h"]}}
    return body

def write_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",required=True)
    ap.add_argument("--output",default="data/w12")
    ap.add_argument("--chunksize",type=int,default=500000)
    a=ap.parse_args()
    src=Path(a.input); out=Path(a.output)
    if not src.exists(): raise FileNotFoundError(src)
    if out.exists(): shutil.rmtree(out)
    sources=["Source1","Source2","Source3"]
    acc={}; months=0; rows=0; ids=np.full(8_000_000,255,dtype=np.uint8)
    reader=pd.read_csv(src,usecols=COLUMNS,dtype={c:"string[pyarrow]" for c in COLUMNS},chunksize=a.chunksize)
    for n,raw in enumerate(reader,1):
        df=clean(raw,sources); rows+=len(df); months=max(months,int(df["m"].max())+1)
        number=pd.to_numeric(df["ID"].str.slice(2),errors="coerce")
        ok=number.notna() & number.lt(len(ids)) & df["m"].lt(255)
        ids[number[ok].astype(np.int64).to_numpy()]=df.loc[ok,"m"].astype(np.uint8).to_numpy()
        acc=merge(acc,tables(df))
        if n%4==0: acc=compact(acc)
        print(f"Bloque {n:02d}: {rows:,} filas",flush=True)
    acc=compact(acc)
    labels=[f"{START_YEAR+i//12}-{i%12+1:02d}" for i in range(months)]
    top=int(np.flatnonzero(ids!=255).max())+1
    out.mkdir(parents=True,exist_ok=True)
    (out/"id_month.bin").write_bytes(ids[:top].tobytes())
    states=acc[("state","T")].groupby(level=[0,1,2]).sum()
    state_names=sorted(states.index.get_level_values(0).unique())
    write_json(out/"usa.json",{"meta":{"months":labels,"sources":sources,"flags":FLAGS,"weather":WEATHER,"rows":rows,"high_rule":"Severity >= 3"},**payload(acc,"usa",None,(state_names,states))})
    counties=acc[("county","T")]; cities=acc[("city","T")]
    for state in state_names:
        local=sub(counties,(state,))
        slugs=sorted(local.index.get_level_values(0).unique())
        write_json(out/"states"/f"{state}.json",payload(acc,"state",(state,),(slugs,local)))
        for slug in slugs:
            city=sub(cities,(state,slug))
            names=sorted(city.index.get_level_values(0).unique())
            write_json(out/"states"/state/"counties"/f"{slug}.json",payload(acc,"county",(state,slug),(names,city)))
    print(f"Listo: {rows:,} filas, {months} meses, IDs hasta {top-1:,}. Salida: {out.resolve()}")

if __name__=="__main__":
    main()
