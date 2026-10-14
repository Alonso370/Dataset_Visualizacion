/* Exact population summaries + bounded samples; no full accident CSV in the browser. */
const CONFIG = window.VIZZU_CONFIG;
const DATA_ROOT = CONFIG.DATA_ROOT, EXPLORER_ROOT = CONFIG.EXPLORER_ROOT || "data/explorer";
const FIPS = {AL:"01",AK:"02",AZ:"04",AR:"05",CA:"06",CO:"08",CT:"09",DE:"10",DC:"11",FL:"12",GA:"13",HI:"15",ID:"16",IL:"17",IN:"18",IA:"19",KS:"20",KY:"21",LA:"22",ME:"23",MD:"24",MA:"25",MI:"26",MN:"27",MS:"28",MO:"29",MT:"30",NE:"31",NV:"32",NH:"33",NJ:"34",NM:"35",NY:"36",NC:"37",ND:"38",OH:"39",OK:"40",OR:"41",PA:"42",RI:"44",SC:"45",SD:"46",TN:"47",TX:"48",UT:"49",VT:"50",VA:"51",WA:"53",WV:"54",WI:"55",WY:"56"};
const S = {level:"usa",state:null,county:null,countySlug:null,city:null,source:"ALL",year:"ALL"};
const $ = id => document.getElementById(id);
const normCounty = v => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+(county|parish|borough)$/i, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const format = v => Math.round(v).toLocaleString("es-PE");
const colors = {1:[56,189,248,190],2:[37,99,235,190],3:[245,158,11,210],4:[220,38,38,220]};
const tooltip = $("tooltip");
let map, overlay, statesGeo, summaries, manifest, countyIndex;
let generation = 0, controller, currentSample = [], currentDisplay = [], currentBaseLayers = [];
let cameraKey = "", lastStyle = "light", chartFrame;
const cache = new Map();
let cacheBytes = 0;
async function json(url, signal) {
  if (cache.has(url)) {
    const entry = cache.get(url); cache.delete(url); cache.set(url,entry); return entry.value;
  }
  const response = await fetch(url,{signal});
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status}).`);
  const text = await response.text(), value = JSON.parse(text), size = text.length*2;
  const limit = CONFIG.CACHE_BYTES || 24*1024*1024;
  if (size <= limit) {
    while (cacheBytes+size > limit && cache.size) {
      const key = cache.keys().next().value; cacheBytes -= cache.get(key).size; cache.delete(key);
    }
    cache.set(url,{value,size}); cacheBytes += size;
  }
  return value;
}
function match(row, snapshot = S) {
  return (snapshot.source === "ALL" || row.Source === snapshot.source) && (snapshot.year === "ALL" || +row.year === +snapshot.year);
}
function aggregate(rows, key, snapshot) {
  const groups = new Map();
  for (const row of rows) {
    if (!match(row,snapshot)) continue;
    const k = key(row);
    let g = groups.get(k);
    if (!g) { g = {...row,total:0,high:0,latSum:0,lngSum:0,coord_n:0}; groups.set(k,g); }
    g.total += +row.total || 0; g.high += +row.high || 0;
    const n = +row.coord_n || 0;
    g.latSum += (+row.lat || 0)*n; g.lngSum += (+row.lng || 0)*n; g.coord_n += n;
  }
  for (const g of groups.values()) {
    g.rate = g.total ? g.high/g.total : 0;
    g.lat = g.coord_n ? g.latSum/g.coord_n : null; g.lng = g.coord_n ? g.lngSum/g.coord_n : null;
  }
  return groups;
}
function showError(error) { $("error").textContent = error.message || String(error); $("error").classList.remove("hidden"); }
function hideTip() { tooltip.style.opacity = 0; }
function tip(info, lines) {
  if (!info.object) { hideTip(); return; }
  tooltip.replaceChildren();
  for (const line of lines) { const div = document.createElement("div"); div.textContent = line; tooltip.append(div); }
  const rect = $("map").getBoundingClientRect();
  tooltip.style.left = `${Math.min(rect.left+info.x+12,innerWidth-280)}px`;
  tooltip.style.top = `${rect.top+info.y+12}px`; tooltip.style.opacity = 1;
}
function summaryTip(info,stats,name) {
  const row = info.object && stats.get(name(info.object));
  tip(info,row ? [name(info.object),`Accidentes: ${format(row.total)}`,`Severidad ≥ 3: ${format(row.high)}`,"Clic para explorar"] : ["Sin datos para estos filtros"]);
}
function fitFeature(feature) {
  if (!feature) return;
  const bounds = new mapboxgl.LngLatBounds();
  function visit(coords) { if (typeof coords[0] === "number") bounds.extend(coords); else coords.forEach(visit); }
  visit(feature.geometry.coordinates);
  if (!bounds.isEmpty()) map.fitBounds(bounds,{padding:45,maxZoom:11,duration:550});
}
function setMode(selected) {
  $("explorer").classList.toggle("selected",selected);
  $("climatePanel").classList.toggle("hidden",!selected); $("roadPanel").classList.toggle("hidden",!selected);
  const style = selected ? "streets" : "light";
  if (style !== lastStyle) { lastStyle = style; map.setStyle(`mapbox://styles/mapbox/${selected ? "streets-v12" : "light-v11"}`); }
  for (const handler of ["dragPan","scrollZoom","doubleClickZoom","touchZoomRotate","keyboard","boxZoom"]) map[handler][selected ? "enable" : "disable"]();
  map.resize();
  window.ExplorerFilters.setContext(selected);
}
function navigationUI() {
  $("stateSelect").value = S.state || "ALL";
  $("backBtn").disabled = S.level === "usa";
  const items = [["usa","USA"]];
  if (S.state) items.push(["state",S.state]); if (S.county) items.push(["county",S.county]); if (S.city) items.push(["city",S.city]);
  $("breadcrumb").replaceChildren();
  items.forEach(([level,label],i) => {
    if (i) $("breadcrumb").append(" › ");
    const button = document.createElement("button"); button.textContent = label;
    button.addEventListener("click",() => navigate(level)); $("breadcrumb").append(button);
  });
  $("mapTitle").textContent = S.level === "usa" ? "Explora Estados Unidos" : [S.state,S.county,S.city].filter(Boolean).join(" · ");
  $("mapHelp").textContent = {usa:"Selecciona un estado para explorar sus carreteras y factores de riesgo.",state:"Explora con zoom y arrastre. Selecciona un condado para profundizar.",county:"Selecciona una burbuja de ciudad para ver su muestra de accidentes.",city:"Explora los accidentes de la muestra; los totales corresponden a todos los registros."}[S.level];
  $("levelBadge").textContent = `Nivel: ${{usa:"USA",state:"Estado",county:"Condado",city:"Ciudad"}[S.level]}`;
  $("mapLegend").textContent = S.level === "usa" ? "Color = proporción de accidentes de mayor impacto (Severity ≥ 3)" : "Puntos = muestra · Color = severidad · Contornos = límites · Burbujas violetas = ciudades";
}
function navigate(level,selection = {}) {
  const previousArea = [S.level,S.state,S.county,S.city].join("/");
  Object.assign(S,selection,{level});
  if (level === "usa") S.state = null;
  if (["usa","state"].includes(level)) { S.county = null; S.countySlug = null; }
  if (level !== "city") S.city = null;
  if ([S.level,S.state,S.county,S.city].join("/") !== previousArea) window.ExplorerFilters.clearLasso(false);
  update();
}
function decodeSample(payload) { return payload.rows.map(values => Object.fromEntries(payload.columns.map((column,i) => [column,values[i]]))); }
async function sampleWithTime(payload,base,signal) {
  const decoded = decodeSample(payload);
  if (!decoded.length || payload.columns.includes("hour") && payload.columns.includes("weekday")) return decoded;
  const time = await json(`${base}/temporal.json`,signal);
  const index = new Map(time.rows.map(row => [row[0],[row[1],row[2]]]));
  return decoded.map(row => {
    const value = index.get(row.ID);
    if (!value) throw new Error(`Faltan datos horarios del registro ${row.ID}; ejecuta scripts/enrich_temporal.py.`);
    return {...row,hour:value[0],weekday:value[1]};
  });
}
function pointLayer(rows) {
  return new deck.ScatterplotLayer({
    id:"accident-sample",data:rows.filter(d => Number.isFinite(d.Start_Lng) && Number.isFinite(d.Start_Lat)),
    pickable:true,radiusUnits:"pixels",getPosition:d => [d.Start_Lng,d.Start_Lat],getRadius:3,
    getFillColor:d => colors[d.Severity] || [100,116,139,180],
    onHover:info => tip(info,info.object ? [info.object.City || info.object.County,`Severidad: ${info.object.Severity}`,`Fuente: ${info.object.Source} · Año: ${info.object.year}`] : []),
    onClick:info => {
      if (S.level !== "state" || !info.object) return;
      const row = countyIndex?.get(normCounty(info.object.County));
      if (row) navigate("county",{county:row.County,countySlug:row.county_slug});
    }
  });
}
function outline(features,stats,snapshot) {
  return new deck.GeoJsonLayer({
    id:`county-boundaries-${snapshot.state}`,data:features,pickable:true,
    filled:true,stroked:true,getFillColor:[80,110,150,3],getLineColor:[71,85,105,170],lineWidthMinPixels:1,
    onHover:info => summaryTip(info,stats,f => normCounty(f.properties.name)),
    onClick:info => {
      if (!info.object) return;
      const row = stats.get(normCounty(info.object.properties.name));
      if (row) navigate("county",{county:row.County,countySlug:row.county_slug});
    }
  });
}
function drawUSA(snapshot) {
  const stats = aggregate(summaries,d => d.State,snapshot);
  const color = d3.scaleSequential([0,d3.max([...stats.values()],d => d.rate) || 1],d3.interpolateYlOrRd);
  overlay.setProps({layers:[new deck.GeoJsonLayer({
    id:"states",data:statesGeo,pickable:true,filled:true,stroked:true,lineWidthMinPixels:1,getLineColor:[90,90,90,220],
    getFillColor:f => { const stat = stats.get(f.id), c = d3.color(stat ? color(stat.rate) : "#e5e7eb"); return [c.r,c.g,c.b,190]; },
    updateTriggers:{getFillColor:[snapshot.source,snapshot.year]},
    onHover:info => summaryTip(info,stats,f => f.id),
    onClick:info => { if (info.object && FIPS[info.object.id]) navigate("state",{state:info.object.id}); }
  })]});
  if (cameraKey !== "usa") map.flyTo({center:[-98.5,39.5],zoom:3.2,duration:550});
  cameraKey = "usa";
}
function updateLinked(rows,total) {
  currentDisplay = rows;
  overlay.setProps({layers:[...currentBaseLayers,pointLayer(rows)]});
  $("sampleNote").textContent = `${format(rows.length)} de ${format(total)} registros de la muestra visibles. Horas, lazo y severidad filtran la muestra; los totales superiores corresponden al área, fuente y año completos.`;
}
async function update() {
  const version = ++generation;
  controller?.abort(); controller = new AbortController();
  const signal = controller.signal, snapshot = {...S};
  hideTip(); navigationUI(); $("error").classList.add("hidden");
  if (!overlay) return;
  currentDisplay = []; currentBaseLayers = []; window.VizCharts.clear();
  setMode(snapshot.level !== "usa"); $("loading").classList.remove("hidden"); overlay.setProps({layers:[]});
  if (snapshot.level !== "usa") {
    $("totalStat").textContent = "—"; $("highStat").textContent = "—";
    $("sampleNote").textContent = "Cargando muestra del área…";
    $("scopeTitle").textContent = snapshot.city || snapshot.county || snapshot.state;
  }
  try {
    if (snapshot.level === "usa") { drawUSA(snapshot); return; }
    const stateBase = `${DATA_ROOT}/states/${snapshot.state}`, sampleStateBase = `${EXPLORER_ROOT}/states/${snapshot.state}`;
    const countyPromise = json("https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json",signal);
    const summaryURL = snapshot.level === "state" ? `${stateBase}/counties_summary.json` : `${stateBase}/counties/${snapshot.countySlug}/cities_summary.json`;
    const sampleBase = snapshot.level === "state" ? sampleStateBase : `${sampleStateBase}/counties/${snapshot.countySlug}`;
    const payloadPromise = snapshot.level === "city" ? json(`${sampleBase}/cities.json`,signal).then(index => {
      if (index[snapshot.city] === undefined) return {columns:[],rows:[]};
      return json(`${sampleBase}/cities/${index[snapshot.city]}.json`,signal);
    }) : json(`${sampleBase}/sample.json`,signal);
    const samplePromise = payloadPromise.then(payload => sampleWithTime(payload,sampleBase,signal));
    const [rows,geometry,sample] = await Promise.all([json(summaryURL,signal),countyPromise,samplePromise]);
    if (version !== generation) return;
    const stats = aggregate(rows,d => snapshot.level === "state" ? normCounty(d.County) : d.City,snapshot);
    countyIndex = snapshot.level === "state" ? stats : null;
    const scopeRows = snapshot.level === "city" ? rows.filter(d => d.City === snapshot.city) : rows;
    let totals = [...aggregate(scopeRows,() => "area",snapshot).values()][0] || {total:0,high:0};
    // Include records with missing county/city in the population statistics.
    if (snapshot.level === "state") totals = aggregate(summaries,d => d.State,snapshot).get(snapshot.state) || {total:0,high:0};
    if (snapshot.level === "county") {
      const countyRows = await json(`${stateBase}/counties_summary.json`,signal);
      if (version !== generation) return;
      totals = aggregate(countyRows,d => d.county_slug,snapshot).get(snapshot.countySlug) || {total:0,high:0};
    }
    $("totalStat").textContent = format(totals.total);
    $("highStat").textContent = `${format(totals.high)} (${(totals.total ? totals.high/totals.total*100 : 0).toFixed(1)}%)`;
    const features = geometry.features.filter(f => String(f.id).padStart(5,"0").slice(0,2) === FIPS[snapshot.state]);
    const selectedFeature = features.find(f => normCounty(f.properties.name) === normCounty(snapshot.county));
    currentBaseLayers = snapshot.level === "state" ? [outline(features,stats,snapshot)] : [new deck.GeoJsonLayer({
      id:"selected-boundary",data:selectedFeature ? [selectedFeature] : [],filled:false,stroked:true,getLineColor:[71,85,105,200],lineWidthMinPixels:1.5
    })];
    if (snapshot.level === "county") {
      const cities = [...stats.values()].filter(d => Number.isFinite(d.lat) && Number.isFinite(d.lng));
      const radius = d3.scaleSqrt([0,d3.max(cities,d => d.total) || 1],[5,20]);
      currentBaseLayers.push(new deck.ScatterplotLayer({
        id:`cities-${snapshot.state}-${snapshot.countySlug}`,data:cities,pickable:true,radiusUnits:"pixels",
        getPosition:d => [d.lng,d.lat],getRadius:d => radius(d.total),getFillColor:[124,58,237,160],
        stroked:true,getLineColor:[255,255,255,240],lineWidthMinPixels:1,
        updateTriggers:{getRadius:[snapshot.source,snapshot.year]},
        onHover:info => tip(info,info.object ? [info.object.City,`${format(info.object.total)} accidentes · Clic para explorar`] : []),
        onClick:info => { if (info.object) navigate("city",{city:info.object.City}); }
      }));
    }
    currentSample = sample.filter(d => match(d,snapshot));
    const max = CONFIG.MAX_CHART_ROWS || 2500;
    if (currentSample.length > max) {
      const stride = currentSample.length/max;
      currentSample = Array.from({length:max},(_,i) => currentSample[Math.floor(i*stride)]);
    }
    window.VizCharts.setData(currentSample,{onFilter:updateLinked,onPick:row => {
      if (Number.isFinite(row.Start_Lng) && Number.isFinite(row.Start_Lat)) map.flyTo({center:[row.Start_Lng,row.Start_Lat],zoom:13,duration:500});
    }});
    const key = [snapshot.level,snapshot.state,snapshot.county,snapshot.city].join("/");
    if (key !== cameraKey) {
      if (snapshot.level === "state") fitFeature(statesGeo.features.find(f => f.id === snapshot.state));
      else if (snapshot.level === "county") fitFeature(selectedFeature);
      else { const city = stats.get(snapshot.city); if (city && Number.isFinite(city.lng) && Number.isFinite(city.lat)) map.flyTo({center:[city.lng,city.lat],zoom:11,duration:550}); }
      cameraKey = key;
    }
    $("scopeWeather").textContent = `Muestra · ${snapshot.source === "ALL" ? "Todas las fuentes" : snapshot.source} · ${snapshot.year === "ALL" ? "Todos los años" : snapshot.year}`;
  } catch (error) {
    if (error.name !== "AbortError" && version === generation) {
      showError(new Error(`${error.message} Consulta README.md: build_explorer.py genera muestras nuevas; enrich_temporal.py añade horas a las anteriores.`));
      $("sampleNote").textContent = "No se pudo cargar la muestra del área.";
    }
  } finally { if (version === generation) $("loading").classList.add("hidden"); }
}
async function boot() {
  $("loading").classList.remove("hidden");
  try {
    if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN.includes("PEGA_AQUI")) throw new Error("Configura un token público de Mapbox en js/config.js.");
    mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
    map = new mapboxgl.Map({container:"map",style:"mapbox://styles/mapbox/light-v11",center:[-98.5,39.5],zoom:3.2,minZoom:2,projection:"mercator",dragPan:false,scrollZoom:false,doubleClickZoom:false,touchZoomRotate:false,keyboard:false,boxZoom:false});
    map.addControl(new mapboxgl.NavigationControl({showCompass:false}),"top-left");
    map.on("error",event => showError(new Error(`Mapbox: ${event.error?.message || "No se pudo cargar el mapa"}`)));
    // Subscribe before requests: the map can load before the data.
    const ready = new Promise(resolve => map.once("load",resolve));
    [manifest,summaries,statesGeo] = await Promise.all([json(`${DATA_ROOT}/manifest.json`),json(`${DATA_ROOT}/states_summary.json`),json("https://raw.githubusercontent.com/python-visualization/folium/master/examples/data/us-states.json"),ready]);
    overlay = new deck.MapboxOverlay({interleaved:false,layers:[]}); map.addControl(overlay);
    window.ExplorerFilters.init(map,() => window.VizCharts.refresh());
    $("resetFilters").addEventListener("click",() => {
      S.source = "ALL"; S.year = "ALL";
      $("sourceSelect").value = "ALL"; $("yearSelect").value = "ALL"; $("severitySelect").value = "ALL";
      window.ExplorerFilters.reset(); window.VizCharts.resetDimensions(); update();
    });
    for (const state of [...new Set(summaries.map(d => d.State))].sort()) {
      const option = document.createElement("option"); option.value = state; option.textContent = state; $("stateSelect").append(option);
    }
    $("stateSelect").addEventListener("change",event => navigate(event.target.value === "ALL" ? "usa" : "state",{state:event.target.value === "ALL" ? null : event.target.value}));
    map.on("style.load",() => { if (S.level === "usa") drawUSA({...S}); else overlay.setProps({layers:[...currentBaseLayers,pointLayer(currentDisplay)]}); });
    for (const [id,values,field] of [["sourceSelect",manifest.sources,"source"],["yearSelect",manifest.years,"year"]]) {
      for (const value of values || []) { const option = document.createElement("option"); option.value = value; option.textContent = value; $(id).append(option); }
      $(id).addEventListener("change",event => { S[field] = event.target.value; update(); });
    }
    $("homeBtn").addEventListener("click",() => navigate("usa"));
    $("backBtn").addEventListener("click",() => navigate({state:"usa",county:"state",city:"county"}[S.level] || "usa"));
    new ResizeObserver(() => { map.resize(); cancelAnimationFrame(chartFrame); chartFrame = requestAnimationFrame(() => { if (S.level !== "usa") window.VizCharts.resize(); }); }).observe($("explorer"));
    await update();
  } catch (error) { showError(error); $("loading").classList.add("hidden"); }
}
boot();
