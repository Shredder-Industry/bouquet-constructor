(() => {
  const {kinds: KINDS, wraps: WRAPS, ribbons: RIBBONS, gifts: GIFTS, presets: PRESETS} = applyShop(LIBRARY, SHOP);
  const GIFT_MAX = 3;
  // ground points next to the bouquet: front-left, front-right, back-left, back-right
  const GIFT_SLOTS = {
    side:[{x:74,y:450},{x:328,y:458},{x:46,y:376},{x:356,y:384}],
    top: [{x:66,y:398},{x:334,y:398},{x:54,y:104},{x:346,y:104}],
  };
  const BIND = {x:200, y:400};
  const BOUNDS = {x0:30, x1:370, y0:40, y1:330};
  const STORE_KEY = `bouquet-workshop-v2-${SHOP.id}`;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const SQUASH = .62;            // dome height / width in the side view
  const TOP_H = 440, TOP_CY = 220; // top-view canvas

  const rub = n => formatMoney(n, SHOP.currency);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const {rng, DRAW, DRAW_TOP, ATTACH, DIRECTIONAL, GIFT_DRAW} = ART;
  const drawHead = kind => DRAW[KINDS[kind].type](KINDS[kind].pal || {});
  const drawGift = key => GIFT_DRAW[GIFTS[key].draw](GIFTS[key].pal || {});
  /* ---------- state ---------- */
  const MAX_STEMS = 51;
  const CARD = {price: SHOP.cardPrice, maxLength:200};
  let state = {stems:[], gifts:{}, card:{on:false, text:''}, wrap: Object.keys(WRAPS)[0], ribbon: Object.keys(RIBBONS)[0], seed:1, nextId:1, view:'side'};
  let selected = null;

  /* the one gate for any outside bouquet, from localStorage or from a link anyone could send: returns a clean state patch or null */
  function sanitize(saved) {
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.stems)) return null;
    const gifts = Object.fromEntries(Object.entries(saved.gifts || {})
      .filter(([k, n]) => hasKey(GIFTS, k) && Number.isInteger(n) && n > 0).map(([k, n]) => [k, Math.min(n, GIFT_MAX)]));
    /* cut by code points: a half emoji would make encodeURIComponent throw on every render */
    const card = {on: saved.card?.on === true, text: Array.from(String(saved.card?.text || '')).slice(0, CARD.maxLength).join('')};
    const num = v => (Number.isFinite(v) ? v : 0);
    const stems = saved.stems.filter(s => s && hasKey(KINDS, s.kind) && Number.isInteger(s.id)).slice(0, MAX_STEMS)
      .map(s => ({id: s.id, kind: s.kind, rot: num(s.rot), lift: num(s.lift), manual: s.manual === true,
        x: clamp(num(s.x), BOUNDS.x0, BOUNDS.x1), y: clamp(num(s.y), BOUNDS.y0, BOUNDS.y1)}));
    const nextId = Math.max(Number.isInteger(saved.nextId) ? saved.nextId : 1, ...stems.map(s => s.id + 1));
    /* a wrap or ribbon the shop stopped selling falls back to its first one; the flowers stay */
    const wrap = hasKey(WRAPS, saved.wrap) ? saved.wrap : Object.keys(WRAPS)[0];
    const ribbon = hasKey(RIBBONS, saved.ribbon) ? saved.ribbon : Object.keys(RIBBONS)[0];
    return {stems, gifts, card, nextId, wrap, ribbon,
      seed: Number.isInteger(saved.seed) ? saved.seed : 1, view: saved.view === 'top' ? 'top' : 'side'};
  }
  function load() {
    try {
      const clean = sanitize(JSON.parse(localStorage.getItem(STORE_KEY)));
      if (clean) { state = {...state, ...clean}; return true; }
    } catch (e) { /* storage unavailable: start from a preset */ }
    return false;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* not persisted in this browser */ }
  }

  const newStem = (kind, r) => ({id: state.nextId++, kind, x:200, y:200, rot: Math.round((r() - .5) * 60), manual:false});

  const HEAD_SVG_SIZE = 34;   // drawn heads are about this wide at scale 1
  const headSize = kind => KINDS[kind].photo ? KINDS[kind].photo.size * PHOTO_HEAD_SCALE : HEAD_SVG_SIZE * (KINDS[kind].scale || 1);
  const FILLER_RING = .95, FILLER_RING_SPREAD = .1;

  /* flowers fill a dense spiral, biggest in the centre; greenery goes in a ring around the edge */
  function arrange(stems, seed) {
    const r = rng(seed * 9973);
    const auto = stems.filter(s => !s.manual);
    const main = auto.filter(s => !KINDS[s.kind].filler)
      .map(s => ({s, key: (KINDS[s.kind].tier || 0) * 1000 - headSize(s.kind) + r() * 20}))
      .sort((a, b) => a.key - b.key).map(o => o.s);
    const fillers = auto.filter(s => KINDS[s.kind].filler);
    const sizes = main.map(s => headSize(s.kind));
    const rx = packRadius(sizes), ry = rx * SQUASH, radii = spiralRadii(sizes), offset = r() * Math.PI * 2;
    const place = (rad, th) => {
      const lift = Math.round(Math.max(0, 1 - rad * rad) * 24);
      return {x: clamp(Math.round(200 + rad * Math.cos(th) * rx), BOUNDS.x0, BOUNDS.x1),
        y: clamp(Math.round(205 + rad * Math.sin(th) * ry - lift), BOUNDS.y0, BOUNDS.y1), lift};
    };
    const placed = new Map([
      ...main.map((s, i) => [s.id, place(radii[i], i * GOLDEN + offset)]),
      ...fillers.map((s, i) => [s.id, place(FILLER_RING + r() * FILLER_RING_SPREAD, offset + (i + .5) * Math.PI * 2 / fillers.length)]),
    ]);
    return stems.map(s => placed.has(s.id) ? {...s, ...placed.get(s.id)} : s);
  }

  function update(next, {rearrange = true} = {}) {
    const merged = {...state, ...next};
    state = rearrange ? {...merged, stems: arrange(merged.stems, merged.seed)} : merged;
    if (selected && !state.stems.some(s => s.id === selected)) selected = null;
    save();
    render();
  }

  const countOf = kind => state.stems.filter(s => s.kind === kind).length;

  function setCount(kind, delta) {
    if (delta > 0) {
      if (state.stems.length >= MAX_STEMS) return;
      update({stems: [...state.stems, newStem(kind, rng(state.nextId * 31))]});
      return;
    }
    const idx = state.stems.map(s => s.kind).lastIndexOf(kind);
    if (idx < 0) return;
    update({stems: state.stems.filter((_, i) => i !== idx)});
  }

  function setGift(key, delta) {
    const n = clamp((state.gifts[key] || 0) + delta, 0, GIFT_MAX);
    const {[key]: _, ...rest} = state.gifts;
    update({gifts: n ? {...rest, [key]: n} : rest}, {rearrange:false});
  }

  /* replacing the whole bouquet is the only destructive action, so it always offers undo */
  let undoState = null, toastTimer = 0;
  const TOAST_MS = 6000;
  function hideToast() { document.getElementById('toast').hidden = true; undoState = null; clearTimeout(toastTimer); }
  function replaceWithUndo(next, message, {rearrange = true} = {}) {
    const hadContent = state.stems.length || Object.keys(state.gifts).length;
    const prev = state;
    selected = null;
    update(next, {rearrange});
    if (!hadContent) return;
    undoState = prev;
    document.getElementById('toastText').textContent = message;
    document.getElementById('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
  }
  function undo() {
    if (!undoState) return;
    state = undoState;
    selected = null;
    hideToast();
    save();
    render();
  }

  function applyPreset(p) {
    const r = rng(Date.now() & 0xffff);
    const stems = Object.entries(p.items).flatMap(([kind, n]) => Array.from({length:n}, () => newStem(kind, r)));
    replaceWithUndo({stems, gifts: {...(p.gifts || {})}, wrap:p.wrap, ribbon:p.ribbon, seed: Math.floor(r() * 1e6)},
      `Собрали «${p.name}»`);
  }

  /* ---------- stage ---------- */
  const svg = document.getElementById('stage');

  function extents() {
    if (!state.stems.length) return {minX:140, maxX:260, minY:170, maxY:250};
    const xs = state.stems.map(s => s.x), ys = state.stems.map(s => s.y);
    return {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
  }

  function stemPath(s) {
    const k = KINDS[s.kind];
    const hy = s.y + (usesPhoto(s.kind) ? k.photo.size * .3 : (ATTACH[k.type] || 0) * (k.scale || 1));
    const bx = BIND.x + (s.x - BIND.x) * .05;
    const cx = s.x * .55 + bx * .45, cy = (hy + BIND.y) / 2 + 10;
    const ex = BIND.x - (s.x - BIND.x) * .2;
    return `<path d="M${s.x} ${hy}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${BIND.y}L${ex.toFixed(1)} 496" fill="none" stroke="${KINDS[s.kind].type === 'eucalyptus' ? '#5F7F70' : '#5C8A4C'}" stroke-width="2.3" stroke-linecap="round"/>`;
  }

  /* the top view reuses the side layout: undo the dome's squash and lift to get a round plan */
  const isTop = () => state.view === 'top';
  const toView = s => isTop()
    ? {x: s.x, y: clamp(TOP_CY + (s.y + (s.lift || 0) - 205) / SQUASH, 20, TOP_H - 20)}
    : {x: s.x, y: s.y};
  const fromView = (x, y, s) => isTop()
    ? {x, y: 205 + (clamp(y, 30, TOP_H - 30) - TOP_CY) * SQUASH - (s.lift || 0)}
    : {x, y};

  /* photo heads (side view only): bigger in the centre, smaller and leaning outwards at the edge */
  const PHOTO_HEAD_SCALE = 1.2;   // photo heads drawn larger than their library size
  const PHOTO_EDGE_SHRINK = .2, PHOTO_LEAN = .12, PHOTO_JITTER = .2, PHOTO_HALF_SPAN = 150;
  const usesPhoto = kind => !isTop() && Boolean(KINDS[kind].photo);
  function photoHead(s, k) {
    const ph = k.photo, edge = Math.min(1, Math.abs(s.x - BIND.x) / PHOTO_HALF_SPAN);
    const head = ph.size * PHOTO_HEAD_SCALE * (1 - edge * PHOTO_EDGE_SHRINK), w = head / ph.w;
    const rot = (s.x - BIND.x) * PHOTO_LEAN + s.rot * PHOTO_JITTER;
    return `<g transform="rotate(${rot.toFixed(1)})"><image href="${ph.src}" x="${(-ph.cx * w).toFixed(1)}" y="${(-ph.cy * w).toFixed(1)}"`
      + ` width="${w.toFixed(1)}" height="${w.toFixed(1)}" filter="url(#photoShadow)" pointer-events="none"/></g>`;
  }

  /* top view from side photos: a flower shows its head, cut round; greenery shows the whole sprig pointing outwards */
  const TOP_HEAD_SCALE = 1.15, TOP_SPRIG_BASE = .75, TOP_SPRIG_SCALE = .6;
  const TOP_HEAD_ASPECT = .62;   // a side-view head is about this tall for its width; stretched back to round from above
  function photoTopHead(s, k, p) {
    const ph = k.photo;
    if (k.filler) {
      const w = ph.size / ph.w * TOP_SPRIG_SCALE, outwards = Math.atan2(p.y - TOP_CY, p.x - 200) * 180 / Math.PI + 90;
      return `<g transform="rotate(${(outwards + s.rot * PHOTO_JITTER).toFixed(1)})"><image href="${ph.src}" x="${(-ph.cx * w).toFixed(1)}"`
        + ` y="${(-TOP_SPRIG_BASE * w).toFixed(1)}" width="${w.toFixed(1)}" height="${w.toFixed(1)}" pointer-events="none"/></g>`;
    }
    const head = ph.size * PHOTO_HEAD_SCALE * TOP_HEAD_SCALE, w = head / ph.w, clip = `topHead${s.id}`;
    return `<clipPath id="${clip}"><ellipse rx="${(head * .5).toFixed(1)}" ry="${(head * .5 * TOP_HEAD_ASPECT).toFixed(1)}"/></clipPath>`
      + `<g transform="rotate(${s.rot}) scale(1 ${(1 / TOP_HEAD_ASPECT * .85).toFixed(2)})" filter="url(#photoShadow)"><image href="${ph.src}" x="${(-ph.cx * w).toFixed(1)}" y="${(-ph.cy * w).toFixed(1)}"`
      + ` width="${w.toFixed(1)}" height="${w.toFixed(1)}" clip-path="url(#${clip})" pointer-events="none"/></g>`;
  }

  function headSvg(s) {
    const k = KINDS[s.kind], sc = k.scale || 1, p = toView(s), top = isTop();
    if (top && k.photo) {
      const ringEl = s.id === selected ? `<circle r="${(k.photo.size * TOP_HEAD_SCALE * .58).toFixed(0)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>` : '';
      return `<g class="head" data-id="${s.id}" transform="translate(${p.x} ${p.y.toFixed(1)})"><circle r="30" fill="transparent"/>${photoTopHead(s, k, p)}${ringEl}</g>`;
    }
    if (usesPhoto(s.kind)) {
      const ringEl = s.id === selected ? `<circle r="${(k.photo.size * .55).toFixed(0)}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>` : '';
      return `<g class="head" data-id="${s.id}" transform="translate(${p.x} ${p.y.toFixed(1)})"><circle r="30" fill="transparent"/>${photoHead(s, k)}${ringEl}</g>`;
    }
    const rot = !top && DIRECTIONAL.has(k.type) ? (s.x - BIND.x) * .16 + s.rot * .15 : s.rot;
    const art = top && DRAW_TOP[k.type] ? DRAW_TOP[k.type](k.pal || {}) : drawHead(s.kind);
    const ringEl = s.id === selected ? `<circle r="34" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>` : '';
    return `<g class="head" data-id="${s.id}" transform="translate(${p.x} ${p.y.toFixed(1)})"><circle r="30" fill="transparent"/>`
      + `<g transform="rotate(${rot.toFixed(1)}) scale(${sc})">${art}</g>${ringEl}</g>`;
  }

  function bow(rb, y) {
    const x = BIND.x;
    return `<g transform="translate(${x} ${y})">`
      + `<path d="M-4 2L-16 34L-9 32L-6 38L0 4Z" fill="${rb.color}" stroke="${rb.dark}" stroke-width="1"/>`
      + `<path d="M4 2L14 35L8 33L4 39L0 4Z" fill="${rb.color}" stroke="${rb.dark}" stroke-width="1"/>`
      + `<path d="M0 0C-10-16-32-14-30 0C-32 14-10 14 0 0Z" fill="${rb.color}" stroke="${rb.dark}" stroke-width="1"/>`
      + `<path d="M0 0C10-16 32-14 30 0C32 14 10 14 0 0Z" fill="${rb.color}" stroke="${rb.dark}" stroke-width="1"/>`
      + `<rect x="-6" y="-6" width="12" height="12" rx="3" fill="${rb.color}" stroke="${rb.dark}" stroke-width="1"/></g>`;
  }

  function giftsScene(view) {
    const shown = Object.keys(GIFTS).filter(k => state.gifts[k])
      .sort((a, b) => (GIFTS[a].group === 'toy' ? 0 : 1) - (GIFTS[b].group === 'toy' ? 0 : 1));
    return `<g pointer-events="none">` + shown.slice(0, GIFT_SLOTS[view].length).map((k, i) => {
      const slot = GIFT_SLOTS[view][i], n = state.gifts[k];
      const badge = n > 1 ? `<g transform="translate(24 -60)"><circle r="11" fill="var(--accent)"/>`
        + `<text y="4" text-anchor="middle" font-family="Manrope, sans-serif" font-size="12" font-weight="700" fill="var(--accent-ink)">×${n}</text></g>` : '';
      return `<g transform="translate(${slot.x} ${slot.y}) scale(${GIFTS[k].scale || 1})"><ellipse cy="1" rx="26" ry="4" fill="#000" opacity=".13"/>${drawGift(k)}${badge}</g>`;
    }).join('') + `</g>`;
  }

  const fillerFirst = (a, b) => (KINDS[b.kind].filler ? 1 : 0) - (KINDS[a.kind].filler ? 1 : 0);
  const emptyNote = () => '';   // the empty state is HTML over the stage (#emptyNote)

  const PHOTO_DEFS = '<defs><filter id="photoShadow" x="-20%" y="-20%" width="140%" height="140%">'
    + '<feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#1C2A21" flood-opacity=".22"/></filter>'
    + '<radialGradient id="domeShade" cx=".5" cy=".42" r=".58"><stop offset=".5" stop-color="#0B140D" stop-opacity="0"/>'
    + '<stop offset="1" stop-color="#0B140D" stop-opacity=".38"/></radialGradient></defs>';

  /* decorative greenery under the flowers: not in the order, it only hides the gaps between heads */
  const BED_SPRIG = (Object.values(LIBRARY.flowers).find(f => f.filler && f.photo) || {}).photo;
  const BED_GREEN = '#2F4A2A', BED_SPRIG_SCALE = .55, BED_SPRIG_BASE = .85;
  function bedSprig(x, y, outwards, scale) {  // scale: share of the full sprig length
    if (!BED_SPRIG) return '';
    const w = BED_SPRIG.size / BED_SPRIG.w * BED_SPRIG_SCALE * scale;
    return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${outwards.toFixed(1)})"><image href="${BED_SPRIG.src}"`
      + ` x="${(-BED_SPRIG.cx * w).toFixed(1)}" y="${(-BED_SPRIG_BASE * w).toFixed(1)}" width="${w.toFixed(1)}" height="${w.toFixed(1)}"/></g>`;
  }
  /* sprigs around an ellipse (cx, cy, rx, ry), each pointing away from (ox, oy); then a dark green mass under the heads */
  function greeneryBed(cx, cy, rx, ry, ox, oy, sprigScale = 1) {
    const deg = Math.PI / 180;
    const sprigs = bedSprigs(rx, state.seed).map(sp => {
      const x = cx + Math.cos(sp.angle * deg) * rx * sp.dist, y = cy + Math.sin(sp.angle * deg) * ry * sp.dist;
      return bedSprig(x, y, Math.atan2(y - oy, x - ox) / deg + 90, sp.scale * sprigScale);
    }).join('');
    return `<g pointer-events="none">${sprigs}<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(rx * .92).toFixed(1)}" ry="${(ry * .92).toFixed(1)}"`
      + ` fill="${BED_GREEN}" opacity=".9" filter="url(#wrapBlur)"/></g>`;
  }
  /* shared dome light: centre bright, rim in shade, drawn over the heads */
  const domeShade = (cx, cy, rx, ry) => `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}"`
    + ` fill="url(#domeShade)" pointer-events="none"/>`;
  function sideScene() {
    const w = WRAPS[state.wrap], rb = RIBBONS[state.ribbon], e = extents();
    const hasWrap = state.wrap !== 'none';
    const heads = [...state.stems].sort((a, b) => fillerFirst(a, b) || a.y - b.y);
    const has = state.stems.length > 0;
    const cx = (e.minX + e.maxX) / 2, cy = (e.minY + e.maxY) / 2, rx = (e.maxX - e.minX) / 2 + 30, ry = (e.maxY - e.minY) / 2 + 26;
    return PHOTO_DEFS + `<defs>${wrapDefs(w)}</defs>` + (hasWrap ? wrapBackSvg(w, e, BIND) : '')
      + state.stems.map(stemPath).join('')
      + (has ? greeneryBed(cx, cy, rx, ry, BIND.x, BIND.y) : '')
      + heads.map(s => headSvg(s)).join('')
      + (has ? domeShade(cx, cy - 6, rx + 8, ry + 10) : '')
      + (hasWrap ? `<g pointer-events="none">${wrapFrontSvg(w, e, BIND)}</g>` : '')
      + `<g pointer-events="none">${bow(rb, hasWrap ? 438 : BIND.y)}</g>` + giftsScene('side') + emptyNote(210);
  }

  function topScene() {
    const w = WRAPS[state.wrap];
    const dist = s => { const p = toView(s); return Math.hypot(p.x - 200, p.y - TOP_CY); };
    const reach = state.stems.length ? Math.max(...state.stems.map(dist)) : 60;
    const R = clamp(reach + 44, 96, 192);
    const paper = state.wrap === 'none' ? ''
      : `<g pointer-events="none" transform="translate(200 ${TOP_CY})">${wrapTopSvg(w, R)}</g>`;
    const TOP_BED_INSET = .78, TOP_BED_SPRIG = .5;   // seen from above the greenery only peeks out from under the heads
    const bed = greeneryBed(200, TOP_CY, reach * TOP_BED_INSET + 10, reach * TOP_BED_INSET + 10, 200, TOP_CY, TOP_BED_SPRIG);
    // outer heads sit lower in the dome, so they are drawn first and the centre ends up on top
    const heads = [...state.stems].sort((a, b) => fillerFirst(a, b) || dist(b) - dist(a));
    return PHOTO_DEFS + `<defs>${wrapDefs(w)}</defs>` + paper + (state.stems.length ? bed : '') + heads.map(s => headSvg(s)).join('')
      + (state.stems.length ? domeShade(200, TOP_CY, reach + 34, reach + 34) : '') + giftsScene('top') + emptyNote(TOP_CY);
  }

  function renderStage() {
    svg.setAttribute('viewBox', isTop() ? `0 0 400 ${TOP_H}` : '0 0 400 510');
    svg.setAttribute('aria-label', isTop() ? 'Букет, вид сверху' : 'Букет, вид сбоку');
    svg.innerHTML = isTop() ? topScene() : sideScene();
  }

  /* drag & select */
  let drag = null;
  const toSvg = ev => {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  svg.addEventListener('pointerdown', ev => {
    const g = ev.target.closest('.head');
    if (!g) { selected = null; render(); return; }
    const id = Number(g.dataset.id), s = state.stems.find(x => x.id === id), p = toSvg(ev), v = toView(s);
    selected = id;
    drag = {id, dx: v.x - p.x, dy: v.y - p.y, moved:false};
    svg.setPointerCapture(ev.pointerId);
    render();
  });
  svg.addEventListener('pointermove', ev => {
    if (!drag) return;
    const p = toSvg(ev), pos = fromView(p.x + drag.dx, p.y + drag.dy, state.stems.find(s => s.id === drag.id));
    const x = clamp(Math.round(pos.x), BOUNDS.x0, BOUNDS.x1), y = clamp(Math.round(pos.y), BOUNDS.y0, BOUNDS.y1);
    drag.moved = true;
    state = {...state, stems: state.stems.map(s => s.id === drag.id ? {...s, x, y, manual:true} : s)};
    renderStage();
    svg.querySelector(`.head[data-id="${drag.id}"]`)?.classList.add('dragging');
  });
  /* a moved stem changes the layout link inside the order message */
  const endDrag = () => { if (drag?.moved) { save(); renderOrderLinks(orderLines()); } drag = null; };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  /* ---------- panel ---------- */
  const $ = id => document.getElementById(id);
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  };
  const stemsText = n => `${n} ${plural(n, 'стебель', 'стебля', 'стеблей')}`;
  const icon = (name, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));

  const flowerCount = () => state.stems.filter(s => !KINDS[s.kind].filler).length;
  const giftCount = () => Object.values(state.gifts).reduce((a, n) => a + n, 0);

  /* AI photo of the assembled bouquet; paper and ribbon only when the bouquet is wrapped */
  const realPhoto = initRealisticPhoto({
    dialog: $('realDialog'), triggers: [$('realBtn'), $('realBtnOrder')], stage: $('stage'),
    getComposition: () => {
      const wrapped = state.wrap !== 'none';
      return composition(state.stems, KINDS, wrapped ? WRAPS[state.wrap].name : null, wrapped ? RIBBONS[state.ribbon].name : null);
    },
    onOrder: () => openOrder(),
  });
  const preview = kind => KINDS[kind].photo
    ? `<img src="${KINDS[kind].photo.src}" alt="" loading="lazy" width="96" height="96">`
    : `<svg viewBox="-34 -46 68 92" aria-hidden="true"><path d="M0 ${ATTACH[KINDS[kind].type] || 0}V46" stroke="#5C8A4C" stroke-width="2.3"/>${drawHead(kind)}</svg>`;
  const giftPreview = key => `<svg viewBox="-36 -86 72 90" aria-hidden="true">${drawGift(key)}</svg>`;

  /* one catalog row: "Добавить" until picked, then a stepper */
  function rowItem({attr, key, name, price, n, art, canAdd}) {
    const control = n
      ? `<div class="stepper" role="group" aria-label="Количество: ${esc(name)}">`
        + `<button type="button" data-${attr}="${key}" data-d="-1" aria-label="Убрать один: ${esc(name)}">${icon('minus')}</button>`
        + `<output aria-live="polite">${n}</output>`
        + `<button type="button" data-${attr}="${key}" data-d="1" aria-label="Добавить ещё: ${esc(name)}"${canAdd ? '' : ' disabled'}>${icon('plus')}</button></div>`
      : `<button type="button" class="add" data-${attr}="${key}" data-d="1" aria-label="Добавить: ${esc(name)}"${canAdd ? '' : ' disabled'}>${icon('plus')}<span>Добавить</span></button>`;
    return `<div class="row-item${n ? ' on' : ''}"><div class="thumb">${art}</div>`
      + `<div class="row-text"><b>${esc(name)}</b><span>${rub(price)} / шт</span></div>${control}</div>`;
  }

  /* catalog filter: 'all', 'picked' or a FLOWER_GROUPS key; view state only, not saved */
  let flowerFilter = 'all';
  const matchesFilter = (kind, filter) => filter === 'all' || (filter === 'picked' ? countOf(kind) > 0 : flowerGroup(KINDS[kind]) === filter);

  function renderFilters() {
    const kinds = Object.keys(KINDS), picked = kinds.filter(k => countOf(k) > 0).length;
    const chips = [{key:'all', label:'Все'},
      ...FLOWER_GROUPS.filter(g => kinds.some(k => flowerGroup(KINDS[k]) === g.key)).map(g => ({key:g.key, label:g.label})),
      {key:'picked', label:'В букете', n:picked}];
    $('flowerFilters').innerHTML = chips.map(c =>
      `<button type="button" data-filter="${c.key}" aria-pressed="${c.key === flowerFilter}">${c.label}${c.n ? `<span class="badge">${c.n}</span>` : ''}</button>`).join('');
  }

  function renderCatalog() {
    const full = state.stems.length >= MAX_STEMS;
    const shown = Object.keys(KINDS).filter(kind => matchesFilter(kind, flowerFilter));
    const row = kind => rowItem({attr:'kind', key:kind, name:KINDS[kind].name, price:KINDS[kind].price, n:countOf(kind), art:preview(kind), canAdd:!full});
    /* on "Все" the picked flowers come first, so the steppers stay in one place */
    const picked = flowerFilter === 'all' ? shown.filter(k => countOf(k)) : [];
    const rest = shown.filter(k => !picked.includes(k));
    renderFilters();
    $('catalog').innerHTML = !shown.length
      ? `<p class="list-empty">В букете пока нет цветов. <button type="button" class="link" data-filter="all">Показать все</button></p>`
      : (picked.length ? `<p class="list-label">В букете · ${picked.length}</p>${picked.map(row).join('')}<p class="list-label">Ещё цветы</p>` : '')
        + rest.map(row).join('');
    $('gifts').innerHTML = Object.entries(GIFTS).map(([key, g]) => {
      const n = state.gifts[key] || 0;
      return rowItem({attr:'gift', key, name:g.name, price:g.price, n, art:giftPreview(key), canAdd: n < GIFT_MAX});
    }).join('');
  }

  const wrapFill = v => v.front ? `background:linear-gradient(135deg,${v.front} 50%,${v.side} 50%)`
    : 'background:repeating-linear-gradient(45deg,transparent 0 4px,rgba(127,127,127,.35) 4px 6px)';
  function renderDecor() {
    $('wraps').innerHTML = Object.entries(WRAPS).map(([key, v]) =>
      `<button type="button" class="opt" data-wrap="${key}" aria-pressed="${key === state.wrap}"><i style="${wrapFill(v)}"></i>`
      + `<span>${esc(v.name)}<small>${v.price ? '+' + rub(v.price) : 'бесплатно'}</small></span></button>`).join('');
    $('ribbons').innerHTML = Object.entries(RIBBONS).map(([key, v]) =>
      `<button type="button" class="rib" data-ribbon="${key}" aria-pressed="${key === state.ribbon}"><i style="background:${v.color}"></i>${esc(v.name)}</button>`).join('');
  }

  /* label stays the message text; n/unit are for the receipt only */
  function orderLines() {
    const lines = Object.entries(KINDS).filter(([kind]) => countOf(kind))
      .map(([kind, k]) => ({label: `${k.name} × ${countOf(kind)}`, name: k.name, n: countOf(kind), unit: k.price, sum: k.price * countOf(kind)}));
    const w = WRAPS[state.wrap];
    if (state.stems.length) lines.push({label: `Упаковка: ${w.name.toLowerCase()}`, sum: w.price});
    if (state.stems.length) lines.push({label: `Лента: ${RIBBONS[state.ribbon].name.toLowerCase()}`, sum: 0});
    const gifts = Object.entries(GIFTS).filter(([key]) => state.gifts[key])
      .map(([key, g]) => ({label: `${g.name} × ${state.gifts[key]}`, name: g.name, n: state.gifts[key], unit: g.price, sum: g.price * state.gifts[key]}));
    const card = state.card.on ? [{label: 'Открытка с текстом', sum: CARD.price, note: state.card.text.trim()}] : [];
    return [...lines, ...gifts, ...card];
  }
  const orderTotal = lines => lines.reduce((a, l) => a + l.sum, 0);

  /* the preset whose flowers match the bouquet exactly, for a friendlier title */
  function matchingPreset() {
    const counts = Object.fromEntries(Object.keys(KINDS).map(k => [k, countOf(k)]).filter(([, n]) => n));
    return PRESETS.find(p => Object.keys(p.items).length === Object.keys(counts).length
      && Object.entries(p.items).every(([k, n]) => counts[k] === n));
  }
  function bouquetSummary() {
    const g = giftCount(), p = matchingPreset();
    const base = state.stems.length ? stemsText(state.stems.length) : 'Букет пустой';
    return `${p ? `${p.name} · ` : ''}${base}${g ? ` + ${g} ${plural(g, 'подарок', 'подарка', 'подарков')}` : ''}`;
  }

  function renderBar(lines) {
    $('barTotal').textContent = rub(orderTotal(lines));
    $('barMeta').textContent = state.stems.length || giftCount() ? `${bouquetSummary()} · состав` : 'Букет пустой';
    const empty = !lines.length;
    $('toOrder').disabled = empty;
    $('toOrder').lastChild.textContent = empty ? 'Добавьте цветы' : 'Заказать';
  }

  let floristMode = false;   // opened from a florist link: a read-only checklist
  function renderOrderView(lines) {
    const noteHtml = l => l.note === undefined ? '' : `<small>${l.note ? '«' + esc(l.note) + '»' : 'Текст пока не написан'}</small>`;
    const qty = l => l.n ? `<small>${l.n} × ${rub(l.unit)}</small>` : '';
    const check = floristMode ? `<input type="checkbox" aria-label="Собрано">` : '';
    $('lines').innerHTML = lines.length
      ? lines.map(l => `<li><span>${check}<span>${esc(l.name || l.label)}${qty(l)}${noteHtml(l)}</span></span>`
        + `<span class="sum">${l.sum ? rub(l.sum) : 'бесплатно'}</span></li>`).join('')
      : `<li class="empty">Букет пока пустой</li>`;
    $('total').textContent = rub(orderTotal(lines));
    const p = matchingPreset();
    $('orderTitle').textContent = floristMode ? 'Макет заказа' : p ? p.name : 'Ваш заказ';
    $('orderEyebrow').textContent = floristMode ? `${SHOP.name} · просмотр` : p ? 'Ваш заказ' : SHOP.name;
    $('orderLead').textContent = floristMode
      ? `${bouquetSummary()}. Отметьте собранное — макет выше по кнопке «Посмотреть макет».`
      : `${bouquetSummary()}. Ссылка на этот макет будет в сообщении — флорист соберёт так же.`;
    $('backLabel').textContent = floristMode ? 'Посмотреть макет' : 'Изменить букет';
    $('msgBox').hidden = floristMode;
    $('wa').hidden = floristMode;
    $('cloneLink').hidden = !floristMode;
    $('msgPreview').textContent = orderText(lines, {heading: ORDER_GREETING, link: bouquetLink()});
  }

  function renderReceipt() {
    const lines = orderLines();
    renderBar(lines);
    renderOrderLinks(lines);
    if (!$('orderView').hidden) renderOrderView(lines);
  }

  const shopPhone = normalizePhone(SHOP.whatsapp);
  const orderText = (lines, opts) => orderMessage(lines, {currency: SHOP.currency, ...opts});
  /* only a published page has an address the florist can open */
  const bouquetLink = () => /^https?:$/.test(location.protocol) && state.stems.length
    ? `${location.origin}${location.pathname}#b=${encodeBouquet(state)}` : undefined;
  /* null while the order cannot be sent: empty bouquet or no shop number */
  function orderLink(lines) {
    if (!lines.length || !shopPhone) return null;
    return whatsappUrl(shopPhone, orderText(lines, {heading: ORDER_GREETING, link: bouquetLink()}));
  }
  /* plain links, not window.open: the Instagram in-app browser blocks pop-ups */
  function renderOrderLinks(lines) {
    const href = orderLink(lines);
    const label = !lines.length ? 'Добавьте цветы' : !shopPhone ? 'Номер магазина не настроен' : 'Заказать в WhatsApp';
    for (const a of [$('wa'), $('waBar')]) {
      if (href) { a.href = href; a.removeAttribute('aria-disabled'); } else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
      a.lastChild.textContent = label;
    }
  }

  function renderCard() {
    document.querySelectorAll('#cardMode button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.card === 'on') === state.card.on)));
    $('cardField').hidden = !state.card.on;
    const ta = $('cardText');
    if (ta.value !== state.card.text) ta.value = state.card.text;
    $('cardCounter').textContent = `${state.card.text.length} / ${CARD.maxLength}`;
  }

  /* the main flower the bouquet has most of: the one "+1" adds */
  const leadKind = () => Object.keys(KINDS).filter(k => !KINDS[k].filler && countOf(k)).sort((a, b) => countOf(b) - countOf(a))[0];

  function renderStatus() {
    const n = flowerCount(), all = state.stems.length;
    const banner = (cls, text, action = '') => `<div class="banner ${cls}" role="status">${icon('info')}<span>${text}</span>${action}</div>`;
    const out = [];
    if (all >= MAX_STEMS) out.push(banner('err', `Максимум — ${MAX_STEMS} стебель. Чтобы добавить другой цветок, уберите один`));
    else if (n && n % 2 === 0) out.push(banner('warn', 'Чётное число дарят на траурных церемониях',
      `<button type="button" data-plus="${leadKind()}">+1 цветок</button>`));
    else if (n) out.push(banner('ok m-hide', `${n} — нечётное число, подходит для подарка. Максимум — ${MAX_STEMS} стебель`));
    else if (!all) out.push(banner('info', 'Для подарка выбирайте нечётное число стеблей'));
    const giftKinds = Object.keys(state.gifts).length, slots = GIFT_SLOTS.side.length;
    if (giftKinds > slots) out.push(banner('info', `На макете ${slots} подарка из ${giftKinds}, в заказе все`));
    $('status').innerHTML = out.join('');

    $('countPill').innerHTML = `${icon('stem')}${all >= MAX_STEMS ? `${all} из ${MAX_STEMS}` : stemsText(all)}`;
    $('emptyNote').hidden = all > 0;
    $('shuffle').disabled = $('clear').disabled = !all && !giftCount();
    realPhoto.setEnabled(all > 0);
    const sel = selected && state.stems.find(s => s.id === selected);
    $('selBar').hidden = !sel;
    if (sel) $('selName').textContent = KINDS[sel.kind].name;
    $('tabFlowersN').textContent = all || '';
    $('tabGiftsN').textContent = giftCount() || '';
  }

  function render() {
    renderStage(); renderCatalog(); renderDecor(); renderReceipt(); renderStatus(); renderCard();
    document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
  }

  /* ---------- presets ---------- */
  const sumOf = (counts, catalog) => Object.entries(counts || {}).reduce((a, [k, n]) => a + catalog[k].price * n, 0);
  const presetPrice = p => sumOf(p.items, KINDS) + WRAPS[p.wrap].price + sumOf(p.gifts, GIFTS);
  const presetStems = p => Object.values(p.items).reduce((a, n) => a + n, 0);
  const PRESET_THUMBS = 3;
  /* the preset's main flowers, most numerous first, as overlapping round photos */
  const presetThumbs = p => `<span class="cthumbs" aria-hidden="true">${p.gifts ? '<span class="tag">с подарком</span>' : ''}${Object.entries(p.items)
    .filter(([k]) => !KINDS[k].filler).sort((a, b) => b[1] - a[1]).slice(0, PRESET_THUMBS)
    .map(([k]) => `<span class="ct">${preview(k)}</span>`).join('')}</span>`;
  $('presets').innerHTML = PRESETS.map((p, i) =>
    `<button type="button" class="combo" data-preset="${i}">${presetThumbs(p)}<span class="cn">${esc(p.name)}</span>`
    + `<span class="cd">${esc(p.desc)} · ${presetStems(p)} шт</span><span class="cp">${rub(presetPrice(p))}</span></button>`).join('');

  /* ---------- tabs ---------- */
  const TABS = ['presets', 'flowers', 'gifts', 'wrap', 'card'];
  let tab = 'presets';
  function showTab(name, {focus = false, scroll = true} = {}) {
    tab = name;
    for (const t of TABS) {
      const b = $(`t-${t}`), on = t === name;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      $(`p-${t}`).hidden = !on;
    }
    if (focus) $(`t-${name}`).focus();
    $(`t-${name}`).scrollIntoView({block:'nearest', inline:'nearest'});
    /* keep the tab bar where it was: a short panel must not leave the page scrolled past it */
    if (scroll && window.scrollY > tabsAnchor()) window.scrollTo({top: tabsAnchor()});
  }
  const tabsAnchor = () => $('tabs').getBoundingClientRect().top + window.scrollY - parseFloat(getComputedStyle($('tabs')).top || 0);
  $('tabs').addEventListener('click', ev => { const b = ev.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
  $('tabs').addEventListener('keydown', ev => {
    const d = {ArrowRight:1, ArrowLeft:-1}[ev.key];
    if (!d) return;
    ev.preventDefault();
    showTab(TABS[(TABS.indexOf(tab) + d + TABS.length) % TABS.length], {focus:true});
  });

  /* ---------- panel events ---------- */
  document.querySelector('.panel').addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || b.closest('#tabs') || b.closest('#bar')) return;
    if (b.dataset.filter) {
      flowerFilter = b.dataset.filter;
      renderCatalog();
      document.querySelector(`#flowerFilters [data-filter="${flowerFilter}"]`).scrollIntoView({block:'nearest', inline:'nearest'});
      return;
    }
    if (b.dataset.goto) showTab(b.dataset.goto);
    else if (b.dataset.kind) setCount(b.dataset.kind, Number(b.dataset.d));
    else if (b.dataset.gift) setGift(b.dataset.gift, Number(b.dataset.d));
    else if (b.dataset.wrap) update({wrap: b.dataset.wrap}, {rearrange:false});
    else if (b.dataset.ribbon) update({ribbon: b.dataset.ribbon}, {rearrange:false});
    else if (b.dataset.preset) applyPreset(PRESETS[Number(b.dataset.preset)]);
    else if (b.dataset.phrase) {
      const t = state.card.text.trim(), next = (t ? `${t} ${b.dataset.phrase}` : b.dataset.phrase);
      update({card: {on:true, text: Array.from(next).slice(0, CARD.maxLength).join('')}}, {rearrange:false});
    }
    else if (b.dataset.card) {
      update({card: {...state.card, on: b.dataset.card === 'on'}}, {rearrange:false});
      if (state.card.on) $('cardText').focus();
    }
  });
  $('status').addEventListener('click', ev => {
    const b = ev.target.closest('[data-plus]');
    if (b && hasKey(KINDS, b.dataset.plus)) setCount(b.dataset.plus, 1);
  });

  /* typing must not re-render the panel, or the textarea would lose focus */
  $('cardText').addEventListener('input', ev => {
    state = {...state, card: {...state.card, text: ev.target.value.slice(0, CARD.maxLength)}};
    save();
    renderReceipt();
    $('cardCounter').textContent = `${state.card.text.length} / ${CARD.maxLength}`;
  });

  /* ---------- stage size: full → compact while scrolling the list → mini while typing the card ---------- */
  const stageCol = document.querySelector('.stage-col');
  const COMPACT_AFTER = 24;
  let mini = false, expanded = false;
  function layoutStage() {
    const scrolled = window.scrollY > tabsAnchor() + COMPACT_AFTER - stageCol.offsetHeight;
    stageCol.classList.toggle('mini', mini && !expanded);
    stageCol.classList.toggle('compact', !mini && scrolled && !expanded);
    $('expand').hidden = !(mini || scrolled) || expanded;
    document.documentElement.style.setProperty('--tabs-top', `${stageCol.offsetHeight}px`);
  }
  addEventListener('scroll', () => { if (expanded && window.scrollY < 4) expanded = false; layoutStage(); }, {passive:true});
  addEventListener('resize', layoutStage);
  $('cardText').addEventListener('focus', () => { mini = true; expanded = false; layoutStage(); });
  $('cardText').addEventListener('blur', () => { mini = false; layoutStage(); });
  $('expand').addEventListener('click', () => { expanded = true; layoutStage(); });

  /* ---------- order view ---------- */
  function openOrder({push = true} = {}) {
    if (!orderLines().length && !floristMode) return;
    $('orderView').hidden = false;
    document.body.classList.add('ordering');
    renderOrderView(orderLines());
    window.scrollTo({top:0});
    /* a history entry, so the phone's back button returns to the builder instead of leaving the shop */
    if (push) history.pushState({order:true}, '');
    $('orderTitle').focus({preventScroll:true});
  }
  function closeOrder() {
    $('orderView').hidden = true;
    document.body.classList.remove('ordering');
    layoutStage();
  }
  $('orderTitle').tabIndex = -1;
  $('toOrder').addEventListener('click', () => openOrder());
  $('toOrderSum').addEventListener('click', () => openOrder());
  $('backToBuilder').addEventListener('click', () => { if (history.state?.order) history.back(); else closeOrder(); });
  addEventListener('popstate', () => { if (!history.state?.order) closeOrder(); });
  $('cloneLink').addEventListener('click', () => { floristMode = false; $('backToBuilder').click(); });

  $('undo').addEventListener('click', undo);
  $('views').addEventListener('click', ev => {
    const b = ev.target.closest('button[data-view]');
    if (b) update({view: b.dataset.view}, {rearrange:false});
  });

  const removeSelected = () => { if (selected) update({stems: state.stems.filter(s => s.id !== selected)}); };
  $('removeSel').addEventListener('click', removeSelected);
  const NUDGE = {ArrowLeft:[-1, 0], ArrowRight:[1, 0], ArrowUp:[0, -1], ArrowDown:[0, 1]};
  const NUDGE_STEP = 6, NUDGE_STEP_FAST = 18;
  document.addEventListener('keydown', ev => {
    if (!selected || /INPUT|TEXTAREA/.test(document.activeElement.tagName) || document.activeElement.closest('#tabs')) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeSelected(); return; }
    if (ev.key === 'Escape') { selected = null; render(); return; }
    const dir = NUDGE[ev.key];
    if (!dir) return;
    ev.preventDefault();
    const step = ev.shiftKey ? NUDGE_STEP_FAST : NUDGE_STEP;
    state = {...state, stems: state.stems.map(s => s.id !== selected ? s : {...s, manual:true,
      x: clamp(s.x + dir[0] * step, BOUNDS.x0, BOUNDS.x1), y: clamp(s.y + dir[1] * step, BOUNDS.y0, BOUNDS.y1)})};
    save();
    renderOrderLinks(orderLines());
    renderStage();
  });
  $('shuffle').addEventListener('click', () =>
    update({seed: state.seed + 1, stems: state.stems.map(s => ({...s, manual:false}))}));
  $('clear').addEventListener('click', () => replaceWithUndo({stems: [], gifts: {}}, 'Букет очищен'));

  const COPIED_MS = 1800;
  $('copy').addEventListener('click', () => {
    const btn = $('copy'), text = orderText(orderLines()), fb = $('copyFallback');
    const showFallback = () => { fb.value = text; fb.hidden = false; fb.focus(); fb.select(); };
    try {
      navigator.clipboard.writeText(text).then(() => {
        fb.hidden = true;
        btn.textContent = 'Скопировано — вставьте в любой чат';
        setTimeout(() => { btn.textContent = 'Скопировать состав'; }, COPIED_MS);
      }, showFallback);
    } catch (e) { showFallback(); }
  });

  /* header comes from the shop config; textContent, not markup */
  document.title = SHOP.name;
  $('shopName').textContent = SHOP.name;
  $('shopTagline').textContent = SHOP.tagline;
  $('logo').textContent = SHOP.name.trim().charAt(0).toUpperCase();
  const contact = $('waContact');
  if (shopPhone) contact.href = whatsappUrl(shopPhone, 'Здравствуйте! У меня вопрос по букету');
  else contact.hidden = true;
  $('cardPrice').textContent = '+' + rub(CARD.price);

  const returning = load();
  document.body.classList.toggle('returning', returning);
  if (returning) { render(); showTab('flowers', {scroll:false}); }
  else { if (PRESETS.length) applyPreset(PRESETS[0]); else render(); showTab('presets', {scroll:false}); }
  layoutStage();

  /* a bouquet link from an order message: show it as the florist's checklist, keep the visitor's own bouquet one "undo" away */
  const LINK_PREFIX = '#b=';
  if (location.hash.startsWith(LINK_PREFIX)) {
    const clean = sanitize(decodeBouquet(location.hash.slice(LINK_PREFIX.length)));
    history.replaceState(null, '', location.pathname + location.search);
    /* positions come from the link as they are: re-arranging would move the stems the customer never touched */
    if (clean) {
      replaceWithUndo({...clean, view: state.view}, 'Открыт букет по ссылке', {rearrange: false});
      floristMode = true;
      openOrder();
    }
  }
})();
