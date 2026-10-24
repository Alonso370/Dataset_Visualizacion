const CONFIG = window.VIZZU_CONFIG;
const DATA_ROOT = CONFIG.DATA_ROOT;
const EXPLORER_ROOT = CONFIG.EXPLORER_ROOT;
const W12 = CONFIG.W12_ROOT;
const MIN_E = CONFIG.MIN_N || 30;
const STATES_GEOJSON = "https://raw.githubusercontent.com/python-visualization/folium/master/examples/data/us-states.json";
const COUNTIES_GEOJSON = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";
const FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12",
  GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23",
  MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33",
  NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56"
};
const MAP_HANDLERS = ["dragPan", "scrollZoom", "doubleClickZoom", "touchZoomRotate", "keyboard", "boxZoom"];

const S = {
  level: "usa", state: null, county: null, countySlug: null, city: null,
  source: -1, range: [0, 0], pins: {A: null, B: null},
  onlyHigh: false, hoverCity: null, table: false
};

const $ = id => document.getElementById(id);
const {int, pct, times} = VizCharts;

function normCounty(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+(county|parish|borough)$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

let usa, meta, rates, statesGeo, countiesGeo, idMonth;
let map, overlay, mapReady;
let scope = null;
let areaRows = [];
let countyNames = new Map();
let slugNames = new Map();
let stateCounties = [];
let generation = 0;
let controller;
let frame;
let cameraKey = "";

const cache = new Map();
let cacheBytes = 0;

async function json(url, signal) {
  if (cache.has(url)) {
    const entry = cache.get(url);
    cache.delete(url);
    cache.set(url, entry);
    return entry.value;
  }
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status}).`);
  const text = await response.text();
  const value = JSON.parse(text);
  const size = text.length * 2;
  if (size <= CONFIG.CACHE_BYTES) {
    while (cacheBytes + size > CONFIG.CACHE_BYTES && cache.size) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).size;
      cache.delete(oldest);
    }
    cache.set(url, {value, size});
    cacheBytes += size;
  }
  return value;
}

async function loadMonthIndex() {
  if (idMonth) return idMonth;
  const response = await fetch(`${W12}/id_month.bin`);
  if (!response.ok) throw new Error("No se pudo cargar data/w12/id_month.bin.");
  idMonth = new Uint8Array(await response.arrayBuffer());
  return idMonth;
}

function showError(error) {
  $("error").textContent = error.message || String(error);
  $("error").classList.remove("hidden");
}

const isStreet = () => S.level === "county" || S.level === "city";
const comparing = () => Boolean(S.pins.A && S.pins.B);
const sourceList = () => S.source < 0 ? [0, 1, 2] : [S.source];
const stateName = code => statesGeo?.features.find(f => f.id === code)?.properties.name || code;
const areaName = () => S.city || S.county || (S.state ? stateName(S.state) : "Estados Unidos");

function periodName(range) {
  if (range[0] === range[1]) return meta.months[range[0]];
  return `${meta.months[range[0]]} a ${meta.months[range[1]]}`;
}

function scopeTable() {
  if (S.level === "usa") return usa.T;
  if (S.level === "city") return DataCore.areaTable(scope.areas, S.city);
  return scope.T;
}

function rewind(features) {
  for (const f of features) {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      if (d3.geoArea({type: "Polygon", coordinates: polygon}) > 2 * Math.PI) {
        for (const ring of polygon) ring.reverse();
      }
    }
  }
  return features;
}

function countyFeature(name) {
  return stateCounties.find(f => normCounty(f.properties.NAME) === normCounty(name));
}

function countyOf(feature) {
  return countyNames.get(normCounty(feature.properties.NAME));
}

function ensureMapbox() {
  if (mapReady) return mapReady;
  $("map").classList.remove("hidden");
  mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
  map = new mapboxgl.Map({container: "map", style: "mapbox://styles/mapbox/light-v11", center: [-98.5, 39.5], zoom: 4, minZoom: 3});
  map.addControl(new mapboxgl.NavigationControl({showCompass: false}), "top-right");
  map.on("error", event => showError(new Error(`Mapbox: ${event.error?.message || "no se pudo cargar el mapa"}`)));
  mapReady = new Promise(resolve => map.once("load", () => {
    overlay = new deck.MapboxOverlay({interleaved: false, layers: []});
    map.addControl(overlay);
    window.ExplorerFilters.init(map, schedule);
    resolve(map);
  }));
  return mapReady;
}

function useGeoMap() {
  $("mapStage").classList.add("geo");
  $("geoMap").classList.remove("hidden");
  $("map").classList.add("hidden");
  $("mapTools").classList.add("hidden");
  $("legendBlock").classList.remove("hidden");
  $("pointLegend").classList.add("hidden");
  window.ExplorerFilters.setContext(false);
}

function useStreetMap() {
  const wasHidden = $("geoMap").classList.contains("hidden") === false;
  $("mapStage").classList.remove("geo");
  $("geoMap").classList.add("hidden");
  $("map").classList.remove("hidden");
  $("mapTools").classList.remove("hidden");
  $("legendBlock").classList.add("hidden");
  $("pointLegend").classList.remove("hidden");
  map.resize();
  window.ExplorerFilters.setContext(true);
  for (const handler of MAP_HANDLERS) map[handler].enable();
  return wasHidden;
}

function pinFor(kind, id) {
  for (const key of ["A", "B"]) {
    const pin = S.pins[key];
    if (pin && pin.kind === kind && (kind === "state" ? pin.state === id : pin.slug === id)) return key;
  }
  return null;
}

function areaTip(event, name, cell) {
  if (!event) {
    VizCharts.hideTip();
    return;
  }
  if (!cell) {
    VizCharts.tip(event, [name, "Sin accidentes en este periodo y fuente"]);
    return;
  }
  const index = cell.e >= MIN_E ? `${times(cell.index)} lo esperado` : "Pocos datos para el índice";
  VizCharts.tip(event, [
    index,
    name,
    `${int(cell.t)} accidentes · ${int(cell.h)} con Severity ≥ 3 (${pct(cell.rate)})`,
    `Se esperaban ${int(cell.e)} según la fuente y el año`,
    "Clic para entrar"
  ]);
}

function renderGeoMap() {
  const color = cell => VizCharts.indexColor(cell, MIN_E);
  if (S.level === "usa") {
    const stats = DataCore.byAreaIndex(usa.areas, S.range, S.source, rates);
    const states = statesGeo.features.filter(f => FIPS[f.id]);
    GeoMap.draw({
      key: "usa",
      context: [],
      areas: states,
      focus: states,
      statOf: f => stats.get(f.id),
      colorOf: color,
      pins: f => pinFor("state", f.id),
      onClick: f => navigate("state", {state: f.id}),
      onHover: (event, f) => {
        GeoMap.highlight(f);
        areaTip(event, f ? f.properties.name : "", f ? stats.get(f.id) : null);
      }
    });
    return;
  }
  const stats = DataCore.byAreaIndex(scope.areas, S.range, S.source, rates);
  const stateFeature = statesGeo.features.find(f => f.id === S.state);
  GeoMap.draw({
    key: `state-${S.state}`,
    context: statesGeo.features.filter(f => f.id !== S.state && FIPS[f.id]),
    areas: stateCounties,
    focus: [stateFeature],
    statOf: f => stats.get(countyOf(f)?.slug),
    colorOf: color,
    pins: f => pinFor("county", countyOf(f)?.slug),
    onClick: f => {
      const county = countyOf(f);
      if (county) navigate("county", {county: county.County, countySlug: county.slug});
    },
    onHover: (event, f) => {
      GeoMap.highlight(f);
      areaTip(event, f ? `${f.properties.NAME}, ${S.state}` : "", f ? stats.get(countyOf(f)?.slug) : null);
    }
  });
}

function filterRows() {
  let area = [];
  for (const row of areaRows) {
    if (S.source >= 0 && row.Source !== meta.sources[S.source]) continue;
    if (row.month === undefined) row.month = idMonth[+String(row.ID).slice(2)];
    if (row.month < S.range[0] || row.month > S.range[1]) continue;
    area.push(row);
  }
  const max = CONFIG.MAX_CHART_ROWS;
  if (area.length > max) {
    const stride = area.length / max;
    area = Array.from({length: max}, (_, i) => area[Math.floor(i * stride)]);
  }
  const lasso = area.filter(row => window.ExplorerFilters.inLasso(row));
  const visible = lasso.filter(row => window.ExplorerFilters.hourOk(row) && (!S.onlyHigh || row.Severity >= 3));
  return {area, lasso, visible};
}

function pointTip(info) {
  const row = info.object;
  if (!row) {
    VizCharts.hideTip();
    return;
  }
  const event = {clientX: info.x + $("map").getBoundingClientRect().left, clientY: info.y + $("map").getBoundingClientRect().top};
  const hourText = Number.isInteger(row.hour) ? `${String(row.hour).padStart(2, "0")}:00` : "hora sin dato";
  VizCharts.tip(event, [`Severity ${row.Severity}`, row.City || row.County, `${meta.months[row.month] || ""} · ${hourText} · ${row.Source}`]);
}

function renderStreetMap(visible) {
  if (!overlay) return;
  const outline = countyFeature(S.county);
  const valid = visible.filter(d => Number.isFinite(d.Start_Lng) && Number.isFinite(d.Start_Lat));
  const focusCity = S.level === "county" ? S.hoverCity : null;
  const faded = row => focusCity && row.City !== focusCity;
  const low = valid.filter(d => !(d.Severity >= 3));
  const high = valid.filter(d => d.Severity >= 3);
  overlay.setProps({layers: [
    new deck.GeoJsonLayer({
      id: "county-outline",
      data: outline ? [outline] : [],
      filled: false,
      stroked: true,
      getLineColor: [82, 81, 78, 220],
      lineWidthMinPixels: 1.5
    }),
    new deck.ScatterplotLayer({
      id: "points-low",
      data: low,
      pickable: true,
      radiusUnits: "pixels",
      getPosition: d => [d.Start_Lng, d.Start_Lat],
      getRadius: 3,
      getFillColor: d => faded(d) ? [185, 184, 178, 50] : [137, 135, 129, 170],
      updateTriggers: {getFillColor: [focusCity]},
      onHover: pointTip
    }),
    new deck.ScatterplotLayer({
      id: "points-high",
      data: high,
      pickable: true,
      radiusUnits: "pixels",
      getPosition: d => [d.Start_Lng, d.Start_Lat],
      getRadius: 4,
      stroked: true,
      lineWidthMinPixels: 1,
      getLineColor: [252, 252, 251, 255],
      getFillColor: d => faded(d) ? [11, 11, 11, 40] : [11, 11, 11, 230],
      updateTriggers: {getFillColor: [focusCity]},
      onHover: pointTip
    })
  ]});
}

function renderKpis(T) {
  const total = DataCore.indexTotal(T, S.range, S.source, rates);
  $("kpiTotal").textContent = int(total.t);
  $("kpiHigh").textContent = int(total.h);
  $("kpiRate").textContent = total.t ? `${pct(total.rate)} del total` : "";
  $("kpiIndex").textContent = total.e >= MIN_E ? times(total.index) : "—";
  $("kpiIndexNote").textContent = total.e >= MIN_E ? "1× = lo esperado" : "pocos datos para el índice";
  VizCharts.mix("#kpiMix", DataCore.bySource(T, S.range, meta.sources.length), meta.sources);
}

function yearsIn(range) {
  return d3.range(Math.floor(range[0] / 12), Math.floor(range[1] / 12) + 1);
}

function yearRange(year, range) {
  return [Math.max(range[0], year * 12), Math.min(range[1], year * 12 + 11)];
}

function timeMessage(text) {
  d3.select("#focusChart").selectAll("*").remove();
  d3.select("#focusChart").style("height", "0px");
  $("focusNote").textContent = text;
}

function renderTimeBySource(T) {
  const height = Math.max(220, Math.min(320, $("mapStage").clientHeight - 40));
  const months = d3.range(S.range[0], S.range[1] + 1);
  const monthly = DataCore.monthly(T, meta.months.length, meta.sources.length);
  const asRate = (cell, min) => cell.t >= min ? cell.h / cell.t : null;
  let labels = months.map(m => meta.months[m]);
  let series = sourceList().map(s => ({s, values: months.map(m => asRate(monthly[s][m], 50))}));
  let grain = "mes";

  const enough = list => list.some(x => x.values.filter(v => v !== null).length >= 6);
  if (!enough(series)) {
    const years = yearsIn(S.range);
    labels = years.map(y => String(2016 + y));
    series = sourceList().map(s => ({
      s,
      values: years.map(y => {
        const [a, b] = yearRange(y, S.range);
        const cell = d3.range(a, b + 1).reduce((acc, m) => ({t: acc.t + monthly[s][m].t, h: acc.h + monthly[s][m].h}), {t: 0, h: 0});
        return asRate(cell, 30);
      })
    }));
    grain = "año";
  }
  series = series.filter(x => x.values.filter(v => v !== null).length >= 3);
  if (!series.length) {
    timeMessage(`${areaName()} tiene muy pocos accidentes en este periodo para ver cómo cambian en el tiempo, ni siquiera agrupando por año. Los totales están arriba, en los indicadores.`);
    return;
  }

  const lines = series.map(x => ({label: meta.sources[x.s], color: VizCharts.SOURCE_COLORS[x.s], values: x.values}));
  let annotation = null;
  const s1 = series.findIndex(x => x.s === 0);
  if (S.level === "usa" && grain === "mes" && s1 >= 0 && S.range[0] <= 42 && S.range[1] >= 66) {
    annotation = {series: s1, at: 50 - S.range[0], labelValue: 0.07, anchor: "start", text: "Source1 cambia de criterio"};
  }
  VizCharts.lineChart("#focusChart", {labels, series: lines, height, yFormat: d3.format(".0%"), annotation});
  $("timeTitle").textContent = "¿Cuándo? Proporción con Severity ≥ 3, por fuente";
  $("focusNote").textContent = `Cada fuente comparada consigo misma, por ${grain}.`
    + (grain === "año" ? " Hay pocos accidentes por mes, así que se agrupa por año." : " Se omiten los meses con menos de 50 accidentes de una fuente.");
}

async function pinData(pin) {
  if (pin.kind === "state") return json(`${W12}/states/${pin.state}.json`);
  return json(`${W12}/states/${pin.state}/counties/${pin.slug}.json`);
}

function renderTimeCompare(A, B) {
  const height = Math.max(220, Math.min(320, $("mapStage").clientHeight - 40));
  const years = yearsIn(S.range);
  const yearly = data => years.map(y => {
    const cell = DataCore.indexTotal(data.T, yearRange(y, S.range), S.source, rates);
    return cell.e >= MIN_E ? cell.index : null;
  });
  VizCharts.lineChart("#focusChart", {
    labels: years.map(y => String(2016 + y)),
    series: [
      {label: `A · ${S.pins.A.label}`, color: "#0b0b0b", values: yearly(A)},
      {label: `B · ${S.pins.B.label}`, color: "#0b0b0b", className: "dashed", values: yearly(B)}
    ],
    height,
    yFormat: v => times(v),
    reference: 1
  });
  $("timeTitle").textContent = "¿Cuándo? Índice por año, A frente a B";
  $("focusNote").textContent = "1× es lo esperado según la fuente y el año; la mezcla de fuentes ya está descontada.";
}

function keyHtml(target, items) {
  const el = $(target);
  el.replaceChildren(...items.map(([cls, text]) => {
    const span = document.createElement("span");
    const dot = document.createElement("i");
    dot.className = cls;
    span.append(dot, document.createTextNode(text));
    return span;
  }));
}

function profileSources(P) {
  const totals = DataCore.bySource(P.T, S.range, meta.sources.length);
  return sourceList().filter(s => totals[s].t >= 200);
}

function renderProfileExact(P, title, note) {
  $("profileTitle").textContent = title;
  $("profileNote").textContent = note;
  $("heatChartB").classList.add("hidden");
  const heat = VizCharts.heat("#heatChart", {cells: DataCore.heat(P.H, S.range, S.source), divisor: DataCore.weekdayDays(S.range), hours: window.ExplorerFilters.getHours()});
  $("heatHelp").textContent = "Promedio de accidentes Severity ≥ 3 por día. Se divide por la cantidad de lunes, martes… del periodo.";
  $("heatNote").textContent = heat.note;

  const sources = profileSources(P);
  const infraBySource = new Map(sources.map(s => [s, DataCore.infraIndex(P.I, P.T, S.range, s, rates, meta.flags.length)]));
  const infraRows = meta.flags.map((flag, f) => ({
    label: VizCharts.FLAG_LABELS[flag],
    points: sources.map(s => ({name: meta.sources[s], cls: `src-${s}`, cell: infraBySource.get(s)[f].with})),
    hint: `Sin el elemento: ${sources.map(s => `${meta.sources[s]} ${times(infraBySource.get(s)[f].without.index)}`).join(" · ")}`
  }));
  VizCharts.indexChart("#infraChart", {rows: infraRows, minExpected: MIN_E});

  const groups = meta.weather.map((g, w) => ({g, w})).filter(d => VizCharts.WEATHER_LABELS[d.g]);
  const weatherBySource = new Map(sources.map(s => [s, DataCore.weatherIndex(P.W, S.range, s, rates, meta.weather.length)]));
  const weatherRows = groups.map(({g, w}) => ({
    label: VizCharts.WEATHER_LABELS[g],
    points: sources.map(s => ({name: meta.sources[s], cls: `src-${s}`, cell: weatherBySource.get(s)[w]}))
  }));
  VizCharts.indexChart("#weatherChart", {rows: weatherRows, minExpected: MIN_E});

  const key = sources.length > 1 ? sources.map(s => [`src-${s}`, meta.sources[s]]) : [];
  keyHtml("infraKey", key);
  keyHtml("weatherKey", key);
  $("weatherHelp").textContent = "Índice según la condición registrada al momento del accidente, por fuente.";
}

function renderProfileSample(rows) {
  $("profileTitle").textContent = `Perfil del lazo en ${areaName()}`;
  $("profileNote").textContent = `Calculado con los ${int(rows.length)} reportes de la muestra que caen dentro del lazo.`;
  $("heatChartB").classList.add("hidden");
  const sampled = DataCore.heatRows(rows);
  const heat = VizCharts.heat("#heatChart", {cells: sampled.cells, divisor: null, hours: window.ExplorerFilters.getHours()});
  $("heatHelp").textContent = "Accidentes Severity ≥ 3 de la muestra dentro del lazo, sin normalizar.";
  $("heatNote").textContent = heat.note;

  const sources = sourceList().filter(s => rows.filter(r => r.Source === meta.sources[s]).length >= 30);
  const bySource = new Map(sources.map(s => [s, DataCore.sampleInfraIndex(rows.filter(r => r.Source === meta.sources[s]), meta.flags, meta.sources, rates)]));
  const infraRows = meta.flags.map((flag, f) => ({
    label: VizCharts.FLAG_LABELS[flag],
    points: sources.map(s => ({name: meta.sources[s], cls: `src-${s}`, cell: bySource.get(s)[f].with}))
  }));
  VizCharts.indexChart("#infraChart", {rows: infraRows, minExpected: 5});
  keyHtml("infraKey", sources.length > 1 ? sources.map(s => [`src-${s}`, meta.sources[s]]) : []);
  keyHtml("weatherKey", []);
  const svg = d3.select("#weatherChart");
  svg.selectAll("*").remove();
  svg.attr("viewBox", "0 0 320 50").style("height", "50px");
  svg.append("text").attr("class", "empty").attr("x", 160).attr("y", 25).attr("text-anchor", "middle").text("La muestra no trae la condición del clima; quita el lazo para verla.");
  $("weatherHelp").textContent = "";
}

function renderProfileCompare(A, B) {
  $("profileTitle").textContent = "Perfil: A frente a B";
  $("profileNote").textContent = `A = ${S.pins.A.label} · B = ${S.pins.B.label}. Mismo periodo y fuente.`;
  const hours = window.ExplorerFilters.getHours();
  const divisor = DataCore.weekdayDays(S.range);
  $("heatChartB").classList.remove("hidden");
  const heatA = VizCharts.heat("#heatChart", {cells: DataCore.heat(A.H, S.range, S.source), divisor, hours, label: `A · ${S.pins.A.label}`});
  const heatB = VizCharts.heat("#heatChartB", {cells: DataCore.heat(B.H, S.range, S.source), divisor, hours, label: `B · ${S.pins.B.label}`});
  $("heatHelp").textContent = "Promedio de accidentes Severity ≥ 3 por día; cada panel tiene su propia escala.";
  $("heatNote").textContent = [heatA.note && `A: ${heatA.note}`, heatB.note && `B: ${heatB.note}`].filter(Boolean).join(" ");

  const infraA = DataCore.infraIndex(A.I, A.T, S.range, S.source, rates, meta.flags.length);
  const infraB = DataCore.infraIndex(B.I, B.T, S.range, S.source, rates, meta.flags.length);
  VizCharts.indexChart("#infraChart", {
    minExpected: MIN_E,
    rows: meta.flags.map((flag, f) => ({
      label: VizCharts.FLAG_LABELS[flag],
      points: [{name: "A", cls: "pin-a", cell: infraA[f].with}, {name: "B", cls: "pin-b", cell: infraB[f].with}]
    }))
  });
  const weatherA = DataCore.weatherIndex(A.W, S.range, S.source, rates, meta.weather.length);
  const weatherB = DataCore.weatherIndex(B.W, S.range, S.source, rates, meta.weather.length);
  VizCharts.indexChart("#weatherChart", {
    minExpected: MIN_E,
    rows: meta.weather.map((g, w) => ({g, w})).filter(d => VizCharts.WEATHER_LABELS[d.g]).map(({g, w}) => ({
      label: VizCharts.WEATHER_LABELS[g],
      points: [{name: "A", cls: "pin-a", cell: weatherA[w]}, {name: "B", cls: "pin-b", cell: weatherB[w]}]
    }))
  });
  const key = [["pin-a", `A · ${S.pins.A.label}`], ["pin-b", `B · ${S.pins.B.label}`]];
  keyHtml("infraKey", key);
  keyHtml("weatherKey", key);
  $("weatherHelp").textContent = S.source < 0
    ? "Índice con las fuentes combinadas. Si quieres ver si las fuentes coinciden, elige una a la izquierda."
    : `Índice dentro de ${meta.sources[S.source]}.`;
}

function renderCities() {
  if (!isStreet()) {
    $("citiesBlock").classList.add("hidden");
    return;
  }
  $("citiesBlock").classList.remove("hidden");
  $("citiesTitle").textContent = `Ciudades de ${S.county}`;
  const stats = DataCore.byAreaIndex(scope.areas, S.range, S.source, rates);
  const rows = [...stats.entries()].map(([name, cell]) => ({name, ...cell})).sort((a, b) => b.t - a.t);
  VizCharts.cityList("#cityList", {
    rows,
    selected: S.city,
    minExpected: MIN_E,
    onClick: name => navigate("city", {city: name}),
    onHover: name => {
      if (S.level !== "county") return;
      S.hoverCity = name;
      renderStreetMap(filterRows().visible);
    }
  });
}

async function renderPins() {
  const box = $("pinSummary");
  const cards = [];
  for (const key of ["A", "B"]) {
    const pin = S.pins[key];
    if (!pin) continue;
    const data = await pinData(pin);
    const cell = DataCore.indexTotal(data.T, S.range, S.source, rates);
    const card = document.createElement("div");
    card.className = "pin-card";
    const title = document.createElement("b");
    const letter = document.createElement("span");
    letter.className = "pin-key";
    letter.textContent = key;
    title.append(letter, document.createTextNode(pin.label));
    const line = document.createElement("span");
    line.textContent = `${cell.e >= MIN_E ? times(cell.index) : "pocos datos"} lo esperado · ${int(cell.t)} accidentes`;
    const svgId = `pinMix${key}`;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = svgId;
    card.append(title, line, svg);
    cards.push({card, svgId, data});
  }
  box.replaceChildren(...cards.map(c => c.card));
  for (const c of cards) VizCharts.mix(`#${c.svgId}`, DataCore.bySource(c.data.T, S.range, meta.sources.length), meta.sources);
  $("clearPins").disabled = !S.pins.A && !S.pins.B;
  const allowed = S.level === "state" || S.level === "county";
  $("pinA").disabled = !allowed;
  $("pinB").disabled = !allowed;
  $("pinA").title = allowed ? "" : "Se comparan estados o condados";
  $("pinB").title = $("pinA").title;
}

