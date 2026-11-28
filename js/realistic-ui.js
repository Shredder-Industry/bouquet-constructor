/* «Показать вживую»: dialog that requests and shows the AI photo of the bouquet. Browser only. */

const REALISTIC_ENDPOINT = 'api/realistic';
const REALISTIC_NOTE = 'Изображение создано ИИ — реальный букет может немного отличаться';
const REALISTIC_OFFLINE = 'Нет связи, попробуйте ещё раз';

/**
 * @param {{dialog: HTMLDialogElement, triggers: HTMLButtonElement[], stage: SVGSVGElement,
 *          getComposition: () => object, onOrder: () => void}} opts
 * @returns {{setEnabled: (enabled: boolean) => void}}
 */
function initRealisticPhoto({ dialog, triggers, stage, getComposition, onOrder }) {
  const q = sel => dialog.querySelector(sel);
  const body = q('.real-body');
  const actions = q('.real-actions');
  let busy = false;
  let enabled = true;
  let snapshot = null;
  let snapshotComp = null;

  const syncTriggers = () => triggers.forEach(b => { b.disabled = busy || !enabled; });

  function show(html, { canRetry = false, done = false } = {}) {
    body.innerHTML = html;
    q('[data-act="again"]').hidden = !done;
    q('[data-act="retry"]').hidden = !canRetry;
    q('[data-act="order"]').hidden = !done;
    actions.hidden = !(done || canRetry);
  }

  const escapeText = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function generate() {
    if (busy) return;
    busy = true;
    syncTriggers();
    actions.querySelectorAll('button').forEach(b => { b.disabled = true; });
    show('<div class="real-wait"><span class="spinner" aria-hidden="true"></span><p>Создаём фото…<small>обычно 30–40 секунд</small></p></div>');
    try {
      if (!snapshot) { snapshot = await svgToPngBase64(stage); snapshotComp = getComposition(); }
      const resp = await fetch(REALISTIC_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: snapshot, composition: snapshotComp }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.image) throw new Error(data.error || REALISTIC_OFFLINE);
      const mime = /^image\/(png|jpeg|webp)$/.test(data.mime) ? data.mime : 'image/png';
      show(`<img class="real-photo" alt="Реалистичное фото собранного букета" src="data:${mime};base64,${data.image}"><p class="real-note">${REALISTIC_NOTE}</p>`, { done: true });
    } catch (err) {
      const message = err instanceof TypeError ? REALISTIC_OFFLINE : (err.message || REALISTIC_OFFLINE);
      show(`<p class="real-error" role="alert">${escapeText(message)}</p>`, { canRetry: true });
    } finally {
      busy = false;
      syncTriggers();
      actions.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }
  }

  function open() {
    if (busy || !enabled) return;
    snapshot = null;
    snapshotComp = null;
    if (!dialog.open) dialog.showModal();
    generate();
  }

  triggers.forEach(b => b.addEventListener('click', open));
  q('[data-act="again"]').addEventListener('click', generate);
  q('[data-act="retry"]').addEventListener('click', generate);
  q('[data-act="close"]').addEventListener('click', () => dialog.close());
  q('[data-act="order"]').addEventListener('click', () => { dialog.close(); onOrder(); });
  dialog.addEventListener('click', e => { if (e.target === dialog && !busy) dialog.close(); });

  return { setEnabled(value) { enabled = value; syncTriggers(); } };
}
