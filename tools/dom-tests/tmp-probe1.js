// разведка: сколько в банке слов с одинаковым переводом
const { w } = require("./harness-full.js");
const dup = w.eval(`(() => {
  const map = {};
  LEVELS.forEach(l => WORDS[l].forEach(x => { (map[x.t] = map[x.t] || new Set()).add(x.w); }));
  const out = Object.entries(map).filter(([t, s]) => s.size > 1).map(([t, s]) => [t, [...s]]);
  return JSON.stringify({ total: out.length, sample: out.slice(0, 20) });
})()`);
console.log(dup);
