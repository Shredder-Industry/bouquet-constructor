const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler, MODELS } = require('../api/realistic.js');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]).toString('base64');
const BODY = { image: PNG, composition: { flowers: [{ kind: 'rose_red', count: 3 }], wrap: null, ribbon: null } };
const ENV = { FAL_KEY: 'test-key', FAL_MODELS: 'seedream-5-pro,seedream-5.5' };
const Q = 'https://queue.fal.run';

/* Routes fal queue URLs to canned replies; records every call. */
function fakeFal(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
    if (!hit) throw new Error(`unexpected fetch ${url}`);
    const r = typeof hit[1] === 'function' ? hit[1](url, init) : hit[1];
    return { ok: r.ok !== false, status: r.status || 200, headers: { get: () => 'image/jpeg' },
      json: async () => r.body, arrayBuffer: async () => r.bytes };
  };
  return Object.assign(fn, { calls });
}
const submitted = id => ({ body: { request_id: id, status_url: `${Q}/x/requests/${id}/status`, response_url: `${Q}/x/requests/${id}` } });

const call = async (handler, { method = 'POST', body = BODY, ip = '1.1.1.1', query = {} } = {}) => {
  const res = { code: 0, payload: null, status(c) { this.code = c; return this; }, json(p) { this.payload = p; return this; } };
  await handler({ method, body, query, headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }, res);
  return res;
};
const silence = t => t.mock.method(console, 'error', () => {});

test('returns 405 for PUT', async () => {
  const res = await call(createHandler({ fetchImpl: fakeFal({}), env: ENV }), { method: 'PUT' });
  assert.equal(res.code, 405);
});

test('returns 500 with generic message when FAL_KEY is missing', async t => {
  silence(t);
  const f = fakeFal({});
  const res = await call(createHandler({ fetchImpl: f, env: {} }));
  assert.equal(res.code, 500);
  assert.equal(f.calls.length, 0);
  assert.ok(!JSON.stringify(res.payload).includes('FAL'));
});

test('returns 400 for invalid body and unknown flower ids without calling fal', async () => {
  const f = fakeFal({});
  const handler = createHandler({ fetchImpl: f, env: ENV });
  assert.equal((await call(handler, { body: { image: PNG, composition: { flowers: [] } } })).code, 400);
  const bad = { ...BODY, composition: { flowers: [{ kind: 'draw anything', count: 1 }], wrap: null, ribbon: null } };
  assert.equal((await call(handler, { body: bad })).code, 400);
  assert.equal(f.calls.length, 0);
});

test('POST submits one queue job per configured model', async () => {
  const f = fakeFal({ [`${Q}/${MODELS['seedream-5-pro'].id}`]: submitted('p1'), [`${Q}/${MODELS['seedream-5.5'].id}`]: submitted('s1') });
  const res = await call(createHandler({ fetchImpl: f, env: ENV }));
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload.jobs.map(j => j.label), ['Seedream 5.0 Pro', 'Seedream 5.5']);
  assert.ok(res.payload.jobs.every(j => typeof j.job === 'string' && j.job.length > 0));
  assert.equal(f.calls.length, 2);
  const { init } = f.calls[0];
  assert.equal(init.headers.authorization, 'Key test-key');
  const body = JSON.parse(init.body);
  assert.ok(body.prompt.includes('3 × Роза красная'));
  assert.deepEqual(body.image_urls, [`data:image/png;base64,${PNG}`]);
  assert.deepEqual(body.image_size, { width: 1024, height: 1280 });
  assert.equal(body.num_images, 1);
});

test('POST defaults to Seedream 5.0 Pro and 5.5, ignores unknown model keys', async () => {
  const f = fakeFal({ [Q]: submitted('a') });
  const res = await call(createHandler({ fetchImpl: f, env: { FAL_KEY: 'k', FAL_MODELS: 'seedream-5.5,nonsense' } }));
  assert.deepEqual(res.payload.jobs.map(j => j.label), ['Seedream 5.5']);
  const res2 = await call(createHandler({ fetchImpl: fakeFal({ [Q]: submitted('b') }), env: { FAL_KEY: 'k' } }));
  assert.deepEqual(res2.payload.jobs.map(j => j.label), ['Seedream 5.0 Pro', 'Seedream 5.5']);
});

test('POST keeps working jobs when one model fails to submit, 502 when all fail', async t => {
  silence(t);
  const partial = fakeFal({ [`${Q}/${MODELS['seedream-5-pro'].id}`]: { ok: false, status: 500, body: {} }, [`${Q}/${MODELS['seedream-5.5'].id}`]: submitted('s1') });
  const res = await call(createHandler({ fetchImpl: partial, env: ENV }));
  assert.equal(res.code, 200);
  assert.ok(res.payload.jobs[0].error);
  assert.ok(res.payload.jobs[1].job);
  const none = fakeFal({ [Q]: { ok: false, status: 500, body: {} } });
  assert.equal((await call(createHandler({ fetchImpl: none, env: ENV }))).code, 502);
});

