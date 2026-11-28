const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('../api/realistic.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]).toString('base64');
const BODY = { image: PNG, composition: { flowers: [{ kind: 'rose_red', count: 3 }], wrap: null, ribbon: null } };
const ENV = { GEMINI_API_KEY: 'test-key', GEMINI_IMAGE_MODEL: 'test-model' };
const IMAGE_REPLY = { candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: 'QUJD' } }] } }] };

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

test('returns 500 with generic message when GEMINI_API_KEY is missing', async t => {
  silence(t);
  const f = fakeFetch(IMAGE_REPLY);
  const res = await call(createHandler({ fetchImpl: f, env: {} }));
  assert.equal(res.code, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(res.payload).includes('GEMINI'));
});

test('returns 400 for invalid body', async () => {
  const res = await call(createHandler({ fetchImpl: fakeFetch(IMAGE_REPLY), env: ENV }), { body: { image: PNG, composition: { flowers: [] } } });
  assert.equal(res.code, 400);
});

test('returns image from Gemini inlineData', async () => {
  const f = fakeFetch(IMAGE_REPLY);
  const res = await call(createHandler({ fetchImpl: f, env: ENV }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, { image: 'QUJD', mime: 'image/png' });
  const { url, init } = f.calls[0];
  assert.ok(url.includes('/models/test-model:generateContent'));
  assert.ok(!url.includes('test-key'));
  assert.equal(init.headers['x-goog-api-key'], 'test-key');
  const parts = JSON.parse(init.body).contents[0].parts;
  assert.ok(parts.some(p => p.inlineData && p.inlineData.data === PNG && p.inlineData.mimeType === 'image/png'));
  assert.ok(parts.some(p => typeof p.text === 'string' && p.text.includes('3 × Роза красная')));
});

test('returns 502 when Gemini answers without an image', async t => {
  silence(t);
  const reply = { candidates: [{ content: { parts: [{ text: 'cannot' }] } }] };
  const res = await call(createHandler({ fetchImpl: fakeFetch(reply), env: ENV }));
  assert.equal(res.code, 502);
  assert.equal(res.payload.error, 'Не получилось создать фото, попробуйте ещё раз');
});

test('returns 502 when Gemini responds non-2xx', async t => {
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
