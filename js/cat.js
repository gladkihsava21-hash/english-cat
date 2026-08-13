// Савелий как персонаж, а не эмодзи.
//
// Эмодзи нельзя обвести, повернуть и перекрасить, и на Android он выглядит
// другим шрифтом — то есть в стиле, который держится на обводке 1.5px и
// кремовой заливке, эмодзи не участвует вообще. Поэтому SVG.
//
// Позы подставляются по атрибуту data-cat: <div class="cat-avatar" data-cat="read">
// Без атрибута берётся "hello".

const CAT_POSES = {
  // смотрит на тебя — лендинг, приветствие
  hello: `
    <path class="c-ear" d="M32 48 L36 18 L58 36 Z"/>
    <path class="c-ear" d="M88 48 L84 18 L62 36 Z"/>
    <path class="c-ear-in" d="M38 44 L40 27 L52 38 Z"/>
    <path class="c-ear-in" d="M82 44 L80 27 L68 38 Z"/>
    <circle class="c-head" cx="60" cy="66" r="34"/>
    <circle class="c-eye" cx="48" cy="62" r="4.5"/>
    <circle class="c-eye" cx="72" cy="62" r="4.5"/>
    <path class="c-nose" d="M56 74 L64 74 L60 79 Z"/>
    <path class="c-line" d="M60 79 v4 M60 83 q-5 5 -9 1 M60 83 q5 5 9 1"/>
    <path class="c-line" d="M22 66 h14 M22 74 h14 M98 66 h-14 M98 74 h-14"/>`,

  // проверяет тетрадь — фото домашки, разбор
  read: `
    <path class="c-ear" d="M32 42 L36 12 L58 30 Z"/>
    <path class="c-ear" d="M88 42 L84 12 L62 30 Z"/>
    <path class="c-ear-in" d="M38 38 L40 21 L52 32 Z"/>
    <path class="c-ear-in" d="M82 38 L80 21 L68 32 Z"/>
    <circle class="c-head" cx="60" cy="60" r="34"/>
    <path class="c-line" d="M42 60 q6 6 12 0 M66 60 q6 6 12 0"/>
    <path class="c-nose" d="M56 70 L64 70 L60 75 Z"/>
    <path class="c-line" d="M60 75 v3"/>
    <rect class="c-book" x="30" y="90" width="60" height="26" rx="4"/>
    <path class="c-line" d="M60 90 v26 M38 99 h14 M38 107 h14 M68 99 h14 M68 107 h14"/>`,

  // спит — пустые состояния
  sleep: `
    <path class="c-ear" d="M32 48 L36 18 L58 36 Z"/>
    <path class="c-ear" d="M88 48 L84 18 L62 36 Z"/>
    <path class="c-ear-in" d="M38 44 L40 27 L52 38 Z"/>
    <path class="c-ear-in" d="M82 44 L80 27 L68 38 Z"/>
    <circle class="c-head" cx="60" cy="66" r="34"/>
    <path class="c-line" d="M41 62 q7 7 14 0 M65 62 q7 7 14 0"/>
    <path class="c-nose" d="M56 76 L64 76 L60 81 Z"/>
    <path class="c-line" d="M22 66 h14 M22 74 h14 M98 66 h-14 M98 74 h-14"/>
    <text class="c-z" x="92" y="30">z</text>
    <text class="c-z c-z-sm" x="104" y="18">z</text>`,

  // радуется — серия, награда, ноль ошибок
  happy: `
    <path class="c-ear" d="M32 46 L36 14 L58 34 Z"/>
    <path class="c-ear" d="M88 46 L84 14 L62 34 Z"/>
    <path class="c-ear-in" d="M38 42 L40 24 L52 36 Z"/>
    <path class="c-ear-in" d="M82 42 L80 24 L68 36 Z"/>
    <circle class="c-head" cx="60" cy="66" r="34"/>
    <path class="c-line" d="M41 64 q7 -8 14 0 M65 64 q7 -8 14 0"/>
    <path class="c-nose" d="M56 74 L64 74 L60 79 Z"/>
    <path class="c-line" d="M48 84 q12 10 24 0"/>
    <path class="c-line" d="M22 66 h14 M22 74 h14 M98 66 h-14 M98 74 h-14"/>`,

  // удивлён — ошибка, чего-то не хватает
  oops: `
    <path class="c-ear" d="M32 48 L36 18 L58 36 Z"/>
    <path class="c-ear" d="M88 48 L84 18 L62 36 Z"/>
    <path class="c-ear-in" d="M38 44 L40 27 L52 38 Z"/>
    <path class="c-ear-in" d="M82 44 L80 27 L68 38 Z"/>
    <circle class="c-head" cx="60" cy="66" r="34"/>
    <circle class="c-eye" cx="48" cy="62" r="6"/>
    <circle class="c-eye" cx="72" cy="62" r="6"/>
    <ellipse class="c-mouth" cx="60" cy="82" rx="6" ry="7"/>
    <path class="c-nose" d="M56 73 L64 73 L60 77 Z"/>
    <path class="c-line" d="M22 66 h14 M22 74 h14 M98 66 h-14 M98 74 h-14"/>`,
};

function catSvg(pose) {
  const body = CAT_POSES[pose] || CAT_POSES.hello;
  return `<svg viewBox="0 0 120 120" class="cat-svg" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Заменяет эмодзи в .cat-avatar на персонажа. Вызывается после отрисовки
 *  любого экрана — идемпотентна, повторный вызов ничего не ломает. */
function paintCats(root) {
  (root || document).querySelectorAll(".cat-avatar").forEach(el => {
    if (el.querySelector("svg")) return;          // уже нарисован
    el.innerHTML = catSvg(el.dataset.cat);
    el.setAttribute("aria-hidden", "true");       // декор, скринридеру не нужен
  });
}

document.addEventListener("DOMContentLoaded", () => paintCats());
