// Савелий. Рисунок — Twemoji (twemoji.maxcdn.com), лицензия CC-BY 4.0,
// атрибуция стоит в футере. Своя рисовка не получилась: уши разъезжались,
// силуэт был кривой — здесь профессиональная геометрия, а цвета переложены
// на переменные, поэтому кот живёт в общей палитре и сам темнеет ночью.
//
// ЧТО ИЗМЕНИЛОСЬ. Раньше поза была одной плоской строкой SVG: пять картинок,
// между собой не связанных (у «hello» и «sleep» была вообще другая голова —
// то есть другой кот). Двигать в такой картинке нечего: она цельная.
//
// Теперь кот собран из слоёв, и каждый слой можно шевелить отдельно:
//
//   .cat-tail  хвост            — качается сам по себе
//   .cat-head  голова целиком   — медленно поворачивается, оживает от событий
//     .cat-ear  ×2              — дёргаются поодиночке
//     .cat-face                 — единственный слой, который меняется от позы
//        .cat-gaze → .cat-eye   — моргание и взгляд по сторонам
//   .cat-paw   лапа             — машет в позе wave
//   .cat-zzz   «Z-z-z»          — только когда спит
//   .cat-pop   зелёная вспышка  — награда и серия верных ответов
//
// Голова одна на все позы: уши вынуты из силуэта черепа и лежат ОТДЕЛЬНЫМИ
// фигурами ПОД ним (нижний край уха уходит внутрь черепа), поэтому при
// повороте уха стык не расходится.
//
// Позы: <div class="cat-avatar" data-cat="happy"></div>
//   hello · wave · happy · cheer · love · wink · think · sad · sleep · proud
// Старые имена (hello, happy, love, wink, sleep) продолжают работать.
//
// Движение живёт в css/cat.css, здесь — только геометрия и «режиссёр
// простоя»: редкие моргания и подёргивания уха у котов, которые сейчас
// на экране. Всё вместе выключается при prefers-reduced-motion.

/* ======================= ЧАСТИ ======================= */

