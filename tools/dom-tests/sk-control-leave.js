const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
MQ.matches = true;

w.eval(`
  window.__log = { finish: [], bump: [], board: [] };
  const _f = exFinish, _b = bump;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.bump = function (k, n) { window.__log.bump.push(String(k)); return _b(k, n); };
  window.boardTaskCard = "card42";
  window.reportBoardResult = function (id, info) { window.__log.board.push([id, info.text]); };
  state.dictionary = [...WORDS.A1].slice(0, 14)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [], bump: [], board: [] };");
const leave = () => w.eval('show("dashboard")');

(async () => {
  console.log("\nКОНТРОЛЬ. «Сопоставление» (exercises.js, exLater): последняя пара → «Главная»");
  w.eval('openExercise("matching")');
  await tick(80);
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
  const items = () => [...doc.querySelectorAll("#ex-stage .pair-item")];
  for (let step = 0; step < 20; step++) {
    const live = items().filter(b => !b.disabled && !b.classList.contains("done") && !b.classList.contains("matched"));
    if (!live.length) break;
    // левая колонка — английские, правая — русские; ищем совпадающую пару
    let a = null, b2 = null;
    for (const el of live) {
      const t = el.textContent.trim();
      const rec = dict.find(d => d.w === t);
      if (!rec) continue;
      const partner = live.find(x => x.textContent.trim() === rec.t);
      if (partner) { a = el; b2 = partner; break; }
    }
    if (!a) { console.log("   пары не нашлось, осталось:", live.map(x=>x.textContent.trim())); break; }
    const isLast = live.length <= 2;
    if (isLast) reset();
    click(a); click(b2);
    if (isLast) { leave(); break; }
    await tick(60);
  }
  await tick(900);
  const l = log();
  console.log("   exFinish после ухода:", JSON.stringify(l.finish));
  console.log("   уехало репетитору:", JSON.stringify(l.board));
  console.log("   награды:", JSON.stringify(l.bump));
  console.log("   __exBoardBack:", !!w.__exBoardBack);
  w.clearTimeout(w.__exBoardBack);
  if (errors.length) console.log("   errors:", errors.slice(0,3));
  process.exit(0);
})();
