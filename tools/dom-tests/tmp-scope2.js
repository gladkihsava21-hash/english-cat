// _phrasePool: уровневый отбор стоит ДО отбора по папке.
//   fit  = банк, отфильтрованный по уровню ученика (свой ±1)
//   pool = fit.length >= n ? fit : весь банк
//   затем pool.filter(scope)   ← папка ученика применяется к уже урезанному
// Значит выражения из ЕГО ЖЕ папки, если они не соседнего уровня, до
// упражнения не доходят вовсе.
const { w } = require("./harness-full.js");
const doc = w.document;
const st = () => doc.getElementById("ex-stage");
const txt = () => (st().textContent || "").replace(/\s+/g, " ").trim();

const setup = (level, kind, folder, take) => w.eval(`(function () {
  state.trainLevel = ${JSON.stringify(level)};
  const src = ${take};
  state.dictionary = src.map(x => ({ w: x.w, t: x.t, ex: x.ex, kind: x.kind, level: x.level,
    parts: x.parts, literal: x.literal, added: Date.now(), seen: 1, folders: [${JSON.stringify(folder)}] }));
  state.folders = [${JSON.stringify(folder)}];
  state.trainFolders = [${JSON.stringify(folder)}];
  state.trainWords = [];
  return src.map(x => x.w + " (" + x.level + ")");
})()`);

console.log("СЦЕНАРИЙ 1. Ученик набрал папку «Фразовые глаголы» на уровне A1,");
console.log("потом вырос и переключил «Тренируем» на B1.\n");
let words = setup("B1", "phrasal", "Фразовые глаголы",
  "PHRASES.phrasal.filter(x => x.level === 'A1').slice(0, 10)");
console.log("  в папке 10 выражений:", words.join(", "));
console.log("  studyLevel():", w.eval("studyLevel()"));
console.log("  папка видна упражнению? trainingScope().size =", w.eval("trainingScope().size"));
console.log("  _phrasePool('any', 8, ['literal','t']) вернул:",
  w.eval("EX_RUNNERS._phrasePool('any', 8, ['literal','t']).length"), "выражений");
w.eval('openExercise("notliteral")');
console.log("\n  ЭКРАН «Не буквально»:\n  >>> " + txt().slice(0, 230));
w.eval('openExercise("buildphrase")');
console.log("\n  ЭКРАН «Собери выражение»:\n  >>> " + txt().slice(0, 230));

console.log("\n\nСЦЕНАРИЙ 2. Папка «Сочетания» из 10 коллокаций B2, ученик тренирует A2.\n");
words = setup("A2", "colloc", "Сочетания",
  "PHRASES.colloc.filter(x => x.level === 'B2').slice(0, 10)");
console.log("  в папке:", words.join(", "));
console.log("  _phrasePool('colloc', 8, ['parts','t']) вернул:",
  w.eval("EX_RUNNERS._phrasePool('colloc', 8, ['parts','t']).length"), "выражений");
w.eval('openExercise("collocpair")');
console.log("\n  ЭКРАН «Что с чем»:\n  >>> " + txt().slice(0, 230));

console.log("\n\nСЦЕНАРИЙ 3. Смешанная папка: 4 фразовых A2 + 8 фразовых B2, ученик A2.");
console.log("Подход молча укорачивается до тех, что подошли по уровню.\n");
w.eval(`(function () {
  state.trainLevel = "A2";
  const src = PHRASES.phrasal.filter(x => x.level === "A2").slice(0, 4)
    .concat(PHRASES.phrasal.filter(x => x.level === "B2").slice(0, 8));
  state.dictionary = src.map(x => ({ w: x.w, t: x.t, kind: x.kind, level: x.level, parts: x.parts,
    literal: x.literal, added: Date.now(), seen: 1, folders: ["Фразовые глаголы"] }));
  state.folders = ["Фразовые глаголы"]; state.trainFolders = ["Фразовые глаголы"]; state.trainWords = [];
})()`);
console.log("  в папке 12 выражений, из них уровня A2 — 4");
w.eval("localStorage.removeItem('savelyExSeen')");
w.eval('openExercise("notliteral")');
console.log("  счётчик подхода: " + (st().querySelector(".test-counter") || {}).textContent);

console.log("\n\nКОНТРОЛЬ. Та же папка, но ученик на своём уровне (A1 для A1-выражений):\n");
words = setup("A1", "phrasal", "Фразовые глаголы",
  "PHRASES.phrasal.filter(x => x.level === 'A1').slice(0, 10)");
w.eval("localStorage.removeItem('savelyExSeen')");
w.eval('openExercise("notliteral")');
console.log("  >>> " + txt().slice(0, 150));
process.exit(0);
