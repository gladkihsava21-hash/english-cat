// Разведка: что за пул и экран получается у шести упражнений «По словам».
const { w } = require("./harness-full.js");
const doc = w.document;

const dump = id => {
  w.eval(`openExercise(${JSON.stringify(id)})`);
  const st = doc.getElementById("ex-stage");
  console.log("\n===== " + id + " =====");
  console.log(st.textContent.replace(/\s+/g, " ").slice(0, 400));
  console.log("-- кнопки:", [...st.querySelectorAll("button")].map(b => b.id || b.className + ":" + b.textContent.trim()).slice(0, 20).join(" | "));
};

["picture", "matching", "mcq", "spelling", "scramble", "defmatch"].forEach(dump);

// Есть ли в паре одинаковые правые тексты?
console.log("\n--- matching: тексты колонок ---");
w.eval('openExercise("matching")');
console.log("L:", [...doc.querySelectorAll("#pairs-l .pair-item")].map(b => b.textContent).join(" | "));
console.log("R:", [...doc.querySelectorAll("#pairs-r .pair-item")].map(b => b.textContent).join(" | "));