function renderTable() {
  $("mapTable").classList.toggle("hidden", !S.table);
  $("tableBtn").setAttribute("aria-pressed", String(S.table));
  $("tableBtn").textContent = S.table ? "Volver al mapa" : "Ver como tabla";
  if (!S.table) return;
  let stats;
  let nameOf = key => key;
  if (S.level === "usa") {
    stats = DataCore.byAreaIndex(usa.areas, S.range, S.source, rates);
    const names = new Map(statesGeo.features.map(f => [f.id, f.properties.name]));
    nameOf = key => names.get(key) || key;
  } else {
    stats = DataCore.byAreaIndex(scope.areas, S.range, S.source, rates);
    if (S.level === "state") nameOf = key => slugNames.get(key) || key;
  }
  const rows = [...stats.entries()]
    .map(([key, cell]) => ({name: nameOf(key), ...cell}))
    .sort((a, b) => (b.e >= MIN_E ? b.index : -1) - (a.e >= MIN_E ? a.index : -1));
  VizCharts.table("#mapTable", {rows, minExpected: MIN_E});
}

let renderToken = 0;
async function render() {
  if (!scope) return;
  const token = ++renderToken;
  const T = scopeTable();
  renderKpis(T);
  $("periodLabel").textContent = periodName(S.range);

  let rows = null;
  if (isStreet()) {
    rows = filterRows();
    renderStreetMap(rows.visible);
  } else {
    renderGeoMap();
  }
  renderCities();
  renderTable();

  if (comparing()) {
    const [A, B] = await Promise.all([pinData(S.pins.A), pinData(S.pins.B)]);
    if (token !== renderToken) return;
    renderTimeCompare(A, B);
    renderProfileCompare(A, B);
  } else {
    renderTimeBySource(T);
    if (isStreet() && window.ExplorerFilters.hasLasso()) {
      renderProfileSample(rows.lasso);
    } else if (S.level === "city") {
      const total = DataCore.total(T, S.range, S.source);
      renderProfileExact(scope, `Perfil de ${S.county}`, `${S.city} tiene ${int(total.t)} accidentes en el periodo. Por ciudad solo hay totales, así que el perfil muestra el condado como contexto.`);
    } else {
      renderProfileExact(scope, `Perfil de ${areaName()}`, `${sourceList().length > 1 ? "Las tres fuentes" : meta.sources[S.source]} · ${periodName(S.range)}`);
    }
  }
  await renderPins();
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => render().catch(showError));
}

