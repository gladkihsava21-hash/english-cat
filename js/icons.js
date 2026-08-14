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
  matching:   '<path d="M4 8h6M14 8h6M4 16h6M14 16h6"/><circle cx="12" cy="8" r="2"/><circle cx="12" cy="16" r="2"/>',
  mcq:        '<path d="M4 7l2 2 4-4"/><path d="M4 17l2 2 4-4"/><path d="M14 8h6M14 17h6"/>',
  spelling:   '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/>',
  fillblank:  '<path d="M4 12h4M16 12h4"/><path d="M10 8v8M14 8v8"/><path d="M10 12h4" stroke-dasharray="2 2"/>',
  oddone:     '<circle cx="7" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><circle cx="7" cy="17" r="3"/><path d="M14 14l6 6M20 14l-6 6"/>',
  scramble:   '<rect x="3" y="9" width="6" height="6" rx="1"/><rect x="15" y="9" width="6" height="6" rx="1"/><path d="M9 12h6" stroke-dasharray="2 2"/><path d="M12 5v2M12 17v2"/>',
  defmatch:   '<path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-7a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h7z"/>',
  listening:  '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  dictation:  '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="4" height="6" rx="2"/><rect x="18" y="14" width="4" height="6" rx="2"/>',
  context:    '<path d="M4 6h16M4 11h10M4 16h13"/><circle cx="18" cy="16" r="3"/>',
  synonyms:   '<path d="M7 7l-3 3 3 3"/><path d="M4 10h9a4 4 0 0 1 0 8h-2"/><path d="M17 4l3 3-3 3"/>',
  translate:  '<path d="M3 6h9M7.5 6v-2M9.5 6c0 4-3 7-6.5 8"/><path d="M5 10c1.5 2.5 3.5 4 6 5"/><path d="M13 20l4-9 4 9M14.5 17h5"/>',
  personal:   '<path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13 7l4 4"/>',
  blitz:      '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  collocations: '<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/>',
  categories: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  wordsearch: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  crossword:  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M3 9h18"/>',

  // ---------- интерфейс ----------
  sound:      '<path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>',
  mic:        '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
  settings:   '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M22 12h-3M5 12H2M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6"/>',
  send:       '<path d="M4 12l16-8-6 8 6 8z"/>',
  camera:     '<path d="M3 8h3l2-3h8l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  streak:     '<path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3 2-5 1 2 2 2 3 1 0-2 0-3 0-5z"/>',
  star:       '<path d="M12 3l2.6 5.6 6.1.8-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.4l6.1-.8z"/>',
  medal:      '<circle cx="12" cy="14" r="6"/><path d="M8 3l2 6M16 3l-2 6"/>',
  paw:        '<ellipse cx="8" cy="8" rx="2" ry="2.6"/><ellipse cx="16" cy="8" rx="2" ry="2.6"/><ellipse cx="5" cy="13" rx="1.8" ry="2.2"/><ellipse cx="19" cy="13" rx="1.8" ry="2.2"/><path d="M12 12c3 0 5 2.5 5 5s-2.2 3-5 3-5-1-5-3 2-5 5-5z"/>',
  lock:       '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  check:      '<path d="M4 12.5l5 5L20 6.5"/>',
  book:       '<path d="M4 4h6a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H4z"/><path d="M20 4h-6a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H20z"/>',
  chat:       '<path d="M20 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"/>',
  refresh:    '<path d="M20 11a8 8 0 1 0-1.5 5.5"/><path d="M20 5v6h-6"/>',
  trash:      '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  arrow:      '<path d="M5 12h13M12 6l6 6-6 6"/>',
  target:     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  clock:      '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  sparkle:    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
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

/** Подставляет иконки в элементы с data-icon. Идемпотентна. */
function paintIcons(root) {
  (root || document).querySelectorAll("[data-icon]").forEach(el => {
    if (el.querySelector("svg.ic")) return;
    const svg = icon(el.dataset.icon, Number(el.dataset.iconSize) || 24);
    if (svg) el.innerHTML = svg;
  });
}

document.addEventListener("DOMContentLoaded", () => paintIcons());
