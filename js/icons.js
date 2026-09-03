// Монолинейные иконки интерфейса.
//
// Зачем: раньше здесь стояли системные эмодзи. Они рисуются шрифтом
// операционной системы — на Маке одни, на Windows и Android другие, всегда
// полноцветные и всегда ярче окружения. Двадцать карточек тренировок
// превращались в радугу поверх спокойного шалфея, и вся дисциплина палитры
// сгорала на одном экране.
//
// Правила набора:
//   — сетка 24×24, обводка 1.75, currentColor: иконка наследует цвет текста
//     и сама меняется вместе с темой;
//   — только контур, никаких заливок и цветных пятен;
//   — скруглённые концы и стыки — одна пластика с котом;
//   — рисуем предмет, а не метафору: «диктант» — наушники, а не абстракция.
//
// Картинки к СЛОВАМ (js/images.js) сюда не входят: там 418 эмодзи, и они
// помогают ребёнку запоминать слово. Это вопрос обучения, а не оформления.

const ICONS = {
  // ---------- упражнения ----------
  flashcards: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v11"/>',
  picture:    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M3 16l4.5-4 3.5 3 4-5 6 6"/>',
  matching:   '<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h10M7 18c4 0 6-4 10-4"/>',
  mcq:        '<path d="M4 7l2 2 4-4"/><path d="M4 17l2 2 4-4"/><path d="M14 8h6M14 17h6"/>',
  spelling:   '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
  oddone:     '<circle cx="7" cy="7" r="3.2"/><circle cx="17" cy="7" r="3.2"/><circle cx="7" cy="17" r="3.2"/><path d="M13.8 13.8l6.4 6.4M20.2 13.8l-6.4 6.4"/>',
  scramble:   '<rect x="2.5" y="8.5" width="7" height="7" rx="1.5"/><rect x="14.5" y="8.5" width="7" height="7" rx="1.5"/><path d="M12 4.5v3M12 16.5v3"/>',
  defmatch:   '<path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z"/>',
  listening:  '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  dictation:  '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="4" height="6" rx="2"/><rect x="18" y="14" width="4" height="6" rx="2"/>',
  context:    '<path d="M3 5h18M3 19h12"/><rect x="3" y="9.5" width="9" height="5.5" rx="1.5"/><path d="M14 12h7"/>',
  synonyms:   '<path d="M4 8h13M13 4l4 4-4 4"/><path d="M20 16H7M11 12l-4 4 4 4"/>',
  translate:  '<path d="M3 6h9M7.5 6v-2M9.5 6c0 4-3 7-6.5 8"/><path d="M5 10c1.5 2.5 3.5 4 6 5"/><path d="M13 20l4-9 4 9M14.5 17h5"/>',
  personal:   '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13 7l4 4"/>',
  blitz:      '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  collocations: '<circle cx="8.5" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/>',
  categories: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  wordsearch: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  crossword:  '<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="3" y="3" width="6" height="6" fill="currentColor" stroke="none"/><rect x="15" y="15" width="6" height="6" fill="currentColor" stroke="none"/><path d="M9 3v18M3 15h18"/>',

  // ---------- интерфейс ----------
  sound:      '<path d="M11 4L5 9H2v6h3l6 5z"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M18 6.5a8 8 0 0 1 0 11"/>',
  mic:        '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
  settings:   '<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.5M12 18v2.5M20.5 12H18M6 12H3.5M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6"/>',
  send:       '<path d="M20 12L4 4l6 8-6 8z"/>',   // остриё справа: было наоборот
  phone:      '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  camera:     '<path d="M3 8h3l2-3h8l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  streak:     '<path d="M12 2c4 5 6.5 7.5 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 11 7 9 8.5 6.5c1.5 2.5 2.5 2.5 3.5 1.5 0-2.5 0-3.5 0-6z"/>',
  star:       '<path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/>',
  medal:      '<circle cx="12" cy="14.5" r="6.5"/><path d="M7 3l2.5 6M17 3l-2.5 6"/><path d="M12 12l1 2 2 .3-1.5 1.4.4 2-1.9-1-1.9 1 .4-2L9 14.3l2-.3z"/>',
  paw:        '<ellipse cx="8.5" cy="7.5" rx="2.1" ry="2.7"/><ellipse cx="15.5" cy="7.5" rx="2.1" ry="2.7"/><ellipse cx="4.2" cy="12.5" rx="1.9" ry="2.4"/><ellipse cx="19.8" cy="12.5" rx="1.9" ry="2.4"/><path d="M12 12.5c3.2 0 5.4 2.6 5.4 5.2 0 2-2.4 3.3-5.4 3.3s-5.4-1.3-5.4-3.3c0-2.6 2.2-5.2 5.4-5.2z"/>',
  lock:       '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check:      '<path d="M3 12.5l6 6L21 5.5"/>',
  // Пара к check: «неверно» и закрытие панелей. Плечи короче, чем у галочки,
  // иначе в строке ответа крестик выглядит крупнее её при равном размере.
  cross:      '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>',
  // Глазок у поля пароля. Две формы: открытый и перечёркнутый — состояние
  // «сейчас видно» должно читаться формой, а не только цветом.
  eye:        '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/>'
            + '<circle cx="12" cy="12" r="2.8"/>',
  "eye-off":  '<path d="M4 4l16 16"/>'
            + '<path d="M9.6 5.2A10.9 10.9 0 0 1 12 5c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.8"/>'
            + '<path d="M6.4 7.3A17.2 17.2 0 0 0 2 11s3.6 6 10 6a10.8 10.8 0 0 0 3.9-.7"/>'
            + '<path d="M10.2 10.3a2.8 2.8 0 0 0 3.6 3.9"/>',
  book:       '<path d="M4 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z"/>',
  chat:       '<path d="M20 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"/>',
  refresh:    '<path d="M20 11a8 8 0 1 0-1.5 5.5"/><path d="M20 5v6h-6"/>',
  trash:      '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  arrow:      '<path d="M3 12h16M13 5l7 7-7 7"/>',
  target:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  sparkle:    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',

  // ---------- доска для урока ----------
  // Инструменты рисования. Раньше на доске стояли текстовые символы
  // (✎ ▬ ⌫ ▢), и они выглядели чужеродно: разная толщина, разный размер,
  // часть шрифтов рисует их иначе. Здесь тот же стиль, что у остальных.
  cursor:     '<path d="M5 3l14 8-6 1.6L10 19z"/>',
  pen:        '<path d="M4 20l4-1 9.5-9.5a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M14 6.5l3.5 3.5"/>',
  marker:     '<path d="M6 19h5l8-8a2.5 2.5 0 0 0-3.5-3.5l-8 8z" stroke-width="1.6"/><path d="M3 21h8" stroke-width="2.4"/>',
  eraser:     '<path d="M8 19H5l-2-2a1.6 1.6 0 0 1 0-2.3L13 4.5a1.6 1.6 0 0 1 2.3 0l4.2 4.2a1.6 1.6 0 0 1 0 2.3L11.5 19z"/><path d="M9.5 8L16 14.5"/>',
  note:       '<path d="M4.5 4h15v10.5L14 20H4.5z"/><path d="M19.5 14.5H14V20"/>',
  textTool:   '<path d="M5 6.5V5h14v1.5"/><path d="M12 5v14"/><path d="M9 19h6"/>',
  square:     '<rect x="4" y="5.5" width="16" height="13" rx="2"/>',
  circle:     '<ellipse cx="12" cy="12" rx="8" ry="6.5"/>',
  diagonal:   '<path d="M5 19L19 5"/><path d="M11 5h8v8"/>',
  undo:       '<path d="M4 9h9.5a5.5 5.5 0 0 1 0 11H8"/><path d="M8 4.5L3.5 9 8 13.5"/>',
  redo:       '<path d="M20 9h-9.5a5.5 5.5 0 0 0 0 11H16"/><path d="M16 4.5L20.5 9 16 13.5"/>',
  zoomIn:     '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M10.5 7.5v6M7.5 10.5h6"/>',
  zoomOut:    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M7.5 10.5h6"/>',
  fit:        '<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>',
  download:   '<path d="M12 3v12"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4 18v2h16v-2"/>',
  moon:       '<path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5z"/>',
  screen:     '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  words:      '<path d="M3 18l4-11 4 11"/><path d="M4.2 14.5h5.6"/><path d="M14 18l3.5-9 3.5 9"/><path d="M15 15.5h5"/>',
};

