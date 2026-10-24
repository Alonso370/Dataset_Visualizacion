const CONFIG = window.VIZZU_CONFIG;
const DATA_ROOT = CONFIG.DATA_ROOT;
const EXPLORER_ROOT = CONFIG.EXPLORER_ROOT;
const W12 = CONFIG.W12_ROOT;
const MIN_N = CONFIG.MIN_N || 30;
const STATES_GEOJSON = "https://raw.githubusercontent.com/python-visualization/folium/master/examples/data/us-states.json";
const COUNTIES_GEOJSON = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json";
const FIPS = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12",
  GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23",
  MD: "24", MA: "25", MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33",
  NJ: "34", NM: "35", NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56"
};
const THRESHOLDS = [0.05, 0.1, 0.15, 0.2, 0.3, 0.4];
const CLASS_COLORS = d3.schemeYlOrRd[7];
const rateColor = d3.scaleThreshold(THRESHOLDS, CLASS_COLORS);
const severityColors = {1: [56, 189, 248, 190], 2: [37, 99, 235, 190], 3: [245, 158, 11, 210], 4: [220, 38, 38, 220]};
const MAP_HANDLERS = ["dragPan", "scrollZoom", "doubleClickZoom", "touchZoomRotate", "keyboard", "boxZoom"];

const S = {level: "usa", state: null, county: null, countySlug: null, city: null, source: -1, range: [0, 0], pins: {A: null, B: null}};