async function jobToken(handler, f) {
  const res = await call(handler);
  return res.payload.jobs[1].job;
}

test('GET reports pending while fal is still working', async () => {
  const f = fakeFal({ [`${Q}/x/requests/s1/status`]: { body: { status: 'IN_PROGRESS' } }, [Q]: submitted('s1') });
  const handler = createHandler({ fetchImpl: f, env: ENV });
  const job = await jobToken(handler, f);
  const res = await call(handler, { method: 'GET', query: { job } });
  assert.equal(res.code, 200);
  assert.deepEqual(res.payload, { status: 'pending' });
});

test('GET returns the image once fal completes (data URI and hosted URL)', async () => {
  for (const url of ['data:image/jpeg;base64,QUJD', 'https://v3b.fal.media/files/x.jpg']) {
    const f = fakeFal({
      [`${Q}/x/requests/s1/status`]: { body: { status: 'COMPLETED' } },
      [`${Q}/x/requests/s1`]: { body: { images: [{ url, content_type: 'image/jpeg' }] } },
      'https://v3b.fal.media/': { bytes: Buffer.from('ABC') },
      [Q]: submitted('s1'),
    });
    const handler = createHandler({ fetchImpl: f, env: ENV });
    const job = await jobToken(handler, f);
    const res = await call(handler, { method: 'GET', query: { job } });
    assert.deepEqual(res.payload, { status: 'done', image: 'QUJD', mime: 'image/jpeg' }, url);
  }
});

test('GET returns 502 when a completed job has no image', async t => {
  silence(t);
  const f = fakeFal({
    [`${Q}/x/requests/s1/status`]: { body: { status: 'COMPLETED' } },
    [`${Q}/x/requests/s1`]: { body: { detail: 'safety' } },
    [Q]: submitted('s1'),
  });
  const handler = createHandler({ fetchImpl: f, env: ENV });
  const job = await jobToken(handler, f);
  const res = await call(handler, { method: 'GET', query: { job } });
  assert.equal(res.code, 502);
  assert.equal(res.payload.error, 'Не получилось создать фото, попробуйте ещё раз');
});

test('GET rejects forged or foreign job tokens without fetching', async () => {
  const f = fakeFal({});
  const handler = createHandler({ fetchImpl: f, env: ENV });
  const forge = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const bad = [
    'not-base64-json',
    forge({ k: 'seedream-5.5', s: 'http://169.254.169.254/latest', r: `${Q}/x/requests/1` }),
    forge({ k: 'seedream-5.5', s: `${Q}/x/requests/1/status`, r: 'https://evil.example/' }),
    forge({ k: 'nano', s: `${Q}/x/requests/1/status`, r: `${Q}/x/requests/1` }),
  ];
  for (const job of bad) assert.equal((await call(handler, { method: 'GET', query: { job } })).code, 400, job);
  assert.equal((await call(handler, { method: 'GET', query: {} })).code, 400);
  assert.equal(f.calls.length, 0);
});

test('GET does not download images from hosts other than fal media', async t => {
  silence(t);
  const f = fakeFal({
    [`${Q}/x/requests/s1/status`]: { body: { status: 'COMPLETED' } },
    [`${Q}/x/requests/s1`]: { body: { images: [{ url: 'http://169.254.169.254/latest/meta-data' }] } },
    [Q]: submitted('s1'),
  });
  const handler = createHandler({ fetchImpl: f, env: ENV });
  const job = await jobToken(handler, f);
  const before = f.calls.length;
  const res = await call(handler, { method: 'GET', query: { job } });
  assert.equal(res.code, 502);
  assert.equal(f.calls.length, before + 2);
});

test('POST returns 429 on the 11th request from one IP within 10 minutes; polling is not limited', async () => {
  let t = 0;
  const f = fakeFal({ [`${Q}/x/requests/s1/status`]: { body: { status: 'IN_QUEUE' } }, [Q]: submitted('s1') });
  const handler = createHandler({ fetchImpl: f, env: ENV, now: () => t });
  let job;
  for (let i = 0; i < 10; i++) { const r = await call(handler); assert.equal(r.code, 200); job = r.payload.jobs[1].job; }
  assert.equal((await call(handler)).code, 429);
  for (let i = 0; i < 30; i++) assert.equal((await call(handler, { method: 'GET', query: { job } })).code, 200);
  assert.equal((await call(handler, { ip: '2.2.2.2' })).code, 200);
  t = 10 * 60 * 1000 + 1;
  assert.equal((await call(handler)).code, 200);
});