/** Возвращает SVG иконки. size — сторона квадрата в пикселях. */
function icon(name, size) {
  const body = ICONS[name];
  if (!body) return "";
  const s = size || 24;
  return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24"`
       + ` fill="none" stroke="currentColor" stroke-width="1.75"`
       + ` stroke-linecap="round" stroke-linejoin="round"`
       + ` aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Иконка внутри строки текста: «✓ в словаре», «+12 ⭐», подзаголовки.
 *  Голый icon() сюда не годится — у .ic стоит display:block, и значок
 *  уходит на собственную строку над текстом. Обёртка .ic-inline (её же
 *  ставит swapEmoji ниже) возвращает его в поток и сажает на базовую
 *  линию. Для контейнеров, где иконка одна и центрируется сама
 *  (кнопка-иконка, .nav-ico, .ex-icon), нужен обычный icon(). */
function iconInline(name, size) {
  const svg = icon(name, size || 16);
  return svg ? `<span class="ic-inline">${svg}</span>` : "";
}

/** Подставляет иконки в элементы с data-icon. Идемпотентна. */
function paintIcons(root) {
  (root || document).querySelectorAll("[data-icon]").forEach(el => {
    if (el.querySelector("svg.ic")) return;
    const svg = icon(el.dataset.icon, Number(el.dataset.iconSize) || 24);
    if (svg) el.innerHTML = svg;
  });
}

document.addEventListener("DOMContentLoaded", () => paintIcons());

/* ---------- Подмена эмодзи после отрисовки ----------
 * Интерфейсные эмодзи разбросаны по восьми файлам: часть в обычных строках,
 * часть внутри вложенных шаблонов. Править их по месту — 99 точечных замен,
 * и любая ошибка кавычек рвёт синтаксис (проверено на себе).
 * Поэтому одна точка входа: проходим по текстовым узлам и меняем известные
 * символы на иконки. Разметку не трогаем, JS не переписываем.
 *
 * Картинки к СЛОВАМ (.word-art) пропускаем: там 418 эмодзи, они помогают
 * ребёнку связать слово с образом — это обучение, а не оформление. */
const EMOJI_TO_ICON = {
  "🔊": "sound", "🔉": "sound", "🎤": "mic", "🎙️": "mic", "🎙": "mic",
  "⚙️": "settings", "⚙": "settings", "⭐": "star", "🌟": "star",
  "🔥": "streak", "⚡": "blitz", "🏆": "medal", "🥇": "medal", "🥈": "medal",
  "🥉": "medal", "🏅": "medal", "🐾": "paw", "📸": "camera", "📷": "camera",
  "🔍": "wordsearch", "📋": "book", "📚": "book", "📗": "book", "📘": "book",
  "✅": "check", "🎉": "sparkle", "✨": "sparkle", "📬": "chat", "💬": "chat",
  "🎯": "target", "🃏": "flashcards", "🗂️": "categories", "🔒": "lock",
};
const EMOJI_SRC = "(" + Object.keys(EMOJI_TO_ICON)
  .sort((a, b) => b.length - a.length)
  .map(e => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")";
// Две регулярки, а не одна: у глобальной .test() запоминает позицию
// в lastIndex, и каждый второй вызов возвращает ложь. На этом
// первая версия и потеряла восемь эмодзи из десяти.
const EMOJI_TEST = new RegExp(EMOJI_SRC);
const EMOJI_RE = new RegExp(EMOJI_SRC, "g");

const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "SVG"]);

// Своё экранирование, а не esc() из util.js: icons.js подключается
// раньше него, и полагаться на порядок загрузки в такой функции нельзя.
function escapeText(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function swapEmoji(root) {
  const start = root || document.body;
  if (!start) return;
  const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !EMOJI_TEST.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      // картинка к слову остаётся эмодзи — она помогает запоминать
      if (p.closest(".word-art, .cat-avatar")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const hits = [];
  while (walker.nextNode()) hits.push(walker.currentNode);

  hits.forEach(node => {
    EMOJI_RE.lastIndex = 0;
    // Экранируем ТЕКСТ, прежде чем собирать из него разметку.
    //
    // Здесь была дыра, и опасная: node.nodeValue — это уже РАЗОБРАННЫЙ
    // текст. Если сайт честно пропустил сообщение через esc(), браузер
    // при разборе вернул «&lt;img&gt;» обратно в «<img>», и в текстовом
    // узле лежат настоящие угловые скобки. Присваивая такую строку в
    // innerHTML ниже, мы разбирали её как разметку заново — то есть
    // сами отменяли экранирование.
    //
    // Воспроизводится: репетитор пишет ученикам сообщение
    // «Молодцы 🎉<img src=x onerror=...>» — эмодзи нужна, иначе узел
    // сюда не попадает, — и скрипт выполняется у КАЖДОГО ученика,
    // который откроет сообщение. Проверено: утекает
    // localStorage.savelyStudentToken, то есть доступ к его кабинету.
    //
    // Сама подмена эмодзи на значок разметку требует, поэтому просто
    // отказаться от innerHTML нельзя — экранируем всё, кроме неё.
    const html = escapeText(node.nodeValue).replace(EMOJI_RE, m => {
      const svg = icon(EMOJI_TO_ICON[m], 16);
      return svg ? `<span class="ic-inline">${svg}</span>` : m;
    });
    if (html === node.nodeValue) return;
    const span = document.createElement("span");
    span.innerHTML = html;
    node.parentNode.replaceChild(span, node);
  });
}

// После первой отрисовки и после каждой перерисовки экрана.
// MutationObserver сам себя не будит: подменённые узлы уже без эмодзи,
// и фильтр их отбрасывает на первом же шаге.
document.addEventListener("DOMContentLoaded", () => {
  swapEmoji();
  const app = document.getElementById("app") || document.body;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; swapEmoji(app); paintIcons(app); });
  }).observe(app, { childList: true, subtree: true });
});
