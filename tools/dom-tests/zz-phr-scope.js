// «Не буквально» / «Собери выражение» / «Что с чем» и рамка тренировки.
//
// _phrasePool решает, расширять ли пул до всех уровней (fit.length >= n
// ? fit : all), ДО того как отсечёт чужие слова по выбранной папке.
// Поэтому спасательное расширение уже не сработает: пул сузился по
// уровню, а потом из него выбросили всё, чего нет в папке.
//
// Живая история: ученица на B2 набрала идиом из словаря («+ Фразовые
// глаголы, идиомы, сочетания» показывает выражения СВОЕГО уровня),
// потом в «Тренировках» переключила уровень на A2 — повторить попроще.
const { w } = require("./harness-full.js");
// в стенде загружены только A1–B1, поэтому «Достаю слова…» не мешает смотреть выражения

const doc = w.document;
const E = s => w.eval(s);
const head = () => ((doc.querySelector("#ex-stage h2") || {}).textContent || "").trim();
const body = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

// кладём в словарь ровно то, что кладёт renderPhrasePicker (app.js)
const addFromPicker = (kind, lvlList, folder, n) => E(`(() => {
  const lv = ${JSON.stringify(lvlList)};
  const src = PHRASES[${JSON.stringify(kind)}].filter(x => lv.includes(x.level));
  state.dictionary = src.slice(0, ${n}).map(rec => ({
    w: rec.w, t: rec.t, ex: rec.ex, exr: rec.exr, def: rec.def, cat: rec.cat,
    level: rec.level, kind: rec.kind, literal: rec.literal, parts: rec.parts,
    status: "new", knew: 0, forgot: 0, folders: [${JSON.stringify(folder)}] }));
  state.folders = [${JSON.stringify(folder)}];
  state.trainFolders = [${JSON.stringify(folder)}];
  state.trainWords = [];
  return state.dictionary.length + " шт: " + state.dictionary.map(d => d.w).slice(0,6).join(", ") + " …";
})()`);

const openAll = () => {
  for (const ex of ["notliteral", "buildphrase"]) {
    E(`localStorage.removeItem("savelyExSeen")`);
    E(`openExercise(${JSON.stringify(ex)})`);
    const h = head();
    const cnt = (doc.querySelector("#ex-stage .test-counter") || {}).textContent || "";
    console.log(`    ${ex.padEnd(12)} → ${h || "подход пошёл, вопросов: " + cnt.split("/").pop().trim()}`);
    if (/нет подходящих слов/.test(h)) console.log("        " + body().slice(0, 190) + "…");
  }
};

console.log("=== 1. Папка «Идиомы»: 12 идиом, набранных на уровне B2\n");
E(`window.wordsReady = () => true; state.level = "B2"; state.trainLevel = "B2";`);
console.log("   уровень ученика:", E("studyLevel()"), "|", addFromPicker("idioms", ["B2","C1"], "Идиомы", 12));
openAll();

console.log("\n   ученик переключил «Уровень» в тренировках на A2 (повторить попроще):");
E(`state.trainLevel = "A2";`);
console.log("   уровень ученика:", E("studyLevel()"), "| словарь тот же, папка та же");
openAll();

console.log("\n=== 2. Смешанная папка: 10 фразовых глаголов B2 + 2 B1, ученик A2\n");
E(`state.level = "A2"; state.trainLevel = "A2";
   (() => {
     const b2 = PHRASES.phrasal.filter(x => x.level === "B2").slice(0, 10);
     const b1 = PHRASES.phrasal.filter(x => x.level === "B1").slice(0, 2);
     state.dictionary = [...b2, ...b1].map(rec => ({ w: rec.w, t: rec.t, level: rec.level,
       kind: rec.kind, literal: rec.literal, parts: rec.parts,
       status: "new", knew: 0, forgot: 0, folders: ["Фразовые глаголы"] }));
     state.folders = ["Фразовые глаголы"]; state.trainFolders = ["Фразовые глаголы"]; state.trainWords = [];
   })()`);
console.log("   в папке 12 фразовых глаголов (10 × B2, 2 × B1)");
openAll();
