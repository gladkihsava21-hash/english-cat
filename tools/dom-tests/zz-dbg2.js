const { w } = require("./harness-full.js");
const doc = w.document;
w.eval(`window.readGateMs = () => 0;
  window.__cap = null; const _mcq = runMCQ;
  window.runMCQ = function (r, o) { window.__cap = r; return _mcq(r, o); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [...WORDS.A1.slice(0, 20), ...WORDS.A2.slice(0, 20)]
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, def: x.def, cat: x.cat, added: Date.now(), seen: 1 }));
  openExercise("picture");`);
console.log("rounds[0]:", w.eval("JSON.stringify(window.__cap[0])").slice(0, 400));
console.log("кнопок:", [...doc.querySelectorAll("#ex-stage .mcq-option")].map(b => JSON.stringify(b.textContent)).join(" | "));
console.log("stage:", doc.getElementById("ex-stage").textContent.replace(/\s+/g," ").slice(0,200));
