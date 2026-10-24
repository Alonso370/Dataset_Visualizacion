window.VizCharts = (() => {
  const climate = [
    ["Temperature(F)", "Temperatura", "°F"],
    ["Humidity(%)", "Humedad", "%"],
    ["Pressure(in)", "Presión", "inHg"],
    ["Visibility(mi)", "Visibilidad", "mi"],
    ["Wind_Speed(mph)", "Viento", "mph"],
    ["Precipitation(in)", "Precipitación", "in"]
  ];
  const severityColors = {1: "#38bdf8", 2: "#2563eb", 3: "#f59e0b", 4: "#dc2626"};
  const SOURCE_COLORS = ["#6366f1", "#0d9488", "#a3a3a3"];
  const AB = {A: "#db2777", B: "#4d7c0f"};
  const FLAG_LABELS = {
    Traffic_Signal: "Semáforo",
    Crossing: "Cruce peatonal",
    Junction: "Intersección",
    Stop: "Señal de pare",
    Station: "Estación",
    Amenity: "Servicios"
  };
  const WEATHER_LABELS = {
    "Clear/Fair": "Despejado",
    "Cloudy": "Nublado",
    "Rain": "Lluvia",
    "Snow/Ice": "Nieve / hielo",
    "Fog/Low visibility": "Niebla",
    "Storm": "Tormenta",
    "Other": "Otro",
    "Sin dato": "Sin dato"
  };
  const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const $ = id => document.getElementById(id);
  const finite = v => typeof v === "number" && Number.isFinite(v);
  const pct = v => v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)} %`;
  const int = v => Math.round(v).toLocaleString("es-PE");
  const hour = h => String(h).padStart(2, "0");
  const tooltip = $("tooltip");

  function tip(event, lines) {
    if (!lines) {
      tooltip.style.opacity = 0;
      return;
    }
    const rows = lines.map(text => {
      const div = document.createElement("div");
      div.textContent = text;
      return div;
    });
    tooltip.replaceChildren(...rows);
    tooltip.style.left = `${Math.min(event.clientX + 12, innerWidth - 280)}px`;
    tooltip.style.top = `${event.clientY + 12}px`;
    tooltip.style.opacity = 1;
  }

  const hideTip = () => tip(null, null);

  function size(svg, height) {
    const width = svg.node().clientWidth || 320;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    return width;
  }

  function message(svg, height, text) {
    const width = size(svg, height);
    svg.append("text").attr("x", width / 2).attr("y", height / 2).attr("text-anchor", "middle").text(text);
  }

  let domains = new Map();
  let selected = [];
  let lastRad = {rows: [], onPick: null};

  function setRadRows(rows) {
    domains = new Map();
    const previous = new Set(selected.map(d => d[0]));
    selected = [];
    $("climateDimensions").replaceChildren();

    for (const dimension of climate) {
      const [key, label] = dimension;
      const values = rows.map(d => d[key]).filter(finite);
      const domain = values.length ? d3.extent(values) : null;
      domains.set(key, domain);

      const chosen = !!domain && (previous.size ? previous.has(key) : true);
      if (chosen) selected.push(dimension);

      const option = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = chosen;
      input.disabled = !domain;
      option.append(input, document.createTextNode(label));
      $("climateDimensions").append(option);

      input.addEventListener("change", () => {
        const boxes = [...$("climateDimensions").querySelectorAll("input")];
        selected = climate.filter((_, i) => boxes[i].checked);
        radviz(lastRad.rows, lastRad.onPick);
      });
    }
  }

  function clearRad() {
    domains = new Map();
    $("climateDimensions").replaceChildren();
  }

  function radviz(rows, onPick) {
    lastRad = {rows, onPick};
    const svg = d3.select("#weatherChart");
    svg.selectAll("*").remove();
    const center = 200;
    const radius = 125;
    svg.attr("viewBox", "0 0 400 400");

    const centered = text => svg.append("text").attr("x", center).attr("y", center).attr("text-anchor", "middle").text(text);
    if (!domains.size) {
      centered("Selecciona un estado: el RadViz usa la muestra del área");
      $("weatherNote").textContent = "";
      return;
    }
    if (selected.length < 2) {
      centered("Selecciona al menos dos factores disponibles");
      $("weatherNote").textContent = "Las variables sin datos están deshabilitadas.";
      return;
    }

    const anchors = selected.map(([key, label, unit], i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / selected.length;
      return {key, label, unit, x: Math.cos(angle), y: Math.sin(angle), domain: domains.get(key)};
    });

    svg.append("circle").attr("cx", center).attr("cy", center).attr("r", radius).attr("fill", "#f8fafc").attr("stroke", "#cbd5e1");
    svg.append("circle")
      .attr("cx", center).attr("cy", center).attr("r", radius / 2)
      .attr("fill", "none").attr("stroke", "#e2e8f0").attr("stroke-dasharray", "3 4");

    for (const a of anchors) {
      svg.append("line")
        .attr("x1", center).attr("y1", center)
        .attr("x2", center + a.x * radius).attr("y2", center + a.y * radius)
        .attr("stroke", "#e2e8f0");
      svg.append("circle").attr("cx", center + a.x * radius).attr("cy", center + a.y * radius).attr("r", 5).attr("fill", "#7c3aed");

      const anchor = Math.abs(a.x) < 0.1 ? "middle" : a.x > 0 ? "start" : "end";
      const text = svg.append("text")
        .attr("x", center + a.x * (radius + 18))
        .attr("y", center + a.y * (radius + 18))
        .attr("text-anchor", anchor)
        .attr("font-size", 12);
      text.append("tspan").text(a.label);
      text.append("tspan")
        .attr("x", text.attr("x"))
        .attr("dy", 14)
        .attr("font-size", 10)
        .text(`${d3.format(".3~g")(a.domain[0])}–${d3.format(".3~g")(a.domain[1])} ${a.unit}`);
    }

    const points = [];
    let missing = 0;
    let atCenter = 0;
    for (const row of rows) {
      if (!anchors.every(a => finite(row[a.key]))) {
        missing++;
        continue;
      }
      let sum = 0;
      let px = 0;
      let py = 0;
      for (const a of anchors) {
        const [min, max] = a.domain;
        const weight = max === min ? 0 : (row[a.key] - min) / (max - min);
        sum += weight;
        px += a.x * weight;
        py += a.y * weight;
      }
      if (!sum) atCenter++;
      points.push({row, x: center + (sum ? px / sum : 0) * radius, y: center + (sum ? py / sum : 0) * radius});
    }

    svg.append("g").selectAll("circle")
      .data(points)
      .join("circle")
      .attr("cx", d => d.x)
      .attr("cy", d => d.y)
      .attr("r", 2.5)
      .attr("fill", d => severityColors[d.row.Severity] || "#64748b")
      .attr("opacity", 0.6)
      .style("cursor", "pointer")
      .on("click", (_, d) => onPick?.(d.row))
      .on("mousemove", (event, d) => tip(event, [
        `${d.row.City || d.row.County} · Severidad ${d.row.Severity} · ${d.row.Source}`,
        ...anchors.map(a => `${a.label}: ${d.row[a.key]} ${a.unit}`)
      ]))
      .on("mouseleave", hideTip);

    const centerNote = atCenter ? ` · ${atCenter} en el centro sin fuerza normalizada` : "";
    $("weatherNote").textContent = `${int(points.length)} puntos · ${int(missing)} omitidos por datos climáticos incompletos`
      + `${centerNote}. Rangos calculados en la muestra del área.`;
  }

  function heat({cells, divisor, hours, missing = 0}) {
    const svg = d3.select("#heatChart");
    svg.selectAll("*").remove();
    const height = 190;
    const width = size(svg, height);
    const margin = {left: 30, right: 8, top: 6, bottom: 36};

    const values = cells.map((row, d) => row.map(v => divisor ? (divisor[d] ? v / divisor[d] : 0) : v));
    const max = d3.max(values.flat()) || 0;
    if (!max) {
      message(svg, height, "Sin accidentes Severity ≥ 3 para estos filtros");
      $("heatNote").textContent = "";
      return;
    }

    const x = d3.scaleBand(d3.range(24), [margin.left, width - margin.right]).padding(0.06);
    const y = d3.scaleBand(d3.range(7), [margin.top, height - margin.bottom]).padding(0.08);
    const color = d3.scaleSequential([0, max], d3.interpolateBuPu);
    const flat = values.flatMap((row, d) => row.map((v, h) => ({v, d, h})));

    svg.append("g").selectAll("rect")
      .data(flat)
      .join("rect")
      .attr("x", c => x(c.h))
      .attr("y", c => y(c.d))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("rx", 2)
      .attr("fill", c => color(c.v))
      .attr("opacity", c => hours.has(c.h) ? 1 : 0.18)
      .on("mousemove", (event, c) => {
        const detail = divisor
          ? `${c.v.toFixed(2)} accidentes Severity ≥ 3 por día (${int(cells[c.d][c.h])} en ${divisor[c.d]} días)`
          : `${int(c.v)} accidentes Severity ≥ 3 de la muestra`;
        tip(event, [`${DAYS[c.d]} · ${hour(c.h)}:00–${hour(c.h)}:59`, detail]);
      })
      .on("mouseleave", hideTip);

    svg.append("g")
      .attr("transform", `translate(${margin.left - 4},0)`)
      .call(d3.axisLeft(y).tickFormat(d => DAYS[d]).tickSize(0))
      .call(g => g.select(".domain").remove());
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom + 2})`)
      .call(d3.axisBottom(x).tickValues([0, 3, 6, 9, 12, 15, 18, 21]).tickFormat(h => `${h}h`).tickSize(0))
      .call(g => g.select(".domain").remove());

    const legendWidth = Math.min(160, width - margin.left - 60);
    const legendX = width - margin.right - legendWidth;
    const legendY = height - 12;
    const gradient = svg.append("defs").append("linearGradient").attr("id", "heatGradient");
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(t * max));
    }
    svg.append("rect").attr("x", legendX).attr("y", legendY - 6).attr("width", legendWidth).attr("height", 6).attr("fill", "url(#heatGradient)");
    svg.append("text").attr("x", legendX - 4).attr("y", legendY).attr("text-anchor", "end").text("0");
    svg.append("text").attr("x", legendX + legendWidth + 3).attr("y", legendY).text(divisor ? max.toFixed(1) : int(max));

    const peak = [...flat].sort((a, b) => b.v - a.v)[0];
    const peakValue = divisor ? `${peak.v.toFixed(2)} por día` : `${int(peak.v)} en la muestra`;
    $("heatHelp").textContent = divisor
      ? "Promedio de accidentes Severity ≥ 3 por día, para cada día de la semana y hora. Se divide por el número "
        + "de lunes, martes… del periodo, así que laborables y fin de semana son comparables."
      : "Accidentes Severity ≥ 3 de la muestra filtrada (lazo, ciudad u horas), sin normalizar.";
    $("heatNote").textContent = `Máximo: ${DAYS[peak.d]} ${hour(peak.h)}:00 (${peakValue}).`
      + `${missing ? ` ${int(missing)} sin hora/día.` : ""} Las horas fuera del reloj se atenúan.`;
  }

  function infra({data, flags, sources, source, minN}) {
    const svg = d3.select("#infraChart");
    svg.selectAll("*").remove();

    const rows = [];
    flags.forEach((flag, f) => sources.forEach((name, s) => {
      if (source >= 0 && s !== source) return;
      const {with: w, without: o} = data[f][s];
      if (w.t + o.t === 0) return;
      rows.push({
        flag,
        label: FLAG_LABELS[flag] || flag,
        s,
        name,
        w,
        o,
        rateWith: w.t ? w.h / w.t : null,
        rateWithout: o.t ? o.h / o.t : null,
        ok: w.t >= minN && o.t >= minN
      });
    }));

    const rowHeight = source >= 0 ? 24 : 15;
    const height = Math.max(120, 22 + rows.length * rowHeight + 26);
    svg.style("height", `${height}px`);
    if (!rows.length) {
      message(svg, height, "Sin datos para estos filtros");
      $("infraNote").textContent = "";
      return;
    }

    const width = size(svg, height);
    const margin = {left: 96, right: 14, top: 8, bottom: 24};
    const comparable = rows.filter(r => r.ok);
    const max = d3.max(comparable, r => Math.max(r.rateWith, r.rateWithout)) || 0.5;
    const x = d3.scaleLinear([0, Math.min(1, max * 1.1)], [margin.left, width - margin.right]).nice();
    const y = d3.scaleBand(d3.range(rows.length), [margin.top, height - margin.bottom]).padding(0.15);

    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".0%")).tickSize(-(height - margin.top - margin.bottom)));

    const g = svg.append("g").selectAll("g")
      .data(rows)
      .join("g")
      .attr("transform", (_, i) => `translate(0,${y(i) + y.bandwidth() / 2})`)
      .on("mousemove", (event, r) => tip(event, [
        `${r.label} · ${r.name}`,
        `Con el elemento: ${pct(r.rateWith)} de ${int(r.w.t)}`,
        `Sin el elemento: ${pct(r.rateWithout)} de ${int(r.o.t)}`,
        r.ok ? `Diferencia: ${((r.rateWith - r.rateWithout) * 100).toFixed(1)} puntos` : `Menos de ${minN} casos en un grupo: no se compara`
      ]))
      .on("mouseleave", hideTip);

    g.append("text")
      .attr("x", margin.left - 6)
      .attr("text-anchor", "end")
      .attr("dy", "0.32em")
      .attr("font-size", source >= 0 ? 11 : 9)
      .attr("font-weight", 600)
      .text((r, i) => i === 0 || rows[i - 1].flag !== r.flag ? r.label : "");

    const valid = g.filter(r => r.ok);
    valid.append("line")
      .attr("x1", r => x(r.rateWithout))
      .attr("x2", r => x(r.rateWith))
      .attr("stroke", r => SOURCE_COLORS[r.s])
      .attr("stroke-width", 2)
      .attr("opacity", 0.7);
    valid.append("circle")
      .attr("cx", r => x(r.rateWithout))
      .attr("r", 4)
      .attr("fill", "#fff")
      .attr("stroke", r => SOURCE_COLORS[r.s])
      .attr("stroke-width", 1.6);
    valid.append("circle")
      .attr("cx", r => x(r.rateWith))
      .attr("r", 4.5)
      .attr("fill", r => SOURCE_COLORS[r.s]);

    g.filter(r => !r.ok).append("text")
      .attr("x", margin.left + 4)
      .attr("dy", "0.32em")
      .attr("font-size", 9)
      .attr("fill", "#9ca3af")
      .text(r => `${r.name}: n < ${minN}`);

    const strongest = [...comparable].sort((a, b) => Math.abs(b.rateWith - b.rateWithout) - Math.abs(a.rateWith - a.rateWithout))[0];
    const intro = source >= 0 ? "" : "Una fila por fuente (color de la leyenda del periodo). ";
    const biggest = strongest
      ? `Mayor diferencia: ${strongest.label} en ${strongest.name}, ${pct(strongest.rateWithout)} sin → ${pct(strongest.rateWith)} con.`
      : "";
    $("infraNote").textContent = `${intro}${biggest} Asociación, no causa: el elemento también indica el tipo de vía.`;
  }

  function mix(bySource, sources) {
    const svg = d3.select("#kpiMix");
    svg.selectAll("*").remove();
    const width = size(svg, 22);
    const total = d3.sum(bySource, d => d.t);
    if (!total) return;

    let x = 0;
    bySource.forEach((d, i) => {
      const w = d.t / total * width;
      if (!w) return;
      svg.append("rect")
        .attr("x", x).attr("y", 2)
        .attr("width", Math.max(0, w - 1)).attr("height", 18)
        .attr("rx", 3)
        .attr("fill", SOURCE_COLORS[i])
        .on("mousemove", event => tip(event, [
          `${sources[i]}: ${int(d.t)} accidentes (${pct(d.t / total)})`,
          `Severity ≥ 3 en esta fuente: ${pct(d.t ? d.h / d.t : null)}`
        ]))
        .on("mouseleave", hideTip);
      if (w > 34) {
        svg.append("text")
          .attr("x", x + 4).attr("y", 15)
          .attr("fill", "#fff").attr("font-size", 10).attr("font-weight", 700)
          .attr("pointer-events", "none")
          .text(`${sources[i].replace("Source", "S")} ${Math.round(d.t / total * 100)}%`);
      }
      x += w;
    });
  }

  function legend(thresholds, colors, minN) {
    const svg = d3.select("#mapLegend");
    svg.selectAll("*").remove();
    const width = size(svg, 30);
    const w = Math.min(36, (width - 60) / colors.length);

    colors.forEach((c, i) => {
      svg.append("rect").attr("x", i * w).attr("y", 2).attr("width", w - 2).attr("height", 10).attr("fill", c);
      if (i) {
        svg.append("text").attr("x", i * w - 1).attr("y", 25).attr("text-anchor", "middle").text(`${Math.round(thresholds[i - 1] * 100)}%`);
      }
    });
    svg.append("rect").attr("x", colors.length * w + 10).attr("y", 2).attr("width", w - 2).attr("height", 10).attr("fill", "#e5e7eb");
    svg.append("text").attr("x", colors.length * w + 10).attr("y", 25).text(`n < ${minN}`);
  }

  function lineChart(svg, {series, months, range, height, yLabel}) {
    svg.selectAll("*").remove();
    const width = size(svg, height);
    const margin = {left: 40, right: 10, top: 10, bottom: 24};
    const parse = d3.utcParse("%Y-%m");
    const dateOf = m => parse(months[m]);
    const visible = d3.range(range[0], range[1] + 1);

    const x = d3.scaleUtc([dateOf(range[0]), dateOf(range[1])], [margin.left, width - margin.right]);
    const rates = series.flatMap(s => s.values.filter(v => v.rate !== null).map(v => v.rate));
    const y = d3.scaleLinear([0, Math.max(0.05, d3.max(rates) || 0)], [height - margin.bottom, margin.top]).nice();

    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(d3.format(".0%")));
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor(width / 80))).tickSizeOuter(0));
    if (yLabel) {
      svg.append("text").attr("x", margin.left).attr("y", margin.top - 2).attr("font-size", 9).text(yLabel);
    }

    const line = d3.line()
      .defined(d => d.rate !== null)
      .x(d => x(dateOf(d.m)))
      .y(d => y(d.rate));

    for (const s of series) {
      const data = visible.map(m => ({m, ...s.values[m]}));
      svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", s.color)
        .attr("stroke-width", s.width || 2)
        .attr("stroke-dasharray", s.dash || null)
        .attr("d", line);
      if (visible.length <= 24) {
        svg.append("g").selectAll("circle")
          .data(data.filter(d => d.rate !== null))
          .join("circle")
          .attr("cx", d => x(dateOf(d.m)))
          .attr("cy", d => y(d.rate))
          .attr("r", 2.2)
          .attr("fill", s.color);
      }
    }

    const guide = svg.append("line")
      .attr("y1", margin.top).attr("y2", height - margin.bottom)
      .attr("stroke", "#9ca3af").attr("opacity", 0);

    svg.append("rect")
      .attr("x", margin.left).attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .attr("fill", "transparent")
      .on("mousemove", event => {
        const date = x.invert(d3.pointer(event)[0]);
        const m = Math.max(range[0], Math.min(range[1], (date.getUTCFullYear() - 2016) * 12 + date.getUTCMonth()));
        guide.attr("x1", x(dateOf(m))).attr("x2", x(dateOf(m))).attr("opacity", 1);
        const lines = series.map(s => {
          const v = s.values[m];
          return `${s.label}: ${v.rate === null ? "sin datos" : `${pct(v.rate)} de ${int(v.t)}`}`;
        });
        tip(event, [months[m], ...lines]);
      })
      .on("mouseleave", () => {
        guide.attr("opacity", 0);
        hideTip();
      });
  }

  function pairs(svg, {rows, height, minN}) {
    svg.selectAll("*").remove();
    const width = size(svg, height);
    const margin = {left: 92, right: 12, top: 4, bottom: 22};
    const enough = r => r.na >= minN && r.nb >= minN;
    const max = d3.max(rows.filter(enough), r => Math.max(r.a, r.b)) || 0.5;
    const x = d3.scaleLinear([0, Math.min(1, max * 1.1)], [margin.left, width - margin.right]).nice();
    const y = d3.scaleBand(d3.range(rows.length), [margin.top, height - margin.bottom]).padding(0.2);

    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(4).tickFormat(d3.format(".0%")).tickSize(-(height - margin.top - margin.bottom)));

    const g = svg.append("g").selectAll("g")
      .data(rows)
      .join("g")
      .attr("transform", (_, i) => `translate(0,${y(i) + y.bandwidth() / 2})`)
      .on("mousemove", (event, r) => tip(event, [r.label, `A: ${pct(r.a)} de ${int(r.na)}`, `B: ${pct(r.b)} de ${int(r.nb)}`]))
      .on("mouseleave", hideTip);

    g.append("text")
      .attr("x", margin.left - 6)
      .attr("text-anchor", "end")
      .attr("dy", "0.32em")
      .attr("font-size", 10)
      .text(r => r.label);

    const valid = g.filter(enough);
    valid.append("line").attr("x1", r => x(r.a)).attr("x2", r => x(r.b)).attr("stroke", "#cbd5e1").attr("stroke-width", 2);
    valid.append("circle").attr("cx", r => x(r.a)).attr("r", 4.5).attr("fill", AB.A);
    valid.append("circle").attr("cx", r => x(r.b)).attr("r", 4.5).attr("fill", AB.B);

    g.filter(r => !enough(r)).append("text")
      .attr("x", margin.left + 4)
      .attr("dy", "0.32em")
      .attr("font-size", 9)
      .attr("fill", "#9ca3af")
      .text(`n < ${minN}`);
  }

  function points(gap) {
    const n = Math.round(gap * 100);
    return `${n} ${n === 1 ? "punto" : "puntos"}`;
  }

  function verdictText(gap, source, sources) {
    if (gap === null) return "Sin datos en una de las dos áreas.";
    if (source >= 0) {
      return `Comparación dentro de ${sources[source]}: la mezcla de fuentes no interviene `
        + `(diferencia de mezcla total: ${points(gap)}).`;
    }
    if (gap <= 0.1) return `Mezcla de fuentes comparable: la mayor diferencia es de ${points(gap)}.`;
    return `Mezcla de fuentes distinta (${points(gap)} de diferencia): la brecha de proporciones puede deberse `
      + "a las fuentes. Elige una fuente a la izquierda.";
  }

  function areaHeader(body, key, area, scope, sources) {
    const row = body.append("div").attr("class", "compare-row");
    row.append("span").attr("class", `tag ${key}`).text(key.toUpperCase());
    row.append("b").text(area.label);
    row.append("span");
    row.append("span").text(`${int(area.total.t)} accidentes · ${pct(area.total.rate)} con Severity ≥ 3 (${scope})`);
    row.append("span");

    const svg = row.append("svg").attr("height", 14).style("height", "14px");
    const width = svg.node().clientWidth || 240;
    const total = d3.sum(area.bySource, d => d.t);
    svg.attr("viewBox", `0 0 ${width} 14`);
    let x = 0;
    area.bySource.forEach((d, i) => {
      const w = total ? d.t / total * width : 0;
      svg.append("rect")
        .attr("x", x)
        .attr("width", Math.max(0, w - 1))
        .attr("height", 14)
        .attr("rx", 2)
        .attr("fill", SOURCE_COLORS[i])
        .append("title")
        .text(`${sources[i]}: ${pct(total ? d.t / total : null)}`);
      x += w;
    });
  }

  function compare({A, B, months, range, sources, source, flags, weatherGroups, minN}) {
    const body = d3.select("#compareBody");
    body.selectAll("*").remove();
    $("compareBadge").textContent = A && B ? "datos completos" : "";

    if (!A || !B) {
      let text = "Fija dos áreas con los botones de la izquierda. Se comparan con las mismas escalas "
        + "y se muestra si su mezcla de fuentes es comparable.";
      if (A) text = `Falta fijar B. A = ${A.label}.`;
      if (B) text = `Falta fijar A. B = ${B.label}.`;
      body.append("p").attr("class", "chart-help").text(text);
      return;
    }

    const scope = source >= 0 ? sources[source] : "todas las fuentes";
    areaHeader(body, "a", A, scope, sources);
    areaHeader(body, "b", B, scope, sources);

    const gap = DataCore.compositionGap(A.bySource, B.bySource);
    const fine = source >= 0 || (gap !== null && gap <= 0.1);
    body.append("p").attr("class", `verdict ${fine ? "ok" : "warn"}`).text(verdictText(gap, source, sources));

    body.append("p").attr("class", "chart-help").text("Proporción mensual con Severity ≥ 3");
    lineChart(body.append("svg").style("height", "150px"), {
      series: [
        {label: `A · ${A.label}`, color: AB.A, values: A.monthly},
        {label: `B · ${B.label}`, color: AB.B, values: B.monthly}
      ],
      months,
      range,
      height: 150
    });

    if (A.infra && B.infra) {
      body.append("p").attr("class", "chart-help").text("Proporción con Severity ≥ 3 cuando el elemento vial está presente");
      const withFlag = (area, f) => {
        const list = source >= 0 ? [area.infra[f][source]] : area.infra[f];
        const t = d3.sum(list, d => d.with.t);
        const h = d3.sum(list, d => d.with.h);
        return {rate: t ? h / t : null, n: t};
      };
      const rows = flags.map((flag, f) => {
        const a = withFlag(A, f);
        const b = withFlag(B, f);
        return {label: FLAG_LABELS[flag] || flag, a: a.rate, b: b.rate, na: a.n, nb: b.n};
      });
      const height = rows.length * 20 + 30;
      pairs(body.append("svg").style("height", `${height}px`), {rows, height, minN});
    }

    if (A.weather && B.weather) {
      body.append("p").attr("class", "chart-help").text("Proporción con Severity ≥ 3 según el clima registrado");
      const rate = d => d.t ? d.h / d.t : null;
      const rows = weatherGroups
        .map((group, w) => ({
          label: WEATHER_LABELS[group] || group,
          a: rate(A.weather[w]),
          b: rate(B.weather[w]),
          na: A.weather[w].t,
          nb: B.weather[w].t
        }))
        .filter(r => r.label !== "Sin dato" && r.label !== "Otro");
      const height = rows.length * 20 + 30;
      pairs(body.append("svg").style("height", `${height}px`), {rows, height, minN});
    }

    if (!A.infra || !B.infra) {
      body.append("p").attr("class", "chart-help")
        .text("Las ciudades solo tienen totales mensuales; infraestructura y clima se comparan entre estados o condados.");
    }
  }

  return {
    SOURCE_COLORS, AB, FLAG_LABELS,
    setRadRows, clearRad, radviz, heat, infra, mix, legend, lineChart, compare, tip, hideTip
  };
})();
