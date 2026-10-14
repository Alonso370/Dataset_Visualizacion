
from __future__ import annotations
import argparse, json, re, unicodedata, shutil
from collections import Counter
from pathlib import Path
import pandas as pd

INFRA_VARS=["Traffic_Signal","Crossing","Junction","Stop","Station","Amenity","Railway"]
ACCIDENT_COLUMNS=["ID","State","County","City","Source","Severity","Start_Lat","Start_Lng","year","hour","day_of_week","weather_group"]+INFRA_VARS

def slugify(v):
    v="" if v is None else str(v)
    v=unicodedata.normalize("NFKD",v)
    v="".join(c for c in v if not unicodedata.combining(c)).lower().strip()
    v=re.sub(r"[^a-z0-9]+","_",v)
    return re.sub(r"_+","_",v).strip("_") or "sin_nombre"

def normalize_county(v):
    v="" if v is None else str(v)
    v=re.sub(r"\s+(county|parish|borough)$","",v,flags=re.I)
    v=unicodedata.normalize("NFKD",v)
    v="".join(c for c in v if not unicodedata.combining(c))
    return re.sub(r"\s+"," ",v).strip().lower()

def as_bool(s):
    if pd.api.types.is_bool_dtype(s): return s.fillna(False)
    return s.astype("string").str.strip().str.lower().isin(["true","1","t","yes","y"])

def parse_time(s):
    try: return pd.to_datetime(s,errors="coerce",format="mixed")
    except Exception: return pd.to_datetime(s,errors="coerce")

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

def add_counts(counter,df,cols,value_col=None):
    if df.empty: return
    g=df.groupby(cols,dropna=False).size() if value_col is None else df.groupby(cols,dropna=False)[value_col].sum()
    for k,v in g.items():
        if not isinstance(k,tuple): k=(k,)
        k=tuple("" if pd.isna(x) else x for x in k)
        counter[k]+=float(v) if value_col in ("Start_Lat", "Start_Lng") else int(v)

def clean_chunk(df):
    req=["State","County","City","Source","Severity","Start_Lat","Start_Lng"]
    miss=[c for c in req if c not in df.columns]
    if miss: raise ValueError(f"Faltan columnas requeridas: {miss}")
    for c in ["State","County","City","Source"]:
        df[c]=df[c].astype("string").fillna("").str.strip()
    df["Severity"]=pd.to_numeric(df["Severity"],errors="coerce")
    df["Start_Lat"]=pd.to_numeric(df["Start_Lat"],errors="coerce")
    df["Start_Lng"]=pd.to_numeric(df["Start_Lng"],errors="coerce")
    df["high_impact"]=as_bool(df["high_impact"]) if "high_impact" in df.columns else df["Severity"].ge(3)

    if all(c in df.columns for c in ["year","hour","day_of_week"]):
        df["year"]=pd.to_numeric(df["year"],errors="coerce").astype("Int64")
        df["hour"]=pd.to_numeric(df["hour"],errors="coerce").astype("Int64")
        df["day_of_week"]=df["day_of_week"].astype("string")
    else:
        if "Start_Time" not in df.columns: raise ValueError("Se necesita Start_Time o year/hour/day_of_week.")
        dt=parse_time(df["Start_Time"])
        df["year"]=dt.dt.year.astype("Int64")
        df["hour"]=dt.dt.hour.astype("Int64")
        df["day_of_week"]=dt.dt.day_name().astype("string")

    if "weather_group" in df.columns:
        df["weather_group"]=df["weather_group"].astype("string").fillna("Sin dato")
    else:
        df["weather_group"]=weather_group(df["Weather_Condition"]) if "Weather_Condition" in df.columns else "Sin dato"

    for c in INFRA_VARS:
        df[c]=as_bool(df[c]) if c in df.columns else False
    return df[df["State"].ne("")].copy()

def write_json(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(obj,ensure_ascii=False,separators=(",",":")),encoding="utf-8")

