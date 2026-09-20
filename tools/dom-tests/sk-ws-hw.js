// СКЕПТИК: домашка открывается ШТАТНО — через startHomeworkLesson(task),
// как из карточки на главной. Что увидит репетитор и что уйдёт в SRS.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], stat: [] };
  const _f = exFinish, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + (o ? ":+" : ":-")); return _s(word, o, v); };
  state.dictionary = [];
  state.taskResults = {};
  state.homework = [];
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  // Задание ровно в том виде, в каком его кладёт репетитор: слова + игра
  w.eval(`
    const six = ["milk","bread","horse","table","green","water"].map(x => {
      const i = wordInfo(x); return { w: i.w, t: i.t, ex: i.ex, level: i.level };
    });
    window.__task = { id: "hw-7", title: "Слова к четвергу", words: six, game: "wordsearch", type: "words" };
    startHomeworkLesson(window.__task);
  `);
  await tick(30);

  console.log("Домашка: 6 слов, игра «Поиск слов» — так её выбрал репетитор в панели");
  const grids = [];
  const foundWords = [];
  for (let r = 0; r < 9; r++) {
    const t = [...doc.querySelectorAll(".ws-target")].map(x => x.textContent);
    if (!t.length) break;
    grids.push(t);
    // На КАЖДОЙ сетке честно находим первое слово
    const SIZE = 9;
    const cells = [...doc.querySelectorAll(".ws-cell")];
    const at = (rr, cc) => cells[rr * SIZE + cc];
    const grid = [];
    for (let rr = 0; rr < SIZE; rr++) grid.push([...Array(SIZE)].map((_, cc) => at(rr, cc).textContent));
    const word = t[0];
    let pos = null;
    for (let rr = 0; rr < SIZE && !pos; rr++)
      for (let cc = 0; cc + word.length <= SIZE; cc++)
        if (grid[rr].slice(cc, cc + word.length).join("") === word) { pos = [[rr, cc],[rr, cc + word.length - 1]]; break; }
    for (let cc = 0; cc < SIZE && !pos; cc++)
      for (let rr = 0; rr + word.length <= SIZE; rr++) {
        let s = ""; for (let k = 0; k < word.length; k++) s += grid[rr + k][cc];
        if (s === word) { pos = [[rr, cc],[rr + word.length - 1, cc]]; break; }
      }
    if (pos) { click(at(pos[0][0], pos[0][1])); click(at(pos[1][0], pos[1][1])); foundWords.push(word); await tick(5); }
    const nb = doc.getElementById("ws-next");
    if (!nb) break;
    click(nb);
    await tick(20);
  }
  grids.forEach((g, i) => console.log("  сетка " + (i + 1) + ": " + g.join(", ")));
  const uniq = new Set(grids.flat());
  console.log("  разных слов: " + uniq.size + ", «спрятано» по счёту игры: " + grids.flat().length);
  const log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("  найдено учеником: " + JSON.stringify(foundWords));
  console.log("  exFinish: " + JSON.stringify(log.finish));
  console.log("  отметки SRS: " + JSON.stringify(log.stat));
  const plus = new Set(log.stat.filter(x => x.endsWith(":+")).map(x => x.split(":")[0]));
  const minusAfterPlus = log.stat.filter(x => x.endsWith(":-")).map(x => x.split(":")[0]).filter(x => plus.has(x));
  console.log("  слова, найденные и потом всё равно помеченные «забыл»: " + JSON.stringify([...new Set(minusAfterPlus)]));
  console.log("  карточка репетитора: " + w.eval("JSON.stringify(state.taskResults)"));
  const d = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(x => ({w:x.w, status:x.status, knew:x.knew, forgot:x.forgot})))"));
  console.log("  словарь после подхода: " + JSON.stringify(d));
  console.log("ошибок JS: " + errors.length);
  process.exit(0);
})();
