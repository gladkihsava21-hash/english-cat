const { w } = require("./harness-full.js");
console.log(w.eval(`(() => {
  const pick = ["plate","dish","big","large","shop","store","table","desk","cheque","receipt"];
  return JSON.stringify(LEVELS.flatMap(l => (WORDS[l]||[]).filter(x => pick.includes(x.w)).map(x => l + " " + x.w + " («" + x.t + "») def: " + (x.def||"—"))), null, 1);
})()`));
