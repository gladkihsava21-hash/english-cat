const { w } = require("./harness-full.js");
const doc = w.document;
w.eval(`window.readGateMs = () => 0;
  state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w:"big",   t:"большой", added:Date.now(), seen:1, folders:["Синонимы"] },
    { w:"large", t:"большой", added:Date.now(), seen:1, folders:["Синонимы"] },
    { w:"huge",  t:"большой", added:Date.now(), seen:1, folders:["Синонимы"] },
  ];
  state.trainFolders = ["Синонимы"];
  openExercise("spelling");
`);
console.log("allFolders:", w.eval("JSON.stringify(typeof allFolders === 'function' ? allFolders() : 'нет')"));
console.log("trainingFolders:", w.eval("JSON.stringify(trainingFolders())"));
console.log("trainingDictionary:", w.eval("JSON.stringify(trainingDictionary().map(d=>d.w))"));
console.log("--- stage HTML ---");
console.log(doc.getElementById("ex-stage").innerHTML.slice(0, 1200));
