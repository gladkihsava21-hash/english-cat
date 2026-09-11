// Прокликанный подход: очки снимаются (revokeXP), а «цель дня» — нет.
// addXP засчитывает goalsHit в момент перехода через цель, revokeXP
// возвращает xp и activity, но счётчик уже стоит. Активность вернулась
// в ноль — значит следующий такой же подход засчитает цель ЕЩЁ раз.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");

E("window.readGateMs = () => 0;");
E(`window.__rounds = null; const _m = runMCQ;
   window.runMCQ = function (r, o) { window.__rounds = r; return _m(r, o); };
   state.xp = 0; state.counters = {}; state.activity = {}; state.goal = 50;`);

(async () => {
  console.log("цель дня:", E("state.goal"), "| стартовые очки:", E("state.xp"));
  for (let run = 1; run <= 3; run++) {
    E(`localStorage.removeItem('savelyExSeen'); openExercise("notliteral");`);
    await tick(20);
    const R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
    for (let k = 0; k < R.length; k++) {           // прокликиваем, не читая
      click([...st().querySelectorAll(".mcq-option")][R[k].correct]);
      await tick(1200);   // ждём смены раунда; «прокликано» меряется от открытия вариантов, а не между вопросами
    }
    console.log(`подход ${run}: экран «${(st().querySelector("h2") || {}).textContent}»`
      + ` | state.xp: ${E("state.xp")}`
      + ` | активность за день: ${E("state.activity[dayKey()] || 0")}`
      + ` | goalsHit: ${E("state.counters.goalsHit || 0")}`
      + ` | exercises: ${E("state.counters.exercises || 0")}`);
  }
  console.log("\n«цель дня выполнена» засчитана", E("state.counters.goalsHit || 0"),
              "раз(а) при 0 очков за день — награда «Цель дня» ведётся по этому счётчику");
  process.exit(0);
})();
