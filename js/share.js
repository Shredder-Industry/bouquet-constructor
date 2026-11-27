/* Bouquet <-> short URL-safe code, so the florist opens exactly the layout the customer built.
   Decoding only checks the shape; catalog limits are enforced by sanitize() in index.html. Classic script, see js/order.js. */

const BOUQUET_CODE_VERSION = 1;

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(code) {
  const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
}

function encodeBouquet(state) {
  const stems = state.stems.map(s => [s.kind, Math.round(s.x), Math.round(s.y), Math.round(s.rot), Math.round(s.lift || 0), s.manual ? 1 : 0]);
  const card = state.card && state.card.on ? state.card.text : null;
  return toBase64Url(JSON.stringify({ v: BOUQUET_CODE_VERSION, w: state.wrap, r: state.ribbon, e: state.seed, s: stems, g: state.gifts || {}, c: card }));
}

const isPlainObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const toInt = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

function decodeBouquet(code) {
  let data;
  try {
    data = JSON.parse(fromBase64Url(String(code || '')));
  } catch (e) {
    return null; // not base64, not UTF-8 or not JSON: an unusable link, the caller falls back
  }
  if (!isPlainObject(data) || data.v !== BOUQUET_CODE_VERSION || !Array.isArray(data.s)) return null;
  const stems = data.s
    .filter(s => Array.isArray(s) && typeof s[0] === 'string')
    .map(([kind, x, y, rot, lift, manual], i) => ({ id: i + 1, kind, x: toInt(x), y: toInt(y), rot: toInt(rot), lift: toInt(lift), manual: manual === 1 }));
  return {
    wrap: String(data.w),
    ribbon: String(data.r),
    seed: toInt(data.e) || 1,
    nextId: stems.length + 1,
    stems,
    gifts: isPlainObject(data.g) ? data.g : {},
    card: typeof data.c === 'string' ? { on: true, text: data.c } : { on: false, text: '' },
  };
}

if (typeof module !== 'undefined') module.exports = { encodeBouquet, decodeBouquet };
