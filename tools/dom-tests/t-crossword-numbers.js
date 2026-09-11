// «Кроссворд»: номера слов на сетке. Два слова могут начинаться в одной
// клетке — тогда на сетке виден только один номер, и второе слово ученику
// негде начать искать.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

let runs = 0, hidden = 0, sample = null;
for (let i = 0; i < 80; i++) {
  let s = ((i + 1) * 2246822519) >>> 0;
  w.Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  w.eval('openExercise("crossword")');
  // Метка подсказки — номер и направление («6h», «6v»): два слова из одной
  // клетки делят номер, и различает их только направление. На сетке
  // рисуется сам номер — с ним и сверяем.
  const clues = [...doc.querySelectorAll(".cw-clue")].map(x => x.dataset.clue.replace(/[hv]$/, ""));
  if (!clues.length) continue;
  runs++;
  const onGrid = new Set([...doc.querySelectorAll(".cw-cell[data-num]")].map(x => x.dataset.num));
  const missing = clues.filter(c => !onGrid.has(c));
  if (missing.length) {
    hidden++;
    if (!sample) sample = {
      clues: [...doc.querySelectorAll(".cw-clue")].map(x => x.textContent.replace(/\s+/g, " ").trim()),
      onGrid: [...onGrid], missing,
    };
  }
}

console.log("\nПрогонов «Кроссворда»: " + runs);
console.log("Из них таких, где номер слова из списка подсказок НЕ нарисован на сетке: "
  + hidden + " (" + Math.round(hidden / runs * 100) + "%)");
if (sample) {
  console.log("  пример: подсказки — " + JSON.stringify(sample.clues));
  console.log("           номера на сетке — " + JSON.stringify(sample.onGrid)
    + ", потерян номер " + JSON.stringify(sample.missing));
}
ok(hidden === 0, "у каждого слова из списка есть свой номер на сетке");

console.log("\nошибок JS: " + errors.length);
console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
process.exit(fails ? 1 : 0);
