# Реалистичное фото букета (Gemini) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Кнопка «Показать вживую» превращает SVG-макет букета в фотореалистичный кадр через Gemini.

**Architecture:** Браузер растеризует `#stage` в PNG и шлёт его с составом букета на Vercel-функцию `api/realistic.js`. Функция валидирует вход, собирает промпт (общий модуль `js/realistic.js`, classic script + `module.exports`, как `js/order.js`) и вызывает Gemini REST `generateContent` с картинкой. Ответ показывается в модалке.

**Tech Stack:** Vanilla JS (classic scripts), `node --test`, Vercel Functions (Node 20, CommonJS), Gemini API REST.

**Spec:** `docs/superpowers/specs/2026-11-28-ai-real-photo-design.md`

## Global Constraints

- Ключ только в env `GEMINI_API_KEY` на сервере; в клиентском коде и в репо ключей нет.
- Модель — env `GEMINI_IMAGE_MODEL`, дефолт — актуальная Gemini image-модель (проверить id в доке Google при реализации).
- PNG в запросе ≤ 2 000 000 байт (после декодирования base64); иначе 413.
- Лимит: 10 запросов в 10 минут на IP (in-memory, best-effort); сверх — 429.
- Подпись под фото дословно: «Изображение создано ИИ — реальный букет может немного отличаться».
- Ошибки для пользователя на русском, без деталей от Gemini; детали — в `console.error` на сервере.
- Иммутабельность состояния, как в `js/app.js` (`state = {...state, ...}`).

## Review Focus

- Пустой букет (0 стеблей) → кнопка неактивна; сервер на пустой состав отвечает 400. (Task 1 тест)
- Gemini вернул ответ без картинки (отказ/safety) → 502 и сообщение «Не получилось создать фото, попробуйте ещё раз». (Task 2 тест)
- Повторный клик во время генерации → второй запрос не уходит. (Task 3, ручная проверка: кнопка `disabled` пока идёт запрос)
- Непредусмотренные id цветов/упаковки или не-PNG данные → 400. (Task 1 тест)
- Нет `GEMINI_API_KEY` → 500 с общим сообщением, без падения функции. (Task 2 тест)

---

### Task 1: Общий модуль состава, промпта и валидации

**Files:**
- Create: `js/realistic.js`
- Test: `tests/realistic.test.js`

**Interfaces:**
- Produces:
  - `composition(stems: {kind:string}[], kinds: Record<id,{name}>, wrapName: string|null, ribbonName: string|null) -> {flowers: {name:string,count:number}[], wrap: string|null, ribbon: string|null}` — группирует по `kind`, порядок первого появления.
  - `buildPrompt(comp) -> string` — по-английски; содержит каждое `"<count> × <name>"`, упаковку/ленту или «no wrapping», и фразы «keep the exact arrangement and colors», «photorealistic studio photo», «plain light background».
  - `validateRequest(body) -> {ok:true, png:Buffer, comp} | {ok:false, status:number, error:string}`; `body = {image: string /*base64 без data:-префикса*/, composition: comp}`.
  - Константы `MAX_PNG_BYTES = 2_000_000`, `MAX_STEMS = 200`.

- [ ] **Step 1: Write the failing tests** (`tests/realistic.test.js`)
  - `composition groups stems by kind with counts` — 3× rose_red + 1× eucalyptus → `[{name:'Роза красная',count:3},{name:'Эвкалипт',count:1}]`.
  - `buildPrompt lists every flower and the wrap` — `includes('3 × Роза красная')`, `includes('крафт')` для wrap `'Крафт'` (регистр как передан), `includes('keep the exact arrangement')`.
  - `buildPrompt says no wrapping when wrap is null`.
  - `validateRequest rejects empty composition` → `{ok:false,status:400}`.
  - `validateRequest rejects non-PNG bytes` (base64 от `'hello'`) → 400.
  - `validateRequest rejects oversized image` (буфер PNG-сигнатура + 2 000 001 байт) → 413.
  - `validateRequest rejects count <=0, non-integer, or total > MAX_STEMS` → 400.
  - `validateRequest accepts a valid PNG and composition` → `ok:true`, `png` — Buffer.
- [ ] **Step 2:** `npm test` → FAIL (`Cannot find module '../js/realistic.js'`).
- [ ] **Step 3:** Реализовать в `js/realistic.js`. PNG-проверка — первые 8 байт `89 50 4E 47 0D 0A 1A 0A`. Имена цветов/упаковки — строки ≤ 60 символов (защита промпта). В конце: `if (typeof module !== 'undefined') module.exports = {...}`. Подключить `<script src="js/realistic.js">` в `index.html` перед `js/app.js`.
- [ ] **Step 4:** `npm test` → PASS всех тестов.
- [ ] **Step 5:** `git add js/realistic.js tests/realistic.test.js index.html && git commit -m "feat: composition, prompt and validation for realistic photo"`