function navigationUI() {
  $("stateSelect").value = S.state || "ALL";
  $("backBtn").disabled = S.level === "usa";
  const crumbs = [["usa", "Estados Unidos"]];
  if (S.state) crumbs.push(["state", stateName(S.state)]);
  if (S.county) crumbs.push(["county", S.county]);
  if (S.city) crumbs.push(["city", S.city]);
  const nav = $("breadcrumb");
  nav.replaceChildren();
  crumbs.forEach(([level, label], i) => {
    if (i) {
      const sep = document.createElement("span");
      sep.className = "sep";
      sep.textContent = "›";
      nav.append(sep);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => navigate(level));
    nav.append(button);
  });
  $("mapTitle").textContent = S.level === "usa" ? "Estados Unidos" : [S.city, S.county, stateName(S.state)].filter(Boolean).join(", ");
}

function navigate(level, selection = {}) {
  const before = [S.level, S.state, S.county, S.city].join("/");
  Object.assign(S, selection, {level});
  if (level === "usa") S.state = null;
  if (level === "usa" || level === "state") {
    S.county = null;
    S.countySlug = null;
  }
  if (level !== "city") S.city = null;
  S.hoverCity = null;
  if ([S.level, S.state, S.county, S.city].join("/") !== before) window.ExplorerFilters.clearLasso(false);
  load();
}