const CAT_ART = {
  // Зелёная вспышка за головой. Радиус подобран так, чтобы даже
  // раздутая до 1.15 она не вылезла за пределы бокса 36×36.
  pop: '<circle class="cat-pop" cx="18" cy="20" r="15.5" fill="var(--accent-fill)"/>',

  // Хвост выходит из-за головы справа снизу и загибается вверх.
  // Кончик чуть выходит за viewBox — у .cat-avatar svg overflow: visible.
  tail: '<g class="cat-tail">'
      + '<path d="M26.5 32.6C30.4 35.6 34.6 34.8 35.4 30.6 36 27.2 34.2 25 32.2 25.2" '
      +   'fill="none" stroke="var(--cat-fur)" stroke-width="3.4" stroke-linecap="round"/>'
      + '<path d="M31.3 34.2C33.6 34 35 32.7 35.3 30.8" '
      +   'fill="none" stroke="var(--cat-fur-dark)" stroke-width="1.1" '
      +   'stroke-linecap="round" opacity=".55"/>'
      + '</g>',

  // Череп без ушей: верх заменён ровным куполом между основаниями ушей.
  // Остальной контур — исходный твемодзи.
  skull: '<path class="cat-skull" fill="var(--cat-fur)" d="'
       + 'M35.734 19.929C35.375 16.66 35 15 34 13'
       + 'C33.2 6.6 26.6 3 18 3C9.4 3 2.8 6.6 2 13'
       + 'C1 15 .625 16.66.266 19.929-.129 23.513.657 26.37 1 27'
       + 'c.39.716 2.367 3.025 5 5 4 3 10 4 12 4s8-1 12-4'
       + 'c2.633-1.975 4.61-4.284 5-5 .343-.63 1.129-3.487.734-7.071z"/>',

  earL: '<g class="cat-ear cat-ear-l">'
      + '<path fill="var(--cat-fur)" d="M2 13C2 13-1 4 1 .3 1.674-.946 8.404 1.988 11 4'
      +   'c1.4 2.4 1.6 5.6.6 8.8C8.6 15.6 4.6 15.8 2 13z"/>'
      + '<path fill="var(--cat-fur-dark)" d="M2 3c.447-1.342 5.64 1 6.64 2C8.64 5 4 8 3 11c0 0-2-5-1-8z"/>'
      + '<path fill="var(--cat-fur)" d="M4.934 5.603C4.934 4.189 11 7 10 8s-2 1.603-3 2.603-2.066-4-2.066-5z"/>'
      + '</g>',

  earR: '<g class="cat-ear cat-ear-r">'
      + '<path fill="var(--cat-fur)" d="M34 13C34 13 37 4 35 .3 34.326-.946 27.596 1.988 25 4'
      +   'c-1.4 2.4-1.6 5.6-.6 8.8C27.4 15.6 31.4 15.8 34 13z"/>'
      + '<path fill="var(--cat-fur-dark)" d="M34 3c-.447-1.342-5.64 1-6.64 2 0 0 4.64 3 5.64 6 0 0 2-5 1-8z"/>'
      + '<path fill="var(--cat-fur)" d="M31.066 5.603C31.066 4.189 25 7 26 8s2 1.603 3 2.603 2.066-4 2.066-5z"/>'
      + '</g>',

  // Румянец. Цвет уже есть в палитре (--cat-tongue), новых не заводим:
  // это та же краска, что у носа, просто разбавленная прозрачностью.
  blush: '<g class="cat-blush">'
       + '<ellipse cx="7.6" cy="22.6" rx="3.1" ry="1.7" fill="var(--cat-tongue)"/>'
       + '<ellipse cx="28.4" cy="22.6" rx="3.1" ry="1.7" fill="var(--cat-tongue)"/>'
       + '</g>',

  whiskers: '<path class="cat-whiskers" fill="var(--cat-muzzle)" d="'
          + 'M.701 25c-.148 0-.294-.065-.393-.19-.171-.217-.134-.531.083-.702.162-.127 4.02-3.12 10.648-2.605.275.02.481.261.46.536-.021.275-.257.501-.537.46-6.233-.474-9.915 2.366-9.951 2.395-.093.071-.202.106-.31.106z'
          + 'm8.868-4.663c-.049 0-.1-.007-.149-.022-4.79-1.497-8.737-.347-8.777-.336-.265.081-.543-.07-.623-.335-.079-.265.071-.543.335-.622.173-.052 4.286-1.247 9.362.338.264.083.411.363.328.627-.066.213-.263.35-.476.35z'
          + 'M35.299 25c.148 0 .294-.065.393-.19.171-.217.134-.531-.083-.702-.162-.127-4.02-3.12-10.648-2.605-.275.02-.481.261-.46.536.021.275.257.501.537.46 6.233-.474 9.915 2.366 9.951 2.395.093.071.202.106.31.106z'
          + 'm-8.868-4.663c.049 0 .1-.007.149-.022 4.79-1.497 8.737-.347 8.777-.336.265.081.543-.07.623-.335.079-.265-.071-.543-.335-.622-.173-.052-4.286-1.247-9.362.338-.264.083-.411.363-.328.627.065.213.263.35.476.35z"/>',

  nose: '<path class="cat-nose" fill="var(--cat-tongue)" d="'
      + 'M18 19.5c3 0 3 .5 3 1.5s-1.5 3-3 3-3-2-3-3-.001-1.5 3-1.5z"/>',

  // Лапа: подушечка и три пальца. Видна только в позе wave.
  paw: '<g class="cat-paw">'
     + '<circle cx="5.6" cy="30.4" r="3.7" fill="var(--cat-fur)"/>'
     + '<circle cx="3.5" cy="28.2" r=".85" fill="var(--cat-muzzle)"/>'
     + '<circle cx="5.7" cy="27.2" r=".9" fill="var(--cat-muzzle)"/>'
     + '<circle cx="7.9" cy="28" r=".85" fill="var(--cat-muzzle)"/>'
     + '<ellipse cx="5.6" cy="30.9" rx="1.7" ry="1.4" fill="var(--cat-muzzle)"/>'
     + '</g>',

  // Три «Z» справа от головы, всплывают по очереди.
  zzz: '<g class="cat-zzz" fill="none" stroke="var(--cat-ink)" stroke-width="1.5" '
     +   'stroke-linecap="round" stroke-linejoin="round">'
     + '<path class="cat-z1" d="M32.6 20.6h4l-4 4.4h4"/>'
     + '<path class="cat-z2" d="M36.4 14.4h3.1l-3.1 3.4h3.1"/>'
     + '<path class="cat-z3" d="M39.4 9.4h2.4l-2.4 2.6h2.4"/>'
     + '</g>'
};

