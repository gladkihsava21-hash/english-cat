// «Категории»: какие пары тем игра ставит рядом и какие слова в них падают.
// Мерка — та самая, что уже стоит в соседней игре «Найди лишнее»:
// CONCRETE (конкретные темы) + WORLD (темы из разных «миров»).
const { w } = require("./harness-full.js");
const doc = w.document;

w.eval(`
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

// Копии констант из oddone (js/exercises.js, ~2116) — их там не экспортируют
const CONCRETE = ["food", "animals", "clothes", "body", "family", "home", "school",
                  "city", "travel", "weather", "nature", "sports", "work", "health",
                  "tech", "art", "time", "money"];
const WORLD = { food: "food", animals: "life", nature: "life", weather: "life",
                clothes: "clothes", body: "person", health: "person", family: "family",
                home: "place", city: "place", travel: "place", school: "study",
                work: "study", sports: "sports", tech: "tech", art: "art",
                time: "time", money: "money" };

const seen = {};
let vague = 0, sameWorld = 0, total = 0;
const examples = {};

for (let i = 0; i < 120; i++) {
  // своя случайность на каждый прогон
  let s = (i * 2654435761) >>> 0;
  w.Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  w.eval('openExercise("categories")');
  const boxes = [...doc.querySelectorAll(".cat-box")];
  if (boxes.length < 2) continue;
  total++;
  const keys = boxes.map(b => b.dataset.cat);
  const names = boxes.map(b => b.querySelector(".cat-box-title").textContent);
  const pair = keys.slice().sort().join("+");
  seen[pair] = (seen[pair] || 0) + 1;
  const bad = keys.some(k => !CONCRETE.includes(k));
  const same = WORLD[keys[0]] && WORLD[keys[0]] === WORLD[keys[1]];
  if (bad) vague++;
  if (same) sameWorld++;
  if ((bad || same) && !examples[pair]) {
    examples[pair] = {
      names,
      words: [...doc.querySelectorAll(".cat-word")].map(x => x.textContent + " (" + x.title + ")"),
    };
  }
}

console.log("\nПрогонов «Категорий»: " + total);
console.log("Пар, где хоть одна тема НЕ из списка конкретных (CONCRETE «Найди лишнее»): "
  + vague + " (" + Math.round(vague / total * 100) + "%)");
console.log("Пар из одного «мира» (WORLD «Найди лишнее» такие запрещает): " + sameWorld);
console.log("\nСамые частые пары:");
Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([p, n]) => console.log("  " + p + " — " + n));
console.log("\nПримеры спорных раскладов (что именно видит ученик):");
Object.entries(examples).slice(0, 6).forEach(([p, e]) => {
  console.log("  «" + e.names.join("» и «") + "»  [" + p + "]");
  console.log("     слова: " + e.words.join(", "));
});
