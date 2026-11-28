const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/realistic.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]).toString('base64');
const BODY = { image: PNG, composition: { flowers: [{ kind: 'rose_red', count: 3 }], wrap: null, ribbon: null } };
const ENV = { CF_ACCOUNT_ID: 'acc123', CF_API_TOKEN: 'test-token' };
const IMAGE_REPLY = { success: true, result: { image: 'QUJD' } };

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

test('returns 500 with generic message when Cloudflare credentials are missing', async t => {
  silence(t);
  const f = fakeFetch(IMAGE_REPLY);
  const res = await call(createHandler({ fetchImpl: f, env: { CF_ACCOUNT_ID: 'acc123' } }));
  assert.equal(res.code, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(res.payload).includes('CF_'));
});

test('returns 400 for invalid body', async () => {
  const res = await call(createHandler({ fetchImpl: fakeFetch(IMAGE_REPLY), env: ENV }), { body: { image: PNG, composition: { flowers: [] } } });
  assert.equal(res.code, 400);
});

test('returns image from Cloudflare result.image', async () => {
  const f = fakeFetch(IMAGE_REPLY);
  const res = await call(createHandler({ fetchImpl: f, env: ENV }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, { image: 'QUJD', mime: 'image/jpeg' });
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/black-forest-labs/flux-2-dev');
  assert.equal(init.headers.authorization, 'Bearer test-token');
  assert.ok(init.body instanceof FormData);
  assert.ok(init.body.get('prompt').includes('3 × Роза красная'));
  const img = init.body.get('input_image_0');
  assert.equal(img.type, 'image/png');
  assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), PNG);
  assert.equal(init.body.get('width'), '512');
  assert.equal(init.body.get('height'), '640');
});

test('returns 502 when Cloudflare answers without an image', async t => {
  silence(t);
  const reply = { success: false, errors: [{ message: 'nope' }] };
  const res = await call(createHandler({ fetchImpl: fakeFetch(reply), env: ENV }));
  assert.equal(res.code, 502);
  assert.equal(res.payload.error, 'Не получилось создать фото, попробуйте ещё раз');
});

test('returns 502 when Cloudflare responds non-2xx', async t => {
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
