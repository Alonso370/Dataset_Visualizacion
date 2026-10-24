window.VizCharts = (() => {
  const SOURCE_COLORS = ["#6250d6", "#199e70", "#c3c2b7"];
  const INDEX_THRESHOLDS = [0.67, 0.8, 0.95, 1.05, 1.25, 1.5];
  const INDEX_COLORS = ["#fdebdc", "#fbcfae", "#f6a979", "#ee7d45", "#d9561f", "#b23d10", "#7f2a0a"];
  const HEAT_COLORS = d3.interpolateRgbBasis(["#fdf3ea", ...INDEX_COLORS.slice(1)]);
  const FEW = "#d6d5cf";
  const AB_COLORS = {A: "#2a78d6", B: "#d55181"};
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
    "Snow/Ice": "Nieve o hielo",
    "Fog/Low visibility": "Niebla",
    "Storm": "Tormenta"
  };
  const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const $ = id => document.getElementById(id);
  const int = v => Math.round(v).toLocaleString("es-PE");
  const pct = v => v === null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(1)} %`;
  const times = v => v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(2)}×`;
  const hour = h => String(h).padStart(2, "0");
  const indexScale = d3.scaleThreshold(INDEX_THRESHOLDS, INDEX_COLORS);
  const tooltip = $("tooltip");

  function indexColor(cell, minExpected) {
    if (!cell || cell.index === null || cell.e < minExpected) return FEW;
    return indexScale(cell.index);
  }

  function tip(event, lines) {
    if (!event || !lines) {
      tooltip.style.opacity = 0;
      return;
    }
    const rows = lines.map((text, i) => {
      const div = document.createElement("div");
      div.textContent = text;
      if (i === 0) div.className = "tip-title";
      return div;
    });
    tooltip.replaceChildren(...rows);
    tooltip.style.left = `${Math.min(event.clientX + 14, innerWidth - 290)}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.style.opacity = 1;
  }

  const hideTip = () => tip(null, null);

  function size(svg, height) {
    const width = svg.node().clientWidth || 320;
    svg.attr("viewBox", `0 0 ${width} ${height}`).style("height", `${height}px`);
    return width;
  }

  function message(svg, height, text) {
    svg.selectAll("*").remove();
    const width = size(svg, height);
    svg.append("text").attr("class", "empty").attr("x", width / 2).attr("y", height / 2).attr("text-anchor", "middle").text(text);
  }

  function coarse(cells, divisor) {
    const groups = [[0, 1, 2, 3, 4], [5, 6]];
    const bands = d3.range(6);
    const values = groups.map(days => bands.map(b => d3.sum(days, d => d3.sum(d3.range(b * 4, b * 4 + 4), h => cells[d][h]))));
    const days = divisor ? groups.map(g => d3.sum(g, d => divisor[d])) : null;
    return {values, days};
  }

  function heat(svgId, {cells, divisor, hours, label}) {
    const svg = d3.select(svgId);
    svg.selectAll("*").remove();
    const total = d3.sum(cells.flat());
    if (total < 30) {
      message(svg, 90, `${label ? `${label}: ` : ""}solo ${int(total)} accidentes Severity ≥ 3; muy pocos para ver horarios.`);
      return {note: ""};
    }

    const detailed = total >= 300;
    const rowLabels = detailed ? DAYS : ["Lun–Vie", "Sáb–Dom"];
    const colCount = detailed ? 24 : 6;
    let values;
    let days;
    if (detailed) {
      values = cells.map((row, d) => row.map(v => divisor ? v / (divisor[d] || 1) : v));
      days = divisor;
    } else {
      values = coarse(cells, null).values;
      days = null;
    }

    const height = detailed ? 176 : 96;
    const width = size(svg, height);
    const margin = {left: 52, right: 6, top: label ? 16 : 4, bottom: 22};
    const x = d3.scaleBand(d3.range(colCount), [margin.left, width - margin.right]).padding(0.08);
    const y = d3.scaleBand(d3.range(rowLabels.length), [margin.top, height - margin.bottom]).padding(0.1);
    const max = d3.max(values.flat()) || 1;
    const color = v => HEAT_COLORS(v / max);
    const flat = values.flatMap((row, r) => row.map((v, c) => ({v, r, c})));
    const hourOf = c => detailed ? [c] : d3.range(c * 4, c * 4 + 4);
    const active = c => hourOf(c).some(h => hours.has(h));

    if (label) svg.append("text").attr("class", "panel-label").attr("x", margin.left).attr("y", 10).text(label);
    svg.append("g").selectAll("rect")
      .data(flat)
      .join("rect")
      .attr("x", d => x(d.c))
      .attr("y", d => y(d.r))
      .attr("width", x.bandwidth())
      .attr("height", y.bandwidth())
      .attr("rx", 2)
      .attr("fill", d => color(d.v))
      .attr("opacity", d => active(d.c) ? 1 : 0.25)
      .on("mousemove", (event, d) => {
        const span = detailed ? `${hour(d.c)}:00–${hour(d.c)}:59` : `${hour(d.c * 4)}:00–${hour(d.c * 4 + 3)}:59`;
        const value = days ? `${d.v.toFixed(2)} por día` : `${int(d.v)} accidentes`;
        tip(event, [value, `${rowLabels[d.r]} · ${span}`, "Accidentes con Severity ≥ 3"]);
      })
      .on("mouseleave", hideTip);

    svg.append("g")
      .attr("transform", `translate(${margin.left - 4},0)`)
      .call(d3.axisLeft(y).tickFormat(r => rowLabels[r]).tickSize(0))
      .call(g => g.select(".domain").remove());
    const ticks = detailed ? [0, 6, 12, 18, 23] : d3.range(6);
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom + 2})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(c => detailed ? `${c}h` : `${c * 4}–${c * 4 + 4}h`).tickSize(0))
      .call(g => g.select(".domain").remove());

    const peak = [...flat].sort((a, b) => b.v - a.v)[0];
    const peakSpan = detailed ? `${DAYS[peak.r]} a las ${peak.c} h` : `${rowLabels[peak.r]}, de ${peak.c * 4} a ${peak.c * 4 + 4} h`;
    const peakValue = days ? `${peak.v.toFixed(1)} por día` : `${int(peak.v)}`;
    const grain = detailed ? "" : ` Con solo ${int(total)} casos se muestran conteos del periodo, agrupados en laborables / fin de semana y franjas de 4 horas.`;
    return {note: `Pico: ${peakSpan} (${peakValue}).${grain}`};
  }

  function indexChart(svgId, {rows, minExpected}) {
    const svg = d3.select(svgId);
    svg.selectAll("*").remove();
    const usable = p => p.cell && p.cell.index > 0 && p.cell.e >= minExpected;
    const values = rows.flatMap(r => r.points.filter(usable).map(p => p.cell.index));
    if (!values.length) {
      message(svg, 70, "Muy pocos casos para calcular el índice.");
      return;
    }
    const single = rows.every(r => r.points.length === 1);
    const rowHeight = 26;
    const height = 8 + rows.length * rowHeight + 22;
    const width = size(svg, height);
    const margin = {left: 104, right: single ? 46 : 14, top: 6, bottom: 22};
    const lo = Math.min(0.5, d3.min(values) * 0.9);
    const hi = Math.max(2, d3.max(values) * 1.1);
    const x = d3.scaleLog([lo, hi], [margin.left, width - margin.right]);
    const y = d3.scaleBand(d3.range(rows.length), [margin.top, height - margin.bottom]).padding(0.25);

    const ticks = [0.5, 1, 2].filter(v => v >= lo && v <= hi);
    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(v => `${v}×`).tickSize(-(height - margin.top - margin.bottom)));
    svg.append("line")
      .attr("class", "baseline")
      .attr("x1", x(1)).attr("x2", x(1))
      .attr("y1", margin.top).attr("y2", height - margin.bottom);

    const row = svg.append("g").selectAll("g")
      .data(rows)
      .join("g")
      .attr("transform", (_, i) => `translate(0,${y(i) + y.bandwidth() / 2})`);
    row.append("text")
      .attr("class", "row-label")
      .attr("x", margin.left - 8)
      .attr("dy", "0.32em")
      .attr("text-anchor", "end")
      .text(r => r.label);

    row.each(function(r) {
      const g = d3.select(this);
      const points = r.points.filter(usable);
      if (!points.length) {
        g.append("text").attr("class", "few").attr("x", margin.left + 4).attr("dy", "0.32em").text("pocos casos");
        return;
      }
      if (single) {
        const c = points[0].cell;
        g.append("rect")
          .attr("x", Math.min(x(1), x(c.index)))
          .attr("width", Math.max(1, Math.abs(x(c.index) - x(1))))
          .attr("y", -6)
          .attr("height", 12)
          .attr("rx", 3)
          .attr("fill", indexColor(c, minExpected));
        g.append("text")
          .attr("class", "value")
          .attr("x", Math.max(x(1), x(c.index)) + 5)
          .attr("dy", "0.32em")
          .text(times(c.index));
        return;
      }
      const xs = points.map(p => x(p.cell.index));
      g.append("line").attr("class", "connector").attr("x1", d3.min(xs)).attr("x2", d3.max(xs));
      g.selectAll("circle")
        .data(points)
        .join("circle")
        .attr("class", p => `pt ${p.cls}`)
        .attr("cx", p => x(p.cell.index))
        .attr("r", 5);
    });

    row.append("rect")
      .attr("class", "hit")
      .attr("x", 0)
      .attr("y", -rowHeight / 2)
      .attr("width", width)
      .attr("height", rowHeight)
      .on("mousemove", (event, r) => {
        const lines = r.points.map(p => {
          if (!usable(p)) return `${p.name}: pocos casos`;
          const c = p.cell;
          return `${p.name}: ${times(c.index)} · ${int(c.h)} de ${int(c.t)} con Severity ≥ 3 (se esperaban ${int(c.e)})`;
        });
        tip(event, [r.label, ...lines, r.hint].filter(Boolean));
      })
      .on("mouseleave", hideTip);
  }

  function mix(svgId, bySource, sources) {
    const svg = d3.select(svgId);
    svg.selectAll("*").remove();
    const width = size(svg, 20);
    const total = d3.sum(bySource, d => d.t);
    if (!total) return;
    let x = 0;
    bySource.forEach((d, i) => {
      const w = d.t / total * width;
      if (w < 0.5) return;
      svg.append("rect")
        .attr("x", x).attr("y", 2)
        .attr("width", Math.max(0, w - 2)).attr("height", 16)
        .attr("rx", 3)
        .attr("fill", SOURCE_COLORS[i])
        .on("mousemove", event => tip(event, [pct(d.t / total), `${sources[i]} · ${int(d.t)} accidentes`, `${pct(d.t ? d.h / d.t : null)} con Severity ≥ 3`]))
        .on("mouseleave", hideTip);
      if (w > 46) {
        svg.append("text")
          .attr("class", i === 2 ? "in-bar dark" : "in-bar")
          .attr("x", x + 6).attr("y", 14)
          .text(`${sources[i].replace("Source", "S")} ${Math.round(d.t / total * 100)} %`);
      }
      x += w;
    });
  }

  function legend(svgId) {
    const svg = d3.select(svgId);
    svg.selectAll("*").remove();
    size(svg, 46);
    const w = 32;
    const top = 16;
    svg.append("text").attr("class", "legend-title").attr("x", 0).attr("y", 10).text("Índice ajustado por fuente y año (1× = lo esperado)");
    INDEX_COLORS.forEach((c, i) => {
      svg.append("rect").attr("x", i * w).attr("y", top).attr("width", w - 2).attr("height", 10).attr("rx", 2).attr("fill", c);
    });
    INDEX_THRESHOLDS.forEach((t, i) => {
      svg.append("text").attr("class", "tick-label").attr("x", (i + 1) * w - 1).attr("y", top + 24).attr("text-anchor", "middle").text(`${t}`);
    });
    svg.append("rect").attr("class", "expected-mark").attr("x", 3 * w - 0.5).attr("y", top - 1.5).attr("width", w - 1).attr("height", 13).attr("rx", 2);
    const fx = INDEX_COLORS.length * w + 16;
    svg.append("rect").attr("x", fx).attr("y", top).attr("width", w - 2).attr("height", 10).attr("rx", 2).attr("fill", FEW);
    svg.append("text").attr("class", "tick-label").attr("x", fx).attr("y", top + 24).text("pocos datos");
  }

  function lineChart(svgId, {labels, series, height, yFormat, reference, annotation}) {
    const svg = d3.select(svgId);
    svg.selectAll("*").remove();
    const width = size(svg, height);
    const margin = {left: 44, right: 74, top: 10, bottom: 24};
    const x = d3.scalePoint(d3.range(labels.length), [margin.left, width - margin.right]);
    const values = series.flatMap(s => s.values.filter(v => v !== null));
    const top = Math.max(reference ? reference * 1.2 : 0.05, d3.max(values) || 0);
    const y = d3.scaleLinear([0, top], [height - margin.bottom, margin.top]).nice();

    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(width - margin.left - margin.right)).tickFormat(yFormat));
    const yearly = labels[0].length === 4;
    const tickIndex = d3.range(labels.length).filter(i => yearly || labels[i].endsWith("-01"));
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues(tickIndex).tickFormat(i => labels[i].slice(0, 4)).tickSizeOuter(0));
    if (reference !== undefined) {
      svg.append("line").attr("class", "baseline").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", y(reference)).attr("y2", y(reference));
    }

    const line = d3.line().defined(v => v !== null).x((_, i) => x(i)).y(v => y(v));
    for (const s of series) {
      svg.append("path")
        .datum(s.values)
        .attr("class", `series ${s.className || ""}`)
        .attr("stroke", s.color)
        .attr("d", line);
      const last = s.values.map((v, i) => ({v, i})).filter(d => d.v !== null).at(-1);
      if (last) {
        svg.append("circle").attr("class", "end-dot").attr("cx", x(last.i)).attr("cy", y(last.v)).attr("r", 4).attr("fill", s.color);
        svg.append("text").attr("class", "end-label").attr("x", x(last.i) + 8).attr("y", y(last.v)).attr("dy", "0.32em").text(s.label);
      }
    }

    if (annotation) {
      const s = series[annotation.series];
      const v = s && s.values[annotation.at];
      if (v !== null && v !== undefined) {
        const ax = x(annotation.at);
        const ay = y(v);
        const ty = y(annotation.labelValue ?? v);
        svg.append("line").attr("class", "annotation-line").attr("x1", ax).attr("x2", ax).attr("y1", ay + 6).attr("y2", ty - 6);
        svg.append("text").attr("class", "annotation").attr("x", annotation.anchor === "end" ? ax - 4 : annotation.anchor === "start" ? ax + 4 : ax).attr("y", ty + 4).attr("text-anchor", annotation.anchor || "middle").text(annotation.text);
      }
    }

    const guide = svg.append("line").attr("class", "crosshair").attr("y1", margin.top).attr("y2", height - margin.bottom).attr("opacity", 0);
    svg.append("rect")
      .attr("class", "hit")
      .attr("x", margin.left).attr("y", margin.top)
      .attr("width", width - margin.left - margin.right)
      .attr("height", height - margin.top - margin.bottom)
      .on("mousemove", event => {
        const px = d3.pointer(event)[0];
        const i = d3.minIndex(d3.range(labels.length), k => Math.abs(x(k) - px));
        guide.attr("x1", x(i)).attr("x2", x(i)).attr("opacity", 1);
        const lines = series.map(s => `${s.label}: ${s.values[i] === null ? "sin datos suficientes" : yFormat(s.values[i])}`);
        tip(event, [labels[i], ...lines]);
      })
      .on("mouseleave", () => {
        guide.attr("opacity", 0);
        hideTip();
      });
  }

  function cityList(container, {rows, selected, onClick, onHover, minExpected}) {
    const list = d3.select(container);
    list.selectAll("*").remove();
    if (!rows.length) {
      list.append("p").attr("class", "note").text("Sin ciudades registradas en este periodo.");
      return;
    }
    const max = d3.max(rows, r => r.t);
    const items = list.selectAll("button")
      .data(rows)
      .join("button")
      .attr("type", "button")
      .attr("class", r => `city-row${r.name === selected ? " selected" : ""}`)
      .on("click", (_, r) => onClick(r.name))
      .on("mouseenter", (_, r) => onHover(r.name))
      .on("mouseleave", () => onHover(null));
    items.append("span").attr("class", "city-name").text(r => r.name);
    const bar = items.append("span").attr("class", "city-bar");
    bar.append("span").style("width", r => `${Math.max(2, r.t / max * 100)}%`);
    items.append("span").attr("class", "city-value").text(r => int(r.t));
    items.append("span")
      .attr("class", "city-index")
      .style("--swatch", r => indexColor(r, minExpected) === FEW ? "transparent" : indexColor(r, minExpected))
      .text(r => r.e >= minExpected ? times(r.index) : "—");
  }

  function table(container, {rows, minExpected}) {
    const wrap = d3.select(container);
    wrap.selectAll("*").remove();
    const t = wrap.append("table");
    t.append("thead").append("tr").selectAll("th")
      .data(["Área", "Accidentes", "Severity ≥ 3", "Proporción", "Índice ajustado"])
      .join("th")
      .text(d => d);
    const body = t.append("tbody").selectAll("tr").data(rows).join("tr");
    body.append("td").text(r => r.name);
    body.append("td").text(r => int(r.t));
    body.append("td").text(r => int(r.h));
    body.append("td").text(r => pct(r.rate));
    body.append("td").text(r => r.e >= minExpected ? times(r.index) : "pocos datos");
  }

  return {
    SOURCE_COLORS, AB_COLORS, INDEX_COLORS, FLAG_LABELS, WEATHER_LABELS, FEW,
    indexColor, tip, hideTip, heat, indexChart, mix, legend, lineChart, cityList, table, times, pct, int
  };
})();
