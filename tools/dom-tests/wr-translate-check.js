// «Перевод фразы»: что проверка пропускает и за что бьёт.
//  1) экран вопроса — сказано ли ученику, по каким правилам его судят;
//  2) образец без финальной точки → «Не совсем. Правильно: <тот же текст>»;
//  3) разбор («почему не так») уезжает НИЖЕ кнопки «Дальше →»;
//  4) порядок слов не проверяется вовсе: «Mary showed Tom.» за «Tom showed Mary.»;
//  5) приписанный хвост зачёту не мешает;
//  6) «Подсказка», нажатая после ответа, стирает правильный ответ с экрана.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const stage = () => doc.getElementById("ex-stage");
const txt = () => (stage().textContent || "").replace(/\s+/g, " ").trim();

E(`window.readGateMs = () => 0; window.__type = null; window.__stat = [];
   const _t = runType, _s = statUpdate;
   window.runType = function (r, o) { window.__type = r; return _t(r, o); };
   window.statUpdate = function (x, ok, v) { window.__stat.push(String(x) + (ok ? " верно" : " НЕВЕРНО")); return _s(x, ok, v); };
   state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;`);

const answer = async v => {
  doc.getElementById("type-input").value = v;
  click(doc.getElementById("type-check"));
  await tick(20);
};

(async () => {
  console.log("── 1. что написано на экране во время вопроса");
  E(`openExercise("translate")`);
  await tick(20);
  console.log("   ", txt().slice(0, 300));
  const r0 = JSON.parse(E(`JSON.stringify(window.__type[0])`));

  E(`window.__stat = []`);
  console.log("\n── 2. ученик написал образец, но без точки в конце");
  const noDot = r0.answer.replace(/[.!?]+$/, "");
  console.log("   образец:", JSON.stringify(r0.answer), "· ответ ученика:", JSON.stringify(noDot));
  await answer(noDot);
  console.log("   вердикт:", doc.getElementById("type-feedback").textContent.trim());
  console.log("   слово ушло в статистику как:", E(`JSON.stringify(window.__stat)`));

  console.log("\n── 3. порядок блоков на экране после ответа");
  [...stage().querySelector(".word-quiz-card").children].forEach(el =>
    console.log("      <" + el.tagName.toLowerCase() + " class=\"" + el.className + "\"> "
      + el.textContent.replace(/\s+/g, " ").trim().slice(0, 70)));

  console.log("\n── 4. доля предложений, где ответ без финальной точки — «Не совсем»");
  console.log(E(`(() => {
    const out = [];
    ["A1","A2","B1"].forEach(lvl => {
      const pool = (WORDS[lvl] || []).filter(p => p.ex && p.exr);
      let bad = 0;
      pool.forEach(p => { const noDot = p.ex.replace(/[.!?]+$/, "");
        if (!translateReview(noDot, p.ex, p.w).ok) bad++; });
      out.push("   " + lvl + ": " + bad + " из " + pool.length
        + " (" + (bad / pool.length * 100).toFixed(0) + "%)");
    });
    const pool = (WORDS.A1 || []).filter(p => p.ex && p.exr);
    let low = 0;
    pool.forEach(p => { if (!translateReview(p.ex[0].toLowerCase() + p.ex.slice(1), p.ex, p.w).ok) low++; });
    out.push("   со строчной буквы, A1: " + low + " из " + pool.length);
    return out.join("\\n");
  })()`));

  console.log("\n── 5. порядок слов: ответ «слова задом наперёд»");
  const res = JSON.parse(E(`JSON.stringify((()=>{
    const out={n:0,ok:0,ex:[]};
    [...(WORDS.A1||[]),...(WORDS.A2||[])].filter(p=>p.ex&&p.exr).forEach(p=>{
      const body=p.ex.replace(/[.!?]+$/,""), tail=p.ex.slice(body.length);
      const rev=body.split(" ").reverse().join(" ")+tail;
      if (rev===p.ex) return;
      out.n++;
      if (translateReview(rev,p.ex,p.w).ok){ out.ok++; if(out.ex.length<6) out.ex.push({s:p.ex,g:rev}); }
    });
    return out;
  })())`));
  console.log(`   предложений: ${res.n}; «задом наперёд» ЗАСЧИТАНО верным: ${res.ok} (${(res.ok/res.n*100).toFixed(1)}%)`);
  res.ex.forEach(x => console.log(`   · «${x.g}» при образце «${x.s}» → Верно, мяу!`));

  console.log("\n── 6. приписанный хвост");
  const res3 = JSON.parse(E(`JSON.stringify((()=>{
    const out={n:0,ok:0,ex:[]};
    [...(WORDS.A1||[]),...(WORDS.A2||[])].filter(p=>p.ex&&p.exr).slice(0,400).forEach(p=>{
      const pad=p.ex.replace(/[.!?]+$/,"")+" and I like pizza very much.";
      out.n++;
      if (translateReview(pad,p.ex,p.w).ok){ out.ok++; if(out.ex.length<4) out.ex.push({s:p.ex,g:pad}); }
    });
    return out;
  })())`));
  console.log(`   проверено ${res3.n}; хвост не помешал зачёту: ${res3.ok}`);
  res3.ex.forEach(x => console.log(`   · «${x.g}» при образце «${x.s}» → Верно, мяу!`));

  console.log("\n── 7. «Подсказка», нажатая после ответа");
  E(`openExercise("translate")`);
  await tick(20);
  const r1 = JSON.parse(E(`JSON.stringify(window.__type[0])`));
  await answer("полная ерунда");
  console.log("   вердикт:", doc.getElementById("type-feedback").textContent.trim().slice(0, 120));
  click(doc.getElementById("type-hint"));
  await tick(10);
  console.log("   после «Подсказки»:", doc.getElementById("type-feedback").textContent.trim().slice(0, 120));
  console.log("   правильный ответ ещё виден на экране?", txt().includes(r1.answer) ? "да" : "НЕТ");

  console.log("\nошибок в окне:", require("./harness-full.js").errors.length);
})();