const $ = id => document.getElementById(id);
const int = v => Math.round(v).toLocaleString("es-PE");
const pct = v => v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)} %`;
const tooltip = $("tooltip");

function normCounty(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+(county|parish|borough)$/i, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

let map, overlay, statesGeo, countiesGeo, usa, meta, idMonth;
let generation = 0;
let controller;
let cameraKey = "";
let frame;
let scope = null;
let areaRows = [];
let areaFeatures = [];
let countyNames = new Map();
let cityPlaces = new Map();

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

function sourceName() {
  return S.source < 0 ? "Todas las fuentes" : meta.sources[S.source];
}

function periodName(range) {
  if (range[0] === range[1]) return meta.months[range[0]];
  return `${meta.months[range[0]]} a ${meta.months[range[1]]}`;
}

function showError(error) {
  $("error").textContent = error.message || String(error);
  $("error").classList.remove("hidden");
}

function hideTip() {
  tooltip.style.opacity = 0;
}

function tip(info, lines) {
  if (!info.object) {
    hideTip();
    return;
  }
  const rows = lines.map(text => {
    const div = document.createElement("div");
    div.textContent = text;
    return div;
  });
  tooltip.replaceChildren(...rows);
  const rect = $("map").getBoundingClientRect();
  tooltip.style.left = `${Math.min(rect.left + info.x + 12, innerWidth - 280)}px`;
  tooltip.style.top = `${rect.top + info.y + 12}px`;
  tooltip.style.opacity = 1;
}

function fillFor(stat, alpha) {
  if (!stat || stat.t < MIN_N) return [229, 231, 235, alpha];
  const c = d3.color(rateColor(stat.rate));
  return [c.r, c.g, c.b, alpha];
}

function areaTip(info, stat, name) {
  if (!stat) {
    tip(info, [name, "Sin accidentes en este periodo y fuente"]);
    return;
  }
  tip(info, [
    name,
    `${int(stat.t)} accidentes · ${pct(stat.rate)} con Severity ≥ 3`,
    stat.t < MIN_N ? `Menos de ${MIN_N}: sin color` : "Clic para explorar"
  ]);
}

function fitFeature(feature) {
  if (!feature) return;
  const bounds = new mapboxgl.LngLatBounds();
  const visit = coords => {
    if (typeof coords[0] === "number") bounds.extend(coords);
    else coords.forEach(visit);
  };
  visit(feature.geometry.coordinates);
  if (!bounds.isEmpty()) map.fitBounds(bounds, {padding: 40, maxZoom: 11, duration: 550});
}

function countyFeature(name) {
  return areaFeatures.find(f => normCounty(f.properties.NAME) === normCounty(name));
}

function countyOf(feature) {
  return countyNames.get(normCounty(feature.properties.NAME));
}

function pinLayer(features, matches) {
  const data = [];
  for (const key of ["A", "B"]) {
    const pin = S.pins[key];
    if (!pin) continue;
    for (const f of features) {
      if (matches(f, pin)) data.push({...f, properties: {...f.properties, pin: key}});
    }
  }
  const lineColor = f => {
    const c = d3.color(VizCharts.AB[f.properties.pin]);
    return [c.r, c.g, c.b, 255];
  };
  return new deck.GeoJsonLayer({
    id: `pins-${data.map(d => d.properties.pin + d.id).join("-")}`,
    data,
    filled: false,
    stroked: true,
    getLineColor: lineColor,
    lineWidthMinPixels: 3
  });
}

function pointLayer(rows) {
  return new deck.ScatterplotLayer({
    id: "accident-sample",
    data: rows.filter(d => Number.isFinite(d.Start_Lng) && Number.isFinite(d.Start_Lat)),
    pickable: true,
    radiusUnits: "pixels",
    getPosition: d => [d.Start_Lng, d.Start_Lat],
    getRadius: 3,
    getFillColor: d => severityColors[d.Severity] || [100, 116, 139, 180],
    onHover: info => {
      const row = info.object;
      tip(info, row ? [row.City || row.County, `Severidad ${row.Severity} · ${row.Source}`, meta.months[row.month] || ""] : []);
    },
    onClick: info => {
      if (S.level !== "state" || !info.object) return;
      const county = countyNames.get(normCounty(info.object.County));
      if (county) navigate("county", {county: county.County, countySlug: county.slug});
    }
  });
}

function usaLayers() {
  const stats = DataCore.byArea(usa.areas, S.range, S.source);
  const states = new deck.GeoJsonLayer({
    id: "states",
    data: statesGeo,
    pickable: true,
    filled: true,
    stroked: true,
    lineWidthMinPixels: 1,
    getLineColor: [90, 90, 90, 200],
    getFillColor: f => fillFor(stats.get(f.id), 200),
    updateTriggers: {getFillColor: [S.range.join(), S.source]},
    onHover: info => info.object ? areaTip(info, stats.get(info.object.id), info.object.properties.name) : hideTip(),
    onClick: info => {
      if (info.object && FIPS[info.object.id]) navigate("state", {state: info.object.id});
    }
  });
  const pins = pinLayer(statesGeo.features, (f, pin) => pin.kind === "state" && pin.state === f.id);
  return [states, pins];
}

function stateLayers() {
  const stats = DataCore.byArea(scope.areas, S.range, S.source);
  const statOf = f => stats.get(countyOf(f)?.slug);
  const counties = new deck.GeoJsonLayer({
    id: `counties-${S.state}`,
    data: areaFeatures,
    pickable: true,
    filled: true,
    stroked: true,
    lineWidthMinPixels: 1,
    getLineColor: [71, 85, 105, 170],
    getFillColor: f => fillFor(statOf(f), 150),
    updateTriggers: {getFillColor: [S.range.join(), S.source]},
    onHover: info => info.object ? areaTip(info, statOf(info.object), info.object.properties.NAME) : hideTip(),
    onClick: info => {
      const county = info.object && countyOf(info.object);
      if (county) navigate("county", {county: county.County, countySlug: county.slug});
    }
  });
  const pins = pinLayer(areaFeatures, (f, pin) => pin.kind === "county" && pin.state === S.state && pin.slug === countyOf(f)?.slug);
  return [counties, pins];
}

function countyLayers() {
  const selected = countyFeature(S.county);
  const layers = [new deck.GeoJsonLayer({
    id: "selected-boundary",
    data: selected ? [selected] : [],
    filled: false,
    stroked: true,
    getLineColor: [71, 85, 105, 200],
    lineWidthMinPixels: 1.5
  })];
  if (S.level !== "county") return layers;

  const stats = DataCore.byArea(scope.areas, S.range, S.source);
  const cities = [...cityPlaces.values()]
    .map(c => ({...c, stat: stats.get(c.City)}))
    .filter(c => c.stat);
  const radius = d3.scaleSqrt([0, d3.max(cities, d => d.stat.t) || 1], [4, 22]);
  layers.push(new deck.ScatterplotLayer({
    id: `cities-${S.countySlug}`,
    data: cities,
    pickable: true,
    radiusUnits: "pixels",
    getPosition: d => [d.lng, d.lat],
    getRadius: d => radius(d.stat.t),
    getFillColor: d => fillFor(d.stat, 200),
    stroked: true,
    getLineColor: [255, 255, 255, 240],
    lineWidthMinPixels: 1,
    updateTriggers: {getRadius: [S.range.join(), S.source], getFillColor: [S.range.join(), S.source]},
    onHover: info => info.object ? areaTip(info, info.object.stat, info.object.City) : hideTip(),
    onClick: info => {
      if (info.object) navigate("city", {city: info.object.City});
    }
  }));
  return layers;
}

function mapLayers(visible) {
  if (S.level === "usa") return usaLayers();
  const base = S.level === "state" ? stateLayers() : countyLayers();
  return [...base, pointLayer(visible)];
}

function scopeTable() {
  return S.level === "city" ? DataCore.areaTable(scope.areas, S.city) : scope.T;
}

function usesExactData() {
  return S.level !== "city" && !window.ExplorerFilters.hasLasso() && scope.H;
}

function filterRows() {
  const severity = $("severitySelect").value;
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
  const visible = lasso.filter(row => {
    const severityOk = severity === "ALL" || +row.Severity === +severity;
    return severityOk && window.ExplorerFilters.hourOk(row);
  });
  return {area, lasso, visible};
}

function renderHeatAndInfra(rows) {
  const exact = usesExactData();
  const badge = exact ? "datos completos" : `muestra · ${int(rows.lasso.length)}`;
  for (const id of ["heatBadge", "infraBadge"]) {
    $(id).textContent = badge;
    $(id).className = exact ? "badge" : "badge sample";
  }

  const hours = window.ExplorerFilters.getHours();
  if (exact) {
    VizCharts.heat({cells: DataCore.heat(scope.H, S.range, S.source), divisor: DataCore.weekdayDays(S.range), hours});
  } else {
    const sampled = DataCore.heatRows(rows.lasso);
    VizCharts.heat({cells: sampled.cells, divisor: null, hours, missing: sampled.missing});
  }

  const data = exact
    ? DataCore.infra(scope.I, scope.T, S.range, meta.flags.length, meta.sources.length)
    : DataCore.infraRows(rows.lasso, meta.flags, meta.sources);
  VizCharts.infra({data, flags: meta.flags, sources: meta.sources, source: S.source, minN: exact ? MIN_N : 10});
}

function render() {
  if (!scope) return;
  const T = scopeTable();
  const total = DataCore.total(T, S.range, S.source);
  $("kpiTotal").textContent = int(total.t);
  $("kpiHigh").textContent = int(total.h);
  $("kpiRate").textContent = pct(total.rate);
  VizCharts.mix(DataCore.bySource(T, S.range, meta.sources.length), meta.sources);
  $("periodLabel").textContent = periodName(S.range);

  const where = S.city || S.county || S.state || "EE. UU.";
  Timeline.focus({T, months: meta.months, sources: meta.sources, source: S.source, range: S.range, scope: `${where} · ${sourceName()}`});

  const rows = S.level === "usa" ? {area: [], lasso: [], visible: []} : filterRows();
  overlay.setProps({layers: mapLayers(rows.visible)});
  renderHeatAndInfra(rows);

  VizCharts.radviz(rows.visible, row => {
    if (Number.isFinite(row.Start_Lng)) map.flyTo({center: [row.Start_Lng, row.Start_Lat], zoom: 13, duration: 500});
  });

  if (S.level === "usa") {
    $("scopeWeather").textContent = "";
    $("sampleNote").textContent = "Desde el nivel Estado aparecen los puntos de la muestra, el RadViz, el reloj y el lazo.";
  } else {
    $("scopeWeather").textContent = `muestra · ${int(rows.visible.length)}`;
    $("sampleNote").textContent = `Muestra: ${int(rows.visible.length)} visibles de ${int(rows.area.length)} en el periodo y fuente `
      + `(máximo ${int(CONFIG.MAX_CHART_ROWS)}). Horas, severidad y lazo filtran solo la muestra; los totales son del área completa.`;
  }
  renderCompare();
}

function schedule() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(render);
}

async function pinData(pin) {
  if (pin.kind === "state") return json(`${W12}/states/${pin.state}.json`);
  const county = await json(`${W12}/states/${pin.state}/counties/${pin.slug}.json`);
  return pin.kind === "city" ? {T: DataCore.areaTable(county.areas, pin.city)} : county;
}

async function compareArea(pin, range, source) {
  if (!pin) return null;
  const data = await pinData(pin);
  const series = DataCore.monthly(data.T, meta.months.length, meta.sources.length);
  const monthly = meta.months.map((_, m) => {
    const cells = source < 0 ? series.map(s => s[m]) : [series[source][m]];
    const t = d3.sum(cells, c => c.t);
    const h = d3.sum(cells, c => c.h);
    return {t, h, rate: t >= 20 ? h / t : null};
  });
  return {
    label: pin.label,
    total: DataCore.total(data.T, range, source),
    bySource: DataCore.bySource(data.T, range, meta.sources.length),
    monthly,
    infra: data.I ? DataCore.infra(data.I, data.T, range, meta.flags.length, meta.sources.length) : null,
    weather: data.W ? DataCore.weather(data.W, range, source, meta.weather.length) : null
  };
}

let compareToken = 0;
async function renderCompare() {
  const token = ++compareToken;
  const range = S.range;
  const source = S.source;
  try {
    const [A, B] = await Promise.all([compareArea(S.pins.A, range, source), compareArea(S.pins.B, range, source)]);
    if (token !== compareToken) return;
    VizCharts.compare({
      A, B, range, source,
      months: meta.months,
      sources: meta.sources,
      flags: meta.flags,
      weatherGroups: meta.weather,
      minN: MIN_N
    });
  } catch (error) {
    showError(error);
  }
}

function pinUI() {
  const labels = ["A", "B"].filter(k => S.pins[k]).map(k => `${k}: ${S.pins[k].label}`);
  $("pinLabels").textContent = labels.join(" · ") || "Navega a un estado, condado o ciudad y fíjalo como A o B.";
  $("clearPins").disabled = !S.pins.A && !S.pins.B;
  $("pinA").disabled = S.level === "usa";
  $("pinB").disabled = S.level === "usa";
}

const HELP = {
  usa: "Color = proporción con Severity ≥ 3 en el periodo y fuente elegidos. Clic en un estado para explorarlo.",
  state: "Condados coloreados igual que el mapa nacional; puntos = muestra coloreada por severidad. Clic en un condado.",
  county: "Burbujas = ciudades: tamaño = accidentes, color = proporción con Severity ≥ 3. Clic en una burbuja.",
  city: "Puntos = muestra de la ciudad. Usa el lazo para acotar una zona de hasta 5 km."
};
const LEVEL_NAMES = {usa: "USA", state: "Estado", county: "Condado", city: "Ciudad"};

function navigationUI() {
  $("stateSelect").value = S.state || "ALL";
  $("backBtn").disabled = S.level === "usa";

  const crumbs = [["usa", "USA"]];
  if (S.state) crumbs.push(["state", S.state]);
  if (S.county) crumbs.push(["county", S.county]);
  if (S.city) crumbs.push(["city", S.city]);
  $("breadcrumb").replaceChildren();
  crumbs.forEach(([level, label], i) => {
    if (i) $("breadcrumb").append("›");
    const button = document.createElement("button");
    button.textContent = label;
    button.addEventListener("click", () => navigate(level));
    $("breadcrumb").append(button);
  });

  $("mapTitle").textContent = S.level === "usa" ? "Estados Unidos" : [S.state, S.county, S.city].filter(Boolean).join(" · ");
  $("mapHelp").textContent = HELP[S.level];
  $("levelBadge").textContent = `Nivel: ${LEVEL_NAMES[S.level]}`;
  $("mapLegendNote").textContent = S.level === "usa"
    ? "Escala fija por clases: los colores se comparan entre periodos."
    : "Mismas clases de color. Puntos: azul = severidad 1–2, ámbar/rojo = 3–4.";
  pinUI();
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

function sampleRequest(level, base, signal) {
  if (level !== "city") return json(`${base}/sample.json`, signal);
  return json(`${base}/cities.json`, signal).then(index => {
    if (index[S.city] === undefined) return {columns: [], rows: []};
    return json(`${base}/cities/${index[S.city]}.json`, signal);
  });
}

function placeCities(rows) {
  cityPlaces = new Map();
  if (!rows) return;
  for (const row of rows) {
    if (!Number.isFinite(row.lat) || !row.coord_n) continue;
    const city = cityPlaces.get(row.City) || {City: row.City, latSum: 0, lngSum: 0, n: 0};
    city.latSum += row.lat * row.coord_n;
    city.lngSum += row.lng * row.coord_n;
    city.n += row.coord_n;
    cityPlaces.set(row.City, city);
  }
  for (const city of cityPlaces.values()) {
    city.lat = city.latSum / city.n;
    city.lng = city.lngSum / city.n;
  }
}

function sampleForSource(source) {
  return areaRows.filter(row => source < 0 || row.Source === meta.sources[source]);
}

function drawContext() {
  Timeline.context({T: scopeTable(), months: meta.months, sources: meta.sources, source: S.source, range: S.range});
}

function moveCamera(level) {
  const key = [level, S.state, S.county, S.city].join("/");
  if (key === cameraKey) return;
  cameraKey = key;
  if (level === "usa") map.flyTo({center: [-98.5, 39.5], zoom: 3.2, duration: 550});
  else if (level === "state") fitFeature(statesGeo.features.find(f => f.id === S.state));
  else if (level === "county") fitFeature(countyFeature(S.county));
  else {
    const city = cityPlaces.get(S.city);
    if (city) map.flyTo({center: [city.lng, city.lat], zoom: 12, duration: 550});
  }
}

async function load() {
  const version = ++generation;
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const level = S.level;

  hideTip();
  navigationUI();
  $("error").classList.add("hidden");
  $("loading").classList.remove("hidden");
  window.ExplorerFilters.setContext(level !== "usa");
  for (const handler of MAP_HANDLERS) map[handler][level === "usa" ? "disable" : "enable"]();

  try {
    if (level === "usa") {
      scope = usa;
      areaRows = [];
      VizCharts.clearRad();
      drawContext();
      moveCamera(level);
      render();
      return;
    }

    const stateBase = `${DATA_ROOT}/states/${S.state}`;
    const sampleBase = level === "state"
      ? `${EXPLORER_ROOT}/states/${S.state}`
      : `${EXPLORER_ROOT}/states/${S.state}/counties/${S.countySlug}`;
    const scopeURL = level === "state"
      ? `${W12}/states/${S.state}.json`
      : `${W12}/states/${S.state}/counties/${S.countySlug}.json`;

    const [data, geo, counties, sample, cities] = await Promise.all([
      json(scopeURL, signal),
      countiesGeo || json(COUNTIES_GEOJSON, signal),
      json(`${stateBase}/counties_summary.json`, signal),
      sampleRequest(level, sampleBase, signal).then(payload => sampleWithTime(payload, sampleBase, signal)),
      level === "state" ? null : json(`${stateBase}/counties/${S.countySlug}/cities_summary.json`, signal),
      loadMonthIndex()
    ]);
    if (version !== generation) return;

    countiesGeo = geo;
    scope = data;
    areaRows = sample;
    countyNames = new Map(counties.map(row => [normCounty(row.County), {County: row.County, slug: row.county_slug}]));
    areaFeatures = geo.features.filter(f => String(f.id).padStart(5, "0").slice(0, 2) === FIPS[S.state]);
    placeCities(cities);

    VizCharts.setRadRows(sampleForSource(S.source));
    drawContext();
    moveCamera(level);
    render();
  } catch (error) {
    if (error.name !== "AbortError" && version === generation) showError(error);
  } finally {
    if (version === generation) $("loading").classList.add("hidden");
  }
}

function setRange(range) {
  S.range = range;
  schedule();
}

function setSource(index) {
  S.source = index;
  $("sourceSelect").value = index < 0 ? "ALL" : meta.sources[index];
  if (S.level !== "usa") VizCharts.setRadRows(sampleForSource(index));
  drawContext();
  render();
}

function pin(key) {
  if (S.level === "usa") return;
  S.pins[key] = {
    kind: S.level,
    state: S.state,
    slug: S.countySlug,
    city: S.city,
    label: [S.city, S.county, S.state].filter(Boolean).join(", ")
  };
  pinUI();
  render();
}

function startStory({range, pins = {A: null, B: null}}) {
  S.range = range || [0, meta.months.length - 1];
  S.pins = pins;
  S.source = -1;
  $("sourceSelect").value = "ALL";
  window.ExplorerFilters.reset();
  navigate("usa");
}

const STORIES = [
  {
    title: "1 · Source1 cambió de criterio: 33 % en 2018, 2 % en 2021",
    text: "Mira T1: la línea de Source1 se desploma mientras Source2 sigue entre 30 % y 37 %. "
      + "La caída nacional de la proporción es un efecto de la fuente, no de las vías.",
    apply: () => startStory({range: [24, 83]})
  },
  {
    title: "2 · Intersección sube en ambas fuentes; el semáforo no",
    text: "Mira T4: con Junction la proporción sube en Source1 (7,6 → 13,1 %) y en Source2 (32,6 → 58,1 %). "
      + "Traffic_Signal solo “baja” el impacto en Source2.",
    apply: () => startStory({})
  },
  {
    title: "3 · Carolina del Sur frente a Ohio: misma mezcla, 12 % frente a 31 %",
    text: "Mira T5: las dos tienen ~38 % Source1 y ~60 % Source2, así que la brecha no viene de las fuentes; "
      + "se mantiene dentro de cada una (Source2: 18 % frente a 40 %).",
    apply: () => startStory({pins: {A: {kind: "state", state: "SC", label: "SC"}, B: {kind: "state", state: "OH", label: "OH"}}})
  }
];

function buildStories() {
  const title = document.createElement("span");
  title.textContent = "Recorridos guiados";
  const note = document.createElement("p");
  note.id = "storyText";
  note.className = "hint";

  const buttons = STORIES.map(story => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = story.title;
    button.title = story.text;
    button.addEventListener("click", () => {
      story.apply();
      note.textContent = story.text;
    });
    return button;
  });
  $("stories").replaceChildren(title, ...buttons, note);
}

function bindControls() {
  for (const state of [...usa.areas.names].sort()) $("stateSelect").append(new Option(state, state));
  for (const source of meta.sources) $("sourceSelect").append(new Option(source, source));

  $("stateSelect").addEventListener("change", event => {
    const value = event.target.value;
    if (value === "ALL") navigate("usa");
    else navigate("state", {state: value});
  });
  $("sourceSelect").addEventListener("change", event => setSource(meta.sources.indexOf(event.target.value)));
  $("severitySelect").addEventListener("change", schedule);
  $("fullPeriod").addEventListener("click", () => {
    S.range = [0, meta.months.length - 1];
    Timeline.move(S.range);
    render();
  });
  $("homeBtn").addEventListener("click", () => navigate("usa"));
  $("backBtn").addEventListener("click", () => {
    const up = {state: "usa", county: "state", city: "county"};
    navigate(up[S.level] || "usa");
  });
  $("aboutBtn").addEventListener("click", () => $("about").showModal());
  $("pinA").addEventListener("click", () => pin("A"));
  $("pinB").addEventListener("click", () => pin("B"));
  $("clearPins").addEventListener("click", () => {
    S.pins = {A: null, B: null};
    pinUI();
    render();
  });
  $("resetFilters").addEventListener("click", () => {
    S.range = [0, meta.months.length - 1];
    S.pins = {A: null, B: null};
    $("severitySelect").value = "ALL";
    window.ExplorerFilters.reset();
    setSource(-1);
    pinUI();
  });
}

async function boot() {
  $("loading").classList.remove("hidden");
  try {
    if (!CONFIG.MAPBOX_TOKEN || CONFIG.MAPBOX_TOKEN.includes("PEGA_AQUI")) {
      throw new Error("Configura un token público de Mapbox en js/config.js.");
    }
    mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;
    map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/light-v11",
      center: [-98.5, 39.5],
      zoom: 3.2,
      minZoom: 2,
      projection: "mercator",
      dragPan: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      keyboard: false,
      boxZoom: false
    });
    map.addControl(new mapboxgl.NavigationControl({showCompass: false}), "top-left");
    map.on("error", event => showError(new Error(`Mapbox: ${event.error?.message || "No se pudo cargar el mapa"}`)));
    const mapReady = new Promise(resolve => map.once("load", resolve));

    [usa, statesGeo] = await Promise.all([json(`${W12}/usa.json`), json(STATES_GEOJSON), mapReady]);
    meta = usa.meta;
    S.range = [0, meta.months.length - 1];

    overlay = new deck.MapboxOverlay({interleaved: false, layers: []});
    map.addControl(overlay);
    VizCharts.legend(THRESHOLDS, CLASS_COLORS, MIN_N);
    Timeline.init(setRange);
    window.ExplorerFilters.init(map, schedule);
    bindControls();
    buildStories();

    map.on("style.load", schedule);
    new ResizeObserver(() => {
      map.resize();
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!scope) return;
        drawContext();
        render();
      });
    }).observe(document.querySelector(".dashboard"));

    await load();
  } catch (error) {
    showError(error);
    $("loading").classList.add("hidden");
  }
}

boot();
