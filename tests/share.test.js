const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeBouquet, decodeBouquet } = require('../js/share.js');

const state = {
  wrap: 'kraft', ribbon: 'sage', view: 'side', seed: 3, nextId: 7,
  stems: [{ id: 4, kind: 'rose_red', x: 200.4, y: 180.6, rot: -12, lift: 20, manual: false },
          { id: 6, kind: 'daisy', x: 150, y: 210, rot: 8, manual: true }],
  gifts: { bear_small: 1 },
  card: { on: true, text: 'Мама, ты лучшая! 💐 & #1' },
};

test('bouquet survives a round trip', () => {
  const b = decodeBouquet(encodeBouquet(state));
  assert.equal(b.wrap, 'kraft');
  assert.equal(b.ribbon, 'sage');
  assert.equal(b.seed, 3);
  assert.equal(b.nextId, 3);
  assert.deepEqual(b.stems.map(s => [s.id, s.kind, s.x, s.y, s.rot, s.lift, s.manual]),
    [[1, 'rose_red', 200, 181, -12, 20, false], [2, 'daisy', 150, 210, 8, 0, true]]);
  assert.deepEqual(b.gifts, { bear_small: 1 });
  assert.deepEqual(b.card, { on: true, text: 'Мама, ты лучшая! 💐 & #1' });
});

test('code is URL-safe', () => {
  assert.match(encodeBouquet(state), /^[A-Za-z0-9_-]+$/);
});

test('a 51-stem bouquet fits in 2500 characters', () => {
  const stems = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, kind: 'rose_powder', x: 100 + i, y: 150 + i, rot: -30 + i, manual: true }));
  assert.ok(encodeBouquet({ ...state, stems }).length <= 2500);
});

test('broken, truncated or foreign codes decode to null', () => {
  const good = encodeBouquet(state);
  for (const bad of ['', '!!!', good.slice(0, good.length / 2), btoa('{"v":2,"s":[]}'), btoa('[1,2,3]')]) {
    assert.equal(decodeBouquet(bad), null, bad);
  }
});

test('card off encodes as no card', () => {
  assert.deepEqual(decodeBouquet(encodeBouquet({ ...state, card: { on: false, text: 'черновик' } })).card, { on: false, text: '' });
});
