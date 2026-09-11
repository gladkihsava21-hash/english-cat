// «Поиск слов» на маленьком наборе (домашка репетитора / словарь новичка):
// шесть сеток тасуют одни и те же слова по кругу. Что уходит в статистику
// и что видит репетитор.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], stat: [] };
  const _f = exFinish, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + (o ? ":+" : ":-")); return _s(word, o, v); };
  // Домашка: репетитор задал шесть слов. Так их и открывают —
  // startHomeworkLesson ставит homeworkScope и homeworkContext.
  const six = ["milk", "bread", "horse", "table", "green", "water"];
  state.dictionary = six.map(x => { const i = wordInfo(x) || { w: x, t: x };
    return { w: i.w, t: i.t, ex: i.ex, added: Date.now(), seen: 1 }; });
  state.taskResults = {};
  homeworkScope = six.slice();
  homeworkContext = { id: "hw-1", title: "Слова к четвергу" };
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Домашка из шести слов открыта «Поиском слов»");
  w.eval('openExercise("wordsearch")');
  await tick(20);
  const grids = [];
  for (let r = 0; r < 8; r++) {
    const t = [...doc.querySelectorAll(".ws-target")].map(x => x.textContent);
    if (!t.length) break;
    grids.push(t);
    // на первой сетке находим одно слово честно, дальше просто «Дальше»
    if (r === 0) {
      const SIZE = 9;
      const cells = [...doc.querySelectorAll(".ws-cell")];
      const at = (rr, cc) => cells[rr * SIZE + cc];
      const grid = [];
      for (let rr = 0; rr < SIZE; rr++) grid.push([...Array(SIZE)].map((_, cc) => at(rr, cc).textContent));
      const word = t[0];
      let pos = null;
      for (let rr = 0; rr < SIZE && !pos; rr++)
        for (let cc = 0; cc + word.length <= SIZE; cc++)
          if (grid[rr].slice(cc, cc + word.length).join("") === word) { pos = [[rr, cc], [rr, cc + word.length - 1]]; break; }
      for (let cc = 0; cc < SIZE && !pos; cc++)
        for (let rr = 0; rr + word.length <= SIZE; rr++) {
          let s = ""; for (let k = 0; k < word.length; k++) s += grid[rr + k][cc];
          if (s === word) { pos = [[rr, cc], [rr + word.length - 1, cc]]; break; }
        }
      if (pos) { click(at(pos[0][0], pos[0][1])); click(at(pos[1][0], pos[1][1])); await tick(10); }
      console.log("  сетка 1: ученик нашёл «" + word + "»");
    }
    const nx = doc.getElementById("ws-next");
    if (!nx) break;
    click(nx);
    await tick(10);
  }
  await tick(200);

  grids.forEach((g, i) => console.log("  сетка " + (i + 1) + ": " + g.join(", ")));
  const L = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const uniqueShown = new Set(grids.flat());
  console.log("  разных слов всего: " + uniqueShown.size + ", «спрятано» по счёту игры: " + (L.finish[0] || [])[1]);
  console.log("  отметки в SRS по порядку: " + JSON.stringify(L.stat));

  const plus = L.stat.filter(x => x.endsWith(":+")).map(x => x.split(":")[0]);
  const minus = L.stat.filter(x => x.endsWith(":-")).map(x => x.split(":")[0]);
  const flip = plus.filter(x => minus.includes(x));
  console.log("  найденные слова: " + JSON.stringify([...new Set(plus)]));
  console.log("  те же слова, потом помеченные «забыл»: " + JSON.stringify([...new Set(flip)]));

  ok((L.finish[0] || [])[1] === uniqueShown.size,
     "итог считает столько слов, сколько их и было (" + uniqueShown.size + "), а не " + (L.finish[0] || [])[1]);
  ok(flip.length === 0,
     "слово, которое ученик нашёл, не помечено в тот же подход как забытое");

  const hw = JSON.parse(w.eval("JSON.stringify(state.taskResults)"));
  console.log("  репетитору записано: " + JSON.stringify(hw));

  console.log("\nошибок JS: " + errors.length);
  errors.forEach(e => console.log("   " + e));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
