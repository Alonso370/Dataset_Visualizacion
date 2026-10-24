/* Pure aggregations over the monthly columnar tables; shared by the UI and node tests. */
(function(root) {
  const START_YEAR = 2016;
  const inRange = (m,range) => m >= range[0] && m <= range[1];
  const sourceOk = (s,source) => source < 0 || s === source;
  function total(T,range,source) {
    let t = 0, h = 0;
    for (let i=0;i<T.m.length;i++) if (inRange(T.m[i],range) && sourceOk(T.s[i],source)) { t += T.t[i]; h += T.h[i]; }
    return {t,h,rate:t ? h/t : null};
  }
  function bySource(T,range,nSources) {
    const out = Array.from({length:nSources},() => ({t:0,h:0}));
    for (let i=0;i<T.m.length;i++) if (inRange(T.m[i],range)) { out[T.s[i]].t += T.t[i]; out[T.s[i]].h += T.h[i]; }
    return out;
  }
  function byArea(areas,range,source) {
    const out = new Map();
    for (let i=0;i<areas.a.length;i++) {
      if (!inRange(areas.m[i],range) || !sourceOk(areas.s[i],source)) continue;
      const name = areas.names[areas.a[i]], g = out.get(name) || {t:0,h:0};
      g.t += areas.t[i]; g.h += areas.h[i]; out.set(name,g);
    }
    for (const g of out.values()) g.rate = g.t ? g.h/g.t : null;
    return out;
  }
  function areaTable(areas,name) {
    const index = areas.names.indexOf(name), T = {s:[],m:[],t:[],h:[]};
    if (index < 0) return T;
    for (let i=0;i<areas.a.length;i++) if (areas.a[i] === index) { T.s.push(areas.s[i]); T.m.push(areas.m[i]); T.t.push(areas.t[i]); T.h.push(areas.h[i]); }
    return T;
  }
  function monthly(T,nMonths,nSources) {
    const out = Array.from({length:nSources},() => Array.from({length:nMonths},() => ({t:0,h:0})));
    for (let i=0;i<T.m.length;i++) { const c = out[T.s[i]][T.m[i]]; if (c) { c.t += T.t[i]; c.h += T.h[i]; } }
    return out;
  }
  function weekdayDays(range) {
    const days = Array(7).fill(0);
    const first = new Date(Date.UTC(START_YEAR,range[0],1)), end = new Date(Date.UTC(START_YEAR,range[1]+1,1));
    for (let d=first; d<end; d=new Date(d.getTime()+864e5)) days[(d.getUTCDay()+6)%7]++;
    return days;
  }
  function heat(H,range,source) {
    const cells = Array.from({length:7},() => Array(24).fill(0));
    for (let i=0;i<H.m.length;i++) if (inRange(H.m[i],range) && sourceOk(H.s[i],source)) cells[H.d[i]][H.hr[i]] += H.h[i];
    return cells;
  }
  function heatRows(rows) {
    const cells = Array.from({length:7},() => Array(24).fill(0));
    let missing = 0;
    for (const row of rows) {
      if (!(row.Severity >= 3)) continue;
      if (!Number.isInteger(row.weekday) || !Number.isInteger(row.hour)) { missing++; continue; }
      cells[row.weekday][row.hour]++;
    }
    return {cells,missing};
  }
  function infra(I,T,range,nFlags,nSources) {
    const all = bySource(T,range,nSources);
    const out = Array.from({length:nFlags},() => Array.from({length:nSources},() => ({t:0,h:0})));
    for (let i=0;i<I.m.length;i++) if (inRange(I.m[i],range)) { const c = out[I.f[i]][I.s[i]]; c.t += I.t[i]; c.h += I.h[i]; }
    return out.map(flag => flag.map((w,s) => ({with:w,without:{t:all[s].t-w.t,h:all[s].h-w.h}})));
  }
  function infraRows(rows,flags,sources) {
    return flags.map(flag => sources.map(source => {
      const r = {with:{t:0,h:0},without:{t:0,h:0}};
      for (const row of rows) {
        if (row.Source !== source) continue;
        const g = row[flag] ? r.with : r.without; g.t++; if (row.Severity >= 3) g.h++;
      }
      return r;
    }));
  }
  function weather(W,range,source,nGroups) {
    const out = Array.from({length:nGroups},() => ({t:0,h:0}));
    for (let i=0;i<W.m.length;i++) if (inRange(W.m[i],range) && sourceOk(W.s[i],source)) { out[W.w[i]].t += W.t[i]; out[W.w[i]].h += W.h[i]; }
    return out;
  }
  function compositionGap(a,b) {
    const ta = a.reduce((s,d) => s+d.t,0), tb = b.reduce((s,d) => s+d.t,0);
    if (!ta || !tb) return null;
    return Math.max(...a.map((d,i) => Math.abs(d.t/ta-b[i].t/tb)));
  }
  const api = {START_YEAR,total,bySource,byArea,areaTable,monthly,weekdayDays,heat,heatRows,infra,infraRows,weather,compositionGap};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DataCore = api;
})(globalThis);
