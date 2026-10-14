/* Pure selection/temporal operations shared by UI and meaningful regression tests. */
(function(root) {
  const validHour = value => Number.isInteger(value) && value >= 0 && value <= 23;
  const validWeekday = value => Number.isInteger(value) && value >= 0 && value <= 6;
  function hourMatches(row,hours) { return hours.size === 24 || validHour(row.hour) && hours.has(row.hour); }
  function series(rows,hours) {
    const weekday = Array.from({length:24},(_,hour) => ({hour,n:0,active:hours.has(hour)}));
    const weekend = weekday.map(d => ({...d}));
    let missing = 0;
    for (const row of rows) {
      if (!validHour(row.hour) || !validWeekday(row.weekday)) { missing++; continue; }
      if (!hours.has(row.hour)) continue;
      (row.weekday >= 5 ? weekend : weekday)[row.hour].n++;
    }
    return {weekday,weekend,missing};
  }
  function inside(polygon,point) {
    // Boundary-inclusive ray casting; avoids dropping points exactly on the lasso.
    let result = false;
    for (let i=0,j=polygon.length-1; i<polygon.length; j=i++) {
      const [ax,ay] = polygon[j], [bx,by] = polygon[i], [px,py] = point;
      const cross = (px-ax)*(by-ay)-(py-ay)*(bx-ax);
      const epsilon = 1e-12;
      if (Math.abs(cross) <= epsilon && px >= Math.min(ax,bx)-epsilon && px <= Math.max(ax,bx)+epsilon && py >= Math.min(ay,by)-epsilon && py <= Math.max(ay,by)+epsilon) return true;
      if ((ay>py)!==(by>py) && px < (bx-ax)*(py-ay)/(by-ay)+ax) result = !result;
    }
    return result;
  }
  const api = {validHour,validWeekday,hourMatches,series,inside};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FilterCore = api;
})(globalThis);
