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
  const EARTH_KM = 6371.0088, rad = Math.PI/180;
  function distanceKm([lng1,lat1],[lng2,lat2]) {
    const a = Math.sin((lat2-lat1)*rad/2)**2+Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin((lng2-lng1)*rad/2)**2;
    return 2*EARTH_KM*Math.asin(Math.min(1,Math.sqrt(a)));
  }
  function clampKm(center,point,km) {
    const d = distanceKm(center,point);
    if (d <= km) return point;
    const [lng1,lat1] = center.map(v => v*rad), [lng2,lat2] = point.map(v => v*rad);
    const bearing = Math.atan2(Math.sin(lng2-lng1)*Math.cos(lat2),Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(lng2-lng1));
    const delta = km/EARTH_KM;
    const lat = Math.asin(Math.sin(lat1)*Math.cos(delta)+Math.cos(lat1)*Math.sin(delta)*Math.cos(bearing));
    const lng = lng1+Math.atan2(Math.sin(bearing)*Math.sin(delta)*Math.cos(lat1),Math.cos(delta)-Math.sin(lat1)*Math.sin(lat));
    return [lng/rad,lat/rad];
  }
  function circle(center,km,steps = 72) { return Array.from({length:steps},(_,i) => destination(center,km,i*360/steps)); }
  function destination([lng,lat],km,degrees) {
    const b = degrees*rad, delta = km/EARTH_KM, la = lat*rad, lo = lng*rad;
    const lat2 = Math.asin(Math.sin(la)*Math.cos(delta)+Math.cos(la)*Math.sin(delta)*Math.cos(b));
    return [(lo+Math.atan2(Math.sin(b)*Math.sin(delta)*Math.cos(la),Math.cos(delta)-Math.sin(la)*Math.sin(lat2)))/rad,lat2/rad];
  }
  const api = {validHour,validWeekday,hourMatches,series,inside,distanceKm,clampKm,circle};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FilterCore = api;
})(globalThis);
