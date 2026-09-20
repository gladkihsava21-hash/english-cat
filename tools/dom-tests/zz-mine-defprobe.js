// «Определения»: не бывает ли так, что определение одного слова подхода
// содержит ДРУГОЕ слово этого же подхода — тогда прямая подсказка ведёт
// ученика в неверную пару.
const { w } = require("./harness-full.js");
const doc = w.document;
w.eval(`window.readGateMs = () => 0;
  window.__cap = null; const _p = runPairs;
  window.runPairs = function (p, o) { window.__cap = p; return _p(p, o); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
`);
let hits = 0, runs = 0, samples = [];
for (let k = 0; k < 60; k++) {
  w.eval(`state.dictionary = [...WORDS.A1, ...WORDS.A2].sort(() => Math.random() - 0.5).slice(0, 25)
    .map(x => ({ w:x.w, t:x.t, ex:x.ex, def:x.def, cat:x.cat, added:Date.now(), seen:1 }));
    openExercise("defmatch");`);
  const pairs = JSON.parse(w.eval("JSON.stringify(window.__cap)"));
  if (!pairs || pairs.length < 2) continue;
  runs++;
  for (const a of pairs) for (const b of pairs) {
    if (a === b) continue;
    const re = new RegExp("\\b" + b.l.toLowerCase().replace(/[^a-z]/g, "") + "\\b");
    if (re.test(String(a.r).toLowerCase())) {
      hits++;
      if (samples.length < 6) samples.push(`«${a.l}» → "${a.r}"   ← содержит слово «${b.l}» из этого же подхода`);
    }
  }
}
console.log("подходов «Определения»:", runs, " случаев «определение называет чужое слово подхода»:", hits);
samples.forEach(s => console.log("  " + s));
