// Scatterplot espectral: cada punto es un estado o un condado; cerca = serie temporal parecida.
// Las coordenadas y los grupos se precalculan en scripts/build_spectral.py.
window.Similar = (() => {
  const GROUP_COLORS = ["#2F6E6A", "#8DB8A8", "#6F86A3", "#5E3A5C", "#B07C93", "#3E4A63"];
  const SIZE = 236;
  const PAD = 8;

  let data = null;
  let handlers = {};
  let view = {kind: "states", points: [], focusState: null, current: null};
  let selected = new Set();
  let hoverId = null;
  let delaunay = null;
  let screen = [];
  let draft = null;

  const svg = () => d3.select("#similarPlot");
  const byId = new Map();

  function init(spectral, options) {
    data = spectral;
    handlers = options;
    for (const kind of ["states", "counties"]) for (const p of data[kind].points) byId.set(p.id, {...p, kind});
    bindPointer();
    d3.select("#similarClear").on("click", () => {
      setSelection(new Set());
      handlers.onClear?.();
    });
  }

  const groupColor = g => GROUP_COLORS[g % GROUP_COLORS.length];
  const point = id => byId.get(id);
  const groupsOf = kind => data[kind].groups;

  // Lo que muestra el panel depende del nivel del mapa: en el país, estados; dentro de un estado, condados.
  function show({kind, focusState, current}) {
    const changed = kind !== view.kind || focusState !== view.focusState;
    view = {kind, focusState, current, points: data[kind].points};
    if (changed) selected = new Set();
    draw();
  }

  function draw() {
    const root = svg();
    root.attr("viewBox", `0 0 ${SIZE} ${SIZE}`).selectAll("*").remove();
    const pts = view.points;
    const x = d3.scaleLinear(d3.extent(pts, d => d.x), [PAD, SIZE - PAD]).nice();
    const y = d3.scaleLinear(d3.extent(pts, d => d.y), [SIZE - PAD, PAD]).nice();
    screen = pts.map(d => [x(d.x), y(d.y)]);
    delaunay = d3.Delaunay.from(screen);

    root.append("rect").attr("class", "similar-frame").attr("width", SIZE).attr("height", SIZE);
    const focus = view.focusState;
    const order = d3.range(pts.length).sort((a, b) => rank(pts[a]) - rank(pts[b]));
    root.append("g").selectAll("circle").data(order).join("circle")
      .attr("cx", i => screen[i][0])
      .attr("cy", i => screen[i][1])
      .attr("r", i => radius(pts[i]))
      .attr("fill", i => groupColor(pts[i].g))
      .attr("class", i => {
        const d = pts[i];
        const faded = (selected.size && !selected.has(d.id)) || (focus && d.state !== focus && !selected.has(d.id));
        return `similar-dot${faded ? " faded" : ""}${selected.has(d.id) ? " picked" : ""}`;
      });

    const ring = (id, cls) => {
      const i = pts.findIndex(d => d.id === id);
      if (i < 0) return;
      root.append("circle").attr("class", cls).attr("cx", screen[i][0]).attr("cy", screen[i][1]).attr("r", 7);
    };
    ring(view.current, "similar-current");
    ring(hoverId, "similar-hover");
    root.append("path").attr("class", "similar-lasso").attr("d", draft && draft.length > 1 ? `M${draft.join("L")}Z` : null);

    drawKey();
    drawSeries();
    const outside = focus ? pts.filter(d => d.state === focus).length : pts.length;
    const total = view.kind === "states" ? "estados" : "condados";
    d3.select("#similarNote").text(focus
      ? `${outside} condados de ${handlers.stateName(focus)} con datos suficientes (en color); en gris, el resto del país.`
      : `${pts.length} ${total}. Arrastra para rodear puntos, clic para ir al área, Mayús + clic para fijarla como A o B.`);
    d3.select("#similarClear").property("disabled", !selected.size && !handlers.hasPins?.());
  }

  const rank = d => (selected.has(d.id) ? 3 : 0) + (!view.focusState || d.state === view.focusState ? 1 : 0);
  const radius = d => view.kind === "states" ? 4.5 : (!view.focusState || d.state === view.focusState ? 3 : 2);

  function drawKey() {
    const groups = groupsOf(view.kind);
    const key = d3.select("#similarKey");
    key.selectAll("*").remove();
    key.selectAll("button").data(groups).join("button")
      .attr("type", "button")
      .attr("class", "group-chip")
      .attr("title", "Seleccionar todo el grupo")
      .style("--chip", d => groupColor(d.g))
      .text(d => `Grupo ${d.g + 1} · ${d.n}`)
      .on("click", (_, d) => setSelection(new Set(view.points.filter(p => p.g === d.g && (!view.focusState || p.state === view.focusState)).map(p => p.id))));
  }

  // Abajo: la serie que explica los grupos (promedios) o la selección (su promedio y cada área).
  function drawSeries() {
    const root = d3.select("#similarSeries");
    const W = SIZE, H = 128, M = {l: 30, r: 6, t: 8, b: 16};
    root.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    const quarters = data.quarters;
    const members = view.points.filter(p => selected.has(p.id));
    const hover = hoverId ? point(hoverId) : null;
    let lines;
    if (members.length) {
      lines = members.slice(0, 40).map(p => ({values: p.q, cls: "series-member", color: groupColor(p.g)}));
      lines.push({values: geoMean(members.map(p => p.q)), cls: "series-mean", color: "var(--ink)"});
      d3.select("#similarSeriesTitle").text(`Promedio de ${members.length} ${view.kind === "states" ? "estados" : "condados"} seleccionados`);
    } else {
      lines = groupsOf(view.kind).map(g => ({values: g.mean, cls: "series-group", color: groupColor(g.g)}));
      d3.select("#similarSeriesTitle").text("Serie promedio de cada grupo");
    }
    if (hover) lines.push({values: hover.q, cls: "series-hover", color: groupColor(hover.g)});

    const all = lines.flatMap(l => l.values);
    const y = d3.scaleLog([Math.min(0.5, d3.min(all)), Math.max(2, d3.max(all))], [H - M.b, M.t]).clamp(true);
    const x = d3.scaleLinear([0, quarters.length - 1], [M.l, W - M.r]);
    root.append("g").attr("class", "grid").attr("transform", `translate(${M.l},0)`)
      .call(d3.axisLeft(y).tickValues([0.5, 1, 2]).tickSize(-(W - M.l - M.r)).tickFormat(v => `${v}×`));
    const years = quarters.map((q, i) => [q, i]).filter(([q]) => q.endsWith("-01") && +q.slice(0, 4) % 2 === 0);
    root.append("g").selectAll("text").data(years).join("text")
      .attr("class", "tick-label").attr("x", d => x(d[1])).attr("y", H - 3).attr("text-anchor", "middle").text(d => d[0].slice(0, 4));
    root.append("line").attr("class", "baseline").attr("x1", M.l).attr("x2", W - M.r).attr("y1", y(1)).attr("y2", y(1));
    const path = d3.line().x((_, i) => x(i)).y(v => y(v)).curve(d3.curveMonotoneX);
    root.append("g").selectAll("path").data(lines).join("path")
      .attr("class", d => `series ${d.cls}`).attr("stroke", d => d.color).attr("d", d => path(d.values));
  }

  function geoMean(list) {
    return list[0].map((_, i) => Math.exp(d3.mean(list, q => Math.log(q[i]))));
  }

  function setSelection(set) {
    selected = set;
    draw();
    handlers.onSelect?.(selected);
  }

  function nearest(px, py) {
    if (!delaunay) return null;
    const i = delaunay.find(px, py);
    if (i < 0) return null;
    const [sx, sy] = screen[i];
    return Math.hypot(sx - px, sy - py) <= 9 ? view.points[i] : null;
  }

  function local(event) {
    const node = svg().node();
    const rect = node.getBoundingClientRect();
    return [(event.clientX - rect.left) * SIZE / rect.width, (event.clientY - rect.top) * SIZE / rect.height];
  }

  function bindPointer() {
    const node = svg().node();
    let start = null;
    node.addEventListener("pointerdown", event => {
      start = local(event);
      draft = [start];
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener("pointermove", event => {
      const p = local(event);
      if (start) {
        draft.push(p.map(v => Math.round(v * 10) / 10));
        svg().select(".similar-lasso").attr("d", `M${draft.join("L")}Z`);
        return;
      }
      const d = nearest(...p);
      setHover(d ? d.id : null, event);
    });
    node.addEventListener("pointerleave", () => { if (!start) setHover(null); });
    node.addEventListener("pointerup", event => {
      const p = local(event);
      // Un lazo suele cerrarse cerca de donde empezó: se mide cuánto se alejó el trazo, no el punto final.
      const moved = start && draft.length > 4 && d3.max(draft, q => Math.hypot(q[0] - start[0], q[1] - start[1])) > 8;
      if (moved) {
        const picked = view.points.filter((d, i) => d3.polygonContains(draft, screen[i])
          && (!view.focusState || d.state === view.focusState));
        draft = null;
        start = null;
        setSelection(new Set(picked.map(d => d.id)));
        return;
      }
      draft = null;
      start = null;
      const d = nearest(...p);
      if (d) handlers.onPick?.(d, event.shiftKey);
      draw();
    });
  }

  // El hover viene del scatter o del mapa; en ambos casos se marca el punto y se dibuja su serie.
  function setHover(id, event) {
    if (id === hoverId && !event) return;
    hoverId = id;
    svg().selectAll(".similar-hover").remove();
    const i = view.points.findIndex(d => d.id === id);
    if (i >= 0) svg().append("circle").attr("class", "similar-hover").attr("cx", screen[i][0]).attr("cy", screen[i][1]).attr("r", 7);
    drawSeries();
    if (event) {
      if (id) tip(event, point(id));
      else VizCharts.hideTip();
      handlers.onHover?.(id);
    }
  }

  function tip(event, d) {
    const tooltip = document.getElementById("tooltip");
    const title = document.createElement("div");
    title.className = "tip-title";
    title.textContent = d.kind === "states" ? handlers.stateName(d.id) : `${d.name}, ${d.state}`;
    const line = document.createElement("div");
    line.textContent = `Grupo ${d.g + 1} · ${VizCharts.int(d.h)} accidentes Severity ≥ 3`;
    const spark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    spark.setAttribute("viewBox", "0 0 200 44");
    spark.setAttribute("class", "tip-spark");
    const x = d3.scaleLinear([0, d.q.length - 1], [2, 198]);
    const y = d3.scaleLog([Math.min(0.5, d3.min(d.q)), Math.max(2, d3.max(d.q))], [42, 2]);
    d3.select(spark).append("line").attr("class", "baseline").attr("x1", 2).attr("x2", 198).attr("y1", y(1)).attr("y2", y(1));
    d3.select(spark).append("path").attr("class", "series").attr("stroke", groupColor(d.g))
      .attr("d", d3.line().x((_, i) => x(i)).y(v => y(v))(d.q));
    const foot = document.createElement("div");
    foot.textContent = `Índice por trimestre, ${data.quarters[0].slice(0, 4)}–${data.quarters.at(-1).slice(0, 4)} · línea = 1×`;
    tooltip.replaceChildren(title, line, spark, foot);
    tooltip.style.left = `${Math.min(event.clientX + 14, innerWidth - 290)}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    tooltip.style.opacity = 1;
  }

  return {
    init, show, groupColor, point,
    selection: () => selected,
    clear: () => setSelection(new Set()),
    hover: id => setHover(id),
    groupOf: id => byId.get(id)?.g,
    GROUP_COLORS
  };
})();
