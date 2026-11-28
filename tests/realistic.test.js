const test = require('node:test');
const assert = require('node:assert/strict');
const { composition, buildPrompt, validateRequest, MAX_PNG_BYTES, MAX_STEMS } = require('../js/realistic.js');

const KINDS = { rose_red: { name: 'Роза красная' }, eucalyptus: { name: 'Эвкалипт' } };
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pngB64 = (extra = 16) => Buffer.concat([PNG_SIG, Buffer.alloc(extra)]).toString('base64');
const comp = { flowers: [{ name: 'Роза красная', count: 3 }], wrap: 'Крафт', ribbon: null };

test('composition groups stems by kind with counts', () => {
  const stems = ['rose_red', 'eucalyptus', 'rose_red', 'rose_red'].map(kind => ({ kind }));
  assert.deepEqual(composition(stems, KINDS, 'Крафт', null), {
    flowers: [{ name: 'Роза красная', count: 3 }, { name: 'Эвкалипт', count: 1 }],
    wrap: 'Крафт', ribbon: null,
  });
});

test('buildPrompt lists every flower and the wrap', () => {
  const p = buildPrompt(comp);
  assert.ok(p.includes('3 × Роза красная'));
  assert.ok(p.includes('Крафт'));
  assert.ok(p.includes('keep the exact arrangement'));
  assert.ok(p.includes('photorealistic studio photo'));
});

test('buildPrompt says no wrapping when wrap is null', () => {
  assert.ok(buildPrompt({ ...comp, wrap: null }).includes('no wrapping'));
});

test('validateRequest rejects empty composition', () => {
  const r = validateRequest({ image: pngB64(), composition: { flowers: [], wrap: null, ribbon: null } });
  assert.equal(r.ok, false); assert.equal(r.status, 400);
});

test('validateRequest rejects non-PNG bytes', () => {
  const r = validateRequest({ image: Buffer.from('hello').toString('base64'), composition: comp });
  assert.equal(r.status, 400);
});

test('validateRequest rejects oversized image', () => {
  const r = validateRequest({ image: pngB64(MAX_PNG_BYTES + 1), composition: comp });
  assert.equal(r.status, 413);
});

test('validateRequest rejects bad counts and too many stems', () => {
  for (const count of [0, -1, 1.5, MAX_STEMS + 1]) {
    const r = validateRequest({ image: pngB64(), composition: { ...comp, flowers: [{ name: 'X', count }] } });
    assert.equal(r.status, 400, `count ${count}`);
  }
});

test('validateRequest rejects missing body and overlong names', () => {
  assert.equal(validateRequest(null).status, 400);
  const r = validateRequest({ image: pngB64(), composition: { ...comp, flowers: [{ name: 'x'.repeat(61), count: 1 }] } });
  assert.equal(r.status, 400);
});

test('validateRequest accepts a valid PNG and composition', () => {
  const r = validateRequest({ image: pngB64(), composition: comp });
  assert.equal(r.ok, true);
  assert.ok(Buffer.isBuffer(r.png));
  assert.deepEqual(r.comp, comp);
});