function decodeSample(payload) {
  return payload.rows.map(values => Object.fromEntries(payload.columns.map((column, i) => [column, values[i]])));
}

async function sampleWithTime(payload, base, signal) {
  const rows = decodeSample(payload);
  if (!rows.length || (payload.columns.includes("hour") && payload.columns.includes("weekday"))) return rows;
  const time = await json(`${base}/temporal.json`, signal);
  const byId = new Map(time.rows.map(row => [row[0], [row[1], row[2]]]));
  return rows.map(row => {
    const found = byId.get(row.ID);
    return found ? {...row, hour: found[0], weekday: found[1]} : row;
  });
}

async function citySample(base, signal) {
  const index = await json(`${base}/cities.json`, signal);
  if (index[S.city] === undefined) return {columns: [], rows: []};
  return json(`${base}/cities/${index[S.city]}.json`, signal);
}

async function loadStateBasics(signal) {
  const [geo, counties] = await Promise.all([
    countiesGeo || json(COUNTIES_GEOJSON, signal),
    json(`${DATA_ROOT}/states/${S.state}/counties_summary.json`, signal)
  ]);
  if (!countiesGeo) rewind(geo.features);
  countiesGeo = geo;
  countyNames = new Map(counties.map(row => [normCounty(row.County), {County: row.County, slug: row.county_slug}]));
  slugNames = new Map(counties.map(row => [row.county_slug, row.County]));
  stateCounties = geo.features.filter(f => String(f.id).padStart(5, "0").slice(0, 2) === FIPS[S.state]);
}

