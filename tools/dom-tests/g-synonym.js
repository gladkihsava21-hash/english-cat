// Гипотеза B. «Найди пару» и «Лопни шар» собирают поле из trainPool()
// БЕЗ проверки на одинаковые переводы. В движке для этого есть
// pickDistinctT() (exercises.js:724) — её зовёт ровно одно упражнение
// («Найди пару» из exercises.js, строка 2091). games.js не зовёт никогда.
//
// В банке сайта у 141 перевода по два и более английских слова
// (big/large — «большой», shop/store — «магазин», plate/dish — «тарелка»).
// Если оба попали в подход:
//   • «Найди пару» — на поле ДВЕ одинаковые русские карточки, и только
//     одна из них «та самая» (пара сверяется по индексу в колоде);
//   • «Лопни шар» — под русским «магазин» висят шары shop и store,
//     и один из них объявляется ошибкой.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

MQ.matches = true;

console.log("\n0. Как часто двойники сходятся в одном подходе:");
console.log(w.eval(`(() => {
  const by = {};
  WORDS.A1.forEach(x => (by[x.t] = by[x.t] || []).push(x));
  const twins = Object.values(by).filter(a => a.length >= 2);
  const out = ["  в банке A1 " + twins.length + " переводов у двух и более слов"];
  const measure = (label, dict) => {
    state.dictionary = dict.map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
    let mem = 0, bal = 0;
    for (let k = 0; k < 300; k++) {
      const six = trainPool(6).slice(0, 6).map(x => x.t);
      if (six.some((t, i) => six.indexOf(t) !== i)) mem++;
      const pool = trainPool(14);
      if (pool.slice(0, 8).some(r => pool.filter(x => x.w !== r.w).slice(0, 3).some(o => o.t === r.t))) bal++;
    }
    out.push("  " + label + " (" + state.dictionary.length + " слов): «Найди пару» "
      + (mem / 3).toFixed(1) + "% раскладов с дублем, «Лопни шар» " + (bal / 3).toFixed(1) + "% партий");
  };
  measure("весь A1", WORDS.A1);
  // Обычный ученик: два десятка слов, среди них одна пара-двойник
  const plain = WORDS.A1.filter(x => !twins.some(a => a.some(y => y.w === x.w))).slice(0, 22);
  measure("22 слова + одна пара-двойник", plain.concat(twins[0].slice(0, 2)));
  // Папка от репетитора: тематический набор, двойников в нём много
  measure("папка из 12 слов-двойников", twins.slice(0, 6).flatMap(a => a.slice(0, 2)));
  return out.join("\\n");
})()`));

