/* Hand-drawn flower heads and gifts as SVG strings. Pure functions: palette in, markup out. */
(function (root) {
  const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ring = (n, f) => Array.from({length:n}, (_, i) => f(i * 360 / n, i)).join('');
  const DRAW = {
    rose: p => ring(5, a => `<ellipse cy="-14" rx="13" ry="16" transform="rotate(${a})" fill="${p.base}" stroke="${p.dark}" stroke-width="1"/>`)
      + `<circle r="15" fill="${p.base}" stroke="${p.dark}" stroke-width="1"/>`
      + ring(3, a => `<ellipse cy="-6" rx="9" ry="10" transform="rotate(${a + 30})" fill="${p.light}" stroke="${p.dark}" stroke-width="1"/>`)
      + `<path d="M-5 0C-5-7 6-7 6 0C6 5-2 6-3 1C-3-2 2-3 2 0" fill="none" stroke="${p.dark}" stroke-width="1.3" stroke-linecap="round"/>`,
    peony: p => ring(10, a => `<ellipse cy="-17" rx="12" ry="17" transform="rotate(${a})" fill="${p.base}" stroke="${p.dark}" stroke-opacity=".55" stroke-width="1"/>`)
      + ring(8, a => `<ellipse cy="-10" rx="9" ry="12" transform="rotate(${a + 20})" fill="${p.light}" stroke="${p.dark}" stroke-opacity=".5" stroke-width="1"/>`)
      + ring(6, a => `<ellipse cy="-5" rx="6" ry="8" transform="rotate(${a + 10})" fill="${p.base}" stroke="${p.dark}" stroke-opacity=".6" stroke-width="1"/>`)
      + `<circle r="4" fill="${p.light}"/>`,
    tulip: p => `<g transform="translate(0 10)"><path d="M-14-4C-17-24-9-34-6-32L0-22L6-32C9-34 17-24 14-4C12 9-12 9-14-4Z" fill="${p.base}" stroke="${p.dark}" stroke-width="1"/>`
      + `<path d="M-7-5C-9-25 0-36 0-36C0-36 9-25 7-5C5 3-5 3-7-5Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1"/></g>`,
    sunflower: () => ring(16, a => `<ellipse cy="-21" rx="6" ry="13" transform="rotate(${a + 11})" fill="#E39B06"/>`)
      + ring(16, a => `<ellipse cy="-20" rx="5.5" ry="12" transform="rotate(${a})" fill="#F5B90F"/>`)
      + `<circle r="13" fill="#5B3A1B"/><circle r="9" fill="#4A2E14"/>`
      + ring(10, a => `<circle cy="-6" r="1.4" fill="#7C5329" transform="rotate(${a})"/>`),
    daisy: () => ring(16, a => `<ellipse cy="-15" rx="4" ry="11" transform="rotate(${a})" fill="#FFFFFF" stroke="#D6D3C7" stroke-width=".8"/>`)
      + `<circle r="7.5" fill="#F2B705" stroke="#D29700" stroke-width="1"/>`,
    lavender: () => Array.from({length:9}, (_, i) => {
        const y = 8 - i * 6, s = 1 - i * .06, x = i % 2 ? 3 : -3;
        return `<ellipse cx="${x}" cy="${y}" rx="${4 * s}" ry="${5.5 * s}" fill="${i % 3 ? '#8F6CC9' : '#6E4CA8'}"/>`;
      }).join('') + `<path d="M0 12V-42" stroke="#6F8F5F" stroke-width="1.2"/>`,
    eucalyptus: () => `<path d="M0 22C2 4-2-18 0-44" stroke="#5F7F70" stroke-width="1.6" fill="none"/>`
      + [14, 2, -10, -22, -33].map((y, i) => {
          const r = 7.5 - i * .9;
          return `<circle cx="${-r - 1}" cy="${y}" r="${r}" fill="#93B1A2"/><circle cx="${r + 1}" cy="${y - 4}" r="${r}" fill="#7C9C8C"/>`;
        }).join('') + `<circle cy="-44" r="3.5" fill="#93B1A2"/>`,
    gypsophila: () => {
      const r = rng(7); let s = '';
      for (let i = 0; i < 6; i++) { const a = -150 + i * 24; s += `<path d="M0 14L${(Math.cos(a * Math.PI / 180) * 20).toFixed(1)} ${(Math.sin(a * Math.PI / 180) * 20).toFixed(1)}" stroke="#7E9C6E" stroke-width=".8"/>`; }
      for (let i = 0; i < 26; i++) { const a = Math.PI * (1.05 + r() * .9), d = 8 + r() * 16; s += `<circle cx="${(Math.cos(a) * d).toFixed(1)}" cy="${(Math.sin(a) * d + 2).toFixed(1)}" r="${(1.6 + r() * 1.3).toFixed(1)}" fill="#FFFFFF" stroke="#CFCBC0" stroke-width=".5"/>`; }
      return s;
    },
  };
  const ATTACH = {tulip:16, lavender:12, eucalyptus:20, gypsophila:14};
  const DIRECTIONAL = new Set(['tulip', 'lavender', 'eucalyptus', 'gypsophila']);
  const EARS = {
    bear: p => `<circle cx="-12" cy="-64" r="6.5" fill="${p.base}"/><circle cx="12" cy="-64" r="6.5" fill="${p.base}"/>`
      + `<circle cx="-12" cy="-64" r="3.2" fill="${p.light}"/><circle cx="12" cy="-64" r="3.2" fill="${p.light}"/>`,
    bunny: p => [-1, 1].map(d => `<g transform="rotate(${d * 10} ${d * 7} -80)"><ellipse cx="${d * 7}" cy="-80" rx="5.5" ry="16" fill="${p.base}"/>`
      + `<ellipse cx="${d * 7}" cy="-80" rx="2.6" ry="11" fill="#F1B9C4"/></g>`).join(''),
    cat: p => `<path d="M-15-58L-12-74L-3-64Z" fill="${p.base}"/><path d="M15-58L12-74L3-64Z" fill="${p.base}"/>`
      + `<path d="M-12.5-61L-11.5-69L-6-64Z" fill="#F1B9C4"/><path d="M12.5-61L11.5-69L6-64Z" fill="#F1B9C4"/>`,
  };
  const plush = (p, ears) => EARS[ears](p)
    + `<ellipse cy="-24" rx="18" ry="19" fill="${p.base}"/><ellipse cy="-22" rx="10" ry="11" fill="${p.light}"/>`
    + `<ellipse cx="-19" cy="-28" rx="6" ry="11" transform="rotate(20 -19 -28)" fill="${p.base}"/><ellipse cx="19" cy="-28" rx="6" ry="11" transform="rotate(-20 19 -28)" fill="${p.base}"/>`
    + `<ellipse cx="-12" cy="-6" rx="9" ry="7" fill="${p.base}"/><ellipse cx="12" cy="-6" rx="9" ry="7" fill="${p.base}"/>`
    + `<ellipse cx="-12" cy="-5" rx="5" ry="4" fill="${p.light}"/><ellipse cx="12" cy="-5" rx="5" ry="4" fill="${p.light}"/>`
    + `<circle cy="-52" r="16" fill="${p.base}"/><ellipse cy="-46" rx="7.5" ry="5.5" fill="${p.light}"/>`
    + `<ellipse cy="-48.5" rx="2.6" ry="2" fill="${p.dark}"/><circle cx="-6" cy="-55" r="1.9" fill="${p.dark}"/><circle cx="6" cy="-55" r="1.9" fill="${p.dark}"/>`
    + (ears === 'cat' ? `<path d="M-6-47H-16M-6-45L-15-42M6-47H16M6-45L15-42" stroke="${p.dark}" stroke-width=".7"/>` : '')
    + `<path d="M0-37L-8-41V-33ZM0-37L8-41V-33Z" fill="#B3122E"/><circle cy="-37" r="2" fill="#7E0B1F"/>`;
  const macaron = (x, y, c) => `<ellipse cx="${x}" cy="${y}" rx="13" ry="5" fill="${c}"/><rect x="${x - 12}" y="${y - 8}" width="24" height="4" rx="2" fill="#FFF4E4"/><ellipse cx="${x}" cy="${y - 9}" rx="13" ry="5.5" fill="${c}"/>`;
  const berry = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="7.5" fill="#C8102E"/><path d="M${x - 6} ${y}A6 7.5 0 0 1 ${x + 6} ${y}Z" fill="#4A2A1A"/>`
    + `<path d="M${x - 4} ${y - 3}l2 2l2-2l2 2" stroke="#F5EBDD" stroke-width=".9" fill="none"/>`;
  const GIFT_DRAW = {
    bear: p => plush(p, 'bear'),
    bunny: p => plush(p, 'bunny'),
    cat: p => plush(p, 'cat'),
    heartBox: () => `<path d="M0-6C-34-24-30-58-15-58C-6-58 0-51 0-44C0-51 6-58 15-58C30-58 34-24 0-6Z" fill="#B3122E" stroke="#6E0A1C" stroke-width="1.2"/>`
      + `<path d="M0-44V-8M-25-36H25" stroke="#E8C46A" stroke-width="3"/>`
      + `<ellipse cx="-6" cy="-47" rx="6" ry="3.5" fill="#E8C46A"/><ellipse cx="6" cy="-47" rx="6" ry="3.5" fill="#E8C46A"/><circle cy="-45" r="2.5" fill="#C9A13E"/>`,
    macarons: () => `<ellipse cy="-2" rx="27" ry="4.5" fill="#F3F1EC" stroke="#CFCAC0"/>`
      + macaron(-12, -7, '#F2A7BC') + macaron(12, -7, '#B9D79A') + macaron(0, -21, '#C8B2E6'),
    berries: () => [-12, 0, 12].map(x => berry(x, -31)).join('')
      + `<path d="M-28-24H28L24 0H-24Z" fill="#C8A276" stroke="#8E7145"/>`
      + [-18, -6, 6, 18].map(x => berry(x, -25)).join(''),
    bar: () => `<g transform="rotate(-8)"><rect x="-13" y="-58" width="26" height="56" rx="2" fill="#2F4B3C"/><rect x="-13" y="-58" width="26" height="10" rx="2" fill="#D9B45A"/>`
      + `<rect x="-9" y="-36" width="18" height="16" rx="2" fill="#F3EBDD"/><path d="M-6-30H6M-6-26H3" stroke="#2F4B3C" stroke-width="1.2"/></g>`,
  };
  const DRAW_TOP = {
    tulip: p => ring(6, a => `<ellipse cy="-9" rx="7.5" ry="12" transform="rotate(${a})" fill="${p.base}" stroke="${p.dark}" stroke-width="1"/>`)
      + ring(3, a => `<ellipse cy="-5" rx="5" ry="7.5" transform="rotate(${a + 60})" fill="${p.light}" stroke="${p.dark}" stroke-width="1"/>`)
      + `<circle r="3" fill="${p.dark}"/>`,
    lavender: () => ring(7, (a, i) => `<circle cy="-7" r="3.6" transform="rotate(${a})" fill="${i % 2 ? '#8F6CC9' : '#6E4CA8'}"/>`)
      + `<circle r="4" fill="#7A58B6"/>`,
    eucalyptus: () => ring(7, (a, i) => `<circle cy="-17" r="7" transform="rotate(${a})" fill="${i % 2 ? '#7C9C8C' : '#93B1A2'}"/>`)
      + ring(5, a => `<circle cy="-8" r="6" transform="rotate(${a + 36})" fill="#86A696"/>`) + `<circle r="4" fill="#93B1A2"/>`,
    gypsophila: () => {
      const r = rng(11); let s = '';
      for (let i = 0; i < 30; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 21; s += `<circle cx="${(Math.cos(a) * d).toFixed(1)}" cy="${(Math.sin(a) * d).toFixed(1)}" r="${(1.6 + r() * 1.3).toFixed(1)}" fill="#FFFFFF" stroke="#CFCBC0" stroke-width=".5"/>`; }
      return s;
    },
  };
  root.ART = {rng, ring, DRAW, DRAW_TOP, ATTACH, DIRECTIONAL, GIFT_DRAW};
})(typeof window !== 'undefined' ? window : globalThis);
