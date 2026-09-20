// Гипотеза: на верхнем уровне (C2) nextLvl === lvl, банк складывается сам
// с собой, и в подход попадает одно и то же слово дважды.
const { w } = require("./harness-full.js");
const doc = w.document;

w.eval(`state.trainLevel = "C2"; state.trainFolders = []; state.trainWords = [];`);
console.log("studyLevel() =", w.eval("studyLevel()"));

// 1. levelPool
console.log("\n— levelPool(6) двадцать раз:");
console.log(w.eval(`(() => {
  let withDup = 0, sample = null;
  for (let k = 0; k < 20; k++) {
    const p = levelPool(6);
    const names = p.map(x => x.w);
    const dup = names.filter((x, i) => names.indexOf(x) !== i);
    if (dup.length) { withDup++; if (!sample) sample = names.join(", ") + "  → дубль: " + dup.join(","); }
  }
  return "подходов с дублем: " + withDup + " из 20" + (sample ? "\\n  пример: " + sample : "");
})()`));

// 2. trainPool с включённым добором
console.log("\n— trainPool(8) с trainMixNew, словарь 3 слова, двадцать раз:");
console.log(w.eval(`(() => {
  state.trainMixNew = true;
  state.dictionary = WORDS.C2.slice(0, 3).map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
  let withDup = 0, sample = null;
  for (let k = 0; k < 20; k++) {
    const p = trainPool(8);
    const names = p.map(x => x.w);
    const dup = names.filter((x, i) => names.indexOf(x) !== i);
    if (dup.length) { withDup++; if (!sample) sample = names.join(", ") + "  → дубль: " + dup.join(","); }
  }
  return "подходов с дублем: " + withDup + " из 20" + (sample ? "\\n  пример: " + sample : "");
})()`));

// 3. Что видит ученик: реальный подход «Аудирование» (levelPool(6)).
console.log("\n— реальный подход listening: те же вопросы на экране?");
w.eval(`
  window.readGateMs = () => 0;
  window.__stat = [];
  const _s = statUpdate;
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _s(word, ok, v); };
`);
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
(async () => {
  let found = 0;
  for (let attempt = 0; attempt < 12 && !found; attempt++) {
    w.eval(`window.__stat = []; state.dictionary = []; openExercise("listening")`);
    await tick();
    const asked = [];
    for (let n = 0; n < 60; n++) {
      const stage = doc.getElementById("ex-stage");
      const opts = [...stage.querySelectorAll(".mcq-option")].filter(b => b.getAttribute("aria-disabled") !== "true");
      if (!opts.length) {
        const nb = stage.querySelector("#mcq-next");
        if (nb) { nb.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await tick(); continue; }
        break;
      }
      // какое слово спрашивают — берём из statWord через журнал после ответа
      opts[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      await tick(40);
    }
    const stat = JSON.parse(w.eval("JSON.stringify(window.__stat)"));
    const words = stat.map(x => x[0]);
    const dup = words.filter((x, i) => words.indexOf(x) !== i);
    if (dup.length) {
      found = 1;
      console.log("  попытка", attempt + 1, "→ слова подхода:", words.join(", "));
      console.log("  ПОВТОР в одном подходе:", [...new Set(dup)].join(", "));
    }
  }
  if (!found) console.log("  за 12 подходов повтора на экране не выпало");
  process.exit(0);
})();