/* ======================= ГЛАЗА, БРОВИ, РОТ ======================= */
// Единственный слой, который переписывается при смене позы.

const EYE_L = 12.2, EYE_R = 23.8, EYE_Y = 15;

function catEyeOpen(cx) {
  return '<g class="cat-eye">'
       + `<ellipse cx="${cx}" cy="${EYE_Y}" rx="2.3" ry="3.8" fill="var(--cat-ink)"/>`
       // блик — то, из-за чего глаз перестаёт быть дыркой и начинает смотреть
       + `<circle cx="${cx + .95}" cy="${EYE_Y - 1.6}" r=".95" fill="var(--cat-eye)"/>`
       + `<circle cx="${cx - .8}" cy="${EYE_Y + 1.5}" r=".5" fill="var(--cat-eye)" opacity=".5"/>`
       + '</g>';
}
const line = (d, w) => `<path d="${d}" fill="none" stroke="var(--cat-ink)" `
                     + `stroke-width="${w || 1.9}" stroke-linecap="round" stroke-linejoin="round"/>`;

const CAT_EYES = {
  open:  '<g class="cat-eye-pair">' + catEyeOpen(EYE_L) + catEyeOpen(EYE_R) + '</g>',
  // ^ ^ — довольные зажмуренные
  arc:   '<g class="cat-eye-pair">'
       + line("M9.7 16.3Q12.2 12.1 14.7 16.3") + line("M21.3 16.3Q23.8 12.1 26.3 16.3")
       + '</g>',
  // спит: веки вниз
  shut:  '<g class="cat-eye-pair">'
       + line("M9.9 14.3Q12.2 17.5 14.5 14.3") + line("M21.5 14.3Q23.8 17.5 26.1 14.3")
       + '</g>',
  wink:  '<g class="cat-eye-pair">' + catEyeOpen(EYE_L)
       + line("M21.3 16.3Q23.8 12.1 26.3 16.3") + '</g>',
  heart: '<path class="cat-eye-pair" fill="var(--cat-tongue)" d="'
       + 'M16.226 5.117c-.859-2.431-3.525-3.707-5.956-2.85-1.477.52-2.521 1.711-2.928 3.104-1.191-.829-2.751-1.1-4.225-.58-2.431.857-3.708 3.525-2.85 5.956.122.345.284.663.472.958 1.951 3.582 7.588 6.1 11.002 6.131 2.637-2.167 5.445-7.664 4.717-11.677-.038-.349-.113-.698-.232-1.042z'
       + 'm3.548 0c.859-2.431 3.525-3.707 5.956-2.85 1.477.52 2.521 1.711 2.929 3.104 1.191-.829 2.751-1.1 4.225-.58 2.43.857 3.707 3.525 2.85 5.956-.123.345-.284.663-.473.958-1.951 3.582-7.588 6.1-11.002 6.131-2.637-2.167-5.445-7.664-4.717-11.677.038-.349.113-.698.232-1.042z"/>'
};

const CAT_BROWS = {
  none:  "",
  // одна бровь выше другой — «а вот это я сейчас обдумаю»
  think: line("M9.4 10.4Q11.9 9.5 14.3 10.1", 1.4) + line("M21.9 8.9Q24.2 7.6 26.5 8.8", 1.4),
  // домиком: внешние концы выше внутренних
  sad:   line("M9.2 9.2Q11.8 10.1 14.2 11.3", 1.4) + line("M26.8 9.2Q24.2 10.1 21.8 11.3", 1.4)
};

