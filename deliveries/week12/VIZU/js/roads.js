window.RoadLayer = (() => {
  const RANK = {motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, street: 1, street_limited: 1};
  const WIDTH = {6: 5, 5: 5, 4: 4, 3: 3, 2: 3, 1: 2};
  const rankOf = kind => RANK[String(kind || "").replace(/_link$/, "")] || 0;
  const COLORS = ["#fbcfae", "#f6a979", "#ee7d45", "#d9561f", "#7f2a0a"];
  let cell = 0.002;
  let byCell = new Map();

  function load(data) {
    cell = data.cell;
    byCell = new Map();
    for (let i = 0; i < data.t.length; i++) {
      const key = `${data.iy[i]},${data.ix[i]}`;
      let years = byCell.get(key);
      if (!years) {
        years = [];
        byCell.set(key, years);
      }
      years.push([data.y[i], data.t[i], data.h[i]]);
    }
  }

  function clear() {
    byCell = new Map();
  }

  function cellValue(key, y0, y1) {
    const years = byCell.get(key);
    if (!years) return null;
    let t = 0;
    let h = 0;
    for (const [y, ty, hy] of years) {
      if (y < y0 || y > y1) continue;
      t += ty;
      h += hy;
    }
    return t ? {t, h} : null;
  }

  const keyOf = ([lng, lat]) => `${Math.floor(lat / cell)},${Math.floor(lng / cell)}`;

  function roadLayers(map) {
    return map.getStyle().layers.filter(l => l.type === "line" && l["source-layer"] === "road").map(l => l.id);
  }

  function piecesOf(line, y0, y1, props, out) {
    let current = null;
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (cell / 2)));
      for (let k = 0; k < steps; k++) {
        const p = [a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps];
        const q = [a[0] + (b[0] - a[0]) * (k + 1) / steps, a[1] + (b[1] - a[1]) * (k + 1) / steps];
        const key = keyOf([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
        if (current && current.key === key) {
          if (current.path) current.path.push(q);
          continue;
        }
        const value = cellValue(key, y0, y1);
        current = value ? {key, path: [p, q], ...value, name: props.name || props.ref || "", rank: rankOf(props.class)} : {key, path: null};
        if (value) out.push(current);
      }
    }
  }

  function segments(map, range) {
    if (!byCell.size) return [];
    const y0 = Math.floor(range[0] / 12);
    const y1 = Math.floor(range[1] / 12);
    const features = map.queryRenderedFeatures({layers: roadLayers(map)});
    const out = [];
    const seen = new Set();
    for (const f of features) {
      const id = `${f.id}|${f.properties.class}|${f.properties.name}|${JSON.stringify(f.geometry.coordinates).length}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
      if (!rankOf(f.properties.class)) continue;
      for (const line of lines) piecesOf(line, y0, y1, f.properties, out);
    }
    const top = new Map();
    for (const piece of out) top.set(piece.key, Math.max(top.get(piece.key) || 0, piece.rank));
    return out.filter(piece => piece.rank === top.get(piece.key));
  }

  function breaks(range) {
    const y0 = Math.floor(range[0] / 12);
    const y1 = Math.floor(range[1] / 12);
    const values = [];
    for (const key of byCell.keys()) {
      const v = cellValue(key, y0, y1);
      if (v && v.h > 0) values.push(v.h);
    }
    if (!values.length) return [];
    values.sort((a, b) => a - b);
    const q = f => values[Math.min(values.length - 1, Math.floor(f * values.length))];
    return [...new Set([q(0.5), q(0.8), q(0.95)])].filter(v => v > 0);
  }

  function colorFor(h, cuts) {
    if (!h) return COLORS[0];
    let i = 1;
    for (const c of cuts) if (h > c) i++;
    return COLORS[Math.min(COLORS.length - 1, i)];
  }

  function layer(pieces, cuts, onHover) {
    return new deck.PathLayer({
      id: "road-cells",
      data: pieces,
      pickable: true,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      getPath: d => d.path,
      getWidth: d => WIDTH[d.rank] || 2,
      getColor: d => {
        const c = d3.color(colorFor(d.h, cuts));
        return [c.r, c.g, c.b, 235];
      },
      updateTriggers: {getColor: [cuts.join()]},
      onHover
    });
  }

  return {load, clear, segments, breaks, colorFor, layer, COLORS};
})();
