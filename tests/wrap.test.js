const test = require('node:test');
const assert = require('node:assert/strict');
const { shade, wrapDefs, wrapBackSvg, wrapFrontSvg } = require('../js/wrap.js');

const kraft = { name: 'Крафт', front: '#C8A276', side: '#B08856', back: '#A07A4B', texture: 'kraft' };
const extents = { minX: 120, maxX: 280, minY: 150, maxY: 260 };
const bind = { x: 200, y: 400 };

test('shade darkens and lightens a hex colour and clamps the result', () => {
  assert.equal(shade('#808080', 0), '#808080');
  assert.equal(shade('#808080', -1), '#000000');
  assert.equal(shade('#808080', 1), '#ffffff');
  assert.equal(shade('#C8A276', -.5), '#64513b');
});

test('wrap layers are valid SVG fragments using the wrap colours', () => {
  const back = wrapBackSvg(kraft, extents, bind), front = wrapFrontSvg(kraft, extents, bind);
  for (const svg of [back, front]) {
    assert.doesNotMatch(svg, /NaN|undefined/);
    assert.match(svg, /<path /);
  }
  assert.match(front, /url\(#wrapGrain\)/);
});

test('front sheets gather at the binding below the bouquet', () => {
  const front = wrapFrontSvg(kraft, extents, bind);
  const ys = [...front.matchAll(/[ML]\s*[\d.]+ ([\d.]+)/g)].map(m => Number(m[1]));
  assert.ok(Math.max(...ys) > bind.y, 'front reaches below the binding');
});

test('defs declare the grain filter and shadow once', () => {
  const defs = wrapDefs();
  assert.equal(defs.match(/id="wrapGrain"/g).length, 1);
  assert.equal(defs.match(/id="wrapShadow"/g).length, 1);
});
