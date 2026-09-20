// Есть ли одно и то же слово в двух банках уровней (полный набор A1..C2)?
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..", "..");
const ctx = { window: {} };
ctx.globalThis = ctx;
vm.createContext(ctx);
["A1","A2","B1","B2","C1","C2"].forEach(l => {
  const src = fs.readFileSync(path.join(ROOT, "js", "words-" + l + ".js"), "utf8");
  vm.runInContext(src, ctx);
});
const W = ctx.window.WORDS;
const LV = ["A1","A2","B1","B2","C1","C2"];
LV.forEach(l => console.log(l, (W[l]||[]).length));
const seen = new Map();
LV.forEach(l => (W[l]||[]).forEach(x => {
  const k = String(x.w).toLowerCase();
  if (!seen.has(k)) seen.set(k, []);
  seen.get(k).push(l + ":" + x.t);
}));
const dup = [...seen.entries()].filter(([, v]) => v.length > 1);
console.log("\nслов больше чем в одном банке:", dup.length);
dup.slice(0, 15).forEach(([k, v]) => console.log("  ", k, "→", v.join(" | ")));
// соседние уровни — именно они складываются в trainPool/levelPool
const pairsAdj = dup.filter(([, v]) => {
  const ls = v.map(s => s.split(":")[0]);
  return ls.some((a, i) => ls.some((b, j) => j !== i && Math.abs(LV.indexOf(a) - LV.indexOf(b)) === 1));
});
console.log("из них в СОСЕДНИХ уровнях:", pairsAdj.length);
pairsAdj.slice(0, 10).forEach(([k, v]) => console.log("   ", k, "→", v.join(" | ")));
// одинаковые переводы внутри одного уровня — по всем уровням
LV.forEach(l => {
  const m = new Map();
  (W[l]||[]).forEach(x => { const k = x.t; if (!m.has(k)) m.set(k, []); m.get(k).push(x.w); });
  const d = [...m.entries()].filter(([, v]) => v.length > 1);
  console.log(l, "— групп одинаковых переводов:", d.length, d.length ? " напр. " + d.slice(0,3).map(([t,v])=>t+"←"+v.join("/")).join(" · ") : "");
});
