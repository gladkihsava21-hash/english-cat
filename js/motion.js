// Слой движения: то, что нельзя выразить одним CSS.
//
// Ничего не рисует и не меняет разметку — только вешает классы, которые
// описаны в css/motion.css. Если файл не загрузится, сайт продолжит
// работать, просто без анимаций.

const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Появление при прокрутке ---------- */
// Один раз на блок: возврат к уже увиденному не должен его снова «показывать».
// rootMargin отрицательный снизу — блок проявляется, когда реально вошёл
// в поле зрения, а не когда край выглянул на пиксель.
let revealIO = null;

function watchReveal() {
  if (REDUCED || !("IntersectionObserver" in window)) return;

  const io = revealIO || (revealIO = new IntersectionObserver((entries, obs) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("m-in");
      obs.unobserve(e.target);          // больше не следим — работа сделана
    });
  }, { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }));

  const mark = (el, i) => {
    if (el.classList.contains("m-reveal")) return;
    el.classList.add("m-reveal");
    if (i < 4) el.classList.add("m-d" + (i + 1));   // лесенка внутри группы
    io.observe(el);
  };

  document.querySelectorAll(".dash-block, .site-footer, .section-head")
    .forEach((el, i) => mark(el, i));
  document.querySelectorAll(".stats-grid > *, .sticker-row > *, .pack-row > *")
    .forEach((el, i) => mark(el, i));
}

/* ---------- Смена экрана ---------- */
// show() из app.js переключает .hidden. Ловим момент, когда экран стал
// видимым, и проигрываем вход. Перехватывать саму функцию не хочу:
// она чужая и может смениться — наблюдаем за атрибутом.
function watchScreens() {
  if (REDUCED || !("MutationObserver" in window)) return;
  document.querySelectorAll(".screen").forEach(scr => {
    // Запоминаем прошлое состояние и реагируем ТОЛЬКО на переход
    // «скрыт → показан». Без этого наблюдатель будил сам себя: он же
    // и менял класс на наблюдаемом элементе — получалась бесконечная петля,
    // и вкладка вставала намертво.
    let wasHidden = scr.classList.contains("hidden");
    new MutationObserver(() => {
      const hidden = scr.classList.contains("hidden");
      if (hidden === wasHidden) return;   // класс сменился, но не видимость
      wasHidden = hidden;
      if (hidden) return;
      scr.classList.remove("m-enter");
      void scr.offsetWidth;               // перезапуск анимации без таймера
      scr.classList.add("m-enter");
    }).observe(scr, { attributes: true, attributeFilter: ["class"] });
  });
}

/* ---------- Реакция персонажа ---------- */
/** Показывает эмоцию кота: 'happy' — верно, 'oops' — ошибка.
 *  Меняет и позу, если js/cat.js доступен. */
function catReact(mood) {
  if (REDUCED) return;
  const boxes = [...document.querySelectorAll(".cat-avatar")]
    .filter(el => el.getBoundingClientRect().width > 0);
  if (!boxes.length) return;
  const el = boxes[0];
  const cls = mood === "oops" ? "m-oops" : "m-happy";
  el.classList.remove("m-happy", "m-oops");
  void el.offsetWidth;
  el.classList.add(cls);
  el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
}

/* ---------- Числа набегают ---------- */
/** Считает от текущего значения к новому. Нужен, когда число выросло
 *  заметно: подмена 0 на 40 не читается как достижение. */
function countTo(el, to, ms) {
  if (!el) return;
  const from = parseInt(String(el.textContent).replace(/\D/g, ""), 10) || 0;
  if (REDUCED || from === to || Math.abs(to - from) < 2) { el.textContent = to; return; }
  const dur = ms || 600;
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    // та же кривая, что у CSS: движение согласовано с остальным интерфейсом
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- «Савелий думает» ---------- */
// Точки вместо статичного текста. Разметку подменяем только если её ещё нет.
function upgradeTyping() {
  const box = document.getElementById("chat-box");
  if (!box) return;
  new MutationObserver(() => {
    box.querySelectorAll(".msg-typing").forEach(el => {
      if (el.querySelector(".typing-dots")) return;
      el.innerHTML = '<span class="typing-dots" aria-hidden="true">'
                   + "<i></i><i></i><i></i></span>";
      el.setAttribute("aria-label", "Савелий печатает");
    });
  }).observe(box, { childList: true, subtree: true });
}

/* ---------- Ответ в упражнении ---------- */
// Классы .right/.wrong ставит exercises.js — ловим их и отзываемся котом.
function watchAnswers() {
  const stage = document.getElementById("exercise-body");
  if (!stage) return;
  // Только внутри упражнения и только по интересующим нас классам: раньше
  // наблюдатель висел на всём документе и просыпался на каждой смене класса,
  // включая те, что ставит этот же файл.
  let last = 0;
  new MutationObserver(muts => {
    if (performance.now() - last < 400) return;   // одна реакция на ответ
    for (const m of muts) {
      const t = m.target;
      if (!(t instanceof Element) || !t.classList.contains("mcq-option")) continue;
      if (t.classList.contains("wrong")) { last = performance.now(); catReact("oops"); return; }
      if (t.classList.contains("right")) { last = performance.now(); catReact("happy"); return; }
    }
  }).observe(stage, { attributes: true, subtree: true, attributeFilter: ["class"] });
}

document.addEventListener("DOMContentLoaded", () => {
  watchReveal();
  watchScreens();
  upgradeTyping();
  watchAnswers();
});

// Разделы дорисовываются после ответа сервера. Пересканируем редко и
// с одним общим наблюдателем: раньше каждый клик создавал новый, и они
// копились до конца сессии.
let rescanAt = 0;
document.addEventListener("click", () => {
  const now = performance.now();
  if (now - rescanAt < 1000) return;
  rescanAt = now;
  setTimeout(watchReveal, 300);
}, true);
