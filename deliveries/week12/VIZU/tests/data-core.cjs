const assert = require('node:assert/strict');
const D = require('../js/data-core.js');

const T = {s: [0, 0, 1, 1, 2], m: [0, 1, 0, 2, 1], t: [10, 20, 30, 40, 5], h: [1, 2, 15, 20, 0]};
assert.deepEqual(D.total(T, [0, 1], -1), {t: 65, h: 18, rate: 18 / 65});
assert.deepEqual(D.total(T, [0, 2], 1), {t: 70, h: 35, rate: 0.5});
assert.equal(D.total(T, [5, 6], -1).rate, null);
assert.deepEqual(D.bySource(T, [0, 0], 3), [{t: 10, h: 1}, {t: 30, h: 15}, {t: 0, h: 0}]);

const areas = {names: ['CA', 'OH'], a: [0, 0, 1], s: [0, 1, 1], m: [0, 0, 1], t: [10, 30, 8], h: [1, 9, 4]};
const byArea = D.byArea(areas, [0, 1], -1);
assert.equal(byArea.get('CA').t, 40);
assert.equal(byArea.get('CA').rate, 0.25);
assert.equal(byArea.get('OH').rate, 0.5);
assert.deepEqual(D.areaTable(areas, 'OH'), {s: [1], m: [1], t: [8], h: [4]});

const january = D.weekdayDays([0, 0]);
assert.equal(january.reduce((a, b) => a + b), 31);
assert.equal(january[4], 5);
assert.equal(january[0], 4);
assert.equal(D.weekdayDays([1, 1]).reduce((a, b) => a + b), 29);

const H = {s: [0, 1, 0], m: [0, 0, 3], d: [0, 6, 0], hr: [8, 23, 8], h: [3, 2, 5]};
const cells = D.heat(H, [0, 1], -1);
assert.equal(cells[0][8], 3);
assert.equal(cells[6][23], 2);
assert.equal(D.heat(H, [0, 9], 0)[0][8], 8);

const I = {s: [0, 1], m: [0, 0], f: [0, 0], t: [4, 10], h: [1, 8]};
const infra = D.infra(I, T, [0, 0], 1, 3);
assert.deepEqual(infra[0][0], {with: {t: 4, h: 1}, without: {t: 6, h: 0}});
assert.deepEqual(infra[0][1], {with: {t: 10, h: 8}, without: {t: 20, h: 7}});

const rows = [
  {Source: 'Source1', Severity: 3, Junction: 1, hour: 8, weekday: 0},
  {Source: 'Source1', Severity: 1, Junction: 0, hour: 8, weekday: 0},
  {Source: 'Source2', Severity: 4, Junction: 1, hour: null, weekday: 0}
];
const infraSample = D.infraRows(rows, ['Junction'], ['Source1', 'Source2']);
assert.deepEqual(infraSample[0][0], {with: {t: 1, h: 1}, without: {t: 1, h: 0}});
const heatSample = D.heatRows(rows);
assert.equal(heatSample.cells[0][8], 1);
assert.equal(heatSample.missing, 1);

assert.equal(D.compositionGap([{t: 50}, {t: 50}, {t: 0}], [{t: 40}, {t: 60}, {t: 0}]).toFixed(2), '0.10');
assert.equal(D.compositionGap([{t: 0}], [{t: 5}]), null);

console.log('OK: totales, fuentes, áreas, días del calendario, heatmap, infraestructura y mezcla de fuentes.');
