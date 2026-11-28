/* «Показать вживую»: dialog that queues AI photos (one per configured model) and polls until each is ready. Browser only. */

const REALISTIC_ENDPOINT = 'api/realistic';
const REALISTIC_NOTE = 'Изображение создано ИИ — реальный букет может немного отличаться';
const REALISTIC_OFFLINE = 'Нет связи, попробуйте ещё раз';
const REALISTIC_SLOW = 'Генерация заняла слишком много времени, попробуйте ещё раз';
const POLL_INTERVAL_MS = 3000;
const POLL_DEADLINE_MS = 3 * 60 * 1000;

const realisticEscape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const realisticSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function realisticJson(resp) {
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || REALISTIC_OFFLINE);
  return data;
}

/* Resolves with {image, mime}; rejects with a user-facing message. */
async function pollRealisticJob(job, isCancelled) {
  const started = Date.now();
  while (Date.now() - started < POLL_DEADLINE_MS) {
    await realisticSleep(POLL_INTERVAL_MS);
    if (isCancelled()) throw new Error('cancelled');
    const data = await realisticJson(await fetch(`${REALISTIC_ENDPOINT}?job=${encodeURIComponent(job)}`));
    if (data.status === 'done') return data;
  }
  throw new Error(REALISTIC_SLOW);
}

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
  let run = 0; /* bumps on every generation and on close, so stale polls stop */

  const syncTriggers = () => triggers.forEach(b => { b.disabled = busy || !enabled; });
  const setActions = ({ canRetry, done }) => {
    q('[data-act="again"]').hidden = !done;
    q('[data-act="retry"]').hidden = !canRetry;
    q('[data-act="order"]').hidden = !done;
    actions.hidden = !(done || canRetry);
  };

  const waitingCard = label => `<figure class="real-card"><div class="real-wait"><span class="spinner" aria-hidden="true"></span>`
    + `<p>Создаём фото…<small>обычно 40–120 секунд</small></p></div><figcaption>${realisticEscape(label)}</figcaption></figure>`;
  const photoCard = (label, p) => {
    const mime = /^image\/(png|jpeg|webp)$/.test(p.mime) ? p.mime : 'image/jpeg';
    return `<figure class="real-card"><img class="real-photo" alt="Реалистичное фото букета — ${realisticEscape(label)}" src="data:${mime};base64,${p.image}">`
      + `<figcaption>${realisticEscape(label)}</figcaption></figure>`;
  };
  const errorCard = (label, message) => `<figure class="real-card"><p class="real-error" role="alert">${realisticEscape(message)}</p>`
    + `<figcaption>${realisticEscape(label)}</figcaption></figure>`;

  async function generate() {
    if (busy) return;
    const myRun = ++run;
    const cancelled = () => myRun !== run;
    busy = true;
    syncTriggers();
    setActions({ canRetry: false, done: false });
    body.innerHTML = `<div class="real-grid">${waitingCard('')}</div>`;
    try {
      if (!snapshot) { snapshot = await svgToPngBase64(stage); snapshotComp = getComposition(); }
      const { jobs } = await realisticJson(await fetch(REALISTIC_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: snapshot, composition: snapshotComp }),
      }));
      if (cancelled()) return;
      body.innerHTML = `<div class="real-grid${jobs.length > 1 ? ' two' : ''}">${jobs.map(j => j.job ? waitingCard(j.label) : errorCard(j.label, j.error)).join('')}</div>`
        + `<p class="real-note">${REALISTIC_NOTE}</p>`;
      const cards = [...body.querySelectorAll('.real-card')];
      const outcomes = await Promise.all(jobs.map(async (j, i) => {
        if (!j.job) return false;
        try {
          const photo = await pollRealisticJob(j.job, cancelled);
          if (!cancelled()) cards[i].outerHTML = photoCard(j.label, photo);
          return true;
        } catch (err) {
          if (!cancelled()) cards[i].outerHTML = errorCard(j.label, err instanceof TypeError ? REALISTIC_OFFLINE : err.message);
          return false;
        }
      }));
      if (!cancelled()) setActions({ canRetry: !outcomes.some(Boolean), done: outcomes.some(Boolean) });
    } catch (err) {
      if (cancelled()) return;
      const message = err instanceof TypeError ? REALISTIC_OFFLINE : (err.message || REALISTIC_OFFLINE);
      body.innerHTML = `<p class="real-error" role="alert">${realisticEscape(message)}</p>`;
      setActions({ canRetry: true, done: false });
    } finally {
      if (!cancelled()) { busy = false; syncTriggers(); }
    }
  }

  function close() {
    run++; /* stop polling; already-queued jobs still finish (and are paid) on fal's side */
    busy = false;
    syncTriggers();
    dialog.close();
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
  q('[data-act="close"]').addEventListener('click', close);
  q('[data-act="order"]').addEventListener('click', () => { close(); onOrder(); });
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) close(); });

  return { setEnabled(value) { enabled = value; syncTriggers(); } };
}
