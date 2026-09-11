// Диктант против настоящего банка предложений.
//
// «Идеальный ученик» — тот, кто расслышал фразу и записал её так, как её
// напишет любая клавиатура: прямой апостроф, латиница без диакритики.
// Если такому ученику тренажёр говорит «Не совсем» — виноват не ученик.
const fs = require("fs");
const path = require("path");
const { w } = require("./harness-full.js");
const ROOT = path.resolve(__dirname, "..", "..");

// добираем уровни, которых нет в стенде по умолчанию
["js/words-B2.js", "js/words-C1.js", "js/words-C2.js"].forEach(f => {
  const s = w.document.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  w.document.head.appendChild(s);
});

// как это напишет ученик: типографику меняем на то, что есть на клавиатуре
const asTyped = s => s
  .replace(/[’‘‛]/g, "'").replace(/[“”«»]/g, '"')
  .replace(/[—–]/g, "-")
  .replace(/𝑥/g, "x")
  .normalize("NFD").replace(/[̀-ͯ]/g, "");   // café → cafe

const diff = (typed, sample) =>
  JSON.parse(w.eval(`JSON.stringify(dictationDiff(${JSON.stringify(typed)}, ${JSON.stringify(sample)}))`));

const levels = JSON.parse(w.eval("JSON.stringify(Object.keys(WORDS))"));
let total = 0;
const broken = [];
for (const lvl of levels) {
  const bank = JSON.parse(w.eval(`JSON.stringify((WORDS[${JSON.stringify(lvl)}] || []).filter(x => x.ex).map(x => ({ w: x.w, ex: x.ex })))`));
  for (const rec of bank) {
    const typed = asTyped(rec.ex);
    total++;
    const d = diff(typed, rec.ex);
    if (!d.ok) broken.push({ lvl, w: rec.w, ex: rec.ex, typed, missed: d.missed, extra: d.extra });
  }
}
console.log(`уровни: ${levels.join(", ")}`);
console.log(`предложений в банке (с ex): ${total}`);
console.log(`ученик записал фразу верно, а тренажёр сказал «не совсем»: ${broken.length}\n`);
broken.forEach(b => {
  console.log(`[${b.lvl}] слово «${b.w}»`);
  console.log(`   диктуют: ${b.ex}`);
  console.log(`   ученик : ${b.typed}`);
  console.log(`   вердикт: не расслышал ${JSON.stringify(b.missed)}, лишние ${JSON.stringify(b.extra)}`);
  console.log(`   на экране: «${String(w.eval(`dictationReviewHTML(${JSON.stringify(b.typed)}, ${JSON.stringify(b.ex)})`))
      .replace(/<[^>]+>/g, "").replace(/&#39;/g, "'").replace(/\s+/g, " ").trim()}»`);
});

// то же самое, но наоборот: банк с прямым апострофом, а ученик на айфоне
console.log("\n--- обратный случай: в банке ' , а телефон ставит ’ ---");
for (const [sample, typed] of [["It's a bone.", "It’s a bone."], ["I don't know.", "I don’t know."]]) {
  const d = diff(typed, sample);
  console.log(`  ${JSON.stringify(sample)} ← ${JSON.stringify(typed)} : ok=${d.ok}` +
              (d.ok ? "" : `, не расслышал ${JSON.stringify(d.missed)}`));
}
