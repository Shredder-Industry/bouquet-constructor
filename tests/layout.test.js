const test = require('node:test');
const assert = require('node:assert/strict');
const { packRadius, spiralRadii, bedSprigs } = require('../js/layout.js');

test('packRadius grows with the total head area, not just the count', () => {
  const small = packRadius([34, 34, 34, 34, 34]);
  const big = packRadius([80, 80, 80, 80, 80]);
  assert.ok(big > small * 2, `${big} vs ${small}`);
  assert.ok(packRadius([72, 72, 72, 72, 72, 72, 72, 72, 72, 72, 72]) > packRadius([72, 72, 72]));
});

test('packRadius stays inside its limits', () => {
  assert.equal(packRadius([]), 30);
  assert.equal(packRadius(Array(200).fill(96)), 150);
});

test('spiralRadii puts the first heads in the centre and the last at the rim', () => {
  const r = spiralRadii([80, 72, 72, 38]);
  assert.equal(r.length, 4);
  assert.ok(r.every((v, i) => i === 0 || v > r[i - 1]), 'radii increase');
  assert.ok(r[0] > 0 && r.at(-1) <= 1);
});

test('bedSprigs is deterministic and spreads sprigs around the whole circle', () => {
  const a = bedSprigs(100, 3), b = bedSprigs(100, 3);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 4 && a.length <= 9, `sparse bed, got ${a.length}`);
  const angles = a.map(s => s.angle).sort((x, y) => x - y);
  const widestGap = Math.max(...angles.map((v, i) => (angles[(i + 1) % angles.length] - v + 360) % 360));
  assert.ok(widestGap < 120, `no side left bare, widest gap ${widestGap}`);
});
