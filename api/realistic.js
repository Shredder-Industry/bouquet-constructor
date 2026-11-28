/* POST /api/realistic — turns the bouquet mock-up PNG into a photorealistic photo via Seedream 5.0 Flash Edit on fal.ai.
   Vercel Function (Node, CommonJS). The key lives only in env FAL_KEY. */

const { validateRequest, buildPrompt } = require('../js/realistic.js');
const { LIBRARY } = require('../js/library.js');
const { SHOP } = require('../js/shop.js');
const { applyShop } = require('../js/catalog.js');

const CATALOG = applyShop(LIBRARY, SHOP);

const DEFAULT_MODEL = 'bytedance/seedream/v5/flash/edit';
const FAL_RUN = 'https://fal.run';
/* fal hosts results here when sync_mode is ignored; anything else is refused (no SSRF via the reply) */
const FAL_MEDIA_HOST = /^https:\/\/([a-z0-9-]+\.)*fal\.media\//;
const OUTPUT_SIZE = { width: 1024, height: 1280 }; /* 1.31 MP: inside Seedream's 0.92–4.6 MP range */
const TIMEOUT_MS = 55_000; /* Seedream takes ~35–40 s; stays below maxDuration so the client gets JSON, not a platform 504 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MSG_GENERIC = 'Сервис временно недоступен, попробуйте позже';
const MSG_NO_IMAGE = 'Не получилось создать фото, попробуйте ещё раз';
const MSG_RATE = 'Слишком много запросов, попробуйте через несколько минут';

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

function parseDataUri(url) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.+)$/i.exec(url);
  return m ? { image: m[2], mime: m[1].toLowerCase() } : null;
}

/* sync_mode returns a data URI; otherwise fal returns a hosted URL we download, so the client contract stays {image, mime}. */
async function extractImage(reply, fetchImpl, signal) {
  const first = reply && Array.isArray(reply.images) ? reply.images[0] : null;
  const url = first && typeof first.url === 'string' ? first.url : '';
  if (url.startsWith('data:')) return parseDataUri(url);
  if (!FAL_MEDIA_HOST.test(url)) return null;
  const resp = await fetchImpl(url, { signal });
  if (!resp.ok) return null;
  const mime = (first.content_type || (resp.headers && resp.headers.get('content-type')) || 'image/jpeg').split(';')[0];
  return { image: Buffer.from(await resp.arrayBuffer()).toString('base64'), mime };
}

async function callFal({ fetchImpl, key, model, prompt, imageB64 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetchImpl(`${FAL_RUN}/${model}`, {
      method: 'POST',
      headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt,
        image_urls: [`data:image/png;base64,${imageB64}`],
        image_size: OUTPUT_SIZE,
        num_images: 1,
        output_format: 'jpeg',
        sync_mode: true,
      }),
      signal: controller.signal,
    });
    const reply = await resp.json().catch(() => null);
    if (!resp.ok) return { status: resp.status, reply, photo: null };
    return { status: resp.status, reply, photo: await extractImage(reply, fetchImpl, controller.signal) };
  } finally {
    clearTimeout(timer);
  }
}

function createHandler({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now } = {}) {
  const allow = createRateLimiter(now);
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
    const key = env.FAL_KEY;
    if (!key) {
      console.error('[realistic] FAL_KEY is not set');
      return res.status(500).json({ error: MSG_GENERIC });
    }
    if (!allow(clientIp(req))) return res.status(429).json({ error: MSG_RATE });
    const checked = validateRequest(CATALOG, req.body);
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });
    try {
      const model = env.FAL_IMAGE_MODEL || DEFAULT_MODEL;
      const { status, reply, photo } = await callFal({ fetchImpl, key, model, prompt: buildPrompt(checked.comp), imageB64: req.body.image });
      if (!photo) {
        console.error('[realistic] fal returned no image', status, JSON.stringify(reply).slice(0, 500));
        return res.status(502).json({ error: MSG_NO_IMAGE });
      }
      return res.status(200).json(photo);
    } catch (err) {
      console.error('[realistic] fal request failed', err);
      return res.status(502).json({ error: MSG_NO_IMAGE });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.config = { maxDuration: 60 };
