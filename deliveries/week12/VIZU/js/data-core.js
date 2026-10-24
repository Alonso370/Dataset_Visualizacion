(function(root) {
  const START_YEAR = 2016;
  const inRange = (m, range) => m >= range[0] && m <= range[1];
  const sourceOk = (s, source) => source < 0 || s === source;
  const zeros = n => Array.from({length: n}, () => ({t: 0, h: 0}));

  function total(T, range, source) {
    let t = 0;
    let h = 0;
    for (let i = 0; i < T.m.length; i++) {
      if (inRange(T.m[i], range) && sourceOk(T.s[i], source)) {
        t += T.t[i];
        h += T.h[i];
      }
    }
    return {t, h, rate: t ? h / t : null};
  }

  function bySource(T, range, nSources) {
    const out = zeros(nSources);
    for (let i = 0; i < T.m.length; i++) {
      if (!inRange(T.m[i], range)) continue;
      out[T.s[i]].t += T.t[i];
      out[T.s[i]].h += T.h[i];
    }
    return out;
  }

  function byArea(areas, range, source) {
    const out = new Map();
    for (let i = 0; i < areas.a.length; i++) {
      if (!inRange(areas.m[i], range) || !sourceOk(areas.s[i], source)) continue;
      const name = areas.names[areas.a[i]];
      const group = out.get(name) || {t: 0, h: 0};
      group.t += areas.t[i];
      group.h += areas.h[i];
      out.set(name, group);
    }
    for (const group of out.values()) group.rate = group.t ? group.h / group.t : null;
    return out;
  }

  function areaTable(areas, name) {
    const index = areas.names.indexOf(name);
    const T = {s: [], m: [], t: [], h: []};
    if (index < 0) return T;
    for (let i = 0; i < areas.a.length; i++) {
      if (areas.a[i] !== index) continue;
      T.s.push(areas.s[i]);
      T.m.push(areas.m[i]);
      T.t.push(areas.t[i]);
      T.h.push(areas.h[i]);
    }
    return T;
  }

  function monthly(T, nMonths, nSources) {
    const out = Array.from({length: nSources}, () => zeros(nMonths));
    for (let i = 0; i < T.m.length; i++) {
      const cell = out[T.s[i]][T.m[i]];
      if (!cell) continue;
      cell.t += T.t[i];
      cell.h += T.h[i];
    }
    return out;
  }

  function weekdayDays(range) {
    const days = Array(7).fill(0);
    const end = new Date(Date.UTC(START_YEAR, range[1] + 1, 1));
    for (let d = new Date(Date.UTC(START_YEAR, range[0], 1)); d < end; d = new Date(d.getTime() + 864e5)) {
      days[(d.getUTCDay() + 6) % 7]++;
    }
    return days;
  }

  function emptyGrid() {
    return Array.from({length: 7}, () => Array(24).fill(0));
  }

  function heat(H, range, source) {
    const cells = emptyGrid();
    for (let i = 0; i < H.m.length; i++) {
      if (inRange(H.m[i], range) && sourceOk(H.s[i], source)) cells[H.d[i]][H.hr[i]] += H.h[i];
    }
    return cells;
  }

  function heatRows(rows) {
    const cells = emptyGrid();
    let missing = 0;
    for (const row of rows) {
      if (!(row.Severity >= 3)) continue;
      if (!Number.isInteger(row.weekday) || !Number.isInteger(row.hour)) {
        missing++;
        continue;
      }
      cells[row.weekday][row.hour]++;
    }
    return {cells, missing};
  }

  function infra(I, T, range, nFlags, nSources) {
    const all = bySource(T, range, nSources);
    const withFlag = Array.from({length: nFlags}, () => zeros(nSources));
    for (let i = 0; i < I.m.length; i++) {
      if (!inRange(I.m[i], range)) continue;
      const cell = withFlag[I.f[i]][I.s[i]];
      cell.t += I.t[i];
      cell.h += I.h[i];
    }
    return withFlag.map(flag => flag.map((w, s) => ({
      with: w,
      without: {t: all[s].t - w.t, h: all[s].h - w.h}
    })));
  }

  function infraRows(rows, flags, sources) {
    return flags.map(flag => sources.map(source => {
      const result = {with: {t: 0, h: 0}, without: {t: 0, h: 0}};
      for (const row of rows) {
        if (row.Source !== source) continue;
        const group = row[flag] ? result.with : result.without;
        group.t++;
        if (row.Severity >= 3) group.h++;
      }
      return result;
    }));
  }

  function weather(W, range, source, nGroups) {
    const out = zeros(nGroups);
    for (let i = 0; i < W.m.length; i++) {
      if (!inRange(W.m[i], range) || !sourceOk(W.s[i], source)) continue;
      out[W.w[i]].t += W.t[i];
      out[W.w[i]].h += W.h[i];
    }
    return out;
  }

  function compositionGap(a, b) {
    const totalA = a.reduce((sum, d) => sum + d.t, 0);
    const totalB = b.reduce((sum, d) => sum + d.t, 0);
    if (!totalA || !totalB) return null;
    return Math.max(...a.map((d, i) => Math.abs(d.t / totalA - b[i].t / totalB)));
  }

  const api = {
    START_YEAR, total, bySource, byArea, areaTable, monthly, weekdayDays,
    heat, heatRows, infra, infraRows, weather, compositionGap
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DataCore = api;
})(globalThis);
