const assert = require('node:assert/strict');
const D = require('../js/data-core.js');

const T = {s: [0, 0, 1, 1, 2], m: [0, 1, 0, 2, 1], t: [10, 20, 30, 40, 5], h: [1, 2, 15, 20, 0]};
assert.deepEqual(D.total(T, [0, 1], -1), {t: 65, h: 18, rate: 18 / 65});
assert.deepEqual(D.total(T, [0, 2], 1), {t: 70, h: 35, rate: 0.5});
assert.equal(D.total(T, [5, 6], -1).rate, null);
assert.deepEqual(D.bySource(T, [0, 0], 3), [{t: 10, h: 1}, {t: 30, h: 15}, {t: 0, h: 0}]);

const areas = {names: ['CA', 'OH'], a: [0, 0, 1], s: [0, 1, 1], m: [0, 0, 1], t: [10, 30, 8], h: [1, 9, 4]};
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

const rows = [
  {Source: 'Source1', Severity: 3, Junction: 1, hour: 8, weekday: 0},
  {Source: 'Source1', Severity: 1, Junction: 0, hour: 8, weekday: 0},
  {Source: 'Source2', Severity: 4, Junction: 1, hour: null, weekday: 0}
];
const heatSample = D.heatRows(rows);
assert.equal(heatSample.cells[0][8], 1);
assert.equal(heatSample.missing, 1);

console.log('OK: totales, fuentes, áreas, días del calendario y heatmap.');

const T2 = {s: [0, 0, 1], m: [0, 12, 0], t: [100, 100, 100], h: [10, 50, 40]};
const rates = D.nationalRates(T2, 2);
assert.equal(rates[0].get(0), 0.1);
assert.equal(rates[0].get(1), 0.5);
assert.equal(D.indexTotal(T2, [0, 23], -1, rates).index, 1);
const areasIdx = {names: ['X'], a: [0, 0], s: [0, 1], m: [0, 0], t: [10, 10], h: [2, 8]};
const x = D.byAreaIndex(areasIdx, [0, 0], -1, rates).get('X');
assert.equal(x.e, 10 * 0.1 + 10 * 0.4);
assert.equal(x.index, 10 / 5);
const Iidx = {s: [0], m: [0], f: [0], t: [40], h: [8]};
const flag = D.infraIndex(Iidx, T2, [0, 11], 0, rates, 1)[0];
assert.equal(flag.with.index, 8 / 4);
assert.equal(flag.without.h, 2);
const Widx = {s: [1], m: [0], w: [0], t: [10], h: [4]};
assert.equal(D.weatherIndex(Widx, [0, 0], -1, rates, 1)[0].index, 1);
const sampleIdx = D.sampleInfraIndex([{Source: 'Source1', Severity: 3, Junction: 1, month: 0}], ['Junction'], ['Source1', 'Source2'], rates);
assert.equal(sampleIdx[0].with.index, 1 / 0.1);
console.log('OK: tasas nacionales por fuente y año, índice ajustado por área, infraestructura, clima y muestra.');
