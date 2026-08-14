// Слой движения: то, что нельзя выразить одним CSS.
//
// Ничего не рисует и не меняет разметку страниц — только вешает классы,
// которые описаны в css/motion.css и css/cat.css. Единственное исключение —
// кот-сосед в упражнении и кот в плашке награды: их вставляет этот файл,
// потому что в index.html их нет, а руками добавлять персонажа в чужую
// вымеренную вёрстку упражнения нельзя. Если файл не загрузится, сайт
// продолжит работать — просто без анимаций и без кота рядом.

const MOTION_MQ = matchMedia("(prefers-reduced-motion: reduce)");
// Для того, что настраивается один раз при загрузке (наблюдатели прокрутки).
const REDUCED = MOTION_MQ.matches;
// Для реакций проверяем ЖИВОЕ значение: настройку могут включить прямо
// сейчас, и кот обязан замолчать сразу, а не после перезагрузки.
const noMotion = () => MOTION_MQ.matches;

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

/* ==========================================================================
   ПЕРСОНАЖ
   ========================================================================== */

/* ---------- Что кот говорит ----------
   Реплик мало и они короткие намеренно: это подпись под движением, а не
   диалог. Тексты здесь одним списком — их правит копирайтер, не я. */
const CAT_SAY = {
  oops:   ["бывает", "мур… ещё разок", "запомним это", "не страшно"],
  streak: { 3: "три подряд!", 5: "пять! мур", 10: "десять подряд, я в шоке" },
  wake:   "мяу? я не спал",
  award:  "вот это да!"
};

/* ---------- Кому играть реакцию ----------
   Раньше брался первый .cat-avatar в документе — а это кот в шапке
   размером 28px. Ученик отвечал неверно, реагировала иконка возле
   логотипа, и со стороны выглядело, будто кот не реагирует вообще.
   Теперь берём того, кто реально на экране и крупнее всех. */
function catTarget() {
  const coach = document.getElementById("savely-coach");
  if (coach && coach.classList.contains("on")) return coach.querySelector(".cat-avatar");
  let best = null, w = 0;
  document.querySelectorAll(".cat-avatar").forEach(el => {
    if (el.classList.contains("brand-cat")) return;      // шапка не считается
    const r = el.getBoundingClientRect();
    if (r.width < 40) return;
    if (r.bottom < 0 || r.top > innerHeight) return;      // за пределами экрана
    if (r.width > w) { w = r.width; best = el; }
  });
  return best;
}

const MOOD_CLASSES = "m-happy m-cheer m-oops m-proud";
const CAT_MOODS = {
  happy: { pose: "happy", cls: "m-happy", hold: 1200 },
  cheer: { pose: "cheer", cls: "m-cheer", hold: 1800 },
  oops:  { pose: "sad",   cls: "m-oops",  hold: 1700 },
  proud: { pose: "proud", cls: "m-proud", hold: 2600 },
  think: { pose: "think", cls: "",        hold: 0 },
  wave:  { pose: "wave",  cls: "",        hold: 3200 }
};

/** Показывает эмоцию кота и возвращает его в исходную позу.
 *  Совместимость: catReact('happy') и catReact('oops') работают как раньше.
 *
 *  При «меньше движения» ПОЗА меняется, а прыжок и покачивание — нет.
 *  Выражение морды — это рисунок, а не движение: отнимать у такого ученика
 *  ещё и реакцию кота значит забирать не анимацию, а смысл. */
function catReact(mood, opts) {
  const o = opts || {};
  const el = o.el || catTarget();
  if (!el) return;
  const m = CAT_MOODS[mood] || CAT_MOODS.happy;

  // Поза, в которую надо вернуться, запоминается один раз: иначе после
  // второй эмоции подряд «исходной» становится предыдущая эмоция.
  if (!el.dataset.catBase) el.dataset.catBase = el.dataset.cat || "hello";

  if (typeof setCatPose === "function") setCatPose(el, m.pose);
  if (m.cls && !noMotion()) {
    el.classList.remove(...MOOD_CLASSES.split(" "));
    void el.offsetWidth;                 // перезапуск анимации без таймера
    el.classList.add(m.cls);
  }
  clearTimeout(el._catBack);
  if (!m.hold) return;
  el._catBack = setTimeout(() => {
    el.classList.remove(...MOOD_CLASSES.split(" "));
    if (typeof setCatPose === "function") setCatPose(el, el.dataset.catBase);
  }, o.hold || m.hold);
}

