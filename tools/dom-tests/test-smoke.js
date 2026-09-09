// Обход всех упражнений в настоящем DOM: каждое должно открыться,
// что-то нарисовать и не бросить исключение — ни на первом заходе,
// ни на десяти подряд с разными словарями.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { if (!c) { console.log("  ✗ " + what); fails++; } };

const IDS = w.eval("EXERCISES.filter(e => !e.hidden && e.id !== 'flashcards').map(e => e.id)");
console.log("упражнений к обходу:", IDS.length);

const DICTS = [
  ["самый обычный словарь", 60],
  ["крошечный словарь (2 слова)", 2],
  ["одно слово", 1],
];

for (const [label, size] of DICTS) {
  console.log("\n— " + label);
  w.eval(`state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, ${size})
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));`);
  for (const id of IDS) {
    errors.length = 0;
    let threw = null;
    try { w.eval(`openExercise(${JSON.stringify(id)})`); }
    catch (e) { threw = e.message; }
    const stage = doc.getElementById("ex-stage");
    const text = stage ? stage.textContent.replace(/\s+/g, " ").trim() : "";
    if (threw) { console.log(`  ✗ ${id}: упало — ${threw}`); fails++; continue; }
    if (errors.length) { console.log(`  ✗ ${id}: ошибка в обработчике — ${errors[0]}`); fails++; continue; }
    if (!text) { console.log(`  ✗ ${id}: пустой экран`); fails++; continue; }
    // Пустой экран с объяснением — это нормально; экран без объяснения — нет
    if (text.length < 12) { console.log(`  ✗ ${id}: экран почти пустой: «${text}»`); fails++; }
  }
  console.log("  (пройдено)");
}

console.log("\n— прокликивание: по каждому упражнению жмём всё подряд 40 раз");
w.eval(`state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
  .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));`);
for (const id of IDS) {
  errors.length = 0;
  let threw = null;
  try {
    w.eval(`openExercise(${JSON.stringify(id)})`);
    for (let n = 0; n < 40; n++) {
      const stage = doc.getElementById("ex-stage");
      if (!stage) break;
      const btns = [...stage.querySelectorAll("button, .mcq-option, .pair-item, .scr-tile, .cat-box, .ws-cell")]
        .filter(b => !b.disabled);
      if (!btns.length) break;
      // всегда первая живая кнопка: ответ чаще неверный, а нам нужен именно
      // путь ошибок — на нём и живут двойные засчитывания
      btns[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    }
  } catch (e) { threw = e.message + " | " + (e.stack || "").split("\n")[1]; }
  if (threw) { console.log(`  ✗ ${id}: упало при прокликивании — ${threw}`); fails++; }
  else if (errors.length) { console.log(`  ✗ ${id}: ошибка обработчика — ${errors[0]}`); fails++; }
}
console.log("  (пройдено)");

console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "все упражнения открываются и прокликиваются без ошибок"));
process.exit(fails ? 1 : 0);
