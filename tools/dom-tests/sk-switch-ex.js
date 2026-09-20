// Разница игр и движка: ученик ответил на ПОСЛЕДНИЙ вопрос и тут же
// открыл ДРУГОЕ упражнение. exLater (движок) должен это отсечь по токену,
// document.body.contains (игры) — нет.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
MQ.matches = true;

w.eval(`
  window.__log = { finish: [], board: [] };
  const _f = exFinish;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.boardTaskCard = null;
  window.reportBoardResult = function (id, info) { window.__log.board.push([id, info.text]); };
  state.dictionary = [...WORDS.A1].slice(0, 14)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [], board: [] };");
const go = () => w.eval('openExercise("mcq")');   // ученик открыл другое упражнение

const head = () => (doc.querySelector("#ex-stage h2") || {}).textContent || "";
const stageTxt = () => (doc.getElementById("ex-stage") || {}).textContent.replace(/\s+/g," ").trim().slice(0,110);

(async () => {
  /* КОЛЕСО */
  console.log("\n1. Колесо: последнее слово → сразу другое упражнение");
  w.eval('openExercise("wheel")');
  await tick();
  for (let g = 0; g < 60; g++) {
    const b = doc.getElementById("wheel-go");
    if (b) { click(b); await tick(20); continue; }
    const yes = doc.getElementById("wheel-yes");
    if (!yes) break;
    const [d, t] = doc.getElementById("wheel-count").textContent.split("/").map(x => +x.trim());
    if (d === t - 1) { reset(); click(yes); go(); break; }
    click(yes); await tick(20);
  }
  await tick(700);
  console.log("   exFinish чужого подхода:", JSON.stringify(log().finish));
  console.log("   что на экране нового упражнения:", stageTxt());

  /* КОНТРОЛЬ: сопоставление */
  console.log("\n2. КОНТРОЛЬ «Сопоставление» (exLater): последняя пара → другое упражнение");
  w.eval('show("practice"); openExercise("matching")');
  await tick(80);
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
  const items = () => [...doc.querySelectorAll("#ex-stage .pair-item")];
  for (let step = 0; step < 20; step++) {
    const live = items().filter(b => !b.disabled && !b.classList.contains("done") && !b.classList.contains("matched"));
    if (!live.length) break;
    let a = null, b2 = null;
    for (const el of live) {
      const t = el.textContent.trim();
      const rec = dict.find(d => d.w === t);
      if (!rec) continue;
      const p = live.find(x => x.textContent.trim() === rec.t);
      if (p) { a = el; b2 = p; break; }
    }
    if (!a) break;
    const isLast = live.length <= 2;
    if (isLast) reset();
    click(a); click(b2);
    if (isLast) { go(); break; }
    await tick(60);
  }
  await tick(900);
  console.log("   exFinish чужого подхода:", JSON.stringify(log().finish));
  console.log("   что на экране нового упражнения:", stageTxt());
  if (errors.length) console.log("   errors:", errors.slice(0,3));
  process.exit(0);
})();
