window.GeoMap = (() => {
  const svg = d3.select("#geoMap");
  const gContext = svg.append("g");
  const gAreas = svg.append("g");
  const gBorder = svg.append("g");
  const gPins = svg.append("g");

  let path = null;
  let viewKey = "";
  let handlers = {onClick: () => {}, onHover: () => {}};

  function fit(focus) {
    const node = svg.node();
    const width = node.clientWidth || 800;
    const height = node.clientHeight || 500;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    const projection = d3.geoAlbersUsa().fitExtent([[12, 12], [width - 12, height - 12]], {type: "FeatureCollection", features: focus});
    path = d3.geoPath(projection);
  }

  function draw({key, context, areas, focus, statOf, colorOf, onClick, onHover, pins}) {
    handlers = {onClick, onHover};
    const size = `${svg.node().clientWidth}x${svg.node().clientHeight}`;
    if (`${key}|${size}` !== viewKey) {
      viewKey = `${key}|${size}`;
      fit(focus);
      gContext.selectAll("path").remove();
      gAreas.selectAll("path").remove();
    }

    gContext.selectAll("path")
      .data(context, f => f.id)
      .join("path")
      .attr("d", path)
      .attr("class", "context-area");

    gAreas.selectAll("path")
      .data(areas, f => f.id)
      .join(enter => enter.append("path")
        .attr("d", path)
        .attr("class", "area")
        .on("mousemove", (event, f) => handlers.onHover(event, f))
        .on("mouseleave", () => handlers.onHover(null, null))
        .on("click", (_, f) => handlers.onClick(f)))
      .attr("fill", f => colorOf(statOf(f)));

    gBorder.selectAll("path")
      .data(focus.length === 1 ? focus : [], f => f.id)
      .join("path")
      .attr("d", path)
      .attr("class", "focus-border");

    const pinned = [];
    for (const f of areas) {
      const pin = pins(f);
      if (pin) pinned.push({f, pin});
    }
    gPins.selectAll("g")
      .data(pinned, d => d.pin + d.f.id)
      .join(enter => {
        const g = enter.append("g");
        g.append("path").attr("class", d => `pin-outline ${d.pin}`);
        g.append("text").attr("class", "pin-label");
        return g;
      })
      .each(function(d) {
        const [x, y] = path.centroid(d.f);
        d3.select(this).select("path").attr("d", path(d.f));
        d3.select(this).select("text").attr("x", x).attr("y", y).text(d.pin);
      });
  }

  function highlight(feature) {
    gAreas.selectAll("path").classed("hovered", f => feature && f.id === feature.id);
  }

  return {draw, highlight};
})();
