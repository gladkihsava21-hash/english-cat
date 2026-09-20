// notliteral: отвлекающие отсеиваются строгим x.t !== p.t. Ищем пары, где
// строки РАЗНЫЕ, а по-русски это один и тот же ответ.
const { w } = require("./harness-full.js");
const P = w.eval("PHRASES");
const all = [...P.phrasal, ...P.idioms];
// варианты перевода внутри записи: «сдаваться, бросать» → [сдаваться, бросать]
const vars = t => String(t).split(/[;,]|\s\/\s/).map(s => s.replace(/\(.*?\)/g, "").trim().toLowerCase()).filter(Boolean);

console.log("=== пары выражений, у которых перевод пересекается по варианту ===");
const seen = new Set();
let n = 0;
for (const a of all) for (const b of all) {
  if (a === b || a.t === b.t) continue;
  const key = [a.w, b.w].sort().join("|");
  if (seen.has(key)) continue;
  const va = vars(a.t), vb = vars(b.t);
  const common = va.filter(x => vb.includes(x));
  if (!common.length) continue;
  seen.add(key); n++;
  console.log(`  ${a.w} = «${a.t}»  ×  ${b.w} = «${b.t}»   общий вариант: ${common.join(", ")}`);
}
console.log("всего пар:", n);

console.log("\n=== части parts короче двух (пул buildphrase/collocpair их выкинет) ===");
console.log("phrasal/idioms:", all.filter(x => !x.parts || x.parts.length < 2).map(x => x.w));
console.log("colloc:", P.colloc.filter(x => !x.parts || x.parts.length < 2).map(x => x.w));
process.exit(0);
