/* RadViz and hourly counts for weekdays/weekends, linked to hours and map lasso. */
window.VizCharts = (() => {
  const climate = [["Temperature(F)","Temperatura","°F"],["Humidity(%)","Humedad","%"],["Pressure(in)","Presión","inHg"],["Visibility(mi)","Visibilidad","mi"],["Wind_Speed(mph)","Viento","mph"],["Precipitation(in)","Precipitación","in"]];
  const colors = {1:"#38bdf8",2:"#2563eb",3:"#f59e0b",4:"#dc2626"};
  const $ = id => document.getElementById(id), finite = value => typeof value === "number" && Number.isFinite(value);
  let rows = [], filtered = [], selected = [], callbacks = {}, domains = new Map(), frame;
  function extent(key) { const values = rows.map(d => d[key]).filter(finite); return values.length ? d3.extent(values) : null; }
  function scheduleFilter() { cancelAnimationFrame(frame); frame = requestAnimationFrame(applyFilters); }
  function applyFilters() {
    const severity = $("severitySelect").value;
    filtered = rows.filter(row => (severity === "ALL" || +row.Severity === +severity) && window.ExplorerFilters.matches(row));
    callbacks.onFilter?.(filtered,rows.length); drawRad(); drawTime();
  }
  function drawRad() {
    const svg = d3.select("#weatherChart"); svg.selectAll("*").remove();
    const center = 200, radius = 125;
    svg.attr("viewBox","0 0 400 400");
    if (selected.length < 2) {
      svg.append("text").attr("x",center).attr("y",center).attr("text-anchor","middle").text("Selecciona al menos dos factores disponibles");
      $("weatherNote").textContent = "Las variables sin datos están deshabilitadas."; return;
    }
    const anchors = selected.map(([key,label,unit],i) => ({key,label,unit,x:Math.cos(-Math.PI/2+i*2*Math.PI/selected.length),y:Math.sin(-Math.PI/2+i*2*Math.PI/selected.length),domain:domains.get(key)}));
    svg.append("circle").attr("cx",center).attr("cy",center).attr("r",radius).attr("fill","#f8fafc").attr("stroke","#cbd5e1");
    svg.append("circle").attr("cx",center).attr("cy",center).attr("r",radius/2).attr("fill","none").attr("stroke","#e2e8f0").attr("stroke-dasharray","3 4");
    for (const a of anchors) {
      svg.append("line").attr("x1",center).attr("y1",center).attr("x2",center+a.x*radius).attr("y2",center+a.y*radius).attr("stroke","#e2e8f0");
      svg.append("circle").attr("cx",center+a.x*radius).attr("cy",center+a.y*radius).attr("r",5).attr("fill","#7c3aed");
      const text = svg.append("text").attr("x",center+a.x*(radius+18)).attr("y",center+a.y*(radius+18)).attr("text-anchor",Math.abs(a.x)<.1 ? "middle" : a.x>0 ? "start" : "end");
      text.append("tspan").text(a.label);
      text.append("tspan").attr("x",text.attr("x")).attr("dy",14).attr("font-size",9).text(`${d3.format(".3~g")(a.domain[0])}–${d3.format(".3~g")(a.domain[1])} ${a.unit}`);
    }
    const points = [];
    let missing = 0, zero = 0;
    for (const row of filtered) {
      if (!anchors.every(a => finite(row[a.key]))) { missing++; continue; }
      let sum = 0, px = 0, py = 0;
      for (const a of anchors) {
        const [min,max] = a.domain, weight = max === min ? 0 : (row[a.key]-min)/(max-min);
        sum += weight; px += a.x*weight; py += a.y*weight;
      }
      if (!sum) zero++;
      points.push({row,x:center+(sum ? px/sum : 0)*radius,y:center+(sum ? py/sum : 0)*radius});
    }
    svg.append("g").selectAll("circle").data(points).join("circle").attr("cx",d => d.x).attr("cy",d => d.y).attr("r",2.5)
      .attr("fill",d => colors[d.row.Severity] || "#64748b").attr("opacity",.6).style("cursor","pointer")
      .on("click",(_,d) => callbacks.onPick?.(d.row)).append("title")
      .text(d => `${d.row.City || d.row.County} · Severidad ${d.row.Severity}\n${anchors.map(a => `${a.label}: ${d.row[a.key]} ${a.unit}`).join("\n")}`);
    $("weatherNote").textContent = `${points.length.toLocaleString("es-PE")} puntos · ${missing.toLocaleString("es-PE")} omitidos por datos climáticos incompletos${zero ? ` · ${zero} en el centro sin fuerza normalizada` : ""}. Rangos calculados en la muestra del área antes del cepillado.`;
  }
  function drawTime() {
    const svg = d3.select("#timeChart"); svg.selectAll("*").remove();
    const width = $("timePlot").clientWidth, height = 300, margin = {left:58,right:25,top:20,bottom:47};
    svg.attr("viewBox",`0 0 ${width} ${height}`);
    const hours = window.ExplorerFilters.getHours(), counts = FilterCore.series(filtered,hours);
    const series = [{key:"weekday",label:"Lunes–viernes",color:"#7c3aed",values:counts.weekday},{key:"weekend",label:"Sábado–domingo",color:"#ea580c",values:counts.weekend}];
    const maximum = d3.max([...counts.weekday,...counts.weekend],d => d.n) || 1;
    const x = d3.scaleLinear([0,23],[margin.left,width-margin.right]), y = d3.scaleLinear([0,maximum],[height-margin.bottom,margin.top]).nice();
    const ticks = maximum <= 4 ? d3.range(0,Math.ceil(y.domain()[1])+1) : y.ticks(5).filter(Number.isInteger);
    svg.append("g").attr("class","time-grid").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).tickValues(ticks).tickSize(-(width-margin.left-margin.right)).tickFormat(""));
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).tickValues([0,3,6,9,12,15,18,21,23]).tickFormat(h => `${String(h).padStart(2,"0")}:00`));
    svg.append("g").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).tickValues(ticks).tickFormat(d3.format("d")));
    svg.append("text").attr("x",width/2).attr("y",height-6).attr("text-anchor","middle").text("Hora registrada en el dataset");
    svg.append("text").attr("transform","rotate(-90)").attr("x",-height/2).attr("y",14).attr("text-anchor","middle").text("Accidentes de la muestra");
    const line = d3.line().defined(d => d.active).x(d => x(d.hour)).y(d => y(d.n));
    for (const s of series) {
      svg.append("path").datum(s.values).attr("class",`time-series ${s.key}`).attr("fill","none").attr("stroke",s.color).attr("stroke-width",2.5).attr("d",line);
      svg.append("g").selectAll("circle").data(s.values.filter(d => d.active)).join("circle").attr("class",`time-point ${s.key}`)
        .attr("data-hour",d => d.hour).attr("data-count",d => d.n).attr("cx",d => x(d.hour)).attr("cy",d => y(d.n)).attr("r",3.5).attr("fill",s.color)
        .append("title").text(d => `${s.label} · ${String(d.hour).padStart(2,"0")}:00–${String(d.hour).padStart(2,"0")}:59 · ${d.n} accidentes de la muestra`);
    }
    if (!filtered.length) svg.append("text").attr("x",width/2).attr("y",height/2).attr("text-anchor","middle").text("Sin accidentes para los filtros actuales");
    const weekdayTotal = d3.sum(counts.weekday,d => d.n), weekendTotal = d3.sum(counts.weekend,d => d.n);
    $("timeNote").textContent = `${weekdayTotal.toLocaleString("es-PE")} lunes–viernes · ${weekendTotal.toLocaleString("es-PE")} sábado–domingo · ${counts.missing} omitidos por hora/día ausente. Conteos de la muestra, sin normalizar por los 5 días laborables frente a los 2 del fin de semana.`;
  }
  $("severitySelect").addEventListener("change",scheduleFilter);
  function clear() {
    cancelAnimationFrame(frame); rows = []; filtered = []; callbacks = {};
    $("weatherChart").replaceChildren(); $("timeChart").replaceChildren(); $("climateDimensions").replaceChildren();
    for (const id of ["weatherNote","timeNote","scopeWeather"]) $(id).textContent = "";
  }
  return {
    clear,
    refresh:scheduleFilter,
    resetDimensions() { selected = []; },
    setData(data,options) {
      cancelAnimationFrame(frame); rows = data; callbacks = options; domains = new Map();
      const previous = new Set(selected.map(d => d[0])); selected = []; $("climateDimensions").replaceChildren();
      for (const dimension of climate) {
        const [key,label] = dimension, domain = extent(key); domains.set(key,domain);
        const chosen = !!domain && (previous.size ? previous.has(key) : true); if (chosen) selected.push(dimension);
        const element = document.createElement("label"), input = document.createElement("input");
        input.type = "checkbox"; input.checked = chosen; input.disabled = !domain;
        element.append(input,document.createTextNode(label)); $("climateDimensions").append(element);
        input.addEventListener("change",() => {
          selected = climate.filter((_,i) => $("climateDimensions").children[i].querySelector("input").checked); drawRad();
        });
      }
      applyFilters();
    },
    resize() { if (rows.length) { drawRad(); drawTime(); } }
  };
})();
