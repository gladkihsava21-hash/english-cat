// «Дикий ребёнок»: жмёт всё подряд, дважды по одному и тому же, во время
// пауз между словами. Инварианты: подход закрывается один раз, верных не
// больше заданий, результат по домашке записан один раз.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];

w.eval(`window.readGateMs = () => 0;
  window.__fin = []; window.__rec = [];
  const _f = exFinish, _r = recordTaskResult;
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  window.recordTaskResult = function (c, t, m) { window.__rec.push([c, t]); return _r(c, t, m); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.taskResults = {};
`);

// rnd на стороне теста — свой, чтобы не сбивать зерно упражнений
let s = Number(process.env.FSEED || 7);
const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const IDS = ["picture", "matching", "mcq", "spelling", "scramble", "defmatch"];
let bad = 0;

(async () => {
  for (const id of IDS) {
    for (let run = 0; run < 3; run++) {
      w.eval(`window.__fin = []; window.__rec = [];
        homeworkContext = { id: "hw1", title: "Домашка" };
        state.taskResults = {};
        state.dictionary = [...WORDS.A1.slice(0, 14), ...WORDS.A2.slice(0, 14)]
          .map(x => ({ w:x.w, t:x.t, ex:x.ex, def:x.def, cat:x.cat, added:Date.now(), seen:1 }));
        openExercise(${JSON.stringify(id)});`);
      for (let step = 0; step < 70; step++) {
        await tick(rnd() < 0.18 ? 950 : 8);
        const btns = SA("button:not([disabled])").filter(b => b.offsetParent !== null || true);
        const live = btns.filter(b => !/ex-again|ex-take|ex-to-board/.test(b.id) && !b.dataset.nav);
        if (!live.length) break;
        const b = live[Math.floor(rnd() * live.length)];
        click(b);
        if (rnd() < 0.5) click(b);            // двойной тап по той же кнопке
        if (rnd() < 0.2) live.forEach(click);  // и веером по всем
      }
      await tick(2200);
      const fin = JSON.parse(w.eval("JSON.stringify(window.__fin)"));
      const rec = JSON.parse(w.eval("JSON.stringify(window.__rec)"));
      const tr = JSON.parse(w.eval("JSON.stringify(state.taskResults)"));
      const problems = [];
      if (fin.length > 1) problems.push("exFinish ×" + fin.length + " " + JSON.stringify(fin));
      fin.forEach(([c, t]) => { if (c > t) problems.push(`верно ${c} из ${t}`); if (c < 0) problems.push("минус"); });
      if (rec.length > 1) problems.push("recordTaskResult ×" + rec.length);
      if (tr.hw1 && tr.hw1.correct > tr.hw1.total) problems.push("в домашке " + JSON.stringify(tr.hw1));
      if (problems.length) { bad++; console.log(`✗ ${id} прогон ${run}: ` + problems.join(" | ")); }
      else if (run === 0) console.log(`  ${id}: exFinish ${JSON.stringify(fin)} домашка ${JSON.stringify(tr.hw1 || null)}`);
    }
  }
  console.log(bad ? "\nНАРУШЕНИЙ: " + bad : "\nинварианты держатся во всех прогонах");
  process.exit(bad ? 1 : 0);
})();
