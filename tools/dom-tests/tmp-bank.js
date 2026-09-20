// Брутфорс по банку: строим раунды теми же формулами, что упражнения,
// и ищем случаи, когда верный ответ неотличим от отвлекающего.
const { w } = require("./harness-full.js");
const P = w.eval("PHRASES");
const all = [...P.phrasal, ...P.idioms];

console.log("=== buildphrase: parts.join(' ') !== w ===");
let n1 = 0;
all.forEach(x => { if (x.parts && x.parts.join(" ") !== x.w) { n1++; if (n1 <= 20) console.log(" ", JSON.stringify(x.w), "vs", JSON.stringify(x.parts.join(" "))); } });
console.log("всего:", n1);

console.log("\n=== collocpair: parts.join(' ') !== w ===");
let n2 = 0;
P.colloc.forEach(x => { if (x.parts && x.parts.join(" ") !== x.w) { n2++; if (n2 <= 20) console.log(" ", JSON.stringify(x.w), "vs", JSON.stringify(x.parts.join(" "))); } });
console.log("всего:", n2);

console.log("\n=== notliteral: у скольких записей нет literal? ===");
console.log("phrasal без literal:", P.phrasal.filter(x => !x.literal).length,
            "| idioms без literal:", P.idioms.filter(x => !x.literal).length);

console.log("\n=== collocpair: отвлекающий даёт настоящее сочетание (тот же хвост) ===");
const realPairs = new Set(P.colloc.filter(x => x.parts).map(x => x.parts.join(" ")));
let amb = 0;
P.colloc.forEach(p => {
  if (!p.parts || p.parts.length < 2) return;
  const head = p.parts[0], rest = p.parts.slice(1).join(" ");
  const cands = [...new Set(P.colloc.filter(x => x.parts && x.parts[0] && x.parts[0] !== head).map(x => x.parts[0]))];
  const bad = cands.filter(h => realPairs.has(h + " " + rest));
  if (bad.length) { amb++; if (amb <= 25) console.log(`  «… ${rest}» (${p.t}) верно "${head}", но отвлекающими могут стать`, bad); }
});
console.log("раундов с возможной двусмысленностью:", amb, "из", P.colloc.length);

console.log("\n=== buildphrase: parts, где несколько порядков дают реальные фразы ===");
const realPh = new Set(all.map(x => x.w));
let amb2 = 0;
all.forEach(p => {
  if (!p.parts || p.parts.length !== 2) return;
  const rev = p.parts[1] + " " + p.parts[0];
  if (realPh.has(rev)) { amb2++; console.log(`  ${p.w} ↔ ${rev} (обе есть в банке)`); }
});
console.log("двусмысленных сборок:", amb2);
process.exit(0);