def analytics_obj(weather,temporal,infra):
    w=[{"Source":k[0],"year":int(k[1]) if k[1]!="" else "","weather_group":k[2],"n":int(v)} for k,v in weather.items()]
    t=[{"Source":k[0],"year":int(k[1]) if k[1]!="" else "","day_of_week":k[2],"hour":int(k[3]) if k[3]!="" else "","n":int(v)} for k,v in temporal.items()]
    i=[{"Source":k[0],"year":int(k[1]) if k[1]!="" else "","infrastructure":k[2],"n":int(v)} for k,v in infra.items()]
    return {"weather":w,"temporal":t,"infrastructure":i}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--input",required=True)
    ap.add_argument("--output",default="data/processed")
    ap.add_argument("--chunksize",type=int,default=250000)
    a=ap.parse_args()

    src=Path(a.input); out=Path(a.output)
    if not src.exists(): raise FileNotFoundError(src)
    if out.exists(): shutil.rmtree(out)
    out.mkdir(parents=True,exist_ok=True)

    state_total=Counter(); state_high=Counter()
    county_total=Counter(); county_high=Counter()
    city_total=Counter(); city_high=Counter()
    city_lat=Counter(); city_lng=Counter(); city_n=Counter()
    sw=Counter(); st=Counter(); si=Counter()
    cw=Counter(); ct=Counter(); ci=Counter()
    sources=set(); years=set(); rows_read=0; written=set(); county_names={}

    needed=set(ACCIDENT_COLUMNS+["Start_Time","Weather_Condition","high_impact"])
    for chunk_no,raw in enumerate(pd.read_csv(src,usecols=lambda c: c in needed,chunksize=a.chunksize,low_memory=False),1):
        df=clean_chunk(raw); rows_read+=len(df)
        # Spelling/case aliases that share a slug must also share one aggregation key.
        for state,indexes in df.groupby("State",sort=False).groups.items():
            names=df.loc[indexes,"County"].unique()
            mapping={name:county_names.setdefault((state,slugify(name)),name) for name in names}
            df.loc[indexes,"County"]=df.loc[indexes,"County"].map(mapping)
        sources.update(x for x in df["Source"].dropna().unique().tolist() if x)
        years.update(int(x) for x in df["year"].dropna().unique().tolist())

        add_counts(state_total,df,["State","Source","year"])
        add_counts(state_high,df[df.high_impact],["State","Source","year"])

        cdf=df[df.County.ne("")].copy()
        add_counts(county_total,cdf,["State","County","Source","year"])
        add_counts(county_high,cdf[cdf.high_impact],["State","County","Source","year"])

        citydf=cdf[cdf.City.ne("")].copy()
        add_counts(city_total,citydf,["State","County","City","Source","year"])
        add_counts(city_high,citydf[citydf.high_impact],["State","County","City","Source","year"])

        coords=citydf[citydf.Start_Lat.notna() & citydf.Start_Lng.notna()].copy()
        add_counts(city_lat,coords,["State","County","City","Source","year"],"Start_Lat")
        add_counts(city_lng,coords,["State","County","City","Source","year"],"Start_Lng")
        coords["_one"]=1
        add_counts(city_n,coords,["State","County","City","Source","year"],"_one")

        hi=df[df.high_impact].copy()
        hic=hi[hi.County.ne("")].copy()

        add_counts(sw,hi,["State","Source","year","weather_group"])
        add_counts(st,hi,["State","Source","year","day_of_week","hour"])
        add_counts(cw,hic,["State","County","Source","year","weather_group"])
        add_counts(ct,hic,["State","County","Source","year","day_of_week","hour"])

        for infra in INFRA_VARS:
            g=hi[hi[infra]].groupby(["State","Source","year"],dropna=False).size()
            for k,v in g.items():
                kk=tuple("" if pd.isna(x) else x for x in k)+(infra,)
                si[kk]+=int(v)
            g=hic[hic[infra]].groupby(["State","County","Source","year"],dropna=False).size()
            for k,v in g.items():
                kk=tuple("" if pd.isna(x) else x for x in k)+(infra,)
                ci[kk]+=int(v)

        # High-impact accident partitions by county
        part=hic[hic.City.ne("")].copy()
        if not part.empty:
            keep=[c for c in ACCIDENT_COLUMNS if c in part.columns]
            part=part[keep]
            for (state,county),g in part.groupby(["State","County"],dropna=False):
                if not state or not county: continue
                cslug=slugify(county)
                fp=out/"states"/state/"counties"/cslug/"accidents.csv"
                fp.parent.mkdir(parents=True,exist_ok=True)
                header=str(fp) not in written and not fp.exists()
                g.to_csv(fp,mode="a",header=header,index=False)
                written.add(str(fp))

        print(f"Chunk {chunk_no:02d}: {len(df):,} filas | acumulado {rows_read:,}")

    # National summary
    states_rows=[]
    for k,total in state_total.items():
        states_rows.append({"State":k[0],"Source":k[1],"year":int(k[2]) if k[2]!="" else "","total":int(total),"high":int(state_high.get(k,0))})
    write_json(out/"states_summary.json",states_rows)
    write_json(out/"manifest.json",{"rows_processed":rows_read,"sources":sorted(sources),"years":sorted(years),"high_impact_rule":"Severity >= 3","levels":["usa","state","county","city"]})

    # Index once. Previously every county scanned every city/analytics key.
    def index_counter(counter, prefix):
        result={}
        for key,value in counter.items():
            result.setdefault(key[:prefix], {})[key]=value
        return result
    county_by_state=index_counter(county_total,1)
    city_by_county=index_counter(city_total,2)
    sw_index=index_counter(sw,1); st_index=index_counter(st,1); si_index=index_counter(si,1)
    cw_index=index_counter(cw,2); ct_index=index_counter(ct,2); ci_index=index_counter(ci,2)
    states=sorted({k[0] for k in state_total})
    for state in states:
        sdir=out/"states"/state; sdir.mkdir(parents=True,exist_ok=True)

        county_rows=[]
        local_counties=county_by_state.get((state,), {})
        counties=sorted({k[1] for k in local_counties})
        for k,total in local_counties.items():
            county=k[1]
            county_rows.append({
                "State":state,"County":county,"county_join":normalize_county(county),"county_slug":slugify(county),
                "Source":k[2],"year":int(k[3]) if k[3]!="" else "","total":int(total),"high":int(county_high.get(k,0))
            })
        write_json(sdir/"counties_summary.json",county_rows)

        sw2=Counter({k[1:]:v for k,v in sw_index.get((state,), {}).items()})
        st2=Counter({k[1:]:v for k,v in st_index.get((state,), {}).items()})
        si2=Counter({k[1:]:v for k,v in si_index.get((state,), {}).items()})
        write_json(sdir/"analytics.json",analytics_obj(sw2,st2,si2))

        for county in counties:
            cslug=slugify(county); cdir=sdir/"counties"/cslug; cdir.mkdir(parents=True,exist_ok=True)
            city_rows=[]
            for k,total in city_by_county.get((state,county), {}).items():
                n=city_n.get(k,0)
                city_rows.append({
                    "State":state,"County":county,"City":k[2],"Source":k[3],"year":int(k[4]) if k[4]!="" else "",
                    "total":int(total),"high":int(city_high.get(k,0)),
                    "lat":(city_lat.get(k,0)/n if n else None),"lng":(city_lng.get(k,0)/n if n else None),"coord_n":int(n)
                })
            write_json(cdir/"cities_summary.json",city_rows)

            cw2=Counter({k[2:]:v for k,v in cw_index.get((state,county), {}).items()})
            ct2=Counter({k[2:]:v for k,v in ct_index.get((state,county), {}).items()})
            ci2=Counter({k[2:]:v for k,v in ci_index.get((state,county), {}).items()})
            write_json(cdir/"analytics.json",analytics_obj(cw2,ct2,ci2))

    print(f"Listo. Filas procesadas: {rows_read:,}")
    print(f"Salida: {out.resolve()}")

if __name__=="__main__":
    main()
