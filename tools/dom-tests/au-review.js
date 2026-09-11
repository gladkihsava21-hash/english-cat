// Упражнения «На слух» тестируются с речью: без неё их теперь честно
// не пускает заслон на входе (см. openExercise).
process.env.TTS = "1";
// «На слух»: что тренажёр ГОВОРИТ ученику про его ответ.
//   A. Диктант: разбор при лишних словах.
//   B. Диктант: апостроф из телефонной клавиатуры (’ вместо ').
//   C. Аудирование: текст вопроса в разборе после подхода.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const strip = h => String(h).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

w.eval(`
  window.__log = { rounds: null, type: null };
  const _m = runMCQ, _t = runType;
  window.runMCQ  = function (r, o) { window.__log.rounds = r; return _m(r, o); };
  window.runType = function (r, o) { window.__log.type = r; return _t(r, o); };
`);
const diff = (typed, sample) =>
  JSON.parse(w.eval(`JSON.stringify(dictationDiff(${JSON.stringify(typed)}, ${JSON.stringify(sample)}))`));
const review = (typed, sample) =>
  w.eval(`dictationReviewHTML(${JSON.stringify(typed)}, ${JSON.stringify(sample)})`);

(async () => {
  console.log("=== A. Диктант: ученик дописал лишнее ===");
  for (const [sample, typed] of [
    ["The cat sits.", "The cat sits happily forever"],
    ["I like tea.", "I like tea very much"],
    ["She lives in a small village.", "She lives in a small village now"],
  ]) {
    const d = diff(typed, sample);
    console.log(`образец: ${JSON.stringify(sample)}`);
    console.log(`ученик : ${JSON.stringify(typed)}`);
    console.log(`  ok=${d.ok}  marks=${JSON.stringify(d.marks)}  лишние=${JSON.stringify(d.extra)}`);
    console.log(`  разбор на экране: «${strip(review(typed, sample))}»`);
    console.log(`  жирным (что «не расслышал»): ${
      (String(review(typed, sample)).match(/<b class="dw-miss">([^<]*)<\/b>/g) || []).join(" ") || "— ничего —"}`);
    console.log("");
  }

  console.log("=== B. Диктант: апостроф ===");
  for (const [sample, typed] of [
    ["It's a bone.", "It’s a bone."],                 // ’ — как ставит iOS/macOS
    ["I don't like it.", "I don’t like it."],
    ["It's a bone.", "It's a bone."],                 // контроль: прямой апостроф
  ]) {
    const d = diff(typed, sample);
    console.log(`образец ${JSON.stringify(sample)} | ученик ${JSON.stringify(typed)} → ok=${d.ok}` +
                (d.ok ? "" : `, «не расслышал»: ${JSON.stringify(d.missed)}, лишние: ${JSON.stringify(d.extra)}`));
    if (!d.ok) console.log(`   на экране: «${strip(review(typed, sample))}»`);
  }

  console.log("\n=== A2. То же через настоящий экран диктанта ===");
  w.eval('readGateMs = () => 0; openExercise("dictation");');
  await tick(80);
  const rounds = JSON.parse(w.eval("JSON.stringify(window.__log.type)"));
  const r0 = rounds[0];
  const inp = doc.getElementById("type-input");
  inp.value = r0.answer + " forever";
  click(doc.getElementById("type-check"));
  await tick(60);
  console.log(`диктовали : «${r0.answer}»`);
  console.log(`ученик    : «${inp.value}»`);
  console.log(`вердикт   : «${doc.getElementById("type-feedback").textContent.trim()}»`);
  const rev = [...doc.querySelectorAll("#ex-stage .word-quiz-card p.muted-small")].pop();
  console.log(`объяснение: «${rev ? rev.textContent.replace(/\s+/g, " ").trim() : "—"}»`);
  console.log(`подсвечено как «не расслышал»: ${
    [...doc.querySelectorAll("#ex-stage .dw-miss")].map(b => b.textContent).join(", ") || "— ничего —"}`);

  console.log("\n=== C. Аудирование: разбор ответов после подхода ===");
  w.eval('openExercise("listening");');
  await tick(80);
  const mcq = JSON.parse(w.eval("JSON.stringify(window.__log.rounds)"));
  for (let n = 0; n < mcq.length; n++) {
    let g = 0;
    while (g++ < 100 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(20);
    const box = doc.querySelector("#ex-stage .mcq-options");
    if (!box) break;
    click(box.children[mcq[n].correct]);
    let g2 = 0;
    while (g2++ < 60 && box.isConnected) await tick(40);
  }
  await tick(150);
  const qs = [...doc.querySelectorAll("#ex-stage .ex-review-q")].map(p => p.textContent.replace(/\s+/g, " ").trim());
  console.log("слышал слова:", mcq.map(r => r.audioText).join(", "));
  console.log("в разборе после подхода написано:");
  qs.forEach(q => console.log("   • " + q));
  console.log("exLog[0].q =", JSON.stringify(JSON.parse(w.eval("JSON.stringify(exLog)"))[0].q));
})();
