// Насколько часто «две одинаковые» вообще выпадают на обычном словаре.
// Словарь ученика собран как у живого: 30 слов A1, среди них есть пары
// синонимов из самого банка (shop/store, plate/dish, city/town, big/large).
const { w, MQ } = require("./harness-full.js");
const doc = w.document;
MQ.matches = true;

w.eval(`
  const src = [...WORDS.A1];
  const twins = ["shop","store","plate","dish","city","town","big","large"];
  const rest = src.filter(x => !twins.includes(x.w)).slice(0, 22);
  state.dictionary = [...twins.map(n => src.find(d => d.w === n)), ...rest]
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, cat: x.cat, added: Date.now(), seen: 1 }));
  state.trainFolders = [];
`);
const tOf = JSON.parse(w.eval("JSON.stringify(Object.fromEntries(state.dictionary.map(d => [d.w, d.t])))"));
const all = JSON.parse(w.eval("JSON.stringify(Object.fromEntries([...WORDS.A1, ...WORDS.A2, ...WORDS.B1].map(d => [d.w, d.t])))"));
const tr = word => tOf[word] || all[word];

const tick = ms => new Promise(r => setTimeout(r, ms || 5));

(async () => {
  let balDirty = 0, memDirty = 0;
  const N = 100;
  for (let k = 0; k < N; k++) {
    w.eval('show("practice"); openExercise("balloons")');
    await tick();
    const ru = doc.getElementById("bal-ru").textContent.trim();
    const opts = [...doc.querySelectorAll("#bal-stage .bal")].map(b => b.getAttribute("aria-label"));
    if (opts.filter(o => tr(o) === ru).length > 1) {
      balDirty++;
      if (balDirty <= 3) console.log(`  шары: «${ru}» → ${JSON.stringify(opts)}`);
    }

    w.eval('show("practice"); openExercise("memory")');
    await tick();
    const ruCards = [...doc.querySelectorAll("#mem-grid .mem-card .mem-front")]
      .filter(el => el.getAttribute("lang") !== "en").map(el => el.textContent.trim());
    const dup = ruCards.filter((t, i) => ruCards.indexOf(t) !== i);
    if (dup.length) {
      memDirty++;
      if (memDirty <= 3) console.log(`  пары: две карточки «${dup.join("», «")}» на поле`);
    }
  }
  console.log(`\nсловарь 30 слов A1 (в нём 4 пары синонимов из банка), ${N} подходов:`);
  console.log(`  «Лопни шар»: два верных шара в ПЕРВОМ раунде — ${balDirty} из ${N}`
    + ` (в подходе восемь раундов, так что реально чаще)`);
  console.log(`  «Найди пару»: две одинаковые карточки на поле — ${memDirty} из ${N}`);
  process.exit(0);
})();