/* ---------- Реплика ---------- */
let sayAt = 0;
function savelySay(text, ms) {
  const box = document.getElementById("savely-say");
  if (!box) return;
  clearTimeout(box._t);
  if (!text) { box.classList.remove("on"); return; }
  // Не чаще раза в шесть секунд. Кот, который комментирует каждый ответ,
  // перестаёт быть персонажем и становится всплывающим окном.
  const now = performance.now();
  if (now - sayAt < 6000) return;
  sayAt = now;
  box.textContent = text;
  box.classList.add("on");
  box._t = setTimeout(() => box.classList.remove("on"), ms || 2600);
}

/* ---------- Кот-сосед в упражнении ----------
   Персонажа не было там, где ученик проводит всё время. Сажаем его в угол
   на время упражнения и карточек: он смотрит, отзывается на ответы и
   засыпает, если минуту ничего не происходит. Разметку страницы это
   не трогает — элемент фиксированный и не перехватывает нажатия. */
function coachCat() {
  const c = document.getElementById("savely-coach");
  return c ? c.querySelector(".cat-avatar") : null;
}

function watchCoach() {
  const screens = ["screen-exercise", "screen-trainer"]
    .map(id => document.getElementById(id)).filter(Boolean);
  // Кота не отменяет даже «меньше движения»: он просто сидит неподвижно.
  // Убрать персонажа целиком — это уже не про анимацию.
  if (!screens.length) return;

  const wrap = document.createElement("div");
  wrap.id = "savely-coach";
  wrap.className = "savely-coach";
  wrap.setAttribute("aria-hidden", "true");   // подпись озвучивает не он
  wrap.innerHTML = '<div class="savely-say" id="savely-say"></div>'
                 + '<div class="cat-avatar" data-cat="hello"></div>';
  document.body.appendChild(wrap);
  if (typeof paintCats === "function") paintCats(wrap);

  let was = false;
  const sync = () => {
    const on = screens.some(s => !s.classList.contains("hidden"));
    if (on === was) return;
    was = on;
    wrap.classList.toggle("on", on);
    savelySay("");
    if (on) {
      // Начинаем с чистого листа: иначе кот входит в новое упражнение
      // с миной от последней ошибки в предыдущем.
      const el = coachCat();
      if (el) {
        clearTimeout(el._catBack);
        el.classList.remove(...MOOD_CLASSES.split(" "));
        el.dataset.catBase = "hello";
        if (typeof setCatPose === "function") setCatPose(el, "hello");
      }
      catStreakReset();
      catNap();
    } else clearTimeout(sleepT);
  };
  screens.forEach(s => new MutationObserver(sync)
    .observe(s, { attributes: true, attributeFilter: ["class"] }));
  sync();
}

/* ---------- Спит, когда ничего не происходит ---------- */
let sleepT = 0;
const SLEEP_AFTER = 45000;      // меньше — и он засыпает, пока читают задание

function catNap() {
  clearTimeout(sleepT);
  sleepT = setTimeout(() => {
    const el = coachCat();
    const wrap = document.getElementById("savely-coach");
    if (!el || !wrap || !wrap.classList.contains("on")) return;
    el.dataset.catBase = "sleep";
    if (typeof setCatPose === "function") setCatPose(el, "sleep");
  }, SLEEP_AFTER);
}

function catAwake(silent) {
  const el = coachCat();
  if (!el) return;
  if (el.dataset.cat === "sleep") {
    el.dataset.catBase = "hello";
    if (typeof setCatPose === "function") setCatPose(el, "hello");
    if (!silent) savelySay(CAT_SAY.wake, 1800);
  }
  catNap();
}

/* ---------- Серия ответов ----------
   Имена с приставкой cat- намеренно: все файлы сайта — обычные скрипты
   в одной глобальной области, и короткое streak уже занято внутри
   exercises.js. На catSay мы на этом и обожглись: так называется отправка
   реплики в чат из app.js, и мой пузырь молча не работал. */
let catStreak = 0, catWrongs = 0;
function catStreakReset() { catStreak = 0; catWrongs = 0; }

