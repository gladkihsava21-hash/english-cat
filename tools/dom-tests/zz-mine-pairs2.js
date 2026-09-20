// runPairs: что делает ПОВТОРНОЕ нажатие по той же неверной кнопке
// (двойной тап на телефоне) и как ошибки попадают в статистику уровней.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

w.eval(`window.readGateMs = () => 0;
  window.__stat = []; window.__fin = []; window.__xp = 0;
  const _s = statUpdate, _f = exFinish, _a = award;
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok, v === undefined ? true : !!v]); return _s(word, ok, v); };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__xp += n; return _a(n); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.levelStats = {};
  state.dictionary = [...WORDS.A1.slice(0, 12)].map(x => ({ w:x.w, t:x.t, ex:x.ex, cat:x.cat, level:"A1", added:Date.now(), seen:1 }));
  openExercise("matching");
`);

console.log("=== 1. Двойной тап по неверной кнопке ===");
console.log("  слева:", L().map(b=>b.textContent).join(" | "));
console.log("  справа:", R().map(b=>b.textContent).join(" | "));
w.eval("window.__stat = []; window.__xp = 0;");
const l0 = L()[0];
// найдём заведомо НЕ ту кнопку справа: ту, чей текст не перевод l0
const myT = w.eval(`(() => { const d = state.dictionary.find(x => x.w === ${JSON.stringify(l0.textContent)}); return d ? d.t : ""; })()`);
const wrong = R().find(b => b.textContent !== myT);
console.log(`  ученик выбрал «${l0.textContent}» (перевод «${myT}») и дважды тапнул по «${wrong.textContent}»`);
click(l0);
click(wrong); click(wrong); click(wrong);
console.log("  statUpdate:", w.eval("JSON.stringify(window.__stat)"));
console.log("  запись слова:", w.eval(`JSON.stringify((d=>({forgot:d.forgot,reps:d.reps,ease:d.ease,due:d.due}))(state.dictionary.find(x=>x.w===${JSON.stringify(l0.textContent)})))`));

// доигрываем честно и смотрим итог
const pairs = w.eval(`JSON.stringify(state.dictionary.map(d=>[d.w,d.t]))`);
const map = new Map(JSON.parse(pairs));
for (const b of L()) {
  if (b.classList.contains("done")) continue;
  click(b);
  const r = R().find(x => x.textContent === map.get(b.textContent) && !x.classList.contains("done"));
  if (r) click(r);
}
setTimeout(() => {
  console.log("  exFinish:", w.eval("JSON.stringify(window.__fin)"), " (пар было", L().length + ")");
  console.log("  очков начислено:", w.eval("window.__xp"));

  console.log("\n=== 2. Ошибки и статистика уровней ===");
  console.log("  levelStats после подхода:", w.eval("JSON.stringify(state.levelStats)"));
  console.log("  (r — верных, w — ошибок; по ним сайт предлагает сменить уровень)");
  const st = JSON.parse(w.eval("JSON.stringify(window.__stat)"));
  console.log("  все вызовы statUpdate за подход:", JSON.stringify(st));
  console.log("  из них с verified=false:", st.filter(x => !x[2]).length, "— такие в levelStats не попадают вовсе");

  console.log("\n=== 3. Для сравнения: тот же ученик в «Выборе варианта» ===");
  w.eval(`state.levelStats = {}; window.__stat = []; openExercise("mcq");`);
  setTimeout(() => {
    const btns = [...doc.querySelectorAll("#ex-stage .mcq-option")];
    click(btns[0]);   // отвечаем наугад — первый вариант
    console.log("  один ответ в mcq → levelStats:", w.eval("JSON.stringify(state.levelStats)"));
    console.log("  statUpdate:", w.eval("JSON.stringify(window.__stat)"));
  }, 60);
}, 700);