### Task 2: Vercel-функция `api/realistic.js`

**Files:**
- Create: `api/realistic.js`, `.env.example`, `tests/api-realistic.test.js`
- Modify: `.gitignore` (`.env*.local`, `.vercel`), `.claude/launch.json` (конфиг `vercel` → `npx vercel dev --listen 3000`, port 3000), `README.md` (раздел «Фото вживую»: env, `vercel dev`)

**Interfaces:**
- Consumes: `validateRequest`, `buildPrompt` из Task 1.
- Produces: `POST /api/realistic` → `200 {image: string /*base64*/, mime: string}` | `{error: string}` со статусом 400/405/413/429/500/502. Экспорт для тестов: `module.exports = handler; module.exports.createHandler = ({fetchImpl, env, now}) => handler`.

- [ ] **Step 1: Write the failing tests** — хендлер с подменённым `fetchImpl` и фейковыми `req/res` (`res.status(n).json(obj)`):
  - `returns 405 for GET`.
  - `returns 500 with generic message when GEMINI_API_KEY is missing` (fetch не вызывается).
  - `returns 400 for invalid body` (из validateRequest).
  - `returns image from Gemini inlineData` — fetch отдаёт `{candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:'QUJD'}}]}}]}` → `200 {image:'QUJD',mime:'image/png'}`; проверить, что тело запроса содержит `inlineData` с картинкой клиента и `text` с промптом, а ключ передан заголовком `x-goog-api-key`, не в URL.
  - `returns 502 when Gemini answers without an image` — parts только с `text`.
  - `returns 502 when Gemini responds non-2xx`.
  - `returns 429 on the 11th request from one IP within 10 minutes` (IP из `x-forwarded-for`, первый адрес; `now` подменяется).
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Реализовать. URL: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`; тело: `contents:[{parts:[{text:prompt},{inlineData:{mimeType:'image/png',data}}]}]`, `generationConfig:{responseModalities:['IMAGE']}` (сверить с текущей докой). Таймаут 60 с через `AbortController` → 502. `.env.example`: `GEMINI_API_KEY=` и `GEMINI_IMAGE_MODEL=`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git add api .env.example tests/api-realistic.test.js .gitignore .claude/launch.json README.md && git commit -m "feat: serverless endpoint generating realistic bouquet photo via Gemini"`

### Task 3: Снимок сцены и модалка в UI

**Files:**
- Create: `js/snapshot.js`
- Modify: `index.html` (кнопка `#realBtn` в тулбаре сцены рядом с `#shuffle`, кнопка `#realBtnOrder` в `.order-actions`, `<dialog id="realDialog">`), `js/app.js` (обработчики, `disabled` при пустом букете), `css/app.css` (стили модалки в существующих токенах)

**Interfaces:**
- Consumes: `composition` из Task 1; `POST /api/realistic` из Task 2.
- Produces: `svgToPngBase64(svg: SVGSVGElement, width = 1024) -> Promise<string>` (base64 без префикса) в `js/snapshot.js`.

- [ ] **Step 1:** `svgToPngBase64`: клонировать SVG, заинлайнить `<image href>` в data-URL (fetch → blob → FileReader), сериализовать, нарисовать на `<canvas>` с белым фоном, `toDataURL('image/png')`. Высота — по `viewBox` 400×510.
- [ ] **Step 2:** UI-поток: клик → `realDialog.showModal()` со спиннером и текстом «Создаём фото…», обе кнопки `disabled` → запрос → `<img>` + подпись (Global Constraints) + кнопки «Ещё вариант» (повтор с тем же снимком) и «Заказать» (закрывает модалку, ведёт к существующему `#toOrder`/`#wa`). Ошибка → текст из `error` ответа или «Нет связи, попробуйте ещё раз» + «Повторить».
- [ ] **Step 3: Проверка в браузере.** `.env.local` с ключом (заводит пользователь), `preview_start` конфиг `vercel`. Собрать букет из 3+ видов → «Показать вживую» → фото появилось, цвета совпадают; пустой букет → кнопка неактивна; двойной клик → один запрос в network; консоль без ошибок; мобильная ширина 375 — модалка влезает.
- [ ] **Step 4:** `npm test` → всё зелёное.
- [ ] **Step 5:** `git add js/snapshot.js js/app.js index.html css/app.css && git commit -m "feat: show realistic AI photo of the assembled bouquet"`
