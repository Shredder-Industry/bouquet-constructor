/* Realistic AI photo: bouquet composition, Gemini prompt and request validation.
   Classic script: globals in the browser, module.exports in Node (tests and api/realistic.js). */

const MAX_PNG_BYTES = 2_000_000;
const MAX_STEMS = 200;
const MAX_NAME_LENGTH = 60;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Groups stems by kind, keeping the order in which each kind first appears.
 * @param {{kind: string}[]} stems
 * @param {Record<string, {name: string}>} kinds
 * @param {string|null} wrapName
 * @param {string|null} ribbonName
 * @returns {{flowers: {name: string, count: number}[], wrap: string|null, ribbon: string|null}}
 */
function composition(stems, kinds, wrapName, ribbonName) {
  const counts = stems.reduce((acc, { kind }) => ({ ...acc, [kind]: (acc[kind] || 0) + 1 }), {});
  const order = [...new Set(stems.map(s => s.kind))];
  const flowers = order.map(kind => ({ name: kinds[kind] ? kinds[kind].name : kind, count: counts[kind] }));
  return { flowers, wrap: wrapName || null, ribbon: ribbonName || null };
}

/** @param {{flowers: {name: string, count: number}[], wrap: string|null, ribbon: string|null}} comp */
function buildPrompt(comp) {
  const flowers = comp.flowers.map(f => `${f.count} × ${f.name}`).join(', ');
  const wrap = comp.wrap ? `wrapped in "${comp.wrap}" florist paper` : 'no wrapping, bare stems';
  const ribbon = comp.ribbon ? `, tied with a "${comp.ribbon}" ribbon` : '';
  return [
    'Turn this flat illustration of a hand-tied bouquet into a photorealistic studio photo of a real bouquet.',
    'Strictly keep the exact arrangement and colors of every flower as in the illustration; do not add or remove flower types.',
    `Flowers (Russian names): ${flowers}.`,
    `Packaging: ${wrap}${ribbon}.`,
    'Fresh real flowers with natural petals and leaves, soft daylight, plain light background, no people, no text.',
  ].join(' ');
}

const fail = (status, error) => ({ ok: false, status, error });
const isName = v => typeof v === 'string' && v.length > 0 && v.length <= MAX_NAME_LENGTH;
const isOptionalName = v => v === null || v === undefined || isName(v);

function validateComposition(comp) {
  if (!comp || !Array.isArray(comp.flowers) || comp.flowers.length === 0) return 'Букет пуст';
  const badFlower = comp.flowers.some(f => !f || !isName(f.name) || !Number.isInteger(f.count) || f.count <= 0);
  if (badFlower) return 'Некорректный состав букета';
  if (comp.flowers.reduce((sum, f) => sum + f.count, 0) > MAX_STEMS) return 'Слишком много цветов';
  if (!isOptionalName(comp.wrap) || !isOptionalName(comp.ribbon)) return 'Некорректная упаковка';
  return null;
}

/**
 * Server-side check of the POST /api/realistic body. Node only (uses Buffer).
 * @param {unknown} body
 */
function validateRequest(body) {
  if (!body || typeof body !== 'object') return fail(400, 'Пустой запрос');
  const compError = validateComposition(body.composition);
  if (compError) return fail(400, compError);
  if (typeof body.image !== 'string' || body.image.length === 0) return fail(400, 'Нет изображения');
  if (body.image.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 + 4) return fail(413, 'Изображение слишком большое');
  const png = Buffer.from(body.image, 'base64');
  if (png.length > MAX_PNG_BYTES) return fail(413, 'Изображение слишком большое');
  if (png.length < PNG_SIGNATURE.length || PNG_SIGNATURE.some((b, i) => png[i] !== b)) {
    return fail(400, 'Изображение должно быть PNG');
  }
  const { flowers, wrap = null, ribbon = null } = body.composition;
  return { ok: true, png, comp: { flowers: flowers.map(f => ({ name: f.name, count: f.count })), wrap, ribbon } };
}

if (typeof module !== 'undefined') {
  module.exports = { composition, buildPrompt, validateRequest, MAX_PNG_BYTES, MAX_STEMS };
}
