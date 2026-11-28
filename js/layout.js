/* Dense bouquet layout maths: how wide the dome is, where each head sits on the spiral,
   and where the decorative greenery bed goes. Pure functions. Classic script, see js/order.js. */

const PACK_OVERLAP = .82;   // heads overlap a little, like in a real bouquet
const PACK_FILL = .9;       // share of the dome covered by heads
const PACK_MIN_R = 30, PACK_MAX_R = 150;
const BED_MIN = 4, BED_MAX = 9, BED_PER_UNIT = 20;   // one sprig per this many units of radius

/* radius of a dome that holds heads of these widths without gaps */
function packRadius(sizes) {
  const area = sizes.reduce((sum, d) => sum + Math.PI * (d * PACK_OVERLAP / 2) ** 2, 0);
  const r = Math.sqrt(area / (Math.PI * PACK_FILL));
  return Math.round(Math.min(PACK_MAX_R, Math.max(PACK_MIN_R, r)));
}

/* share of the dome radius (0..1] for each head in order: each head takes a ring as wide as its area,
   so big heads listed first fill the centre */
function spiralRadii(sizes) {
  const areas = sizes.map(d => d * d), total = areas.reduce((a, b) => a + b, 0) || 1;
  let before = 0;
  return areas.map(a => {
    const mid = before + a / 2;
    before += a;
    return Math.sqrt(mid / total);
  });
}

/* greenery tucked under the edge of the dome; angles in degrees, dist as a share of the radius */
function bedSprigs(radius, seed) {
  const count = Math.min(BED_MAX, Math.max(BED_MIN, Math.round(radius / BED_PER_UNIT)));
  let s = (seed * 2654435761) >>> 0;
  const next = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  return Array.from({ length: count }, (_, i) => ({
    angle: Math.round((i * 360 / count + (next() - .5) * 18) * 10) / 10,
    dist: Math.round((.82 + next() * .2) * 100) / 100,
    scale: Math.round((.8 + next() * .35) * 100) / 100,
  }));
}

if (typeof module !== 'undefined') module.exports = { packRadius, spiralRadii, bedSprigs };