const CAT_MOUTH = {
  // «ω» — спокойная кошачья улыбка
  smile: line("M14.4 25.4Q16.5 27.9 18 25.7 19.5 27.9 21.6 25.4", 1.5),
  smirk: line("M14.8 25.7Q18.4 28.8 22 24.9", 1.5),
  frown: line("M14.6 27.7Q18 24.5 21.4 27.7", 1.5),
  squig: line("M14.9 26.3q1.55-1.4 3.1 0 1.55 1.4 3.1 0", 1.5),
  small: line("M16.3 25.9Q18 27.7 19.7 25.9", 1.5),
  // распахнутый рот с зубами — исходная твемодзи-геометрия
  open:  '<g class="cat-mouth-open">'
       + '<path fill="var(--cat-ink)" d="M28.023 24.191C27.046 24.383 23 26 18 26s-9.046-1.617-10.023-1.809C7 24 6.885 25.264 7.442 27.132 8 29 11 33 18 33s10-4 10.558-5.868c.557-1.868.442-3.132-.535-2.941z"/>'
       + '<ellipse cx="18" cy="30.9" rx="3.6" ry="2.1" fill="var(--cat-tongue)"/>'
       + '<path fill="var(--cat-eye)" d="M8 25s5 2 10 2 10-2 10-2-.5 3-1.5 3-1.5-1-1.5-1-4 2-7 2-7-2-7-2-.5 1-1.5 1S8 25 8 25z"/>'
       + '</g>'
};

/* ======================= ПОЗЫ ======================= */
// blink: можно ли моргать (у зажмуренных и сердечек — нельзя).

const CAT_POSES = {
  hello: { eyes: "open",  mouth: "smile", blink: true },
  wave:  { eyes: "open",  mouth: "smile", blink: true },
  happy: { eyes: "arc",   mouth: "open" },
  cheer: { eyes: "arc",   mouth: "open" },
  love:  { eyes: "heart", mouth: "open" },
  wink:  { eyes: "wink",  mouth: "smirk" },
  think: { eyes: "open",  mouth: "squig", brows: "think", blink: true },
  sad:   { eyes: "open",  mouth: "frown", brows: "sad",   blink: true },
  sleep: { eyes: "shut",  mouth: "small" },
  proud: { eyes: "arc",   mouth: "smirk" }
};

function catFace(pose) {
  const p = CAT_POSES[pose] || CAT_POSES.hello;
  return '<g class="cat-face">'
       + CAT_BROWS[p.brows || "none"]
       + '<g class="cat-gaze">' + CAT_EYES[p.eyes] + '</g>'
       + CAT_MOUTH[p.mouth]
       + '</g>';
}

function catSvg(pose) {
  const name = CAT_POSES[pose] ? pose : "hello";
  return `<svg viewBox="0 0 36 36" class="cat-svg pose-${name}" aria-hidden="true" focusable="false">`
       + CAT_ART.pop
       + CAT_ART.tail
       + '<g class="cat-head">'
       +   CAT_ART.earL + CAT_ART.earR + CAT_ART.skull
       +   CAT_ART.blush + CAT_ART.whiskers + CAT_ART.nose
       +   catFace(name)
       +   CAT_ART.paw
       + '</g>'
       + CAT_ART.zzz
       + '</svg>';
}

/* ======================= РИСОВАНИЕ ======================= */

/** Ставит персонажа вместо эмодзи. Идемпотентна — можно звать после любой
 *  перерисовки экрана, повторный вызов ничего не ломает. */
function paintCats(root) {
  (root || document).querySelectorAll(".cat-avatar").forEach(el => {
    if (!el.querySelector("svg")) {
      el.innerHTML = catSvg(el.dataset.cat);
      el.setAttribute("aria-hidden", "true");
    }
    catIdleWatch(el);
  });
}

