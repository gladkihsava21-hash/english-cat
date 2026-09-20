// Реальная папка репетитора «Кухня»: слова из банка A1/A2, среди них
// plate и dish (оба «тарелка»), table и desk (оба «стол»).
const { w } = require("./harness-full.js");
const doc = w.document;
const S = sel => doc.querySelector("#ex-stage " + sel);
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

w.eval(`window.readGateMs = () => 0;
  window.__fin = []; window.__stat = [];
  const _f = exFinish, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _s(word, ok, v); };
  state.trainWords = []; state.trainMixNew = false;
  state.dictionary = ["spoon","plate","kitchen","table","cup","knife","dish","bowl","fork"]
    .map(x => { const r = wordInfo(x); return { w:r.w, t:r.t, ex:r.ex, def:r.def, cat:r.cat, added:Date.now(), seen:1, folders:["Кухня"] }; });
  state.trainFolders = ["Кухня"];
`);
console.log("папка «Кухня»:", w.eval(`JSON.stringify(state.dictionary.map(d=>d.w+" = "+d.t))`));

(async () => {
  console.log("\n=== «Ввод слова» ===");
  w.eval(`window.__fin = []; window.__stat = []; openExercise("spelling");`);
  const mine = new Map(JSON.parse(w.eval(`JSON.stringify(state.dictionary.map(d=>[d.t, d.w]))`)));  // перевод → ПЕРВОЕ слово ученика
  for (let n = 0; n < 8; n++) {
    const q = S(".quiz-word");
    if (!q) break;
    const t = q.textContent.replace(/[«»]/g, "").trim();
    const my = mine.get(t);            // ученик пишет своё слово с этим переводом
    await tick(500);                   // думает — иначе сработает защита от прокликивания
    const inp = S("#type-input");
    inp.value = my; inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    click(S("#type-check"));
    const fb = S("#type-feedback").textContent.trim();
    console.log(`  вопрос «${t}» → ученик пишет «${my}»: ${fb}`);
    const nb = S("#type-next");
    if (nb) click(nb); else await tick(950);
  }
  await tick(300);
  console.log("  exFinish:", w.eval("JSON.stringify(window.__fin)"));
  console.log("  экран:", (S("h2")||{}).textContent, (S("p")||{}).textContent);

  console.log("\n=== «Сопоставление» на той же папке ===");
  let redRuns = 0, runs = 20;
  for (let k = 0; k < runs; k++) {
    w.eval(`state.dictionary.forEach(d => { delete d.forgot; delete d.knew; delete d.reps; });
            window.__fin = []; window.__stat = []; openExercise("matching");`);
    const L = SA("#pairs-l .pair-item"), R = SA("#pairs-r .pair-item");
    const texts = R.map(b => b.textContent);
    const dupT = [...new Set(texts.filter((t, i) => texts.indexOf(t) !== i))];
    if (!dupT.length) continue;
    // ученик соединяет всё верно ПО ТЕКСТУ — первой подходящей кнопкой
    const t2w = new Map(JSON.parse(w.eval(`JSON.stringify(state.dictionary.map(d=>[d.w,d.t]))`)));
    let red = [];
    for (const lb of L) {
      click(lb);
      const rb = R.find(x => x.textContent === t2w.get(lb.textContent) && !x.classList.contains("done"));
      if (!rb) continue;
      click(rb);
      if (rb.classList.contains("bad")) red.push(lb.textContent + " → " + rb.textContent);
    }
    if (red.length) {
      redRuns++;
      if (redRuns === 1) {
        console.log("  дубли справа:", JSON.stringify(dupT));
        console.log("  верные по смыслу соединения, объявленные ошибкой:", red.join(", "));
        console.log("  statUpdate:", w.eval("JSON.stringify(window.__stat)"));
        console.log("  exFinish:", w.eval("JSON.stringify(window.__fin)"), "(пар было " + L.length + ")");
        console.log("  словарь:", w.eval(`JSON.stringify(state.dictionary.filter(d=>d.forgot).map(d=>d.w+" forgot="+d.forgot))`));
      }
    }
  }
  console.log(`  из ${runs} подходов с ошибкой на ровном месте: ${redRuns}`);
})();
