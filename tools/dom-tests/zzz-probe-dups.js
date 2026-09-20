// Есть ли в банке слова с ОДИНАКОВЫМ переводом (для «Сопоставления»)
// и с одинаковым определением (для «Определений»)?
const { w } = require("./harness-full.js");

const res = w.eval(`(function(){
  const out = { t: [], def: [], within: [] };
  const byT = new Map(), byDef = new Map();
  for (const lvl of LEVELS) for (const x of (WORDS[lvl] || [])) {
    if (x.t) { const k = x.t.trim(); (byT.get(k) || byT.set(k, []).get(k)).push(x.w + "@" + lvl); }
    if (x.def) { const k = x.def.trim().toLowerCase(); (byDef.get(k) || byDef.set(k, []).get(k)).push(x.w + "@" + lvl); }
  }
  for (const [k, v] of byT) if (v.length > 1) out.t.push(k + " → " + v.join(", "));
  for (const [k, v] of byDef) if (v.length > 1) out.def.push(k + " → " + v.join(", "));
  out.levels = LEVELS.filter(l => (WORDS[l]||[]).length).map(l => l + ":" + WORDS[l].length);
  return out;
})()`);
console.log("уровни в памяти:", res.levels.join(" "));
console.log("\nодинаковый перевод (" + res.t.length + "):");
console.log(res.t.slice(0, 40).join("\n"));
console.log("\nодинаковое определение (" + res.def.length + "):");
console.log(res.def.slice(0, 20).join("\n"));
