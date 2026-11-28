/* /api/realistic — photorealistic bouquet photo via fal.ai queue (Seedream models).
   POST {image, composition}  → submits one queue job per model in FAL_MODELS → {jobs: [{label, job} | {label, error}]}
   GET  ?job=<token>          → {status: 'pending'} | {status: 'done', image, mime}
   Queue + polling keeps every request short, so slow models (Pro takes ~100 s) fit Vercel's function limit.
   Vercel Function (Node, CommonJS). The key lives only in env FAL_KEY. */

const { validateRequest, buildPrompt } = require('../js/realistic.js');
const { LIBRARY } = require('../js/library.js');
const { SHOP } = require('../js/shop.js');
const { applyShop } = require('../js/catalog.js');

const CATALOG = applyShop(LIBRARY, SHOP);

/* Allowed models; FAL_MODELS picks some of these keys, in order. The final version keeps one. */
const MODELS = {
  'seedream-5-pro': { id: 'bytedance/seedream/v5/pro/edit', label: 'Seedream 5.0 Pro' },
  'seedream-5.5': { id: 'bytedance/seedream/v5.5/edit', label: 'Seedream 5.5' },
  'seedream-5-flash': { id: 'bytedance/seedream/v5/flash/edit', label: 'Seedream 5.0 Flash' },
};
const DEFAULT_MODELS = 'seedream-5-pro,seedream-5.5';
const FAL_QUEUE = 'https://queue.fal.run/';
const FAL_MEDIA_HOST = /^https:\/\/([a-z0-9-]+\.)*fal\.media\//;
const OUTPUT_SIZE = { width: 1024, height: 1280 }; /* 1.31 MP, below the 1536² price tier of Pro */
const TIMEOUT_MS = 20_000;
const MAX_JOB_TOKEN = 2000;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MSG_GENERIC = 'Сервис временно недоступен, попробуйте позже';
const MSG_NO_IMAGE = 'Не получилось создать фото, попробуйте ещё раз';
const MSG_RATE = 'Слишком много запросов, попробуйте через несколько минут';
const MSG_BAD_JOB = 'Некорректный запрос';

function clientIp(req) {
  const fwd = (req.headers && req.headers['x-forwarded-for']) || '';
  return String(fwd).split(',')[0].trim() || 'unknown';
}

/* Best-effort in-memory limiter: per warm instance only. */
function createRateLimiter(now) {
  const hits = new Map(); /* owned by the limiter; expired IPs are pruned */
  return function allow(ip) {
    const t = now();
    hits.forEach((list, key) => { if (t - list[list.length - 1] >= RATE_WINDOW_MS) hits.delete(key); });
    const recent = (hits.get(ip) || []).filter(ts => t - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return false;
    hits.set(ip, [...recent, t]);
    return true;
  };
}

function activeModels(env) {
  return String(env.FAL_MODELS || DEFAULT_MODELS).split(',').map(s => s.trim()).filter(k => MODELS[k]);
}

const encodeJob = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');

/* A token is only trusted if it names an active model and points back at fal's queue. */
function decodeJob(token, env) {
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_JOB_TOKEN) return null;
  try {
    const job = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const ok = job && activeModels(env).includes(job.k)
      && typeof job.s === 'string' && job.s.startsWith(FAL_QUEUE)
      && typeof job.r === 'string' && job.r.startsWith(FAL_QUEUE);
    return ok ? job : null;
  } catch {
    return null;
  }
}

async function falFetch(fetchImpl, url, key, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetchImpl(url, { ...init, headers: { authorization: `Key ${key}`, ...(init.headers || {}) }, signal: controller.signal });
    return { resp, body: await resp.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
}

async function submit({ fetchImpl, key, modelKey, prompt, imageB64 }) {
  const model = MODELS[modelKey];
  try {
    const { resp, body } = await falFetch(fetchImpl, `${FAL_QUEUE}${model.id}`, key, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, image_urls: [`data:image/png;base64,${imageB64}`], image_size: OUTPUT_SIZE, num_images: 1, output_format: 'jpeg' }),
    });
    if (!resp.ok || !body || !body.status_url || !body.response_url) {
      console.error('[realistic] fal submit failed', modelKey, resp.status, JSON.stringify(body).slice(0, 300));
      return { label: model.label, error: MSG_NO_IMAGE };
    }
    return { label: model.label, job: encodeJob({ k: modelKey, s: body.status_url, r: body.response_url }) };
  } catch (err) {
    console.error('[realistic] fal submit error', modelKey, err);
    return { label: model.label, error: MSG_NO_IMAGE };
  }
}

function parseDataUri(url) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url);
  return m ? { image: m[2], mime: m[1].toLowerCase() } : null;
}

async function downloadImage(reply, fetchImpl) {
  const first = reply && Array.isArray(reply.images) ? reply.images[0] : null;
  const url = first && typeof first.url === 'string' ? first.url : '';
  if (url.startsWith('data:')) return parseDataUri(url);
  if (!FAL_MEDIA_HOST.test(url)) return null;
  const resp = await fetchImpl(url);
  if (!resp.ok) return null;
  const mime = (first.content_type || (resp.headers && resp.headers.get('content-type')) || 'image/jpeg').split(';')[0];
  return { image: Buffer.from(await resp.arrayBuffer()).toString('base64'), mime };
}

async function handlePost(req, res, { fetchImpl, key, env, allow }) {
  if (!allow(clientIp(req))) return res.status(429).json({ error: MSG_RATE });
  const checked = validateRequest(CATALOG, req.body);
  if (!checked.ok) return res.status(checked.status).json({ error: checked.error });
  const prompt = buildPrompt(checked.comp);
  const jobs = await Promise.all(activeModels(env).map(modelKey => submit({ fetchImpl, key, modelKey, prompt, imageB64: req.body.image })));
  if (!jobs.some(j => j.job)) return res.status(502).json({ error: MSG_NO_IMAGE });
  return res.status(200).json({ jobs });
}

async function handleGet(req, res, { fetchImpl, key, env }) {
  const job = decodeJob(req.query && req.query.job, env);
  if (!job) return res.status(400).json({ error: MSG_BAD_JOB });
  try {
    const status = await falFetch(fetchImpl, job.s, key);
    const state = status.body && status.body.status;
    if (state === 'IN_QUEUE' || state === 'IN_PROGRESS') return res.status(200).json({ status: 'pending' });
    const result = state === 'COMPLETED' ? await falFetch(fetchImpl, job.r, key) : null;
    const photo = result && result.resp.ok ? await downloadImage(result.body, fetchImpl) : null;
    if (!photo) {
      console.error('[realistic] fal job without image', job.k, state, JSON.stringify(result && result.body).slice(0, 300));
      return res.status(502).json({ error: MSG_NO_IMAGE });
    }
    return res.status(200).json({ status: 'done', ...photo });
  } catch (err) {
    console.error('[realistic] fal poll error', job.k, err);
    return res.status(502).json({ error: MSG_NO_IMAGE });
  }
}

function createHandler({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now } = {}) {
  const allow = createRateLimiter(now);
  return async function handler(req, res) {
    if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Метод не поддерживается' });
    const key = env.FAL_KEY;
    if (!key) {
      console.error('[realistic] FAL_KEY is not set');
      return res.status(500).json({ error: MSG_GENERIC });
    }
    const ctx = { fetchImpl, key, env, allow };
    return req.method === 'POST' ? handlePost(req, res, ctx) : handleGet(req, res, ctx);
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.MODELS = MODELS;
module.exports.config = { maxDuration: 30 };
