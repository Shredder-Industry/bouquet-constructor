/* Rasterizes the bouquet SVG into a PNG (base64, no data: prefix) for the realistic-photo request. Browser only. */

const SNAPSHOT_WIDTH = 512; /* FLUX.2 input tiles are 512×512; larger costs more neurons */
const SNAPSHOT_BG = '#ffffff';

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/* An SVG drawn into <canvas> via <img> cannot load external images, so every href becomes a data URL. */
async function inlineImages(svg) {
  const images = [...svg.querySelectorAll('image')];
  const sources = [...new Set(images.map(img => img.getAttribute('href')).filter(h => h && !h.startsWith('data:')))];
  const entries = await Promise.all(sources.map(async src => {
    const resp = await fetch(src);
    if (!resp.ok) throw new Error(`Не удалось загрузить ${src}`);
    return [src, await blobToDataUrl(await resp.blob())];
  }));
  const map = new Map(entries);
  images.forEach(img => { const h = img.getAttribute('href'); if (map.has(h)) img.setAttribute('href', map.get(h)); });
}

/* CSS custom properties do not resolve outside the page: substitute their current values. */
function resolveCssVars(markup) {
  const styles = getComputedStyle(document.documentElement);
  return markup.replace(/var\(--([\w-]+)\)/g, (m, name) => styles.getPropertyValue(`--${name}`).trim() || '#000');
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось отрисовать макет'));
    img.src = url;
  });
}

/**
 * @param {SVGSVGElement} svg
 * @param {number} [width]
 * @returns {Promise<string>} PNG as base64 without the data: prefix
 */
async function svgToPngBase64(svg, width = SNAPSHOT_WIDTH) {
  const [, , vbW, vbH] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const height = Math.round(width * vbH / vbW);
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.querySelectorAll('[stroke-dasharray]').forEach(el => el.remove()); /* selection ring */
  await inlineImages(clone);
  const markup = resolveCssVars(new XMLSerializer().serializeToString(clone));
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = SNAPSHOT_BG;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/png').split(',')[1];
}
