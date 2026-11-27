const test = require('node:test');
const assert = require('node:assert/strict');
const { formatMoney, normalizePhone, orderMessage, whatsappUrl } = require('../js/order.js');

test('formatMoney groups thousands with a no-break space and adds tenge', () => {
  assert.equal(formatMoney(12100), '12 100 ₸');
  assert.equal(formatMoney(500), '500 ₸');
  assert.equal(formatMoney(0), '0 ₸');
  assert.equal(formatMoney(1234567, '₽'), '1 234 567 ₽');
});

test('normalizePhone accepts human formats of a Kazakh number', () => {
  assert.equal(normalizePhone('+7 701 123-45-67'), '77011234567');
  assert.equal(normalizePhone('8 (701) 123 45 67'), '77011234567');
  assert.equal(normalizePhone('77011234567'), '77011234567');
});

test('normalizePhone rejects empty and too short numbers', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone('+7 701 123'), null);
});

test('orderMessage lists lines, card text, total and link', () => {
  const text = orderMessage([
    { label: 'Роза красная × 11', sum: 12100 },
    { label: 'Лента: шалфей', sum: 0 },
    { label: 'Открытка с текстом', sum: 500, note: 'С днём рождения!' },
  ], { heading: 'Здравствуйте!', link: 'https://x.test/#b=abc' });
  assert.equal(text, [
    'Здравствуйте!',
    '• Роза красная × 11 — 12 100 ₸',
    '• Лента: шалфей',
    '• Открытка с текстом — 500 ₸\n  Текст: «С днём рождения!»',
    'Итого: 12 600 ₸',
    'Макет: https://x.test/#b=abc',
  ].join('\n'));
});

test('orderMessage for a gifts-only order has no wrap lines', () => {
  const text = orderMessage([{ label: 'Мишка, 25 см × 1', sum: 4990 }], {});
  assert.equal(text, 'Заказ:\n• Мишка, 25 см × 1 — 4 990 ₸\nИтого: 4 990 ₸');
});

test('orderMessage for an empty order', () => {
  assert.equal(orderMessage([], {}), 'Букет пока пустой');
});

test('whatsappUrl survives emoji, quotes, newlines, & # ?', () => {
  const text = 'Текст: «Люблю 💐 & ты?» #1\nвторая строка';
  const url = new URL(whatsappUrl('77011234567', text));
  assert.equal(url.origin + url.pathname, 'https://wa.me/77011234567');
  assert.equal(url.searchParams.get('text'), text);
});
