/* POST /api/realistic — turns the bouquet mock-up PNG into a photorealistic photo via Cloudflare Workers AI (FLUX.2 [dev]).
   Vercel Function (Node, CommonJS). Credentials live only in env CF_ACCOUNT_ID and CF_API_TOKEN. */

const { validateRequest, buildPrompt } = require('../js/realistic.js');
const { LIBRARY } = require('../js/library.js');
const { SHOP } = require('../js/shop.js');
const { applyShop } = require('../js/catalog.js');

const CATALOG = applyShop(LIBRARY, SHOP);

const DEFAULT_MODEL = '@cf/black-forest-labs/flux-2-dev';
const CF_API = 'https://api.cloudflare.com/client/v4/accounts';
/* 512×640 keeps one photo near ~1 300 neurons, so the free 10 000/day covers several photos */
const OUTPUT_WIDTH = 512;
const OUTPUT_HEIGHT = 640;
const OUTPUT_MIME = 'image/jpeg';
const TIMEOUT_MS = 50_000; /* below maxDuration so the client gets JSON, not a platform 504 */
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

function extractImage(reply) {
  const image = reply && reply.result && reply.result.image;
  return typeof image === 'string' && image.length > 0 ? { image, mime: OUTPUT_MIME } : null;
}

async function callCloudflare({ fetchImpl, accountId, token, model, prompt, png }) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('input_image_0', new Blob([png], { type: 'image/png' }), 'bouquet.png');
  form.append('width', String(OUTPUT_WIDTH));
  form.append('height', String(OUTPUT_HEIGHT));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetchImpl(`${CF_API}/${encodeURIComponent(accountId)}/ai/run/${model}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const reply = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, reply };
  } finally {
    clearTimeout(timer);
  }
}

function createHandler({ fetchImpl = globalThis.fetch, env = process.env, now = Date.now } = {}) {
  const allow = createRateLimiter(now);
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Метод не поддерживается' });
    const accountId = env.CF_ACCOUNT_ID;
    const token = env.CF_API_TOKEN;
    if (!accountId || !token) {
      console.error('[realistic] CF_ACCOUNT_ID or CF_API_TOKEN is not set');
      return res.status(500).json({ error: MSG_GENERIC });
    }
    if (!allow(clientIp(req))) return res.status(429).json({ error: MSG_RATE });
    const checked = validateRequest(CATALOG, req.body);
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });
    try {
      const model = env.CF_IMAGE_MODEL || DEFAULT_MODEL;
      const result = await callCloudflare({ fetchImpl, accountId, token, model, prompt: buildPrompt(checked.comp), png: checked.png });
      const photo = result.ok ? extractImage(result.reply) : null;
      if (!photo) {
        console.error('[realistic] Cloudflare returned no image', result.status, JSON.stringify(result.reply).slice(0, 500));
        return res.status(502).json({ error: MSG_NO_IMAGE });
      }
      return res.status(200).json(photo);
    } catch (err) {
      console.error('[realistic] Cloudflare request failed', err);
      return res.status(502).json({ error: MSG_NO_IMAGE });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.config = { maxDuration: 60 };
