// Гипотеза A. Заслон «ученик ушёл с экрана» в играх сделан через
// document.body.contains(...) — а show() в app.js экраны НЕ удаляет,
// он вешает на них класс .hidden. Значит contains() всегда true, и
// заслона нет ни в одной из четырёх игр:
//
//   games.js:483  setTimeout(() => { if (document.body.contains(box)) next(); }, …)
//   games.js:673  setTimeout(() => { if (document.body.contains(list)) after(); }, 1000)
//   games.js:223  setTimeout(() => exFinish(known, total, …), 400)     // и вовсе без заслона
//   games.js:351  setTimeout(() => exFinish(MEM_PAIRS - errors, …), 600)
//
// В движке для этого есть exLater() (exercises.js:872) — по токену захода;
// games.js не зовёт его ни разу (grep: 0 совпадений).
//
// Что видит ученик: ответил на последний вопрос, тут же ушёл на Главную —
// и подход всё равно закрывается: очки, награда «пройдено упражнение»,
// а если игру открыли с доски (#train=…&card=…), то и результат уезжает
// репетитору, а вкладка сама уходит на board.html с чужого экрана.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

MQ.matches = true;  // reduced-motion: колесо и коробки без пауз на анимацию

w.eval(`
  window.__log = { finish: [], bump: [], board: [], xp: 0 };
  const _f = exFinish, _a = award, _b = bump;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  window.bump = function (k, n) { window.__log.bump.push(String(k)); return _b(k, n); };
  // Игру открыли с доски: репетитор дал ссылку прямо на уроке.
  window.boardTaskCard = "card42";
  window.reportBoardResult = function (id, info) { window.__log.board.push([id, info.text]); };
  state.dictionary = [...WORDS.A1].slice(0, 14)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [], bump: [], board: [], xp: 0 };");

const leave = () => w.eval('show("dashboard")');   // ученик жмёт «Главная» внизу

(async () => {
  /* ---------- 1. КОЛЕСО ---------- */
  console.log("\n1. «Колесо»: отметил последнее слово → «Главная»");
  w.eval('openExercise("wheel")');
  await tick();
  for (let g = 0; g < 60; g++) {
    const go = doc.getElementById("wheel-go");
    if (go) { click(go); await tick(20); continue; }
    const yes = doc.getElementById("wheel-yes");
    if (!yes) break;
    const [d, t] = doc.getElementById("wheel-count").textContent.split("/").map(x => +x.trim());
    if (d === t - 1) { reset(); click(yes); leave(); break; }
    click(yes); await tick(20);
  }
  await tick(700);
  let l = log();
  ok(l.finish.length === 0, "итоги не подведены после ухода: " + JSON.stringify(l.finish));
  ok(l.board.length === 0, "результат НЕ уехал репетитору на доску: " + JSON.stringify(l.board));
  ok(!l.bump.includes("exercises"), "награда за подход не начислена: " + JSON.stringify(l.bump));
  ok(!w.__exBoardBack, "вкладку не уводит на board.html с чужого экрана");
  w.clearTimeout(w.__exBoardBack); w.__exBoardBack = null;

  /* ---------- 2. НАЙДИ ПАРУ ---------- */
  console.log("\n2. «Найди пару»: собрал последнюю пару → «Главная»");
  w.eval('show("practice"); openExercise("memory")');
  await tick();
  const cards = () => JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i, text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
  const all = cards();
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const ens = all.filter(c => c.en);
  for (let k = 0; k < ens.length; k++) {
    const a = ens[k];
    const rec = dict.find(d => d.w === a.text);
    const b = all.find(x => !x.en && x.text === (rec && rec.t));
    if (!b) { console.log("  … пары для " + a.text + " не нашлось"); continue; }
    const last = k === ens.length - 1;
    if (last) reset();
    click(byI(a.i)); click(byI(b.i));
    if (last) leave();
    await tick(60);
  }
  await tick(900);
  l = log();
  ok(l.finish.length === 0, "итоги не подведены после ухода: " + JSON.stringify(l.finish));
  ok(l.board.length === 0, "результат НЕ уехал репетитору: " + JSON.stringify(l.board));
  w.clearTimeout(w.__exBoardBack); w.__exBoardBack = null;

  /* ---------- 3. ЛОПНИ ШАР ---------- */
  console.log("\n3. «Лопни шар»: лопнул шар последнего раунда → «Главная»");
  w.eval('show("practice"); openExercise("balloons")');
  await tick();
  const balls = () => [...doc.querySelectorAll("#bal-stage .bal")];
  const tgtBall = () => {
    const ru = doc.getElementById("bal-ru").textContent.trim();
    const rec = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"))
      .find(d => d.t.trim() === ru);
    return balls().find(b => b.getAttribute("aria-label") === (rec && rec.w));
  };
  for (let r = 0; r < 12; r++) {
    const [cur, tot] = doc.getElementById("bal-count").textContent.split("/").map(x => +x.trim());
    const b = tgtBall();
    if (!b) { console.log("  … мишень не найдена в раунде " + cur); break; }
    if (cur === tot) { reset(); click(b); leave(); break; }
    click(b);
    await tick(950);
  }
  await tick(1100);
  l = log();
  ok(l.finish.length === 0, "итоги не подведены после ухода: " + JSON.stringify(l.finish));
  ok(l.board.length === 0, "результат НЕ уехал репетитору: " + JSON.stringify(l.board));
  w.clearTimeout(w.__exBoardBack); w.__exBoardBack = null;

  /* ---------- 4. ОТКРОЙ КОРОБКУ ---------- */
  console.log("\n4. «Открой коробку»: ответил в последней коробке → «Главная»");
  w.eval('show("practice"); openExercise("boxes")');
  await tick();
  const dictPairs = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
  for (let n = 0; n < 30; n++) {
    const nx = doc.getElementById("box-next");
    if (nx) { click(nx); await tick(30); continue; }
    const counter = doc.querySelector("#ex-stage .test-counter");
    const m = counter && counter.textContent.match(/Открыто (\d+) из (\d+)/);
    if (!m) { console.log("    … экран: " + (counter ? counter.textContent.trim() : "нет счётчика")); break; }
    const openedNow = +m[1], total = +m[2];
    const tile = doc.querySelector("#box-grid .box-tile:not([disabled])");
    if (!tile) break;
    click(tile);
    await tick(30);
    const opts = [...doc.querySelectorAll("#box-options .mcq-option")];
    if (!opts.length) { console.log("    … вариантов нет"); break; }
    const wordEn = doc.querySelector(".box-card .quiz-word").textContent.trim();
    const rec = dictPairs.find(d => d.w === wordEn);
    const right = opts.find(o => o.textContent.trim() === (rec && rec.t));
    const last = openedNow === total - 1;
    if (last) reset();
    click(right || opts[0]);
    if (last) { leave(); break; }
    await tick(1100);
  }
  await tick(1300);
  l = log();
  ok(l.finish.length === 0, "итоги не подведены после ухода: " + JSON.stringify(l.finish));
  ok(l.board.length === 0, "результат НЕ уехал репетитору: " + JSON.stringify(l.board));
  ok(!w.__exBoardBack, "вкладку не уводит на board.html с чужого экрана");
  w.clearTimeout(w.__exBoardBack); w.__exBoardBack = null;

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails
    : "уход на Главную обрывает подход во всех четырёх играх"));
  process.exit(fails ? 1 : 0);
})();
