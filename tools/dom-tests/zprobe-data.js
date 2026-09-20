const { w } = require("./harness-full.js");
const out = w.eval(`(() => {
  const res = { levels: LEVELS.slice(), sizes: {}, cross: [], dupT: {}, dupDef: [] };
  LEVELS.forEach(l => res.sizes[l] = (WORDS[l]||[]).length);
  const byWord = new Map();
  LEVELS.forEach(l => (WORDS[l]||[]).forEach(x => {
    const k = x.w.toLowerCase();
    if (!byWord.has(k)) byWord.set(k, []);
    byWord.get(k).push(l + ":" + x.t);
  }));
  res.crossCount = 0;
  byWord.forEach((v,k) => { if (v.length>1) { res.crossCount++; if (res.cross.length<12) res.cross.push(k + " → " + v.join(" | ")); } });
  ["A1","A2","B1"].forEach(l => {
    const m = new Map();
    (WORDS[l]||[]).forEach(x => { const k=x.t; if(!m.has(k)) m.set(k,[]); m.get(k).push(x.w); });
    const dup = [];
    m.forEach((v,k) => { if (v.length>1) dup.push("«"+k+"» ← "+v.join(", ")); });
    res.dupT[l] = { count: dup.length, sample: dup.slice(0,8) };
  });
  const dm = new Map();
  LEVELS.forEach(l => (WORDS[l]||[]).forEach(x => { if(!x.def) return; const k=x.def.toLowerCase(); if(!dm.has(k)) dm.set(k,[]); dm.get(k).push(x.w); }));
  res.dupDefCount = 0;
  dm.forEach((v,k) => { if (new Set(v.map(s=>s.toLowerCase())).size>1) { res.dupDefCount++; if (res.dupDef.length<8) res.dupDef.push(v.join(", ")+" → "+k.slice(0,70)); } });
  return JSON.stringify(res, null, 1);
})()`);
console.log(out);
