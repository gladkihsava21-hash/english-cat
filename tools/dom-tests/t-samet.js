// Гипотеза 4. Два слова с ОДИНАКОВЫМ переводом в одном подходе.
//
// В банке это не редкость: только в A1+A2 таких групп 67 — «магазин»
// (shop/store), «тарелка» (plate/dish), «город» (city/town), «большой»
// (big/large)… Движок про это знает и защищается: distractors() выкидывает
// варианты, у которых есть общее слово с верным переводом (ruTokens,
// замечание Ирины: «две верные кнопки с точки зрения ученика»), а «Впиши
// слово» прогоняет пул через pickDistinctT (js/exercises.js:2091).
//
// «Найди пару» и «Лопни шар» не делают ни того, ни другого: карточки и
// шары разводятся фильтром по АНГЛИЙСКОМУ слову (x.w !== w.w), а решение
// ученик принимает по РУССКОМУ. Верный по смыслу ответ объявляется ошибкой.
//
// Сцена бытовая: репетитор собрал папку «Магазин», в ней shop и store.
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
  console.log("\n1. «Найди пару»: на поле две одинаковые карточки «магазин»");
  console.log("    папка: " + folder(["shop", "store", "juice", "table", "green", "run"]));
  let reproduced = false, tries = 0;
  while (!reproduced && tries++ < 8) {
    w.eval('show("practice"); openExercise("memory")');
    await tick();
    const cards = JSON.parse(w.eval(`JSON.stringify(
      [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
        i: +b.dataset.i,
        text: b.querySelector(".mem-front").textContent.trim(),
        en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
    const ru = cards.filter(c => !c.en).map(c => c.text);
    const twins = ru.filter((t, k) => ru.indexOf(t) !== k);
    if (tries === 1) {
      console.log("    карточки-переводы: " + JSON.stringify(ru));
      ok(twins.length > 0, "две одинаковые карточки правда раздались: " + JSON.stringify(twins));
    }
    const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
    const shop = cards.find(c => c.en && c.text === "shop");
    const mags = cards.filter(c => !c.en && c.text === "магазин");
    // Ученик открыл «shop» и ту карточку «магазин», что попалась первой.
    w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
    click(byI(shop.i)); click(byI(mags[0].i));
    await tick(60);
    const paired = byI(shop.i).classList.contains("done");
    const counter = doc.getElementById("mem-count").textContent;
    console.log(`    сдача ${tries}: «shop» + «магазин» (карточка ${mags[0].i + 1}) → `
      + (paired ? "пара сложилась" : "ОШИБКА: карточки закрылись обратно") + "; " + counter);
    if (!paired) {
      reproduced = true;
      ok(false, "верная по смыслу пара «shop» + «магазин» объявлена ошибкой; счётчик: " + counter);
      await tick(1000);
      // и это стоило ученику балла на итогах
      console.log("    (errors++ → на итогах будет «Верно 5 из 6» при полностью собранном поле)");
    }
  }
  if (!reproduced) ok(true, "за 8 сдач ни одна верная пара ошибкой не названа");

  /* ---------- ЛОПНИ ШАР ---------- */
  console.log("\n2. «Лопни шар»: два шара подходят под один перевод");
  console.log("    папка: " + folder(["shop", "store", "juice", "table"]));
  w.eval('show("practice"); openExercise("balloons")');
  await tick();
  let found = false;
  for (let round = 0; round < 4 && !found; round++) {
    const ruWord = doc.getElementById("bal-ru").textContent.trim();
    const dict = dictOf();
    const balls = [...doc.querySelectorAll("#bal-stage .bal")];
    const opts = balls.map(b => b.getAttribute("aria-label"));
    const fits = opts.filter(o => (dict.find(d => d.w === o) || {}).t === ruWord);
    console.log(`    раунд ${round + 1}: «${ruWord}» → шары ${JSON.stringify(opts)}`
      + `; подходят по переводу: ${JSON.stringify(fits)}`);
    if (fits.length > 1) {
      found = true;
      w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
      const first = balls.find(b => fits.includes(b.getAttribute("aria-label")));
      const second = balls.find(b => fits.includes(b.getAttribute("aria-label")) && b !== first);
      click(first);
      await tick(60);
      let fb = doc.getElementById("bal-fb").textContent.trim();
      console.log(`      лопнул «${first.getAttribute("aria-label")}» → «${fb}»`);
      const misjudged = /Не то слово/.test(fb);
      if (misjudged) {
        click(second);
        await tick(60);
        fb = doc.getElementById("bal-fb").textContent.trim();
        console.log(`      лопнул «${second.getAttribute("aria-label")}» → «${fb}»`);
      }
      const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
      console.log("      statUpdate: " + JSON.stringify(l.stat) + ", очки: " + l.xp);
      ok(!misjudged, "верный по переводу шар не назван ошибкой");
      ok(!l.stat.some(([, o]) => o === false),
         "слово не ушло в «забыл» из-за верного по смыслу ответа: " + JSON.stringify(l.stat));
      ok(l.xp > 0, "раунд засчитан: очки начислены (" + l.xp + ")");
      break;
    }
    const right = balls.find(b => (dict.find(d => d.w === b.getAttribute("aria-label")) || {}).t === ruWord);
    click(right || balls[0]);
    await tick(1000);
  }
  ok(found, "раунд с двумя подходящими шарами встретился");

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