function fitBounds(points, animate) {
  const bounds = new mapboxgl.LngLatBounds();
  for (const p of points) bounds.extend(p);
  if (!bounds.isEmpty()) map.fitBounds(bounds, {padding: 60, maxZoom: 14, duration: animate ? 600 : 0});
}

function featurePoints(feature) {
  const out = [];
  const visit = coords => {
    if (typeof coords[0] === "number") out.push(coords);
    else coords.forEach(visit);
  };
  visit(feature.geometry.coordinates);
  return out;
}

function moveStreetCamera(animate) {
  const key = [S.level, S.state, S.county, S.city].join("/");
  if (key === cameraKey) return;
  cameraKey = key;
  if (S.level === "city") {
    const coords = areaRows.filter(r => Number.isFinite(r.Start_Lng) && Number.isFinite(r.Start_Lat)).map(r => [r.Start_Lng, r.Start_Lat]);
    if (coords.length) {
      fitBounds(coords, animate);
      return;
    }
  }
  const outline = countyFeature(S.county);
  if (outline) fitBounds(featurePoints(outline), animate);
}

async function load() {
  const version = ++generation;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  navigationUI();
  VizCharts.hideTip();
  $("error").classList.add("hidden");
  $("loading").classList.remove("hidden");
  try {
    if (S.level === "usa") {
      scope = usa;
      areaRows = [];
      useGeoMap();
    } else if (S.level === "state") {
      const [data] = await Promise.all([json(`${W12}/states/${S.state}.json`, signal), loadStateBasics(signal)]);
      if (version !== generation) return;
      scope = data;
      areaRows = [];
      useGeoMap();
    } else {
      const sampleBase = `${EXPLORER_ROOT}/states/${S.state}/counties/${S.countySlug}`;
      const sample = S.level === "city" ? citySample(sampleBase, signal) : json(`${sampleBase}/sample.json`, signal);
      const [data, payload] = await Promise.all([
        json(`${W12}/states/${S.state}/counties/${S.countySlug}.json`, signal),
        sample,
        loadStateBasics(signal),
        loadMonthIndex(),
        ensureMapbox()
      ]);
      const rows = await sampleWithTime(payload, sampleBase, signal);
      if (version !== generation) return;
      scope = data;
      areaRows = rows;
      const justShown = useStreetMap();
      moveStreetCamera(!justShown);
    }
    Timeline.context({T: scopeTable(), months: meta.months, sources: meta.sources, source: S.source, range: S.range});
    await render();
  } catch (error) {
    if (error.name !== "AbortError" && version === generation) showError(error);
  } finally {
    if (version === generation) $("loading").classList.add("hidden");
  }
}

