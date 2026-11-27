/* Order text and WhatsApp link helpers. Classic script: globals in the browser, module.exports in Node tests. */

const ORDER_GREETING = 'Здравствуйте! Хочу заказать букет из конструктора:';
const PHONE_MIN_DIGITS = 11;
const PHONE_MAX_DIGITS = 15;

function formatMoney(amount, currency = '₸') {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${grouped} ${currency}`;
}

/* Kazakh local format 8XXXXXXXXXX becomes international 7XXXXXXXXXX. */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  return digits.length >= PHONE_MIN_DIGITS && digits.length <= PHONE_MAX_DIGITS ? digits : null;
}

function orderMessage(lines, { currency = '₸', heading = 'Заказ:', link } = {}) {
  if (!lines.length) return 'Букет пока пустой';
  const money = n => formatMoney(n, currency);
  const items = lines.map(l => `• ${l.label}${l.sum > 0 ? ` — ${money(l.sum)}` : ''}${l.note ? `\n  Текст: «${l.note}»` : ''}`);
  const total = lines.reduce((sum, l) => sum + l.sum, 0);
  return [heading, ...items, `Итого: ${money(total)}`, ...(link ? [`Макет: ${link}`] : [])].join('\n');
}

function whatsappUrl(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

if (typeof module !== 'undefined') module.exports = { formatMoney, normalizePhone, orderMessage, whatsappUrl, ORDER_GREETING };
