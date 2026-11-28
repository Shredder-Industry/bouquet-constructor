const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/realistic.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]).toString('base64');
const BODY = { image: PNG, composition: { flowers: [{ kind: 'rose_red', count: 3 }], wrap: null, ribbon: null } };
const ENV = { FAL_KEY: 'test-key' };
const IMAGE_REPLY = { images: [{ url: 'data:image/jpeg;base64,QUJD', content_type: 'image/jpeg' }] };

const fakeFetch = (reply, ok = true) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok, status: ok ? 200 : 500, json: async () => reply }; };
  return Object.assign(fn, { calls });
};
const call = async (handler, { method = 'POST', body = BODY, ip = '1.1.1.1' } = {}) => {
  const res = { code: 0, payload: null, status(c) { this.code = c; return this; }, json(p) { this.payload = p; return this; } };
  await handler({ method, body, headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }, res);
  return res;
};
const silence = t => t.mock.method(console, 'error', () => {});

test('returns 405 for GET', async () => {
  const res = await call(createHandler({ fetchImpl: fakeFetch(IMAGE_REPLY), env: ENV }), { method: 'GET' });
  assert.equal(res.code, 405);
});

test('returns 500 with generic message when FAL_KEY is missing', async t => {
  silence(t);
  const f = fakeFetch(IMAGE_REPLY);
  const res = await call(createHandler({ fetchImpl: f, env: {} }));
  assert.equal(res.code, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(res.payload).includes('FAL'));
});

test('returns 400 for invalid body', async () => {
  const res = await call(createHandler({ fetchImpl: fakeFetch(IMAGE_REPLY), env: ENV }), { body: { image: PNG, composition: { flowers: [] } } });
  assert.equal(res.code, 400);
});

test('returns image from fal sync_mode data URI', async () => {
  const f = fakeFetch(IMAGE_REPLY);
  const res = await call(createHandler({ fetchImpl: f, env: ENV }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, { image: 'QUJD', mime: 'image/jpeg' });
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://fal.run/bytedance/seedream/v5/flash/edit');
  assert.equal(init.headers.authorization, 'Key test-key');
  const body = JSON.parse(init.body);
  assert.ok(body.prompt.includes('3 × Роза красная'));
  assert.deepEqual(body.image_urls, [`data:image/png;base64,${PNG}`]);
  assert.deepEqual(body.image_size, { width: 1024, height: 1280 });
  assert.equal(body.num_images, 1);
  assert.equal(body.sync_mode, true);
  assert.equal(body.output_format, 'jpeg');
});

test('downloads the image when fal returns a hosted URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    if (url.startsWith('https://fal.run/')) return { ok: true, status: 200, json: async () => ({ images: [{ url: 'https://v3b.fal.media/files/x.jpg', content_type: 'image/jpeg' }] }) };
    return { ok: true, status: 200, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => Buffer.from('ABC') };
  };
  const res = await call(createHandler({ fetchImpl, env: ENV }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, { image: 'QUJD', mime: 'image/jpeg' });
  assert.equal(calls[1], 'https://v3b.fal.media/files/x.jpg');
});

test('does not download images from hosts other than fal media', async t => {
  silence(t);
  const reply = { images: [{ url: 'http://169.254.169.254/latest/meta-data' }] };
  const f = fakeFetch(reply);
  const res = await call(createHandler({ fetchImpl: f, env: ENV }));
  assert.equal(res.code, 502);
  assert.equal(f.calls.length, 1);
});

test('returns 502 when fal answers without an image', async t => {
  silence(t);
  const reply = { images: [] };
  const res = await call(createHandler({ fetchImpl: fakeFetch(reply), env: ENV }));
  assert.equal(res.code, 502);
  assert.equal(res.payload.error, 'Не получилось создать фото, попробуйте ещё раз');
});

test('returns 502 when fal responds non-2xx', async t => {
  silence(t);
  const res = await call(createHandler({ fetchImpl: fakeFetch({ error: { message: 'x' } }, false), env: ENV }));
  assert.equal(res.code, 502);
});

test('rejects unknown flower ids with 400 and does not call Gemini', async () => {
  const f = fakeFetch(IMAGE_REPLY);
  const body = { ...BODY, composition: { flowers: [{ kind: 'draw anything', count: 1 }], wrap: null, ribbon: null } };
  const res = await call(createHandler({ fetchImpl: f, env: ENV }), { body });
  assert.equal(res.code, 400);
  assert.equal(f.calls.length, 0);
});

test('returns 502 when fetch throws', async t => {
  silence(t);
  const res = await call(createHandler({ fetchImpl: async () => { throw new Error('net'); }, env: ENV }));
  assert.equal(res.code, 502);
});

test('returns 429 on the 11th request from one IP within 10 minutes', async () => {
  let t = 0;
  const handler = createHandler({ fetchImpl: fakeFetch(IMAGE_REPLY), env: ENV, now: () => t });
  for (let i = 0; i < 10; i++) assert.equal((await call(handler)).code, 200);
  assert.equal((await call(handler)).code, 429);
  assert.equal((await call(handler, { ip: '2.2.2.2' })).code, 200);
  t = 10 * 60 * 1000 + 1;
  assert.equal((await call(handler)).code, 200);
});