function catAnswer(ok) {
  if (ok) {
    catStreak++;
    const milestone = CAT_SAY.streak[catStreak] || (catStreak > 10 && catStreak % 10 === 0
      ? CAT_SAY.streak[10] : null);
    if (milestone) { catReact("cheer"); savelySay(milestone); }
    else catReact("happy");
  } else {
    catStreak = 0;
    catWrongs++;
    catReact("oops");
    // Первая ошибка и дальше каждая третья: на двадцатой подряд утешение
    // раздражает сильнее самой ошибки.
    if (catWrongs === 1 || catWrongs % 3 === 0) {
      savelySay(CAT_SAY.oops[Math.floor(Math.random() * CAT_SAY.oops.length)]);
    }
  }
  catNap();
}

/* ---------- Ответ в упражнении ----------
   Классы ставит exercises.js — ловим их и отзываемся котом. Разбираем не
   один тип упражнения, а общие признаки: right/ok/done — верно,
   wrong/err/bad — ошибка. Так реагируют и варианты, и пары, и ввод
   с клавиатуры, и кроссворд, хотя классы у них разные. */
const OK_MARKS = ["right", "ok", "done"];
const BAD_MARKS = ["wrong", "err", "bad"];

function watchAnswers() {
  const stage = document.getElementById("exercise-body");
  if (!stage) return;
  let last = 0;
  new MutationObserver(muts => {
    if (performance.now() - last < 500) return;   // одна реакция на ответ
    let ok = false, bad = false;
    for (const m of muts) {
      const t = m.target;
      if (!(t instanceof Element) || !t.classList.length) continue;
      if (BAD_MARKS.some(c => t.classList.contains(c))) bad = true;
      else if (OK_MARKS.some(c => t.classList.contains(c))) ok = true;
    }
    // Ошибка важнее: при неверном ответе exercises.js подсвечивает ещё и
    // правильный вариант классом right, и без этого приоритета кот
    // радовался бы чужому правильному ответу.
    if (bad) { last = performance.now(); catAnswer(false); }
    else if (ok) { last = performance.now(); catAnswer(true); }
  }).observe(stage, { attributes: true, subtree: true, attributeFilter: ["class"] });
}

/* ---------- Награда ----------
   Плашку создаёт achievements.js прямо в body. Ловим её появление,
   ставим в неё кота и заодно поднимаем настроение тому коту,
   который сейчас на экране. */
function watchAwards() {
  if (!("MutationObserver" in window)) return;
  new MutationObserver(muts => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (!(node instanceof Element) || !node.classList.contains("ach-toast")) continue;
        if (node.querySelector(".ach-cat")) continue;
        const cat = document.createElement("span");
        cat.className = "cat-avatar ach-cat";
        cat.dataset.cat = "proud";
        node.insertBefore(cat, node.firstChild);
        if (typeof paintCats === "function") paintCats(node);
        catReact("proud");
        savelySay(CAT_SAY.award);
      }
    }
  }).observe(document.body, { childList: true });
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
// Заодно кот в шапке чата уходит в позу «думает», пока идёт ответ, —
// это то же ожидание, только сказанное персонажем.
function upgradeTyping() {
  const box = document.getElementById("chat-box");
  if (!box) return;
  const head = document.querySelector(".chat-head .cat-avatar");
  new MutationObserver(() => {
    box.querySelectorAll(".msg-typing").forEach(el => {
      if (el.querySelector(".typing-dots")) return;
      el.innerHTML = '<span class="typing-dots" aria-hidden="true">'
                   + "<i></i><i></i><i></i></span>";
      el.setAttribute("aria-label", "Савелий печатает");
    });
    if (!head || noMotion() || typeof setCatPose !== "function") return;
    setCatPose(head, box.querySelector(".msg-typing") ? "think" : "hello");
  }).observe(box, { childList: true, subtree: true });
}

/* ---------- Приветствие ----------
   Кот на входном экране машет лапой один раз при загрузке. Дальше молчит:
   махать бесконечно — значит требовать внимания там, где человек читает. */
function catGreet() {
  if (noMotion()) return;      // это чистое украшение — под запретом уходит первым
  const hero = document.getElementById("hero-cat");
  if (!hero || !hero.offsetParent) return;
  setTimeout(() => catReact("wave", { el: hero }), 500);
}

document.addEventListener("DOMContentLoaded", () => {
  watchReveal();
  watchScreens();
  upgradeTyping();
  watchAnswers();
  watchCoach();
  watchAwards();
  catGreet();
});

// Любое действие ученика будит кота. passive — обработчик не должен
// задерживать прокрутку на слабом телефоне.
["pointerdown", "keydown"].forEach(ev =>
  document.addEventListener(ev, () => catAwake(false), { passive: true, capture: true }));

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
