// Словарь разрезан по уровням: проверяем, что ученику едут ИМЕННО его
// уровни, что смена уровня догружает недостающее и что упражнение не
// стартует раньше загрузки.
//
// Сеть в jsdom выключена, поэтому loadScriptOnce подменяем счётчиком:
// нас интересует не сам факт скачивания, а какие файлы запрошены.
const { w } = require("./harness-full.js");
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  window.__asked = [];
  window.loadScriptOnce = function (src) {
    window.__asked.push(src);
    // Делаем вид, что файл доехал: заводим уровень пустым списком.
    const m = src.match(/words-([A-C][12])\\.js/);
    if (m) (window.WORDS = window.WORDS || {})[m[1]] = [];
    return Promise.resolve(true);
  };
`);

const asked = () => JSON.parse(w.eval("JSON.stringify(window.__asked)"));
const reset = () => w.eval("window.__asked = [];");

console.log("\n1. Какие уровни нужны ученику");
const cases = [
  ["A1", "A1,A2"],
  ["A2", "A1,A2,B1"],
  ["B1", "A1,A2,B1,B2"],
  ["B2", "A1,A2,B1,B2,C1"],
  ["C1", "A1,A2,B1,B2,C1,C2"],
  ["C2", "A1,A2,B1,B2,C1,C2"],
];
for (const [lvl, want] of cases) {
  const got = w.eval(`state.trainLevel = ${JSON.stringify(lvl)}; wordsLevels().join(",")`);
  ok(got === want, `${lvl} → ${got}`);
}
ok(w.eval(`state.trainLevel = "мусор"; wordsLevels().join(",")`) === "A1,A2,B1,B2,C1,C2",
   "неизвестный уровень — берём всё, а не падаем");

console.log("\n2. Лишнего не качаем");
w.eval(`state.trainLevel = "A2"; delete WORDS.B2; delete WORDS.C1; delete WORDS.C2;`);
reset();
w.eval("ensureWords()");
ok(asked().length === 0, "A1, A2 и B1 уже есть — запросов ноль, а не " + asked().length);

console.log("\n3. Сменился уровень — догружаем недостающее");
w.eval(`state.trainLevel = "B2";`);
reset();
w.eval("ensureWords()");
const a3 = asked();
ok(a3.length === 2, "запрошено два файла, а не " + a3.length);
ok(a3.some(x => x.includes("words-B2")) && a3.some(x => x.includes("words-C1")),
   "именно B2 и C1: " + a3.join(", "));
ok(!a3.some(x => x.includes("words-C2")), "C2 ученику B2 не нужен и не запрошен");

console.log("\n4. Страница репетитора берёт весь словарь");
w.eval(`delete WORDS.C2;`);
reset();
w.eval("ensureWords(LEVELS)");
ok(asked().some(x => x.includes("words-C2")), "ensureWords(LEVELS) тянет и C2");

console.log("\n5. Готовность считается по нужным уровням, а не по «объект есть»");
w.eval(`state.trainLevel = "C1"; delete WORDS.C2;`);
ok(w.eval("typeof WORDS !== 'undefined'") === true, "объект WORDS на месте");
ok(w.eval("wordsReady()") === false, "но wordsReady() = false: C2 ещё не доехал");
ok(w.eval("wordsReady(['A1','A2'])") === true, "а для A1+A2 — true");
w.eval(`state.trainLevel = "A2";`);
ok(w.eval("wordsReady()") === true, "ученику A2 всего хватает");

console.log("\n6. Упражнение не стартует раньше словаря");
w.eval(`state.trainLevel = "C1"; delete WORDS.C2; window.__asked = [];`);
w.eval('openExercise("mcq")');
const stage = w.document.getElementById("ex-stage");
ok(/Достаю слова/.test(stage.textContent), "показан экран ожидания: " + stage.textContent.replace(/\s+/g, " ").trim().slice(0, 40));
ok(asked().some(x => x.includes("words-C2")), "и недостающий уровень запрошен");

console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "разрезанный словарь грузится правильно"));
process.exit(fails ? 1 : 0);
