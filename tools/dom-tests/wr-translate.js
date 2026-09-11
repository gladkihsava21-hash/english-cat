// «Перевод фразы» (translate → runType → translateReview).
// Проверяем, не объявляет ли проверка верный перевод ошибкой.
//  1) ученик написал РОВНО образец — тот самый текст, который упражнение
//     показывает как правильный ответ;
//  2) ученик написал сокращение (he's вместо he is) — обычный английский.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = sel => doc.querySelector(sel).dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const fs = require("fs"), path = require("path");

// догружаем все уровни словаря: у ученика B1+ в WORDS попадают B2/C1,
// а «Перевод фразы» берёт свой уровень и следующий
["B2", "C1", "C2"].forEach(l => {
  const s = doc.createElement("script");
  s.textContent = fs.readFileSync(path.resolve(__dirname, "..", "..", "js/words-" + l + ".js"), "utf8");
  doc.head.appendChild(s);
});

// --- 1) сколько предложений банка НЕ проходят собственную проверку ---
console.log("Ученик вводит РОВНО тот текст, который упражнение покажет как правильный:");
const byLevel = JSON.parse(E(`JSON.stringify((() => {
  const out = {};
  LEVELS.forEach((lvl, i) => {
    const next = LEVELS[Math.min(i + 1, LEVELS.length - 1)];
    const pool = [...(WORDS[lvl]||[]), ...(WORDS[next]||[])].filter(p => p.ex && p.exr);
    let bad = [];
    pool.forEach(p => { const r = translateReview(p.ex, p.ex, p.w);
      if (!r.ok) bad.push({ w: p.w, ex: p.ex, notes: r.notes, meaning: r.meaning }); });
    out[lvl] = { n: pool.length, bad: bad.length, ex: bad.slice(0, 4) };
  });
  return out;
})())`));
for (const [lvl, v] of Object.entries(byLevel)) {
  console.log(`  уровень ученика ${lvl}: предложений ${v.n}, образец не принят ${v.bad}`
            + ` (${(100 * v.bad / v.n).toFixed(1)}%)`);
  v.ex.forEach(b => console.log(`      «${b.ex}» → ${b.notes.join(" ")}`));
}

// --- то же, но через настоящий экран упражнения ---
console.log("\nПрогон через экран «Перевод фразы» (слово взято в тренировку галочкой):");
const victim = JSON.parse(E(`JSON.stringify((() => {
  for (const lvl of LEVELS) for (const p of (WORDS[lvl] || []))
    if (p.ex && p.exr && !translateReview(p.ex, p.ex, p.w).ok) return { ...p, lvl };
  return null;
})())`));
console.log("  берём:", victim.w, "|", victim.exr, "→", victim.ex);
E(`state.dictionary = [${JSON.stringify(victim)}];
   state.trainWords = [${JSON.stringify(victim.w)}];
   state.trainFolders = [];
   localStorage.clear();`);
E(`openExercise("translate")`);
console.log("  вопрос на экране:", doc.querySelector("#ex-stage .quiz-word").textContent.trim());
doc.getElementById("type-input").value = victim.ex;      // вводим образец слово в слово
click("#type-check");
console.log("  ответ ученика:", JSON.stringify(victim.ex));
console.log("  вердикт:", doc.getElementById("type-feedback").textContent.trim());
console.log("  разбор:", (doc.querySelector("#type-feedback + p") || {}).textContent
  ? doc.querySelector("#type-feedback + p").textContent.replace(/\s+/g, " ").trim() : "(нет)");

// --- 2) сокращения ---
console.log("\nСокращения (he's / I'm / don't) вместо полной формы:");
const cases = [
  ["He is my friend.", "He's my friend.", "friend"],
  ["It is a big city.", "It's a big city.", "city"],
  ["I am happy.", "I'm happy.", "happy"],
  ["I do not like it.", "I don't like it.", "like"],
];
cases.forEach(([sample, got, word]) => {
  const r = JSON.parse(E(`JSON.stringify(translateReview(${JSON.stringify(got)}, ${JSON.stringify(sample)}, ${JSON.stringify(word)}))`));
  console.log(`  образец «${sample}» ← ответ «${got}»: ${r.ok ? "ЗАЧТЕНО" : "НЕ ЗАЧТЕНО — " + r.notes.join(" ")}`);
});
