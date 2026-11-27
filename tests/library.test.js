const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LIBRARY } = require('../js/library.js');

const withPhoto = Object.entries(LIBRARY.flowers).filter(([, f]) => f.photo);
const inUnit = v => typeof v === 'number' && v > 0 && v <= 1;

test('library has flowers with photos', () => {
  assert.ok(withPhoto.length > 0);
});

test('each photo has a source and a head anchor inside the image', () => {
  for (const [key, { photo }] of withPhoto) {
    assert.match(photo.src, /^assets\/flowers\/[\w-]+\.png$/, key);
    assert.ok(inUnit(photo.cx) && inUnit(photo.cy) && inUnit(photo.w), `${key}: anchor out of range`);
    assert.ok(photo.size > 0, `${key}: size must be positive`);
  }
});

test('each photo file exists when assets are present', t => {
  const root = path.join(__dirname, '..');
  if (!fs.existsSync(path.join(root, 'assets/flowers'))) return t.skip('assets/flowers not checked out');
  for (const [key, { photo }] of withPhoto) assert.ok(fs.existsSync(path.join(root, photo.src)), `${key}: ${photo.src} missing`);
});
