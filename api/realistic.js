/* POST /api/realistic — turns the bouquet mock-up PNG into a photorealistic photo via Gemini.
   Vercel Function (Node, CommonJS). Key lives only in env GEMINI_API_KEY. */

const { validateRequest, buildPrompt } = require('../js/realistic.js');

const DEFAULT_MODEL = 'gemini-2.5-flash-image';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 60_000;
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
  let hits = new Map();
  return function allow(ip) {
    const t = now();
    const recent = (hits.get(ip) || []).filter(ts => t - ts < RATE_WINDOW_MS);
    if (recent.length >= RATE_LIMIT) return false;
    hits = new Map(hits).set(ip, [...recent, t]);
    return true;
  };
}

function extractImage(reply) {
  const parts = (reply && reply.candidates && reply.candidates[0] && reply.candidates[0].content
    && reply.candidates[0].content.parts) || [];
  const part = parts.find(p => p && p.inlineData && p.inlineData.data);
  return part ? { image: part.inlineData.data, mime: part.inlineData.mimeType || 'image/png' } : null;
}

async function callGemini({ fetchImpl, key, model, prompt, image }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetchImpl(`${GEMINI_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: image } }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
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
    const key = env.GEMINI_API_KEY;
    if (!key) {
      console.error('[realistic] GEMINI_API_KEY is not set');
      return res.status(500).json({ error: MSG_GENERIC });
    }
    if (!allow(clientIp(req))) return res.status(429).json({ error: MSG_RATE });
    const checked = validateRequest(req.body);
    if (!checked.ok) return res.status(checked.status).json({ error: checked.error });
    try {
      const model = env.GEMINI_IMAGE_MODEL || DEFAULT_MODEL;
      const result = await callGemini({ fetchImpl, key, model, prompt: buildPrompt(checked.comp), image: req.body.image });
      const photo = result.ok ? extractImage(result.reply) : null;
      if (!photo) {
        console.error('[realistic] Gemini returned no image', result.status, JSON.stringify(result.reply).slice(0, 500));
        return res.status(502).json({ error: MSG_NO_IMAGE });
      }
      return res.status(200).json(photo);
    } catch (err) {
      console.error('[realistic] Gemini request failed', err);
      return res.status(502).json({ error: MSG_NO_IMAGE });
    }
  };
}

module.exports = createHandler();
module.exports.createHandler = createHandler;
module.exports.config = { maxDuration: 60 };
