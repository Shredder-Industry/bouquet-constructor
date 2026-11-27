/* Side-view florist wrap: a fan of sheets behind the flowers and two crossed sheets in front,
   with paper grain, pleats gathered at the binding, a rolled top edge and a soft shadow on the flowers.
   Pure string builders, no DOM. Classic script, see js/order.js. */

const WRAP_BACK_SHEETS = 5;
const WRAP_GATHER_Y = 462;      // where the front sheets meet under the ribbon
const WRAP_BACK_BASE_Y = 440;   // back sheets start just above the gather
const WRAP_PAD = 40;            // how far the paper reaches past the outermost flower
/* paper grain strength per material; unknown materials get plain paper */
const WRAP_GRAIN = { kraft: .2, paper: .08, felt: .12 };

/* amt in -1..1: towards black (negative) or white (positive) */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const channel = c => {
    const v = amt < 0 ? c * (1 + amt) : c + (255 - c) * amt;
    return Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  };
  return `#${channel(n >> 16 & 255)}${channel(n >> 8 & 255)}${channel(n & 255)}`;
}

const f1 = v => v.toFixed(1);

/* grain is mixed in through the alpha channel of a noise layer, so it works on any colour */
const grainStrength = w => WRAP_GRAIN[w && w.texture] ?? WRAP_GRAIN.paper;

/* speck alpha falls from about `g` to 0 across the noise range: darker flecks, never a flat tint */
function wrapDefs(w) {
  const g = grainStrength(w);
  return '<filter id="wrapGrain" x="0" y="0" width="100%" height="100%">'
    + '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" result="noise"/>'
    + `<feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${(-3 * g).toFixed(2)} ${(2.1 * g).toFixed(2)}" result="speck"/>`
    + '<feComposite in="speck" in2="SourceGraphic" operator="in" result="grain"/>'
    + '<feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="grain"/></feMerge></filter>'
    + '<filter id="wrapBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>'
    + '<filter id="wrapShadow" x="-10%" y="-20%" width="120%" height="140%">'
    + '<feDropShadow dx="0" dy="-3" stdDeviation="4" flood-color="#1C2A21" flood-opacity=".28"/></filter>';
}

