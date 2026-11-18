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

  function nationalRates(T, nSources) {
    const sums = Array.from({length: nSources}, () => new Map());
    for (let i = 0; i < T.m.length; i++) {
      const year = Math.floor(T.m[i] / 12);
      const cell = sums[T.s[i]].get(year) || {t: 0, h: 0};
      cell.t += T.t[i];
      cell.h += T.h[i];
      sums[T.s[i]].set(year, cell);
    }
    return sums.map(bySourceYear => {
      const rates = new Map();
      for (const [year, cell] of bySourceYear) rates.set(year, cell.t ? cell.h / cell.t : 0);
      return rates;
    });
  }

  function expected(rates, s, m, t) {
    return t * (rates[s].get(Math.floor(m / 12)) || 0);
  }

  function withIndex(cell) {
    cell.rate = cell.t ? cell.h / cell.t : null;
    cell.index = cell.e ? cell.h / cell.e : null;
    return cell;
  }

  function indexTotal(T, range, source, rates) {
    const cell = {t: 0, h: 0, e: 0};
    for (let i = 0; i < T.m.length; i++) {
      if (!inRange(T.m[i], range) || !sourceOk(T.s[i], source)) continue;
      cell.t += T.t[i];
      cell.h += T.h[i];
      cell.e += expected(rates, T.s[i], T.m[i], T.t[i]);
    }
    return withIndex(cell);
  }

  function byAreaIndex(areas, range, source, rates) {
    const out = new Map();
    for (let i = 0; i < areas.a.length; i++) {
      if (!inRange(areas.m[i], range) || !sourceOk(areas.s[i], source)) continue;
      const name = areas.names[areas.a[i]];
      const cell = out.get(name) || {t: 0, h: 0, e: 0};
      cell.t += areas.t[i];
      cell.h += areas.h[i];
      cell.e += expected(rates, areas.s[i], areas.m[i], areas.t[i]);
      out.set(name, cell);
    }
    for (const cell of out.values()) withIndex(cell);
    return out;
  }

  function infraIndex(I, T, range, source, rates, nFlags) {
    const all = indexTotal(T, range, source, rates);
    const flags = Array.from({length: nFlags}, () => ({t: 0, h: 0, e: 0}));
    for (let i = 0; i < I.m.length; i++) {
      if (!inRange(I.m[i], range) || !sourceOk(I.s[i], source)) continue;
      const cell = flags[I.f[i]];
      cell.t += I.t[i];
      cell.h += I.h[i];
      cell.e += expected(rates, I.s[i], I.m[i], I.t[i]);
    }
    return flags.map(w => ({
      with: withIndex(w),
      without: withIndex({t: all.t - w.t, h: all.h - w.h, e: all.e - w.e})
    }));
  }

  function weatherIndex(W, range, source, rates, nGroups) {
    const out = Array.from({length: nGroups}, () => ({t: 0, h: 0, e: 0}));
    for (let i = 0; i < W.m.length; i++) {
      if (!inRange(W.m[i], range) || !sourceOk(W.s[i], source)) continue;
      const cell = out[W.w[i]];
      cell.t += W.t[i];
      cell.h += W.h[i];
      cell.e += expected(rates, W.s[i], W.m[i], W.t[i]);
    }
    return out.map(withIndex);
  }

  function sampleInfraIndex(rows, flags, sources, rates) {
    return flags.map(flag => {
      const result = {with: {t: 0, h: 0, e: 0}, without: {t: 0, h: 0, e: 0}};
      for (const row of rows) {
        const s = sources.indexOf(row.Source);
        if (s < 0 || !Number.isInteger(row.month)) continue;
        const group = row[flag] ? result.with : result.without;
        group.t++;
        if (row.Severity >= 3) group.h++;
        group.e += expected(rates, s, row.month, 1);
      }
      return {with: withIndex(result.with), without: withIndex(result.without)};
    });
  }

  const api = {
    START_YEAR, total, bySource, areaTable, monthly, weekdayDays, heat, heatRows,
    nationalRates, indexTotal, byAreaIndex, infraIndex, weatherIndex, sampleInfraIndex
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DataCore = api;
})(globalThis);
