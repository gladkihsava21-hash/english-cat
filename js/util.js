// Общие утилиты для страницы ученика и панели репетитора.

/** Экранирование для вставки в HTML.
 * Имена учеников, слова словаря и заголовки домашки пишут люди —
 * без этого ученик, назвавшись «<img onerror=…>», выполнил бы свой код
 * в браузере репетитора и увёл его кабинет. */
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Безопасная подстановка в шаблонную строку: html`<b>${имя}</b>` */
function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? esc(values[i]) : ""), "");
}

/** Витрина без бэкенда (GitHub Pages и любая статика).
 * Там нет server.py, поэтому панель репетитора, домашка и синхронизация
 * работать не могут — сайт должен это честно объяснить, а не «зависать». */
const STATIC_HOSTS = ["github.io", "githubusercontent.com", "netlify.app", "vercel.app"];

function isStaticHost() {
  if (location.protocol === "file:") return true;
  return STATIC_HOSTS.some(h => location.hostname.endsWith(h));
}

/** Проверка живого API: один раз за загрузку страницы. */
let _apiAlivePromise = null;
function apiAlive() {
  if (isStaticHost()) return Promise.resolve(false);
  if (!_apiAlivePromise) {
    _apiAlivePromise = fetch("health", { method: "GET" })
      .then(r => r.ok)
      .catch(() => false);
  }
  return _apiAlivePromise;
}
