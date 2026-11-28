/* Realistic AI photo: bouquet composition, Gemini prompt and request validation.
   Classic script: globals in the browser, module.exports in Node (tests and api/realistic.js). */

const MAX_PNG_BYTES = 2_000_000;
const MAX_STEMS = 200;
const NO_WRAP = 'none';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Bouquet composition as catalog ids; the server maps ids to names. Wrap and ribbon are null when unwrapped.
 * @param {{kind: string}[]} stems
 * @param {string|null} wrapId
 * @param {string|null} ribbonId
 * @returns {{flowers: {kind: string, count: number}[], wrap: string|null, ribbon: string|null}}
 */
function composition(stems, wrapId, ribbonId) {
  const counts = stems.reduce((acc, { kind }) => ({ ...acc, [kind]: (acc[kind] || 0) + 1 }), {});
  const flowers = [...new Set(stems.map(s => s.kind))].map(kind => ({ kind, count: counts[kind] }));
  const wrapped = Boolean(wrapId) && wrapId !== NO_WRAP;
  return { flowers, wrap: wrapped ? wrapId : null, ribbon: wrapped && ribbonId ? ribbonId : null };
}

/* Photographic prompt, tuned on Seedream 5.0 (fal.ai). Names are in Russian; the model reads them fine. */
/** @param {{flowers: {name: string, count: number}[], wrap: string|null, ribbon: string|null}} comp */
function buildPrompt(comp) {
  const flowers = comp.flowers.map(f => `${f.count} × ${f.name}`).join(', ');
  const wrap = comp.wrap ? `Wrapped in "${comp.wrap}" florist paper with soft folds` : 'No wrapping, bare stems tied together';
  const ribbon = comp.ribbon ? `, tied with a "${comp.ribbon}" satin ribbon` : '';
  return [
    'Turn the reference image into a real professional photograph of the same hand-tied florist bouquet.',
    'Keep the exact composition: same flower positions, same proportions, same wrapping and ribbon.',
    `Bouquet (flower names in Russian): ${flowers}. ${wrap}${ribbon}.`,
    'Real fresh flowers: natural petal texture, delicate translucency on petal edges, subtle color variation,',
    'tiny natural imperfections, matte leaves. Paper shows realistic creases and soft shadows.',
    'Photography: full-frame camera, 50mm lens, f/2.8, soft natural window light from the left, gentle shadows,',
    'warm neutral off-white background, shallow depth of field, true-to-life colors, sharp focus on the flowers,',
    'florist catalog product shot.',
    'Not an illustration, not a 3D render, no CGI look, no plastic or waxy petals, no extra flowers, no text, no watermark, no people.',
  ].join(' ');
}

const fail = (status, error) => ({ ok: false, status, error });
const known = (table, id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(table, id);

/* Maps ids to names; null when anything is not in the catalog. */
function resolveComposition(comp, catalog) {
  if (!comp || !Array.isArray(comp.flowers) || comp.flowers.length === 0) return { error: 'Букет пуст' };
  const kinds = comp.flowers.map(f => f && f.kind);
  const badFlower = comp.flowers.some(f => !f || !known(catalog.kinds, f.kind) || !Number.isInteger(f.count) || f.count <= 0);
  if (badFlower || new Set(kinds).size !== kinds.length) return { error: 'Некорректный состав букета' };
  if (comp.flowers.reduce((sum, f) => sum + f.count, 0) > MAX_STEMS) return { error: 'Слишком много цветов' };
  const wrap = comp.wrap === null || comp.wrap === undefined ? null : comp.wrap;
  const ribbon = comp.ribbon === null || comp.ribbon === undefined ? null : comp.ribbon;
  if ((wrap !== null && (wrap === NO_WRAP || !known(catalog.wraps, wrap))) || (ribbon !== null && !known(catalog.ribbons, ribbon))) {
    return { error: 'Некорректная упаковка' };
  }
  return { comp: {
    flowers: comp.flowers.map(f => ({ name: catalog.kinds[f.kind].name, count: f.count })),
    wrap: wrap && catalog.wraps[wrap].name,
    ribbon: ribbon && catalog.ribbons[ribbon].name,
  } };
}

/**
 * Server-side check of the POST /api/realistic body. Node only (uses Buffer).
 * @param {{kinds: object, wraps: object, ribbons: object}} catalog  applyShop(LIBRARY, SHOP)
 * @param {unknown} body
 * @returns {{ok: true, png: Buffer, comp: {flowers: {name: string, count: number}[], wrap: string|null, ribbon: string|null}}
 *          | {ok: false, status: number, error: string}}
 */
function validateRequest(catalog, body) {
  if (!body || typeof body !== 'object') return fail(400, 'Пустой запрос');
  const resolved = resolveComposition(body.composition, catalog);
  if (resolved.error) return fail(400, resolved.error);
  if (typeof body.image !== 'string' || body.image.length === 0) return fail(400, 'Нет изображения');
  if (body.image.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 + 4) return fail(413, 'Изображение слишком большое');
  const png = Buffer.from(body.image, 'base64');
  if (png.length > MAX_PNG_BYTES) return fail(413, 'Изображение слишком большое');
  if (png.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((b, i) => png[i] !== b)) {
    return fail(400, 'Изображение должно быть PNG');
  }
  return { ok: true, png, comp: resolved.comp };
}

if (typeof module !== 'undefined') {
  module.exports = { composition, buildPrompt, validateRequest, MAX_PNG_BYTES, MAX_STEMS };
}
