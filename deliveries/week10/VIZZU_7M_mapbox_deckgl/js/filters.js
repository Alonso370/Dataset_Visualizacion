/* A 24-hour dial and freehand geographic lasso; changes never reload the CSV. */
window.ExplorerFilters = (() => {
  const $ = id => document.getElementById(id);
  const hours = new Set(Array.from({length:24},(_,i) => i));
  let map, changed = () => {}, context = false, armed = false, polygon = [], mercatorPolygon = [];
  let draft = [], lassoPointer = null, paintPointer = null, paintValue = true, previousHour = null;
  const clock = d3.select("#hourClock"), group = clock.append("g").attr("transform","translate(140,140)");
  const arc = d3.arc().innerRadius(64).outerRadius(96);
  group.selectAll("path").data(d3.range(24)).join("path").attr("class","clock-sector")
    .attr("d",hour => arc({startAngle:hour*Math.PI/12,endAngle:(hour+1)*Math.PI/12}))
    .attr("data-hour",d => d).attr("role","button").attr("tabindex",0)
    .attr("aria-label",hour => `${String(hour).padStart(2,"0")}:00 a ${String(hour).padStart(2,"0")}:59`)
    .on("keydown",(event,hour) => {
      if (["Enter"," "].includes(event.key)) { event.preventDefault(); toggleHour(hour); changed(); }
    });
  group.selectAll("text.clock-label").data(d3.range(24)).join("text").attr("class","clock-label")
    .attr("x",d => Math.sin((d+.5)*Math.PI/12)*113).attr("y",d => -Math.cos((d+.5)*Math.PI/12)*113+3)
    .attr("text-anchor","middle").text(d => String(d).padStart(2,"0"));
  const digital = group.append("text").attr("text-anchor","middle").attr("y",-3).attr("font-size",23).attr("font-weight",800);
  group.append("text").attr("text-anchor","middle").attr("y",20).text("horas seleccionadas");
  function drawClock() {
    group.selectAll("path").classed("selected",d => hours.has(d)).attr("aria-pressed",d => String(hours.has(d)));
    digital.text(`${hours.size} / 24`);
    $("hourSummary").textContent = `◷ Horas · ${hours.size === 24 ? "Todas" : hours.size ? `${hours.size} seleccionadas` : "Ninguna"}`;
    $("hourDescription").textContent = hours.size === 24 ? "Todas las horas. Se usan las horas registradas en el dataset." : hours.size ? [...hours].sort((a,b) => a-b).map(h => `${String(h).padStart(2,"0")}:00–${String(h).padStart(2,"0")}:59`).join(" · ") : "Sin horas seleccionadas: no se mostrarán accidentes.";
  }
  function toggleHour(hour) {
    if (hours.size === 24) { hours.clear(); hours.add(hour); }
    else if (hours.has(hour)) hours.delete(hour); else hours.add(hour);
    drawClock();
  }
  function hourAt(event) {
    const [localX,localY] = d3.pointer(event,$("hourClock"));
    const x = localX-140, y = localY-140;
    const radius = Math.hypot(x,y);
    if (radius < 62 || radius > 102) return null;
    return Math.floor(((Math.atan2(x,-y)+2*Math.PI)%(2*Math.PI))/(Math.PI/12));
  }
  $("hourClock").addEventListener("pointerdown",event => {
    if (!context || event.button !== 0 || paintPointer !== null || !event.isPrimary) return;
    const hour = hourAt(event); if (hour === null) return;
    event.preventDefault(); paintPointer = event.pointerId; $("hourClock").setPointerCapture(paintPointer);
    paintValue = hours.size === 24 || !hours.has(hour);
    if (hours.size === 24) hours.clear();
    previousHour = hour; hours[paintValue ? "add" : "delete"](hour); drawClock(); changed();
  });
  $("hourClock").addEventListener("pointermove",event => {
    if (event.pointerId !== paintPointer) return;
    const hour = hourAt(event); if (hour === null || hour === previousHour) return;
    // Fill crossed sectors, taking the shortest arc, including 23 -> 00.
    let difference = (hour-previousHour+24)%24;
    if (difference > 12) difference -= 24;
    const step = Math.sign(difference);
    for (let offset=1; offset<=Math.abs(difference); offset++) hours[paintValue ? "add" : "delete"]((previousHour+step*offset+24)%24);
    previousHour = hour; drawClock(); changed();
  });
  for (const type of ["pointerup","pointercancel"]) $("hourClock").addEventListener(type,() => { paintPointer = null; previousHour = null; });
  $("allHours").addEventListener("click",() => { hours.clear(); for (let i=0;i<24;i++) hours.add(i); drawClock(); changed(); });
  $("noHours").addEventListener("click",() => { hours.clear(); drawClock(); changed(); });
  $("closeClock").addEventListener("click",() => { $("hourFilter").open = false; });
  $("hourSummary").addEventListener("click",event => { if (!context) event.preventDefault(); });
  document.addEventListener("pointerdown",event => { if (!$("hourFilter").contains(event.target)) $("hourFilter").open = false; });
  function drawLasso() {
    if (!map) return;
    const points = draft.length ? draft : polygon.map(coords => { const p = map.project(coords); return [p.x,p.y]; });
    $("lassoPath").setAttribute("d",points.length ? `M${points.map(p => p.join(",")).join("L")}${draft.length ? "" : "Z"}` : "");
  }
  function arm(value) {
    armed = value && context; draft = []; lassoPointer = null;
    $("lassoOverlay").classList.toggle("active",armed);
    if (armed) $("tooltip").style.opacity = 0;
    $("lassoBtn").setAttribute("aria-pressed",String(armed));
    $("lassoBtn").textContent = armed ? "Cancelar lazo (Esc)" : "Seleccionar con lazo";
    for (const handler of ["dragPan","scrollZoom","doubleClickZoom","touchZoomRotate","keyboard","boxZoom"]) map?.[handler][context && !armed ? "enable" : "disable"]();
    $("lassoStatus").textContent = armed ? "Arrastra para rodear los accidentes. Suelta para seleccionar; Esc cancela." : polygon.length ? "Lazo aplicado. Puedes seguir usando el zoom; Limpiar lazo recupera los demás puntos." : "";
    drawLasso();
  }
  function clearLasso(notify = true) { polygon = []; mercatorPolygon = []; arm(false); $("clearLasso").disabled = true; if (notify) changed(); }
  const svg = $("lassoOverlay");
  function pointAt(event) { const rect = svg.getBoundingClientRect(); return [Math.max(0,Math.min(rect.width,event.clientX-rect.left)),Math.max(0,Math.min(rect.height,event.clientY-rect.top))]; }
  svg.addEventListener("pointerdown",event => {
    if (!armed || event.button !== 0 || lassoPointer !== null || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation(); map.stop();
    lassoPointer = event.pointerId; svg.setPointerCapture(lassoPointer); draft = [pointAt(event)]; drawLasso();
  });
  svg.addEventListener("pointermove",event => {
    if (event.pointerId !== lassoPointer) return;
    const point = pointAt(event), last = draft[draft.length-1];
    if (Math.hypot(point[0]-last[0],point[1]-last[1]) >= 3 && draft.length < 1500) { draft.push(point); drawLasso(); }
  });
  svg.addEventListener("pointerup",event => {
    if (event.pointerId !== lassoPointer) return;
    draft.push(pointAt(event));
    if (draft.length >= 3 && Math.abs(d3.polygonArea(draft)) >= 25) {
      polygon = draft.map(point => { const coords = map.unproject(point); return [coords.lng,coords.lat]; });
      mercatorPolygon = polygon.map(coords => { const p = mapboxgl.MercatorCoordinate.fromLngLat(coords); return [p.x,p.y]; });
      $("clearLasso").disabled = false;
    }
    arm(false); changed();
  });
  svg.addEventListener("pointercancel",() => arm(false));
  $("lassoBtn").addEventListener("click",() => arm(!armed));
  $("clearLasso").addEventListener("click",() => clearLasso());
  document.addEventListener("keydown",event => { if (event.key === "Escape") { if (armed) arm(false); $("hourFilter").open = false; } });
  drawClock();
  return {
    init(instance,onChange) { map = instance; changed = onChange; map.on("move",drawLasso); map.on("resize",drawLasso); },
    setContext(selected) { context = selected; $("lassoBtn").disabled = !selected; $("hourSummary").setAttribute("aria-disabled",String(!selected)); if (!selected) { clearLasso(false); $("hourFilter").open = false; } else arm(false); },
    clearLasso,
    hasLasso:() => polygon.length > 0,
    getHours:() => new Set(hours),
    matches(row) {
      if (!FilterCore.hourMatches(row,hours)) return false;
      if (!mercatorPolygon.length) return true;
      if (!Number.isFinite(row.Start_Lng) || !Number.isFinite(row.Start_Lat)) return false;
      const p = mapboxgl.MercatorCoordinate.fromLngLat([row.Start_Lng,row.Start_Lat]);
      return FilterCore.inside(mercatorPolygon,[p.x,p.y]);
    },
    reset() { hours.clear(); for (let i=0;i<24;i++) hours.add(i); drawClock(); clearLasso(false); $("hourFilter").open = false; }
  };
})();
