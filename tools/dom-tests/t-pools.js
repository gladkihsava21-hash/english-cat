// distractors / pickFresh / levelPool: сколько вариантов реально доезжает
// до экрана и не приезжает ли одно и то же задание дважды.
const { w } = require("./harness-full.js");

console.log("— сколько ловушек возвращает distractors(word, 3, 't') на живом банке:");
console.log(w.eval(`(() => {
  const hist = {};
  const bad = [];
  ["A1","A2","B1"].forEach(l => (WORDS[l] || []).forEach(x => {
    const d = distractors({ ...x, level: l }, 3, "t");
    hist[d.length] = (hist[d.length] || 0) + 1;
    if (d.length < 3 && bad.length < 6) bad.push(l + " " + x.w + " (" + x.t + ") → " + JSON.stringify(d));
  }));
  return "  ловушек 0/1/2/3: " + [0,1,2,3].map(k => (hist[k]||0)).join(" / ")
    + (bad.length ? "\\n  примеры неполных: \\n   " + bad.join("\\n   ") : "");
})()`));

console.log("\n— одинаковые примеры (ex) у разных слов одного уровня:");
console.log(w.eval(`(() => {
  const out = [];
  ["A1","A2","B1"].forEach(l => {
    const byEx = {};
    (WORDS[l] || []).forEach(x => { if (x.ex) (byEx[x.ex] = byEx[x.ex] || []).push(x.w); });
    const dup = Object.entries(byEx).filter(([, ws]) => ws.length > 1);
    out.push("  " + l + ": " + dup.length + " повторов" + (dup.length ? " — " + dup.slice(0,3).map(([e, ws]) => JSON.stringify(e) + " у " + ws.join("/")).join("; ") : ""));
  });
  return out.join("\\n");
})()`));

console.log("\n— pickFresh: приходит ли одно и то же задание дважды за подход");
console.log(w.eval(`(() => {
  // ключ у диктанта — сам текст примера; два разных слова с общим примером
  // дают два «разных» задания с одинаковым текстом
  localStorage.removeItem("savelyExSeen");
  const all = [
    { w: "a", ex: "The cat sleeps." }, { w: "b", ex: "The cat sleeps." },
    { w: "c", ex: "I like tea." },     { w: "d", ex: "He runs fast." },
    { w: "e", ex: "She sings well." },
  ];
  const picked = pickFresh("probe", all, 5, p => p.ex);
  const ex = picked.map(p => p.ex);
  const dup = ex.filter((x, i) => ex.indexOf(x) !== i);
  return "  подход: " + JSON.stringify(ex) + (dup.length ? "\\n  ПОВТОР: " + JSON.stringify(dup) : "\\n  повторов нет");
})()`));

console.log("\n— pickFresh: банк меньше подхода (что видит ученик два раза подряд)");
console.log(w.eval(`(() => {
  localStorage.removeItem("savelyExSeen");
  const all = [{ s: "1" }, { s: "2" }, { s: "3" }];
  const a = pickFresh("small", all, 5, x => x.s).map(x => x.s);
  const b = pickFresh("small", all, 5, x => x.s).map(x => x.s);
  return "  1-й подход: " + a.join(",") + "  2-й подход: " + b.join(",");
})()`));

console.log("\n— levelPool на верхнем уровне: банк складывается сам с собой");
console.log(w.eval(`(() => {
  // Имитируем верхний уровень: nextLvl === lvl, и WORDS[lvl] попадает дважды
  const top = LEVELS[LEVELS.length - 1];
  const lvl = studyLevel();
  const next = LEVELS[Math.min(LEVELS.indexOf(top) + 1, LEVELS.length - 1)];
  return "  studyLevel C2 → lvl=" + top + ", nextLvl=" + next + " → [...WORDS[C2], ...WORDS[C2]]"
    + " (каждое слово в пуле дважды)";
})()`));

// Реальный замер на C2: грузим файл уровня как это делает ensureWords
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
["words-B2.js", "words-C1.js", "words-C2.js"].forEach(f => {
  const s = w.document.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
  w.document.head.appendChild(s);
});
console.log(w.eval(`(() => {
  state.trainLevel = "C2"; state.trainFolders = []; state.trainWords = []; state.dictionary = [];
  const withEx = (WORDS.C2 || []).filter(x => x.ex).length;
  let dupPool = 0, dupRun = 0, sample = null;
  for (let k = 0; k < 200; k++) {
    const p = levelPool(6);
    const ns = p.map(x => x.w);
    if (ns.some((x, i) => ns.indexOf(x) !== i)) { dupPool++; if (!sample) sample = ns.join(", "); }
  }
  localStorage.removeItem("savelyExSeen");
  for (let k = 0; k < 100; k++) {
    const all = levelPool(60, ["ex"]);
    const pick = pickFresh("d:C2", all, 5, x => x.ex);
    const ns = pick.map(x => x.ex);
    if (ns.some((x, i) => ns.indexOf(x) !== i)) dupRun++;
  }
  return "  C2: слов " + WORDS.C2.length + ", из них с примером " + withEx
    + "\\n  levelPool(6): одно слово дважды в " + dupPool + " подходах из 200"
    + (sample ? " (например: " + sample + ")" : "")
    + "\\n  диктант (levelPool(60,['ex']) → pickFresh 5): одно предложение дважды в " + dupRun + " подходах из 100";
})()`));
process.exit(0);
