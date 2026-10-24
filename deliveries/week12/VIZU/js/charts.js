/* Linked D3 views: RadViz (T2), day x hour (T3), infrastructure (T4), A/B comparison (T5), KPI mix and map legend. */
window.VizCharts = (() => {
  const climate = [["Temperature(F)","Temperatura","°F"],["Humidity(%)","Humedad","%"],["Pressure(in)","Presión","inHg"],["Visibility(mi)","Visibilidad","mi"],["Wind_Speed(mph)","Viento","mph"],["Precipitation(in)","Precipitación","in"]];
  const severityColors = {1:"#38bdf8",2:"#2563eb",3:"#f59e0b",4:"#dc2626"};
  const SOURCE_COLORS = ["#6366f1","#0d9488","#a3a3a3"], AB = {A:"#db2777",B:"#4d7c0f"};
  const FLAG_LABELS = {Traffic_Signal:"Semáforo",Crossing:"Cruce peatonal",Junction:"Intersección",Stop:"Señal de pare",Station:"Estación",Amenity:"Servicios"};
  const WEATHER_LABELS = {"Clear/Fair":"Despejado","Cloudy":"Nublado","Rain":"Lluvia","Snow/Ice":"Nieve / hielo","Fog/Low visibility":"Niebla","Storm":"Tormenta","Other":"Otro","Sin dato":"Sin dato"};
  const DAYS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const $ = id => document.getElementById(id), finite = v => typeof v === "number" && Number.isFinite(v);
  const pct = v => v === null || !Number.isFinite(v) ? "—" : `${(v*100).toFixed(1)} %`, int = v => Math.round(v).toLocaleString("es-PE");
  const tooltip = $("tooltip");
  function tip(event,lines) {
    if (!lines) { tooltip.style.opacity = 0; return; }
    tooltip.replaceChildren(...lines.map(text => Object.assign(document.createElement("div"),{textContent:text})));
    tooltip.style.left = `${Math.min(event.clientX+12,innerWidth-280)}px`; tooltip.style.top = `${event.clientY+12}px`; tooltip.style.opacity = 1;
  }
  const hideTip = () => tip(null,null);
  function size(svg,height) { const width = svg.node().clientWidth || 320; svg.attr("viewBox",`0 0 ${width} ${height}`); return width; }
  function empty(svg,height,text) { const width = size(svg,height); svg.append("text").attr("x",width/2).attr("y",height/2).attr("text-anchor","middle").text(text); }

  let domains = new Map(), selected = [], lastRad = {rows:[],onPick:null};
  function setRadRows(rows) {
    domains = new Map();
    const previous = new Set(selected.map(d => d[0])); selected = []; $("climateDimensions").replaceChildren();
    for (const dimension of climate) {
      const [key,label] = dimension, values = rows.map(d => d[key]).filter(finite), domain = values.length ? d3.extent(values) : null; domains.set(key,domain);
      const chosen = !!domain && (previous.size ? previous.has(key) : true); if (chosen) selected.push(dimension);
      const element = document.createElement("label"), input = document.createElement("input");
      input.type = "checkbox"; input.checked = chosen; input.disabled = !domain;
      element.append(input,document.createTextNode(label)); $("climateDimensions").append(element);
      input.addEventListener("change",() => { selected = climate.filter((_,i) => $("climateDimensions").children[i].querySelector("input").checked); radviz(lastRad.rows,lastRad.onPick); });
    }
  }
  function radviz(rows,onPick) {
    lastRad = {rows,onPick};
    const svg = d3.select("#weatherChart"); svg.selectAll("*").remove();
    const center = 200, radius = 125; svg.attr("viewBox","0 0 400 400");
    if (!domains.size) { svg.append("text").attr("x",center).attr("y",center).attr("text-anchor","middle").text("Selecciona un estado: el RadViz usa la muestra del área"); $("weatherNote").textContent = ""; return; }
    if (selected.length < 2) { svg.append("text").attr("x",center).attr("y",center).attr("text-anchor","middle").text("Selecciona al menos dos factores disponibles"); $("weatherNote").textContent = "Las variables sin datos están deshabilitadas."; return; }
    const anchors = selected.map(([key,label,unit],i) => ({key,label,unit,x:Math.cos(-Math.PI/2+i*2*Math.PI/selected.length),y:Math.sin(-Math.PI/2+i*2*Math.PI/selected.length),domain:domains.get(key)}));
    svg.append("circle").attr("cx",center).attr("cy",center).attr("r",radius).attr("fill","#f8fafc").attr("stroke","#cbd5e1");
    svg.append("circle").attr("cx",center).attr("cy",center).attr("r",radius/2).attr("fill","none").attr("stroke","#e2e8f0").attr("stroke-dasharray","3 4");
    for (const a of anchors) {
      svg.append("line").attr("x1",center).attr("y1",center).attr("x2",center+a.x*radius).attr("y2",center+a.y*radius).attr("stroke","#e2e8f0");
      svg.append("circle").attr("cx",center+a.x*radius).attr("cy",center+a.y*radius).attr("r",5).attr("fill","#7c3aed");
      const text = svg.append("text").attr("x",center+a.x*(radius+18)).attr("y",center+a.y*(radius+18)).attr("text-anchor",Math.abs(a.x)<.1 ? "middle" : a.x>0 ? "start" : "end").attr("font-size",12);
      text.append("tspan").text(a.label);
      text.append("tspan").attr("x",text.attr("x")).attr("dy",14).attr("font-size",10).text(`${d3.format(".3~g")(a.domain[0])}–${d3.format(".3~g")(a.domain[1])} ${a.unit}`);
    }
    const points = []; let missing = 0, zero = 0;
    for (const row of rows) {
      if (!anchors.every(a => finite(row[a.key]))) { missing++; continue; }
      let sum = 0, px = 0, py = 0;
      for (const a of anchors) { const [min,max] = a.domain, weight = max === min ? 0 : (row[a.key]-min)/(max-min); sum += weight; px += a.x*weight; py += a.y*weight; }
      if (!sum) zero++;
      points.push({row,x:center+(sum ? px/sum : 0)*radius,y:center+(sum ? py/sum : 0)*radius});
    }
    svg.append("g").selectAll("circle").data(points).join("circle").attr("cx",d => d.x).attr("cy",d => d.y).attr("r",2.5)
      .attr("fill",d => severityColors[d.row.Severity] || "#64748b").attr("opacity",.6).style("cursor","pointer")
      .on("click",(_,d) => onPick?.(d.row))
      .on("mousemove",(event,d) => tip(event,[`${d.row.City || d.row.County} · Severidad ${d.row.Severity} · ${d.row.Source}`,...anchors.map(a => `${a.label}: ${d.row[a.key]} ${a.unit}`)])).on("mouseleave",hideTip);
    $("weatherNote").textContent = `${int(points.length)} puntos · ${int(missing)} omitidos por datos climáticos incompletos${zero ? ` · ${zero} en el centro sin fuerza normalizada` : ""}. Rangos calculados en la muestra del área.`;
  }

  function heat({cells,divisor,hours,mode,missing = 0}) {
    const svg = d3.select("#heatChart"); svg.selectAll("*").remove();
    const height = 190, width = size(svg,height), margin = {left:30,right:8,top:6,bottom:36};
    const values = cells.map((row,d) => row.map(v => divisor ? (divisor[d] ? v/divisor[d] : 0) : v));
    const max = d3.max(values.flat()) || 0;
    if (!max) { empty(svg,height,"Sin accidentes Severity ≥ 3 para estos filtros"); $("heatNote").textContent = ""; return; }
    const x = d3.scaleBand(d3.range(24),[margin.left,width-margin.right]).padding(.06), y = d3.scaleBand(d3.range(7),[margin.top,height-margin.bottom]).padding(.08);
    const color = d3.scaleSequential([0,max],d3.interpolateBuPu);
    const flat = values.flatMap((row,d) => row.map((v,h) => ({v,d,h})));
    svg.append("g").selectAll("rect").data(flat).join("rect").attr("x",c => x(c.h)).attr("y",c => y(c.d)).attr("width",x.bandwidth()).attr("height",y.bandwidth()).attr("rx",2)
      .attr("fill",c => color(c.v)).attr("opacity",c => hours.has(c.h) ? 1 : .18)
      .on("mousemove",(event,c) => tip(event,[`${DAYS[c.d]} · ${String(c.h).padStart(2,"0")}:00–${String(c.h).padStart(2,"0")}:59`,divisor ? `${c.v.toFixed(2)} accidentes Severity ≥ 3 por día (${int(cells[c.d][c.h])} en ${divisor[c.d]} días)` : `${int(c.v)} accidentes Severity ≥ 3 de la muestra`]))
      .on("mouseleave",hideTip);
    svg.append("g").attr("transform",`translate(${margin.left-4},0)`).call(d3.axisLeft(y).tickFormat(d => DAYS[d]).tickSize(0)).call(g => g.select(".domain").remove());
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom+2})`).call(d3.axisBottom(x).tickValues([0,3,6,9,12,15,18,21]).tickFormat(h => `${h}h`).tickSize(0)).call(g => g.select(".domain").remove());
    const lw = Math.min(160,width-margin.left-60), lx = width-margin.right-lw, ly = height-12, gradient = svg.append("defs").append("linearGradient").attr("id","heatGradient");
    for (const t of d3.range(0,1.01,.25)) gradient.append("stop").attr("offset",`${t*100}%`).attr("stop-color",color(t*max));
    svg.append("rect").attr("x",lx).attr("y",ly-6).attr("width",lw).attr("height",6).attr("fill","url(#heatGradient)");
    svg.append("text").attr("x",lx-4).attr("y",ly).attr("text-anchor","end").text("0");
    svg.append("text").attr("x",lx+lw+3).attr("y",ly).text(divisor ? max.toFixed(1) : int(max));
    const peak = [...flat].sort((a,b) => b.v-a.v)[0];
    $("heatHelp").textContent = divisor ? "Promedio de accidentes Severity ≥ 3 por día, para cada día de la semana y hora. Se divide por el número de lunes, martes… del periodo, así que laborables y fin de semana son comparables." : "Accidentes Severity ≥ 3 de la muestra filtrada (lazo, ciudad u horas), sin normalizar.";
    $("heatNote").textContent = `Máximo: ${DAYS[peak.d]} ${String(peak.h).padStart(2,"0")}:00 (${divisor ? `${peak.v.toFixed(2)} por día` : `${int(peak.v)} en la muestra`}).${missing ? ` ${int(missing)} sin hora/día.` : ""} Las horas fuera del reloj se atenúan.`;
  }

  function infra({data,flags,sources,source,minN,mode}) {
    const svg = d3.select("#infraChart"); svg.selectAll("*").remove();
    const rows = [];
    flags.forEach((flag,f) => sources.forEach((name,s) => {
      if (source >= 0 && s !== source) return;
      const {with:w,without:o} = data[f][s];
      if (w.t+o.t === 0) return;
      rows.push({flag,label:FLAG_LABELS[flag] || flag,s,name,w,o,rw:w.t ? w.h/w.t : null,ro:o.t ? o.h/o.t : null,ok:w.t >= minN && o.t >= minN});
    }));
    const height = Math.max(120,22+rows.length*(source >= 0 ? 24 : 15)+26); svg.style("height",`${height}px`);
    if (!rows.length) { empty(svg,height,"Sin datos para estos filtros"); $("infraNote").textContent = ""; return; }
    const width = size(svg,height), margin = {left:96,right:14,top:8,bottom:24};
    const max = d3.max(rows.filter(r => r.ok),r => Math.max(r.rw,r.ro)) || .5;
    const x = d3.scaleLinear([0,Math.min(1,max*1.1)],[margin.left,width-margin.right]).nice(), y = d3.scaleBand(d3.range(rows.length),[margin.top,height-margin.bottom]).padding(.15);
    svg.append("g").attr("class","grid").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".0%")).tickSize(-(height-margin.top-margin.bottom)));
    const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform",(_,i) => `translate(0,${y(i)+y.bandwidth()/2})`)
      .on("mousemove",(event,r) => tip(event,[`${r.label} · ${r.name}`,`Con el elemento: ${pct(r.rw)} de ${int(r.w.t)}`,`Sin el elemento: ${pct(r.ro)} de ${int(r.o.t)}`,r.ok ? `Diferencia: ${((r.rw-r.ro)*100).toFixed(1)} puntos` : `Menos de ${minN} casos en un grupo: no se compara`])).on("mouseleave",hideTip);
    g.append("text").attr("x",margin.left-6).attr("text-anchor","end").attr("dy","0.32em").attr("font-size",source >= 0 ? 11 : 9).text((r,i) => i === 0 || rows[i-1].flag !== r.flag ? r.label : "")
      .attr("font-weight",600);
    g.filter(r => r.ok).append("line").attr("x1",r => x(r.ro)).attr("x2",r => x(r.rw)).attr("stroke",r => SOURCE_COLORS[r.s]).attr("stroke-width",2).attr("opacity",.7);
    g.filter(r => r.ok).append("circle").attr("cx",r => x(r.ro)).attr("r",4).attr("fill","#fff").attr("stroke",r => SOURCE_COLORS[r.s]).attr("stroke-width",1.6);
    g.filter(r => r.ok).append("circle").attr("cx",r => x(r.rw)).attr("r",4.5).attr("fill",r => SOURCE_COLORS[r.s]);
    g.filter(r => !r.ok).append("text").attr("x",margin.left+4).attr("dy","0.32em").attr("font-size",9).attr("fill","#9ca3af").text(r => `${r.name}: n < ${minN}`);
    const strongest = rows.filter(r => r.ok).sort((a,b) => Math.abs(b.rw-b.ro)-Math.abs(a.rw-a.ro))[0];
    $("infraNote").textContent = `${source >= 0 ? "" : "Una fila por fuente (color de la leyenda del periodo). "}${strongest ? `Mayor diferencia: ${strongest.label} en ${strongest.name}, ${pct(strongest.ro)} sin → ${pct(strongest.rw)} con.` : ""} Asociación, no causa: el elemento también indica el tipo de vía.`;
  }

  function mix(bySource,sources) {
    const svg = d3.select("#kpiMix"); svg.selectAll("*").remove();
    const width = size(svg,22), total = d3.sum(bySource,d => d.t);
    if (!total) return;
    let x = 0;
    bySource.forEach((d,i) => {
      const w = d.t/total*width; if (!w) return;
      svg.append("rect").attr("x",x).attr("y",2).attr("width",Math.max(0,w-1)).attr("height",18).attr("rx",3).attr("fill",SOURCE_COLORS[i])
        .on("mousemove",event => tip(event,[`${sources[i]}: ${int(d.t)} accidentes (${pct(d.t/total)})`,`Severity ≥ 3 en esta fuente: ${pct(d.t ? d.h/d.t : null)}`])).on("mouseleave",hideTip);
      if (w > 34) svg.append("text").attr("x",x+4).attr("y",15).attr("fill","#fff").attr("font-size",10).attr("font-weight",700).attr("pointer-events","none").text(`${sources[i].replace("Source","S")} ${Math.round(d.t/total*100)}%`);
      x += w;
    });
  }

  function legend(thresholds,colors,minN) {
    const svg = d3.select("#mapLegend"); svg.selectAll("*").remove();
    const width = size(svg,30), w = Math.min(36,(width-60)/colors.length);
    colors.forEach((c,i) => {
      svg.append("rect").attr("x",i*w).attr("y",2).attr("width",w-2).attr("height",10).attr("fill",c);
      if (i) svg.append("text").attr("x",i*w-1).attr("y",25).attr("text-anchor","middle").text(`${Math.round(thresholds[i-1]*100)}%`);
    });
    svg.append("rect").attr("x",colors.length*w+10).attr("y",2).attr("width",w-2).attr("height",10).attr("fill","#e5e7eb");
    svg.append("text").attr("x",colors.length*w+10).attr("y",25).text(`n < ${minN}`);
  }

  function lineChart(svg,{series,months,range,height,yLabel,reference}) {
    svg.selectAll("*").remove();
    const width = size(svg,height), margin = {left:40,right:10,top:10,bottom:24};
    const domain = d3.range(range[0],range[1]+1), parse = d3.utcParse("%Y-%m");
    const x = d3.scaleUtc([parse(months[range[0]]),parse(months[range[1]])],[margin.left,width-margin.right]);
    const values = series.flatMap(s => s.values.filter(v => v.rate !== null).map(v => v.rate));
    const y = d3.scaleLinear([0,Math.max(.05,d3.max(values) || 0)],[height-margin.bottom,margin.top]).nice();
    svg.append("g").attr("class","grid").attr("transform",`translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(width-margin.left-margin.right)).tickFormat(d3.format(".0%")));
    svg.append("g").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(Math.max(2,Math.floor(width/80))).tickSizeOuter(0));
    if (yLabel) svg.append("text").attr("x",margin.left).attr("y",margin.top-2).attr("font-size",9).text(yLabel);
    if (reference !== undefined && reference !== null) svg.append("line").attr("x1",margin.left).attr("x2",width-margin.right).attr("y1",y(reference)).attr("y2",y(reference)).attr("stroke","#111827").attr("stroke-dasharray","4 3").attr("opacity",.5);
    const line = d3.line().defined(d => d.rate !== null).x(d => x(parse(months[d.m]))).y(d => y(d.rate));
    for (const s of series) {
      const data = domain.map(m => ({m,...s.values[m]}));
      svg.append("path").datum(data).attr("fill","none").attr("stroke",s.color).attr("stroke-width",s.width || 2).attr("stroke-dasharray",s.dash || null).attr("d",line);
      if (domain.length <= 24) svg.append("g").selectAll("circle").data(data.filter(d => d.rate !== null)).join("circle").attr("cx",d => x(parse(months[d.m]))).attr("cy",d => y(d.rate)).attr("r",2.2).attr("fill",s.color);
    }
    const hover = svg.append("line").attr("y1",margin.top).attr("y2",height-margin.bottom).attr("stroke","#9ca3af").attr("opacity",0);
    svg.append("rect").attr("x",margin.left).attr("y",margin.top).attr("width",width-margin.left-margin.right).attr("height",height-margin.top-margin.bottom).attr("fill","transparent")
      .on("mousemove",event => {
        const date = x.invert(d3.pointer(event)[0]), m = Math.max(range[0],Math.min(range[1],(date.getUTCFullYear()-2016)*12+date.getUTCMonth()));
        hover.attr("x1",x(parse(months[m]))).attr("x2",x(parse(months[m]))).attr("opacity",1);
        tip(event,[months[m],...series.map(s => { const v = s.values[m]; return `${s.label}: ${v.rate === null ? "sin datos" : `${pct(v.rate)} de ${int(v.t)}`}`; })]);
      }).on("mouseleave",() => { hover.attr("opacity",0); hideTip(); });
  }

  function pairs(svg,{rows,height,minN}) {
    svg.selectAll("*").remove();
    const width = size(svg,height), margin = {left:92,right:12,top:4,bottom:22};
    const ok = rows.filter(r => r.na >= minN && r.nb >= minN), max = d3.max(ok,r => Math.max(r.a,r.b)) || .5;
    const x = d3.scaleLinear([0,Math.min(1,max*1.1)],[margin.left,width-margin.right]).nice(), y = d3.scaleBand(d3.range(rows.length),[margin.top,height-margin.bottom]).padding(.2);
    svg.append("g").attr("class","grid").attr("transform",`translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".0%")).tickSize(-(height-margin.top-margin.bottom)));
    const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform",(_,i) => `translate(0,${y(i)+y.bandwidth()/2})`)
      .on("mousemove",(event,r) => tip(event,[r.label,`A: ${pct(r.a)} de ${int(r.na)}`,`B: ${pct(r.b)} de ${int(r.nb)}`])).on("mouseleave",hideTip);
    g.append("text").attr("x",margin.left-6).attr("text-anchor","end").attr("dy","0.32em").attr("font-size",10).text(r => r.label);
    const valid = g.filter(r => r.na >= minN && r.nb >= minN);
    valid.append("line").attr("x1",r => x(r.a)).attr("x2",r => x(r.b)).attr("stroke","#cbd5e1").attr("stroke-width",2);
    valid.append("circle").attr("cx",r => x(r.a)).attr("r",4.5).attr("fill",AB.A);
    valid.append("circle").attr("cx",r => x(r.b)).attr("r",4.5).attr("fill",AB.B);
    g.filter(r => r.na < minN || r.nb < minN).append("text").attr("x",margin.left+4).attr("dy","0.32em").attr("font-size",9).attr("fill","#9ca3af").text(`n < ${minN}`);
  }

  function compare({A,B,months,range,sources,source,flags,weatherGroups,minN}) {
    const body = d3.select("#compareBody"); body.selectAll("*").remove();
    $("compareBadge").textContent = A && B ? "datos completos" : "";
    if (!A || !B) {
      body.append("p").attr("class","chart-help").text(A || B ? `Falta fijar ${A ? "B" : "A"}. ${A ? `A = ${A.label}` : `B = ${B.label}`}.` : "Fija dos áreas con los botones de la izquierda. Se comparan con las mismas escalas y se muestra si su mezcla de fuentes es comparable.");
      return;
    }
    const scope = source >= 0 ? sources[source] : "todas las fuentes";
    for (const [key,area] of [["a",A],["b",B]]) {
      const row = body.append("div").attr("class","compare-row");
      row.append("span").attr("class",`tag ${key}`).text(key.toUpperCase());
      row.append("b").text(area.label);
      row.append("span"); row.append("span").text(`${int(area.total.t)} accidentes · ${pct(area.total.rate)} con Severity ≥ 3 (${scope})`);
      row.append("span"); const mixSvg = row.append("svg").attr("height",14).style("height","14px");
      const width = mixSvg.node().clientWidth || 240, t = d3.sum(area.bySource,d => d.t); let x = 0;
      mixSvg.attr("viewBox",`0 0 ${width} 14`);
      area.bySource.forEach((d,i) => { const w = t ? d.t/t*width : 0; mixSvg.append("rect").attr("x",x).attr("width",Math.max(0,w-1)).attr("height",14).attr("rx",2).attr("fill",SOURCE_COLORS[i]).append("title").text(`${sources[i]}: ${pct(t ? d.t/t : null)}`); x += w; });
    }
    const gap = DataCore.compositionGap(A.bySource,B.bySource), points = v => { const n = Math.round(v*100); return `${n} ${n === 1 ? "punto" : "puntos"}`; };
    const comparable = gap !== null && gap <= .1;
    body.append("p").attr("class",`verdict ${comparable || source >= 0 ? "ok" : "warn"}`).text(gap === null ? "Sin datos en una de las dos áreas." : source >= 0 ? `Comparación dentro de ${sources[source]}: la mezcla de fuentes no interviene (diferencia de mezcla total: ${points(gap)}).` : comparable ? `Mezcla de fuentes comparable: la mayor diferencia es de ${points(gap)}.` : `Mezcla de fuentes distinta (${points(gap)} de diferencia): la brecha de proporciones puede deberse a las fuentes. Elige una fuente a la izquierda.`);
    body.append("p").attr("class","chart-help").text("Proporción mensual con Severity ≥ 3");
    lineChart(body.append("svg").style("height","150px"),{series:[{label:`A · ${A.label}`,color:AB.A,values:A.monthly},{label:`B · ${B.label}`,color:AB.B,values:B.monthly}],months,range,height:150});
    if (A.infra && B.infra) {
      body.append("p").attr("class","chart-help").text("Proporción con Severity ≥ 3 cuando el elemento vial está presente");
      const rows = flags.map((flag,f) => {
        const pick = area => { const list = source >= 0 ? [area.infra[f][source]] : area.infra[f]; const t = d3.sum(list,d => d.with.t), h = d3.sum(list,d => d.with.h); return {r:t ? h/t : null,n:t}; };
        const a = pick(A), b = pick(B); return {label:FLAG_LABELS[flag] || flag,a:a.r,b:b.r,na:a.n,nb:b.n};
      });
      pairs(body.append("svg").style("height",`${rows.length*20+30}px`),{rows,height:rows.length*20+30,minN});
    }
    if (A.weather && B.weather) {
      body.append("p").attr("class","chart-help").text("Proporción con Severity ≥ 3 según el clima registrado");
      const rows = weatherGroups.map((group,w) => ({label:WEATHER_LABELS[group] || group,a:A.weather[w].t ? A.weather[w].h/A.weather[w].t : null,b:B.weather[w].t ? B.weather[w].h/B.weather[w].t : null,na:A.weather[w].t,nb:B.weather[w].t})).filter(r => r.label !== "Sin dato" && r.label !== "Otro");
      pairs(body.append("svg").style("height",`${rows.length*20+30}px`),{rows,height:rows.length*20+30,minN});
    }
    if (!A.infra || !B.infra) body.append("p").attr("class","chart-help").text("Las ciudades solo tienen totales mensuales; infraestructura y clima se comparan entre estados o condados.");
  }

  return {SOURCE_COLORS,AB,FLAG_LABELS,setRadRows,radviz,heat,infra,mix,legend,lineChart,compare,tip,hideTip,clearRad() { domains = new Map(); $("climateDimensions").replaceChildren(); }};
})();