w.eval(`
  window.__log = { stat: [], finish: [], xp: 0 };
  const _s = statUpdate, _f = exFinish, _a = award;
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  const by = {};
  WORDS.A1.forEach(x => (by[x.t] = by[x.t] || []).push(x));
  const twins = Object.values(by).filter(a => a.length >= 2).slice(0, 7);
  window.__twins = twins.map(a => a.slice(0, 2).map(x => x.w).join("/") + " — " + a[0].t);
  state.dictionary = twins.flatMap(a => a.slice(0, 2))
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
console.log("\n   словарь для проверки — 7 пар из банка A1:");
console.log("   " + JSON.parse(w.eval("JSON.stringify(window.__twins)")).join("\n   "));
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { stat: [], finish: [], xp: 0 };");
const dictPairs = () => JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));

(async () => {
  /* ---------- «Найди пару» ---------- */
  console.log("\n1. «Найди пару»: кладём слово на русскую карточку с его переводом");
  let proof = null, decks = 0;
  for (let attempt = 0; attempt < 40 && !proof; attempt++) {
    w.eval('show("practice"); openExercise("memory")');
    await tick();
    const deck = JSON.parse(w.eval(`JSON.stringify(
      [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
        i: +b.dataset.i, text: b.querySelector(".mem-front").textContent.trim(),
        en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
    const ru = deck.filter(c => !c.en);
    const dupText = ru.map(c => c.text).find((t, k, a) => a.indexOf(t) !== k);
    if (!dupText) continue;
    decks++;
    const twoRu = ru.filter(c => c.text === dupText);
    const dict = dictPairs();
    const twoEn = deck.filter(c => c.en && dict.some(d => d.w === c.text && d.t === dupText));
    if (twoEn.length < 2) continue;
    const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
    reset();
    click(byI(twoEn[0].i));
    click(byI(twoRu[0].i));
    await tick(40);
    const a = byI(twoEn[0].i), b = byI(twoRu[0].i);
    if (a.classList.contains("bad") || b.classList.contains("bad")) {
      proof = { en: twoEn[0].text, ru: dupText, other: twoEn[1].text, deck: attempt + 1 };
    } else {
      await tick(30);   // пара сошлась — этот расклад не показателен, берём следующий
    }
  }
  console.log("    раскладов с двумя одинаковыми русскими карточками просмотрено: " + decks);
  if (!proof) console.log("  … случай не поймался");
  else {
    console.log("    на поле были две карточки «" + proof.ru + "» — от «" + proof.en
      + "» и от «" + proof.other + "»");
    console.log("    ребёнок положил «" + proof.en + "» на «" + proof.ru + "» → КРАСНОЕ «мимо»");
    ok(false, "верный по смыслу ход («" + proof.en + "» = «" + proof.ru
      + "») засчитан парой, а не ошибкой");
  }

  /* ---------- «Лопни шар» ---------- */
  console.log("\n2. «Лопни шар»: лопаем шар, который верно переводит показанное слово");
  let bproof = null, collisions = 0;
  for (let attempt = 0; attempt < 40 && !bproof; attempt++) {
    w.eval('show("practice"); openExercise("balloons")');
    await tick();
    for (let r = 0; r < 8 && !bproof; r++) {
      const ru = doc.getElementById("bal-ru").textContent.trim();
      const dict = dictPairs();
      const rightAll = dict.filter(d => d.t.trim() === ru).map(d => d.w);
      const balls = [...doc.querySelectorAll("#bal-stage .bal")];
      const syn = balls.filter(b => rightAll.includes(b.getAttribute("aria-label")));
      if (syn.length > 1) {
        collisions++;
        reset();
        const picked = syn[0].getAttribute("aria-label");
        click(syn[0]);
        await tick(40);
        const fb = doc.getElementById("bal-fb").textContent.trim();
        const l = log();
        if (!/Верно/.test(fb)) {
          bproof = { ru, picked, fb, stat: l.stat,
            balls: balls.map(b => b.getAttribute("aria-label")) };
          // Доигрываем раунд честно: лопаем ВТОРОЙ верный шар — тот,
          // который игра считает мишенью.
          click(syn[1]);
          await tick(60);
          bproof.after = doc.getElementById("bal-fb").textContent.trim();
          bproof.statAfter = log().stat;
          bproof.count = doc.getElementById("bal-count").textContent.trim();
          break;
        }
        await tick(900);   // попали в мишень — идём дальше искать
        continue;
      }
      const tgt = balls.find(b => rightAll.includes(b.getAttribute("aria-label")));
      if (!tgt) break;
      click(tgt);
      await tick(900);
    }
  }
  console.log("    раундов с двумя верными шарами просмотрено: " + collisions);
  if (!bproof) console.log("  … случай не поймался");
  else {
    console.log("    на экране «" + bproof.ru + "», шары " + JSON.stringify(bproof.balls));
    console.log("    лопнул «" + bproof.picked + "» — верный перевод «" + bproof.ru + "»");
    console.log("    ответ тренажёра: «" + bproof.fb + "»");
    console.log("    записано в статистику: " + JSON.stringify(bproof.stat));
    console.log("    после этого лопнул второй верный шар → «" + bproof.after + "»");
    console.log("    в статистику ушло: " + JSON.stringify(bproof.statAfter));
    ok(false, "перевод «" + bproof.ru + "» шаром «" + bproof.picked + "» принят как верный");
    ok(!(bproof.statAfter || []).some(s => s[1] === false),
      "слово не помечено забытым в SRS: " + JSON.stringify(bproof.statAfter));
    ok(/Верно/.test(bproof.after || ""),
      "раунд зачтён: оба лопнутых шара переводят «" + bproof.ru + "» верно");
  }

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "верный по смыслу ответ нигде не назван ошибкой"));
  process.exit(fails ? 1 : 0);
})();
