// Гипотеза 4 (из аудита). Два слова с ОДИНАКОВЫМ переводом в одном подходе.
//
// В банке это не редкость: только в A1+A2 таких групп 67 — «магазин»
// (shop/store), «тарелка» (plate/dish), «город» (city/town), «большой»
// (big/large)… Когда-то «Найди пару» и «Лопни шар» разводили карточки и
// шары фильтром по АНГЛИЙСКОМУ слову, а решение ученик принимает по
// РУССКОМУ — верный по смыслу ответ объявлялся ошибкой.
//
// Теперь обе игры прикрыты (pickDistinctT в колоде, clash-фильтр чужих
// шаров по ruTokens), и этот тест — регрессионный сторож: двойняшек по
// переводу на поле быть не должно вовсе.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

MQ.matches = true;   // без анимаций: шары стоят и ждут

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
`);

// Папка репетитора: тренируем только её, чтобы добор слов уровня не мешал.
const folder = names => w.eval(`(function () {
  const src = [...WORDS.A1, ...WORDS.A2];
  state.dictionary = ${JSON.stringify(names)}.map(n => {
    const x = src.find(d => d.w === n);
    return { w: x.w, t: x.t, ex: x.ex, cat: x.cat, folders: ["Магазин"],
             added: Date.now(), seen: 1, knew: 0, checked: 0 };
  });
  state.trainFolders = ["Магазин"];
  return JSON.stringify(state.dictionary.map(d => d.w + " — " + d.t));
})()`);

const dictOf = () => JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d => ({ w: d.w, t: d.t })))"));

(async () => {
  /* ---------- НАЙДИ ПАРУ ---------- */
  console.log("\n1. «Найди пару»: двух одинаковых карточек-переводов на поле нет");
  console.log("    папка: " + folder(["shop", "store", "juice", "table", "green", "run", "cat", "dog"]));
  {
    let twinDeals = 0;
    for (let deal = 0; deal < 8; deal++) {
      w.eval('show("practice"); openExercise("memory")');
      await tick();
      const ru = JSON.parse(w.eval(`JSON.stringify(
        [...document.querySelectorAll("#mem-grid .mem-card")]
          .filter(b => b.querySelector(".mem-front").getAttribute("lang") !== "en")
          .map(b => b.querySelector(".mem-front").textContent.trim()))`));
      if (deal === 0) console.log("    карточки-переводы: " + JSON.stringify(ru));
      if (ru.some((t, k) => ru.indexOf(t) !== k)) twinDeals++;
    }
    ok(twinDeals === 0, "8 раздач подряд: дублей переводов на поле нет");
    // Поле при этом не пустое и играбельное
    const cards = doc.querySelectorAll("#mem-grid .mem-card").length;
    ok(cards > 0, "карточки раздаются (" + cards + " на поле)");
  }

  /* ---------- ЛОПНИ ШАР ---------- */
  console.log("\n2. «Лопни шар»: под один перевод никогда не подходит два шара");
  console.log("    папка: " + folder(["shop", "store", "juice", "table", "run"]));
  {
    let dirty = 0, roundsSeen = 0;
    w.eval('show("practice"); openExercise("balloons")');
    await tick();
    const dict = dictOf();
    const all = JSON.parse(w.eval('JSON.stringify([...WORDS.A1, ...WORDS.A2, ...WORDS.B1].map(d => ({ w: d.w, t: d.t })))'));
    const tOf = word => (dict.find(d => d.w === word) || all.find(d => d.w === word) || {}).t;
    for (let round = 0; round < 8; round++) {
      const balls = [...doc.querySelectorAll("#bal-stage .bal")];
      if (!balls.length) break;
      const ruWord = doc.getElementById("bal-ru").textContent.trim();
      const fits = balls.map(b => b.getAttribute("aria-label")).filter(o => tOf(o) === ruWord);
      roundsSeen++;
      if (fits.length > 1) {
        dirty++;
        console.log(`    раунд ${round + 1}: «${ruWord}» → два верных шара ${JSON.stringify(fits)}`);
      }
      const right = balls.find(b => tOf(b.getAttribute("aria-label")) === ruWord);
      click(right || balls[0]);
      await tick(1000);
    }
    ok(dirty === 0, `раундов просмотрено: ${roundsSeen}, с двумя верными шарами: ${dirty}`);
  }

  /* ---------- ТО ЖЕ БЕЗ ПАПКИ, НА ОБЫЧНОМ СЛОВАРЕ ---------- */
  console.log("\n3. Тот же расклад на обычном словаре (без папок), 6 подходов подряд");
  w.eval(`state.trainFolders = [];
    state.dictionary = [...WORDS.A1].slice(0, 40)
      .map(x => ({ w: x.w, t: x.t, ex: x.ex, cat: x.cat, added: Date.now(), seen: 1 }));`);
  let dirty = 0, roundsSeen = 0;
  for (let s = 0; s < 6; s++) {
    w.eval('show("practice"); openExercise("balloons")');
    await tick();
    const dict = dictOf();
    const all = JSON.parse(w.eval('JSON.stringify([...WORDS.A1, ...WORDS.A2, ...WORDS.B1].map(d => ({ w: d.w, t: d.t })))'));
    const tOf = word => (dict.find(d => d.w === word) || all.find(d => d.w === word) || {}).t;
    for (let round = 0; round < 8; round++) {
      const balls = [...doc.querySelectorAll("#bal-stage .bal")];
      if (!balls.length) break;
      const ruWord = doc.getElementById("bal-ru").textContent.trim();
      const fits = balls.map(b => b.getAttribute("aria-label")).filter(o => tOf(o) === ruWord);
      roundsSeen++;
      if (fits.length > 1) {
        dirty++;
        console.log(`    подход ${s + 1}, раунд ${round + 1}: «${ruWord}» → два верных шара ${JSON.stringify(fits)}`);
      }
      const right = balls.find(b => tOf(b.getAttribute("aria-label")) === ruWord);
      click(right || balls[0]);
      await tick(1000);
    }
  }
  console.log(`    раундов просмотрено: ${roundsSeen}, с двумя верными шарами: ${dirty}`);
  ok(dirty === 0, "на обычном словаре двойных верных шаров не встретилось");

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "одинаковые переводы игр не ломают"));
  process.exit(fails ? 1 : 0);
})();