/** Меняет позу, не перерисовывая всего кота: подменяется только лицо,
 *  поэтому качание головы и хвоста не сбрасывается на каждой эмоции. */
function setCatPose(el, pose) {
  if (!el) return;
  const svg = el.querySelector("svg");
  if (!svg) { el.dataset.cat = pose; paintCats(el.parentNode || el); return; }
  const name = CAT_POSES[pose] ? pose : "hello";
  if (el.dataset.cat === name) return;
  el.dataset.cat = name;
  svg.setAttribute("class", "cat-svg pose-" + name);
  const face = svg.querySelector(".cat-face");
  if (face) face.outerHTML = catFace(name);
}

/* ======================= РЕЖИССЁР ПРОСТОЯ ======================= */
// Кот должен быть живым, когда на него НЕ смотрят: редкое моргание с
// человеческим ритмом (иногда двойное), подёргивание одного уха, взгляд
// в сторону. Всё это нельзя описать одним CSS — там нет случайности,
// а ровно-периодическое моргание сразу читается как механизм.
//
// Цена вопроса: один setTimeout на кота, и только пока он в поле зрения
// и вкладка активна. Никакого requestAnimationFrame — считать нечего.

const CAT_MQ = matchMedia("(prefers-reduced-motion: reduce)");
const catLive = new Set();      // коты, за которыми сейчас следим
let catIO = null;

function catIdleWatch(el) {
  if (CAT_MQ.matches || !("IntersectionObserver" in window)) return;
  if (el.dataset.catIdle) return;
  el.dataset.catIdle = "1";
  catIO || (catIO = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? catIdleStart(e.target) : catIdleStop(e.target));
  }, { threshold: 0.2 }));
  catIO.observe(el);
}

function catIdleStart(el) {
  if (CAT_MQ.matches || document.hidden || el._catT) return;
  catLive.add(el);
  catIdlePlan(el, 900 + Math.random() * 2600);
}

function catIdleStop(el) {
  clearTimeout(el._catT);
  el._catT = 0;
  catLive.delete(el);
}

function catIdlePlan(el, ms) {
  clearTimeout(el._catT);
  el._catT = setTimeout(() => catIdleTick(el), ms);
}

function catIdleTick(el) {
  el._catT = 0;
  // Элемент могли снести вместе с перерисовкой экрана — тогда отпускаем.
  if (!el.isConnected) { catIdleStop(el); if (catIO) catIO.unobserve(el); return; }
  if (CAT_MQ.matches || document.hidden) { catIdleStop(el); return; }

  const pose = CAT_POSES[el.dataset.cat] || CAT_POSES.hello;
  const r = Math.random();
  let cls, hold, wait;

  if (pose.blink && r < 0.52)      { cls = "is-blink";  hold = 300;  wait = 2600; }
  else if (pose.blink && r < 0.66) { cls = "is-blink2"; hold = 620;  wait = 3400; }
  else if (r < 0.86)               { cls = "is-ear-" + (Math.random() < .5 ? "l" : "r");
                                     hold = 560;  wait = 3200; }
  else                             { cls = "is-look-" + (Math.random() < .5 ? "l" : "r");
                                     hold = 1500; wait = 2400; }

  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), hold);
  // Разброс большой намеренно: равные промежутки между морганиями глаз
  // считывает как тик метронома, а не как живое существо.
  catIdlePlan(el, wait + Math.random() * 4200);
}

// Вкладка ушла в фон — коты замирают: ни таймеров, ни перерисовки.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) catLive.forEach(el => { clearTimeout(el._catT); el._catT = 0; });
  else catLive.forEach(el => catIdlePlan(el, 400 + Math.random() * 2000));
});

// Пользователь включил «меньше движения» прямо сейчас — гасим всё.
CAT_MQ.addEventListener("change", e => {
  if (!e.matches) return;
  catLive.forEach(el => { clearTimeout(el._catT); el._catT = 0; });
  catLive.clear();
});

document.addEventListener("DOMContentLoaded", () => paintCats());