function setRange(range) {
  S.range = range;
  markStory(-1);
  schedule();
}

function setSource(index) {
  S.source = index;
  $("sourceSelect").value = index < 0 ? "ALL" : meta.sources[index];
  Timeline.context({T: scopeTable(), months: meta.months, sources: meta.sources, source: index, range: S.range});
  schedule();
}

function pin(key) {
  if (S.level !== "state" && S.level !== "county") return;
  S.pins[key] = S.level === "state"
    ? {kind: "state", state: S.state, label: stateName(S.state)}
    : {kind: "county", state: S.state, slug: S.countySlug, label: `${S.county}, ${S.state}`};
  schedule();
}

const STORIES = [
  {
    title: "Source1 cambió de criterio: 33 % en 2018, 2 % en 2021",
    text: "Mira la línea de tiempo: la proporción de Source1 se desploma entre 2019 y 2021 mientras Source2 se mantiene. Por eso el mapa usa el índice y no porcentajes brutos.",
    apply: () => startStory({range: [24, 83]})
  },
  {
    title: "Nieve y tormentas: unas 1.25 veces lo esperado, en las dos fuentes",
    text: "Mira «¿Con qué clima?»: nieve o hielo y tormenta quedan entre 1.2× y 1.3× en Source1 y en Source2; la niebla, por debajo de 1×. En la vía, en cambio, las fuentes no coinciden: con semáforo Source1 da 1.10× y Source2 0.27×.",
    apply: () => startStory({})
  },
  {
    title: "Carolina del Sur frente a Ohio: misma mezcla de fuentes, 0.54× frente a 1.22×",
    text: "Las dos tienen ~38 % de Source1 y ~60 % de Source2, y aun así quedan en lados opuestos de lo esperado. El perfil y la línea de tiempo superponen A y B.",
    apply: () => startStory({pins: {A: {kind: "state", state: "SC", label: "Carolina del Sur"}, B: {kind: "state", state: "OH", label: "Ohio"}}})
  }
];

