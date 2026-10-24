window.Timeline = (() => {
  const $ = id => document.getElementById(id);
  const int = v => Math.round(v).toLocaleString("es-PE");
  const pct = v => v === null ? "—" : `${(v * 100).toFixed(1)} %`;

  let onRange = () => {};
  let x = null;
  let brush = null;
  let gBrush = null;
  let current = [0, 0];
  let frame;

  function init(callback) {
    onRange = callback;
  }

  function isFull(range) {
    return x && range[0] === 0 && range[1] === x.domain().length - 1;
  }

  function monthAt(px) {
    const index = Math.floor((px - x.range()[0]) / x.step());
    return Math.max(0, Math.min(x.domain().length - 1, index));
  }

  function selectionFor(range) {
    return isFull(range) ? null : [x(range[0]), x(range[1]) + x.bandwidth()];
  }

  function emit(range) {
    if (range[0] === current[0] && range[1] === current[1]) return;
    current = range;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => onRange([...current]));
  }

  function context({T, months, sources, source, range}) {
    const svg = d3.select("#contextChart");
    svg.selectAll("*").remove();
    const height = 150;
    const width = svg.node().clientWidth || 800;
    const margin = {left: 46, right: 12, top: 8, bottom: 24};
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    current = [...range];

    const series = DataCore.monthly(T, months.length, sources.length);
    const keys = sources.map((_, i) => i).filter(i => source < 0 || i === source);
    const table = months.map((_, m) => Object.fromEntries(keys.map(k => [k, series[k][m].h])));
    const stacked = d3.stack().keys(keys)(table);
    const top = d3.max(stacked.at(-1) || [], d => d[1]) || 1;

    x = d3.scaleBand(d3.range(months.length), [margin.left, width - margin.right]).paddingInner(0.12);
    const y = d3.scaleLinear([0, top], [height - margin.bottom, margin.top]).nice();

    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(3).tickSize(-(width - margin.left - margin.right)).tickFormat(d3.format("~s")));

    svg.append("g").selectAll("g")
      .data(stacked)
      .join("g")
      .attr("fill", d => VizCharts.SOURCE_COLORS[d.key])
      .selectAll("rect")
      .data(d => d.map((v, m) => ({v, m})))
      .join("rect")
      .attr("x", d => x(d.m))
      .attr("width", x.bandwidth())
      .attr("y", d => y(d.v[1]))
      .attr("height", d => y(d.v[0]) - y(d.v[1]));

    const januaries = months.map((label, m) => ({label, m})).filter(d => d.label.endsWith("-01"));
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).tickValues(januaries.map(d => d.m)).tickFormat(m => months[m].slice(0, 4)).tickSizeOuter(0));

    svg.append("text")
      .attr("transform", `translate(11,${(height - margin.bottom + margin.top) / 2}) rotate(-90)`)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .text("Sev ≥ 3 / mes");

    brush = d3.brushX()
      .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]])
      .on("brush", event => {
        if (!event.sourceEvent || !event.selection) return;
        const [a, b] = event.selection;
        emit([monthAt(a), monthAt(b - 1)]);
      })
      .on("end", event => {
        if (!event.sourceEvent) return;
        if (!event.selection) {
          emit([0, months.length - 1]);
          return;
        }
        const [a, b] = event.selection;
        const snapped = [monthAt(a), monthAt(b - 1)];
        emit(snapped);
        gBrush.call(brush.move, selectionFor(snapped));
      });

    gBrush = svg.append("g").attr("class", "brush").call(brush);
    gBrush.call(brush.move, selectionFor(range));

    gBrush.select(".overlay")
      .on("mousemove.tip", event => {
        const m = monthAt(d3.pointer(event)[0]);
        const lines = keys.map(k => `${sources[k]}: ${int(series[k][m].h)} con Sev ≥ 3 de ${int(series[k][m].t)}`);
        VizCharts.tip(event, [months[m], ...lines]);
      })
      .on("mouseleave.tip", VizCharts.hideTip);
    gBrush.select(".selection").on("mousemove.tip", VizCharts.hideTip);

    const legend = keys.map(k => {
      const item = document.createElement("span");
      item.textContent = sources[k];
      item.style.setProperty("--color", VizCharts.SOURCE_COLORS[k]);
      return item;
    });
    $("sourceLegend").replaceChildren(...legend);
  }

  function move(range) {
    if (!gBrush || !x) return;
    current = [...range];
    gBrush.call(brush.move, selectionFor(range));
  }

  function focus({T, months, sources, source, range, scope}) {
    const series = DataCore.monthly(T, months.length, sources.length);
    const withRate = list => list.map(d => ({...d, rate: d.t >= 50 ? d.h / d.t : null}));
    const keys = sources.map((_, i) => i).filter(i => source < 0 || i === source);

    const lines = keys.map(k => ({
      label: sources[k],
      color: VizCharts.SOURCE_COLORS[k],
      width: k === 2 ? 1.2 : 2,
      values: withRate(series[k])
    }));
    if (source < 0) {
      const all = months.map((_, m) => ({
        t: d3.sum(series, s => s[m].t),
        h: d3.sum(series, s => s[m].h)
      }));
      lines.push({label: "Todas", color: "#111827", dash: "4 3", width: 1.4, values: withRate(all)});
    }

    const svg = d3.select("#focusChart");
    const height = Math.max(220, svg.node().clientHeight || 260);
    VizCharts.lineChart(svg, {series: lines, months, range, height, yLabel: "% con Severity ≥ 3"});
    $("focusScope").textContent = scope;

    const summary = keys.map(k => {
      const period = series[k].slice(range[0], range[1] + 1);
      const t = d3.sum(period, d => d.t);
      const h = d3.sum(period, d => d.h);
      return `${sources[k]} ${pct(t ? h / t : null)}`;
    });
    $("focusNote").textContent = `En el periodo: ${summary.join(" · ")}. Se omiten los meses con menos de 50 accidentes `
      + "de una fuente. Arrastra abajo para elegir el periodo; clic fuera de la selección vuelve al periodo completo.";
  }

  return {init, context, focus, move};
})();