/* vertical light falloff: light at the top edge, darker where the paper is gathered */
function sheetGradient(id, color) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="${shade(color, .12)}"/><stop offset=".55" stop-color="${color}"/>`
    + `<stop offset="1" stop-color="${shade(color, -.28)}"/></linearGradient>`;
}

const WRAP_SIDE_BULGE = 10;      // sides of a sheet bow outwards instead of running straight

function wrapBackSvg(w, e, bind) {
  const L = e.minX - WRAP_PAD, R = e.maxX + WRAP_PAD, top = e.minY - 6, span = R - L;
  const width = span / (WRAP_BACK_SHEETS - 1.6), soft = w.texture === 'felt' ? 1.4 : 1;
  const sheets = Array.from({ length: WRAP_BACK_SHEETS }, (_, i) => {
    const t = i / (WRAP_BACK_SHEETS - 1), cx = L + span * t;
    const rise = Math.sin(t * Math.PI) * 26;            // the middle sheets stand taller
    const y = top - rise + (i % 2) * 10, x0 = cx - width / 2, x1 = cx + width / 2;
    const bx = bind.x + (t - .5) * 36, midY = (WRAP_BACK_BASE_Y + y) / 2 + 24;
    const color = i % 2 ? w.side : w.back;
    const peak = y - 14 - (i % 2 ? 0 : 8), lean = (t - .5) * width * .35;   // a rounded crown, tilted outwards
    const bulge = WRAP_SIDE_BULGE * soft;
    const d = `M${f1(bx - 10)} ${WRAP_BACK_BASE_Y}`
      + `Q${f1(x0 - bulge)} ${f1(midY)} ${f1(x0)} ${f1(y + 14)}`
      + `C${f1(x0 + width * .2 + lean)} ${f1(peak)} ${f1(x1 - width * .2 + lean)} ${f1(peak + 4)} ${f1(x1)} ${f1(y + 8)}`
      + `Q${f1(x1 + bulge)} ${f1(midY)} ${f1(bx + 10)} ${WRAP_BACK_BASE_Y}Z`;
    const crease = `M${f1(bx)} ${WRAP_BACK_BASE_Y}Q${f1(cx + lean * .4 + 6)} ${f1(midY)} ${f1(cx + lean)} ${f1(peak + 10)}`;
    return `<path d="${d}" fill="url(#wrapBack${i % 2})"/>`
      + `<path d="${crease}" fill="none" stroke="${shade(color, -.35)}" stroke-opacity=".18" stroke-width="1.2"/>`;
  });
  return `<defs>${sheetGradient('wrapBack0', w.back)}${sheetGradient('wrapBack1', w.side)}</defs>`
    + `<g filter="url(#wrapGrain)">${sheets.join('')}</g>`
    + `<ellipse cx="${bind.x}" cy="${f1((e.minY + e.maxY) / 2 + 16)}" rx="${f1(span * .4)}" ry="${f1((e.maxY - e.minY) / 2 + 44)}"`
    + ` fill="#000" opacity=".28" filter="url(#wrapBlur)"/>`;   // the hollow of the cone behind the flowers
}

/* one front sheet: top edge from (ax,ay) to (bx,by), gathered at the binding between gx0..gx1 */
function frontSheet(id, color, a, b, gx0, gx1, felt) {
  const lip = felt ? 1.5 : 3;
  const dip = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 12};   // the top edge sags between its corners
  const pleats = [.22, .5, .76].map(t => {
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, gx = gx0 + (gx1 - gx0) * t;
    return `<path d="M${f1(x)} ${f1(y + 2)}Q${f1((x + gx) / 2 + 6)} ${f1((y + WRAP_GATHER_Y) / 2)} ${f1(gx)} ${WRAP_GATHER_Y}"`
      + ` stroke="${shade(color, -.4)}" stroke-opacity=".18" stroke-width="1.2" fill="none"/>`
      + `<path d="M${f1(x + 3)} ${f1(y + 3)}Q${f1((x + gx) / 2 + 9)} ${f1((y + WRAP_GATHER_Y) / 2)} ${f1(gx + 2)} ${WRAP_GATHER_Y}"`
      + ` stroke="${shade(color, .35)}" stroke-opacity=".14" stroke-width="1" fill="none"/>`;
  }).join('');
  const edge = `Q${f1(dip.x)} ${f1(dip.y + 12)} ${f1(b.x)} ${f1(b.y)}`;
  /* sides curve in towards the binding, so the sheet reads as soft paper rather than a triangle */
  const sideB = `C${f1(b.x + 4)} ${f1(b.y + 60)} ${f1(gx1 + 18)} ${WRAP_GATHER_Y - 50} ${f1(gx1)} ${WRAP_GATHER_Y}`;
  const sideA = `C${f1(gx0 - 18)} ${WRAP_GATHER_Y - 50} ${f1(a.x - 4)} ${f1(a.y + 60)} ${f1(a.x)} ${f1(a.y)}`;
  return `<path d="M${f1(a.x)} ${f1(a.y)}${edge}${sideB}L${f1(gx0)} ${WRAP_GATHER_Y}${sideA}Z" fill="url(#${id})"/>`
    + pleats
    + `<path d="M${f1(a.x)} ${f1(a.y)}${edge}" fill="none" stroke="${shade(color, .3)}" stroke-width="${lip}" stroke-linecap="round" opacity=".7"/>`;
}

function wrapFrontSvg(w, e, bind) {
  const top = Math.min(e.maxY + 10, 372), L = e.minX - 22, R = e.maxX + 22;
  const mid = bind.x + (R - L) * .06, felt = w.texture === 'felt';
  const left = frontSheet('wrapFront0', w.front, { x: L, y: top - 8 }, { x: mid + 12, y: top + 24 }, bind.x - 24, bind.x + 10, felt);
  const right = frontSheet('wrapFront1', w.side, { x: mid - 18, y: top + 20 }, { x: R, y: top - 10 }, bind.x - 6, bind.x + 24, felt);
  return `<defs>${sheetGradient('wrapFront0', w.front)}${sheetGradient('wrapFront1', w.side)}</defs>`
    + `<g filter="url(#wrapShadow)"><g filter="url(#wrapGrain)">${left}${right}</g></g>`;
}

if (typeof module !== 'undefined') module.exports = { shade, wrapDefs, wrapBackSvg, wrapFrontSvg, WRAP_GRAIN };