function markStory(active) {
  [...$("stories").children].forEach((button, i) => button.setAttribute("aria-pressed", String(i === active)));
  $("storyText").textContent = active >= 0 ? STORIES[active].text : "";
}

function startStory({range, pins = {A: null, B: null}}) {
  S.range = range || [0, meta.months.length - 1];
  S.pins = pins;
  S.source = -1;
  $("sourceSelect").value = "ALL";
  window.ExplorerFilters.reset();
  navigate("usa");
}

function buildStories() {
  const buttons = STORIES.map((story, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = story.title;
    button.addEventListener("click", () => {
      story.apply();
      markStory(i);
    });
    return button;
  });
  $("stories").replaceChildren(...buttons);
}

function bindControls() {
  const states = [...usa.areas.names].map(code => [code, stateName(code)]).sort((a, b) => a[1].localeCompare(b[1], "es"));
  for (const [code, name] of states) $("stateSelect").append(new Option(name, code));
  for (const source of meta.sources) $("sourceSelect").append(new Option(source, source));

  $("stateSelect").addEventListener("change", event => {
    const value = event.target.value;
    if (value === "ALL") navigate("usa");
    else navigate("state", {state: value});
  });
  $("sourceSelect").addEventListener("change", event => setSource(meta.sources.indexOf(event.target.value)));
  $("fullPeriod").addEventListener("click", () => {
    S.range = [0, meta.months.length - 1];
    Timeline.move(S.range);
    schedule();
  });
  $("backBtn").addEventListener("click", () => {
    const up = {state: "usa", county: "state", city: "county"};
    navigate(up[S.level] || "usa");
  });
  $("aboutBtn").addEventListener("click", () => $("about").showModal());
  $("pinA").addEventListener("click", () => pin("A"));
  $("pinB").addEventListener("click", () => pin("B"));
  $("clearPins").addEventListener("click", () => {
    S.pins = {A: null, B: null};
    markStory(-1);
    schedule();
  });
  $("onlyHigh").addEventListener("change", event => {
    S.onlyHigh = event.target.checked;
    schedule();
  });
  $("tableBtn").addEventListener("click", () => {
    S.table = !S.table;
    renderTable();
  });
  $("resetFilters").addEventListener("click", () => {
    S.range = [0, meta.months.length - 1];
    S.pins = {A: null, B: null};
    S.onlyHigh = false;
    $("onlyHigh").checked = false;
    window.ExplorerFilters.reset();
    markStory(-1);
    setSource(-1);
  });
}

async function boot() {
  $("loading").classList.remove("hidden");
  try {
    if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN.includes("PEGA_AQUI")) {
      throw new Error("Configura un token público de Mapbox en js/config.js.");
    }
    [usa, statesGeo] = await Promise.all([json(`${W12}/usa.json`), json(STATES_GEOJSON)]);
    rewind(statesGeo.features);
    meta = usa.meta;
    rates = DataCore.nationalRates(usa.T, meta.sources.length);
    S.range = [0, meta.months.length - 1];

    VizCharts.legend("#mapLegend");
    Timeline.init(setRange);
    bindControls();
    buildStories();

    new ResizeObserver(() => {
      if (map && isStreet()) map.resize();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!scope) return;
        Timeline.context({T: scopeTable(), months: meta.months, sources: meta.sources, source: S.source, range: S.range});
        render().catch(showError);
      });
    }).observe(document.querySelector(".layout"));

    await load();
  } catch (error) {
    showError(error);
    $("loading").classList.add("hidden");
  }
}

boot();
