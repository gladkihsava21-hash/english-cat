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
