const test = require('node:test');
const assert = require('node:assert/strict');
const { applyShop } = require('../js/catalog.js');

const library = {
  flowers: { rose_red: { name: 'Роза красная', type: 'rose' }, daisy: { name: 'Ромашка', type: 'daisy' } },
  wraps: { kraft: { name: 'Крафт' }, none: { name: 'Без упаковки' } },
  ribbons: { sage: { name: 'Шалфей' }, wine: { name: 'Бордо' } },
  gifts: { bear_small: { name: 'Мишка, 25 см' } },
};
const shop = {
  flowers: { rose_red: 1100, peony_blue: 900 },
  wraps: { kraft: 1250, none: 0 },
  ribbons: ['sage'],
  gifts: {},
  presets: [
    { name: 'Классика', wrap: 'kraft', ribbon: 'sage', items: { rose_red: 11 } },
    { name: 'Ромашки', wrap: 'kraft', ribbon: 'sage', items: { daisy: 7 } },
    { name: 'С мишкой', wrap: 'kraft', ribbon: 'sage', items: { rose_red: 5 }, gifts: { bear_small: 1 } },
    { name: 'Бордо', wrap: 'kraft', ribbon: 'wine', items: { rose_red: 5 } },
  ],
};

test('applyShop keeps only stocked items and attaches shop prices', () => {
  const c = applyShop(library, shop);
  assert.deepEqual(Object.keys(c.kinds), ['rose_red']);
  assert.equal(c.kinds.rose_red.price, 1100);
  assert.equal(c.kinds.rose_red.type, 'rose');
  assert.equal(c.wraps.none.price, 0);
  assert.deepEqual(Object.keys(c.ribbons), ['sage']);
  assert.deepEqual(c.gifts, {});
});

test('applyShop ignores shop keys missing from the library', () => {
  assert.equal(applyShop(library, shop).kinds.peony_blue, undefined);
});

test('applyShop drops presets that use unavailable items, gifts or ribbons', () => {
  assert.deepEqual(applyShop(library, shop).presets.map(p => p.name), ['Классика']);
});

test('applyShop does not mutate its inputs', () => {
  const before = JSON.stringify([library, shop]);
  applyShop(library, shop);
  assert.equal(JSON.stringify([library, shop]), before);
});

test('applyShop does not treat inherited names like toString as stocked items', () => {
  const crafted = { ...shop, presets: [{ name: 'Подделка', wrap: 'kraft', ribbon: 'sage', items: { toString: 3 } }] };
  assert.deepEqual(applyShop(library, crafted).presets, []);
});
