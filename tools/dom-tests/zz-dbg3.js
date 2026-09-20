const { w } = require("./harness-full.js");
console.log(w.eval(`(() => {
  const need = ["тарелка","чашка","ложка","вилка","нож","стакан","миска","блюдо","кухня","стол"];
  const out = [];
  ["A1","A2"].forEach(l => (WORDS[l]||[]).forEach(x => { if (need.includes(x.t)) out.push(l + " " + x.w + " = " + x.t); }));
  return JSON.stringify(out);
})()`));
