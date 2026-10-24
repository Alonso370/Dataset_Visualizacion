/* One-screen explorer: exact monthly aggregates drive the map, KPIs and T1/T3/T4/T5; bounded samples drive points and RadViz. */
const CONFIG = window.VIZZU_CONFIG;
const DATA_ROOT = CONFIG.DATA_ROOT, EXPLORER_ROOT = CONFIG.EXPLORER_ROOT, W12 = CONFIG.W12_ROOT, MIN_N = CONFIG.MIN_N || 30;
const FIPS = {AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",FL:"12",GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56"};
const THRESHOLDS = [.05,.1,.15,.2,.3,.4], CLASS_COLORS = d3.schemeYlOrRd[7];
const rateColor = d3.scaleThreshold(THRESHOLDS,CLASS_COLORS);
const severityColors = {1:[56,189,248,190],2:[37,99,235,190],3:[245,158,11,210],4:[220,38,38,220]};
const S = {level:"usa",state:null,county:null,countySlug:null,city:null,source:-1,range:[0,0],pins:{A:null,B:null}};
const $ = id => document.getElementById(id);
const normCounty = v => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+(county|parish|borough)$/i,"").trim().toLowerCase().replace(/[^a-z0-9]+/g,"");
const int = v => Math.round(v).toLocaleString("es-PE"), pct = v => v === null || !Number.isFinite(v) ? "—" : `${(v*100).toFixed(1)} %`;
const tooltip = $("tooltip");
let map, overlay, statesGeo, countiesGeo, usa, meta, idMonth;
let generation = 0, controller, cameraKey = "", frame;
let scope = null, areaRows = [], areaFeatures = [], countyNames = new Map(), cityPlaces = new Map();
const cache = new Map(); let cacheBytes = 0;
async function json(url,signal) {
  if (cache.has(url)) { const entry = cache.get(url); cache.delete(url); cache.set(url,entry); return entry.value; }
  const response = await fetch(url,{signal});
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status}).`);
  const text = await response.text(), value = JSON.parse(text), size = text.length*2, limit = CONFIG.CACHE_BYTES;
  if (size <= limit) { while (cacheBytes+size > limit && cache.size) { const key = cache.keys().next().value; cacheBytes -= cache.get(key).size; cache.delete(key); } cache.set(url,{value,size}); cacheBytes += size; }
  return value;
}
async function months() {
  if (!idMonth) { const response = await fetch(`${W12}/id_month.bin`); if (!response.ok) throw new Error("No se pudo cargar data/w12/id_month.bin."); idMonth = new Uint8Array(await response.arrayBuffer()); }
  return idMonth;
}
const sourceName = () => S.source < 0 ? "Todas las fuentes" : meta.sources[S.source];
const periodName = range => range[0] === range[1] ? meta.months[range[0]] : `${meta.months[range[0]]} a ${meta.months[range[1]]}`;
function showError(error) { $("error").textContent = error.message || String(error); $("error").classList.remove("hidden"); }
function hideTip() { tooltip.style.opacity = 0; }
function tip(info,lines) {
  if (!info.object) { hideTip(); return; }
  tooltip.replaceChildren(...lines.map(text => Object.assign(document.createElement("div"),{textContent:text})));
  const rect = $("map").getBoundingClientRect();
  tooltip.style.left = `${Math.min(rect.left+info.x+12,innerWidth-280)}px`; tooltip.style.top = `${rect.top+info.y+12}px`; tooltip.style.opacity = 1;
}
function rgba(stat,alpha) { if (!stat || stat.t < MIN_N) return [229,231,235,alpha]; const c = d3.color(rateColor(stat.rate)); return [c.r,c.g,c.b,alpha]; }
function areaTip(info,stat,name) { tip(info,stat ? [name,`${int(stat.t)} accidentes · ${pct(stat.rate)} con Severity ≥ 3`,stat.t < MIN_N ? `Menos de ${MIN_N}: sin color` : "Clic para explorar"] : [name,"Sin accidentes en este periodo y fuente"]); }
function fitFeature(feature) {
  if (!feature) return;
  const bounds = new mapboxgl.LngLatBounds();
  (function visit(coords) { if (typeof coords[0] === "number") bounds.extend(coords); else coords.forEach(visit); })(feature.geometry.coordinates);
  if (!bounds.isEmpty()) map.fitBounds(bounds,{padding:40,maxZoom:11,duration:550});
}
function pinColor(key) { const c = d3.color(VizCharts.AB[key]); return [c.r,c.g,c.b,255]; }
function pinLayer(features,match) {
  const data = [];
  for (const key of ["A","B"]) { const pin = S.pins[key]; if (!pin) continue; for (const f of features) if (match(f,pin)) data.push({...f,properties:{...f.properties,pin:key}}); }
  return new deck.GeoJsonLayer({id:`pins-${data.map(d => d.properties.pin+d.id).join("-")}`,data,filled:false,stroked:true,getLineColor:f => pinColor(f.properties.pin),lineWidthMinPixels:3});
}
function pointLayer(rows) {
  return new deck.ScatterplotLayer({
    id:"accident-sample",data:rows.filter(d => Number.isFinite(d.Start_Lng) && Number.isFinite(d.Start_Lat)),
    pickable:true,radiusUnits:"pixels",getPosition:d => [d.Start_Lng,d.Start_Lat],getRadius:3,getFillColor:d => severityColors[d.Severity] || [100,116,139,180],
    onHover:info => tip(info,info.object ? [info.object.City || info.object.County,`Severidad ${info.object.Severity} · ${info.object.Source}`,meta.months[info.object.month] || ""] : []),
    onClick:info => { if (S.level !== "state" || !info.object) return; const row = countyNames.get(normCounty(info.object.County)); if (row) navigate("county",{county:row.County,countySlug:row.slug}); }
  });
}
function mapLayers(visible) {
  const snapshot = S, layers = [];
  if (snapshot.level === "usa") {
    const stats = DataCore.byArea(usa.areas,snapshot.range,snapshot.source);
    layers.push(new deck.GeoJsonLayer({
      id:"states",data:statesGeo,pickable:true,filled:true,stroked:true,lineWidthMinPixels:1,getLineColor:[90,90,90,200],
      getFillColor:f => rgba(stats.get(f.id),200),updateTriggers:{getFillColor:[snapshot.range.join(),snapshot.source]},
      onHover:info => info.object ? areaTip(info,stats.get(info.object.id),info.object.properties.name) : hideTip(),
      onClick:info => { if (info.object && FIPS[info.object.id]) navigate("state",{state:info.object.id}); }
    }));
    layers.push(pinLayer(statesGeo.features,(f,pin) => pin.kind === "state" && pin.state === f.id));
    return layers;
  }
  if (snapshot.level === "state") {
    const stats = DataCore.byArea(scope.areas,snapshot.range,snapshot.source);
    const slugOf = f => countyNames.get(normCounty(f.properties.NAME))?.slug;
    layers.push(new deck.GeoJsonLayer({
      id:`counties-${snapshot.state}`,data:areaFeatures,pickable:true,filled:true,stroked:true,lineWidthMinPixels:1,getLineColor:[71,85,105,170],
      getFillColor:f => rgba(stats.get(slugOf(f)),150),updateTriggers:{getFillColor:[snapshot.range.join(),snapshot.source]},
      onHover:info => info.object ? areaTip(info,stats.get(slugOf(info.object)),info.object.properties.NAME) : hideTip(),
      onClick:info => { if (!info.object) return; const row = countyNames.get(normCounty(info.object.properties.NAME)); if (row) navigate("county",{county:row.County,countySlug:row.slug}); }
    }));
    layers.push(pinLayer(areaFeatures,(f,pin) => pin.kind === "county" && pin.state === snapshot.state && pin.slug === slugOf(f)));
  } else {
    const selected = areaFeatures.find(f => normCounty(f.properties.NAME) === normCounty(snapshot.county));
    layers.push(new deck.GeoJsonLayer({id:"selected-boundary",data:selected ? [selected] : [],filled:false,stroked:true,getLineColor:[71,85,105,200],lineWidthMinPixels:1.5}));
    if (snapshot.level === "county") {
      const stats = DataCore.byArea(scope.areas,snapshot.range,snapshot.source);
      const cities = [...cityPlaces.values()].map(c => ({...c,stat:stats.get(c.City)})).filter(c => c.stat);
      const radius = d3.scaleSqrt([0,d3.max(cities,d => d.stat.t) || 1],[4,22]);
      layers.push(new deck.ScatterplotLayer({
        id:`cities-${snapshot.countySlug}`,data:cities,pickable:true,radiusUnits:"pixels",getPosition:d => [d.lng,d.lat],getRadius:d => radius(d.stat.t),
        getFillColor:d => rgba(d.stat,200),stroked:true,getLineColor:[255,255,255,240],lineWidthMinPixels:1,updateTriggers:{getRadius:[snapshot.range.join(),snapshot.source],getFillColor:[snapshot.range.join(),snapshot.source]},
        onHover:info => info.object ? areaTip(info,info.object.stat,info.object.City) : hideTip(),
        onClick:info => { if (info.object) navigate("city",{city:info.object.City}); }
      }));
    }
  }
  layers.push(pointLayer(visible));
  return layers;
}
function scopeTable() { return S.level === "city" ? DataCore.areaTable(scope.areas,S.city) : scope.T; }
function exactMode() { return S.level !== "city" && !window.ExplorerFilters.hasLasso(); }
function filterRows() {
  const ids = idMonth, out = {area:[],lasso:[],visible:[]};
  const severity = $("severitySelect").value;
  for (const row of areaRows) {
    if (S.source >= 0 && row.Source !== meta.sources[S.source]) continue;
    if (row.month === undefined) row.month = ids ? ids[+String(row.ID).slice(2)] : 255;
    if (row.month < S.range[0] || row.month > S.range[1]) continue;
    out.area.push(row);
  }
  const max = CONFIG.MAX_CHART_ROWS;
  if (out.area.length > max) { const stride = out.area.length/max; out.area = Array.from({length:max},(_,i) => out.area[Math.floor(i*stride)]); }
  for (const row of out.area) {
    if (window.ExplorerFilters.inLasso(row)) {
      out.lasso.push(row);
      if ((severity === "ALL" || +row.Severity === +severity) && window.ExplorerFilters.hourOk(row)) out.visible.push(row);
    }
  }
  return out;
}
function render() {
  if (!scope) return;
  const range = S.range, T = scopeTable(), total = DataCore.total(T,range,S.source), bySource = DataCore.bySource(T,range,meta.sources.length);
  $("kpiTotal").textContent = int(total.t); $("kpiHigh").textContent = int(total.h); $("kpiRate").textContent = pct(total.rate);
  VizCharts.mix(bySource,meta.sources);
  $("periodLabel").textContent = periodName(range);
  const where = [S.city,S.county,S.state].find(Boolean) || "EE. UU.";
  Timeline.focus({T,months:meta.months,sources:meta.sources,source:S.source,range,scope:`${where} · ${sourceName()}`});
  const rows = S.level === "usa" ? {area:[],lasso:[],visible:[]} : filterRows();
  overlay.setProps({layers:mapLayers(rows.visible)});
  const hours = window.ExplorerFilters.getHours(), exact = exactMode() && scope.H;
  $("heatBadge").textContent = exact ? "datos completos" : `muestra · ${int(rows.lasso.length)}`; $("heatBadge").className = `badge${exact ? "" : " sample"}`;
  $("infraBadge").textContent = $("heatBadge").textContent; $("infraBadge").className = $("heatBadge").className;
  if (exact) VizCharts.heat({cells:DataCore.heat(scope.H,range,S.source),divisor:DataCore.weekdayDays(range),hours});
  else { const h = DataCore.heatRows(rows.lasso); VizCharts.heat({cells:h.cells,divisor:null,hours,missing:h.missing}); }
  const infraData = exact ? DataCore.infra(scope.I,scope.T,range,meta.flags.length,meta.sources.length) : DataCore.infraRows(rows.lasso,meta.flags,meta.sources);
  VizCharts.infra({data:infraData,flags:meta.flags,sources:meta.sources,source:S.source,minN:exact ? MIN_N : 10});
  VizCharts.radviz(rows.visible,row => { if (Number.isFinite(row.Start_Lng)) map.flyTo({center:[row.Start_Lng,row.Start_Lat],zoom:13,duration:500}); });
  $("scopeWeather").textContent = S.level === "usa" ? "" : `muestra · ${int(rows.visible.length)}`;
  $("sampleNote").textContent = S.level === "usa" ? "Desde el nivel Estado aparecen los puntos de la muestra, el RadViz, el reloj y el lazo." : `Muestra: ${int(rows.visible.length)} visibles de ${int(rows.area.length)} en el periodo y fuente (máximo ${int(CONFIG.MAX_CHART_ROWS)}). Horas, severidad y lazo filtran solo la muestra; los totales son del área completa.`;
  renderCompare();
}
function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(render); }
async function pinData(pin) {
  const file = pin.kind === "state" ? `${W12}/states/${pin.state}.json` : `${W12}/states/${pin.state}/counties/${pin.slug}.json`;
  const data = await json(file);
  return pin.kind === "city" ? {T:DataCore.areaTable(data.areas,pin.city)} : data;
}
let compareToken = 0;
async function renderCompare() {
  const token = ++compareToken, range = S.range, source = S.source;
  const build = async pin => {
    if (!pin) return null;
    const d = await pinData(pin), series = DataCore.monthly(d.T,meta.months.length,meta.sources.length);
    const monthly = meta.months.map((_,m) => { const list = source < 0 ? series.map(s => s[m]) : [series[source][m]]; const t = d3.sum(list,x => x.t), h = d3.sum(list,x => x.h); return {t,h,rate:t >= 20 ? h/t : null}; });
    return {label:pin.label,total:DataCore.total(d.T,range,source),bySource:DataCore.bySource(d.T,range,meta.sources.length),monthly,
      infra:d.I ? DataCore.infra(d.I,d.T,range,meta.flags.length,meta.sources.length) : null,weather:d.W ? DataCore.weather(d.W,range,source,meta.weather.length) : null};
  };
  try {
    const [A,B] = await Promise.all([build(S.pins.A),build(S.pins.B)]);
    if (token !== compareToken) return;
    VizCharts.compare({A,B,months:meta.months,range,sources:meta.sources,source,flags:meta.flags,weatherGroups:meta.weather,minN:MIN_N});
  } catch (error) { showError(error); }
}
function pinUI() {
  const text = ["A","B"].filter(k => S.pins[k]).map(k => `${k}: ${S.pins[k].label}`).join(" · ");
  $("pinLabels").textContent = text || "Navega a un estado, condado o ciudad y fíjalo como A o B.";
  $("clearPins").disabled = !S.pins.A && !S.pins.B;
  $("pinA").disabled = $("pinB").disabled = S.level === "usa";
}
function navigationUI() {
  $("stateSelect").value = S.state || "ALL";
  $("backBtn").disabled = S.level === "usa";
  const items = [["usa","USA"]];
  if (S.state) items.push(["state",S.state]); if (S.county) items.push(["county",S.county]); if (S.city) items.push(["city",S.city]);
  $("breadcrumb").replaceChildren();
  items.forEach(([level,label],i) => { if (i) $("breadcrumb").append("›"); const b = document.createElement("button"); b.textContent = label; b.addEventListener("click",() => navigate(level)); $("breadcrumb").append(b); });
  $("mapTitle").textContent = S.level === "usa" ? "Estados Unidos" : [S.state,S.county,S.city].filter(Boolean).join(" · ");
  $("mapHelp").textContent = {usa:"Color = proporción con Severity ≥ 3 en el periodo y fuente elegidos. Clic en un estado para explorarlo.",state:"Condados coloreados igual que el mapa nacional; puntos = muestra coloreada por severidad. Clic en un condado.",county:"Burbujas = ciudades: tamaño = accidentes, color = proporción con Severity ≥ 3. Clic en una burbuja.",city:"Puntos = muestra de la ciudad. Usa el lazo para acotar una zona de hasta 5 km."}[S.level];
  $("levelBadge").textContent = `Nivel: ${{usa:"USA",state:"Estado",county:"Condado",city:"Ciudad"}[S.level]}`;
  $("mapLegendNote").textContent = S.level === "usa" ? "Escala fija por clases: los colores se comparan entre periodos." : "Mismas clases de color. Puntos: azul = severidad 1–2, ámbar/rojo = 3–4.";
  pinUI();
}
function navigate(level,selection = {}) {
  const previous = [S.level,S.state,S.county,S.city].join("/");
  Object.assign(S,selection,{level});
  if (level === "usa") S.state = null;
  if (["usa","state"].includes(level)) { S.county = null; S.countySlug = null; }
  if (level !== "city") S.city = null;
  if ([S.level,S.state,S.county,S.city].join("/") !== previous) window.ExplorerFilters.clearLasso(false);
  load();
}
function decodeSample(payload) { return payload.rows.map(values => Object.fromEntries(payload.columns.map((column,i) => [column,values[i]]))); }
async function sampleWithTime(payload,base,signal) {
  const decoded = decodeSample(payload);
  if (!decoded.length || payload.columns.includes("hour") && payload.columns.includes("weekday")) return decoded;
  const time = await json(`${base}/temporal.json`,signal), index = new Map(time.rows.map(row => [row[0],[row[1],row[2]]]));
  return decoded.map(row => { const v = index.get(row.ID); return v ? {...row,hour:v[0],weekday:v[1]} : row; });
}
async function load() {
  const version = ++generation; controller?.abort(); controller = new AbortController();
  const signal = controller.signal, snapshot = {...S};
  hideTip(); navigationUI(); $("error").classList.add("hidden"); $("loading").classList.remove("hidden");
  window.ExplorerFilters.setContext(snapshot.level !== "usa");
  for (const handler of ["dragPan","scrollZoom","doubleClickZoom","touchZoomRotate","keyboard","boxZoom"]) map[handler][snapshot.level === "usa" ? "disable" : "enable"]();
  try {
    if (snapshot.level === "usa") {
      scope = usa; areaRows = []; VizCharts.clearRad();
      Timeline.context({T:usa.T,months:meta.months,sources:meta.sources,source:S.source,range:S.range});
      if (cameraKey !== "usa") map.flyTo({center:[-98.5,39.5],zoom:3.2,duration:550});
      cameraKey = "usa"; render(); return;
    }
    const stateBase = `${DATA_ROOT}/states/${snapshot.state}`, sampleState = `${EXPLORER_ROOT}/states/${snapshot.state}`;
    const scopeURL = snapshot.level === "state" ? `${W12}/states/${snapshot.state}.json` : `${W12}/states/${snapshot.state}/counties/${snapshot.countySlug}.json`;
    const sampleBase = snapshot.level === "state" ? sampleState : `${sampleState}/counties/${snapshot.countySlug}`;
    const payload = snapshot.level === "city" ? json(`${sampleBase}/cities.json`,signal).then(index => index[snapshot.city] === undefined ? {columns:[],rows:[]} : json(`${sampleBase}/cities/${index[snapshot.city]}.json`,signal)) : json(`${sampleBase}/sample.json`,signal);
    const [data,geo,counties,sample,cities] = await Promise.all([
      json(scopeURL,signal),
      countiesGeo ? countiesGeo : json("https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json",signal),
      json(`${stateBase}/counties_summary.json`,signal),
      payload.then(p => sampleWithTime(p,sampleBase,signal)),
      snapshot.level === "state" ? null : json(`${stateBase}/counties/${snapshot.countySlug}/cities_summary.json`,signal),
      months()
    ]);
    if (version !== generation) return;
    countiesGeo = geo; scope = data; areaRows = sample;
    countyNames = new Map(); for (const row of counties) countyNames.set(normCounty(row.County),{County:row.County,slug:row.county_slug});
    areaFeatures = geo.features.filter(f => String(f.id).padStart(5,"0").slice(0,2) === FIPS[snapshot.state]);
    cityPlaces = new Map();
    if (cities) for (const row of cities) {
      if (!Number.isFinite(row.lat) || !row.coord_n) continue;
      const c = cityPlaces.get(row.City) || {City:row.City,latSum:0,lngSum:0,n:0};
      c.latSum += row.lat*row.coord_n; c.lngSum += row.lng*row.coord_n; c.n += row.coord_n; cityPlaces.set(row.City,c);
    }
    for (const c of cityPlaces.values()) { c.lat = c.latSum/c.n; c.lng = c.lngSum/c.n; }
    VizCharts.setRadRows(areaRows.filter(row => S.source < 0 || row.Source === meta.sources[S.source]));
    Timeline.context({T:scopeTable(),months:meta.months,sources:meta.sources,source:S.source,range:S.range});
    const key = [snapshot.level,snapshot.state,snapshot.county,snapshot.city].join("/");
    if (key !== cameraKey) {
      if (snapshot.level === "state") fitFeature(statesGeo.features.find(f => f.id === snapshot.state));
      else if (snapshot.level === "county") fitFeature(areaFeatures.find(f => normCounty(f.properties.NAME) === normCounty(snapshot.county)));
      else { const c = cityPlaces.get(snapshot.city); if (c) map.flyTo({center:[c.lng,c.lat],zoom:12,duration:550}); }
      cameraKey = key;
    }
    render();
  } catch (error) {
    if (error.name !== "AbortError" && version === generation) showError(error);
  } finally { if (version === generation) $("loading").classList.add("hidden"); }
}
function setRange(range) { S.range = range; schedule(); }
function setSource(index) {
  S.source = index; $("sourceSelect").value = index < 0 ? "ALL" : meta.sources[index];
  if (S.level !== "usa") VizCharts.setRadRows(areaRows.filter(row => index < 0 || row.Source === meta.sources[index]));
  Timeline.context({T:scopeTable(),months:meta.months,sources:meta.sources,source:index,range:S.range}); render();
}
function pin(key) {
  if (S.level === "usa") return;
  const kind = S.level === "state" ? "state" : S.level === "county" ? "county" : "city";
  S.pins[key] = {kind,state:S.state,slug:S.countySlug,city:S.city,label:[S.city,S.county,S.state].filter(Boolean).join(", ")};
  pinUI(); render();
}
function story({range,source = -1,pins = {A:null,B:null}}) {
  S.range = range || [0,meta.months.length-1]; S.pins = pins; S.source = source; $("sourceSelect").value = source < 0 ? "ALL" : meta.sources[source];
  window.ExplorerFilters.reset(); navigate("usa");
}
const STORIES = [
  {title:"1 · Source1 cambió de criterio: 33 % en 2018, 2 % en 2021",text:"Mira T1: la línea de Source1 se desploma mientras Source2 sigue entre 30 % y 37 %. La caída nacional de la proporción es un efecto de la fuente, no de las vías.",apply:() => story({range:[24,83]})},
  {title:"2 · Intersección sube en ambas fuentes; el semáforo no",text:"Mira T4: con Junction la proporción sube en Source1 (7,6 → 13,1 %) y en Source2 (32,6 → 58,1 %). Traffic_Signal solo “baja” el impacto en Source2.",apply:() => story({})},
  {title:"3 · Carolina del Sur frente a Ohio: misma mezcla, 12 % frente a 31 %",text:"Mira T5: las dos tienen ~38 % Source1 y ~60 % Source2, así que la brecha no viene de las fuentes; se mantiene dentro de cada una (Source2: 18 % frente a 40 %).",apply:() => story({pins:{A:{kind:"state",state:"SC",label:"SC"},B:{kind:"state",state:"OH",label:"OH"}}})}
];
function stories() {
  if (!STORIES.length) return;
  $("stories").replaceChildren(Object.assign(document.createElement("span"),{textContent:"Recorridos guiados"}));
  for (const story of STORIES) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = story.title; b.title = story.text;
    b.addEventListener("click",() => { story.apply(); $("storyText").textContent = story.text; }); $("stories").append(b);
  }
  $("stories").append(Object.assign(document.createElement("p"),{id:"storyText",className:"hint"}));
}
async function boot() {
  $("loading").classList.remove("hidden");
  try {
    if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN.includes("PEGA_AQUI")) throw new Error("Configura un token público de Mapbox en js/config.js.");
    mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
    map = new mapboxgl.Map({container:"map",style:"mapbox://styles/mapbox/light-v11",center:[-98.5,39.5],zoom:3.2,minZoom:2,projection:"mercator",dragPan:false,scrollZoom:false,doubleClickZoom:false,touchZoomRotate:false,keyboard:false,boxZoom:false});
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-left");
    map.on("error",event => showError(new Error(`Mapbox: ${event.error?.message || "No se pudo cargar el mapa"}`)));
    const ready = new Promise(resolve => map.once("load",resolve));
    [usa,statesGeo] = await Promise.all([json(`${W12}/usa.json`),json("https://raw.githubusercontent.com/python-visualization/folium/master/examples/data/us-states.json"),ready]);
    meta = usa.meta; S.range = [0,meta.months.length-1];
    overlay = new deck.MapboxOverlay({interleaved:false,layers:[]}); map.addControl(overlay);
    VizCharts.legend(THRESHOLDS,CLASS_COLORS,MIN_N);
    Timeline.init(setRange);
    window.ExplorerFilters.init(map,schedule);
    for (const state of [...usa.areas.names].sort()) $("stateSelect").append(new Option(state,state));
    for (const source of meta.sources) $("sourceSelect").append(new Option(source,source));
    $("stateSelect").addEventListener("change",event => navigate(event.target.value === "ALL" ? "usa" : "state",{state:event.target.value === "ALL" ? null : event.target.value}));
    $("sourceSelect").addEventListener("change",event => setSource(meta.sources.indexOf(event.target.value)));
    $("severitySelect").addEventListener("change",schedule);
    $("fullPeriod").addEventListener("click",() => { S.range = [0,meta.months.length-1]; Timeline.move(S.range); render(); });
    $("homeBtn").addEventListener("click",() => navigate("usa"));
    $("backBtn").addEventListener("click",() => navigate({state:"usa",county:"state",city:"county"}[S.level] || "usa"));
    $("aboutBtn").addEventListener("click",() => $("about").showModal());
    $("pinA").addEventListener("click",() => pin("A")); $("pinB").addEventListener("click",() => pin("B"));
    $("clearPins").addEventListener("click",() => { S.pins = {A:null,B:null}; pinUI(); render(); });
    $("resetFilters").addEventListener("click",() => {
      S.range = [0,meta.months.length-1]; S.pins = {A:null,B:null}; $("severitySelect").value = "ALL";
      window.ExplorerFilters.reset(); setSource(-1); pinUI();
    });
    map.on("style.load",() => schedule());
    new ResizeObserver(() => { map.resize(); cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (scope) { Timeline.context({T:scopeTable(),months:meta.months,sources:meta.sources,source:S.source,range:S.range}); render(); } }); }).observe(document.querySelector(".dashboard"));
    stories();
    await load();
  } catch (error) { showError(error); $("loading").classList.add("hidden"); }
}
boot();
