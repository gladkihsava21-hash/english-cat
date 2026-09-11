// «Сочетания» (runPairs): прогон как ученик.
//  1) ученик знает все пять сочетаний и жмёт по тексту кнопок — сколько
//     раз он всё равно получает «Верно 4 из 5» (два одинаковых слова слева);
//  2) перебор: «Верно 0 из 5» и одновременно «+40 ⭐» — очки за угадывание
//     не снимаются и не зависят от промахов;
//  3) защиты от прокликивания у пар нет вовсе (exRound.answered = 0);
//  4) уход с экрана в 0,5 с после последней пары: подход закрывается
//     в пустоту, домашка репетитору НЕ уходит, а награды начисляются.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const stage = () => doc.getElementById("ex-stage");
const txt = () => (stage().textContent || "").replace(/\s+/g, " ").trim();

E(`window.readGateMs = () => 0;
   window.__pairs=null; window.__fin=[]; window.__rec=[]; window.__xp=0; window.__bump=[];
   const _p=runPairs,_f=exFinish,_a=award,_r=recordTaskResult;
   window.runPairs=function(r,o){window.__pairs=r;return _p(r,o);};
   window.exFinish=function(c,t,n){window.__fin.push([c,t]);return _f(c,t,n);};
   window.award=function(n){window.__xp+=n;return _a(n);};
   window.recordTaskResult=function(c,t,m){window.__rec.push([c,t]);return _r(c,t,m);};
   if (typeof bump === "function"){const _b=bump;window.bump=function(k){window.__bump.push(k);return _b(k);};}
   state.trainFolders=[];state.trainWords=[];state.trainMixNew=false;`);
const reset = () => E(`window.__pairs=null;window.__fin=[];window.__rec=[];window.__xp=0;
  window.__bump=[];exSessionXP=0;state.taskResults={};`);
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
const pairsOf = () => JSON.parse(E(`JSON.stringify((window.__pairs||[]).map(p=>({l:p.l,r:p.r})))`));
// «идеальный ученик»: знает сочетание, жмёт слово слева и его хвост справа;
// одинаковые кнопки слева перебирает подряд — различить их нечем.
const playPerfect = prs => prs.forEach(p => {
  for (const lb of L().filter(b => b.textContent.trim() === p.l && !b.classList.contains("done"))) {
    click(lb);
    const rb = R().find(b => b.textContent.trim() === p.r && !b.classList.contains("done"));
    if (!rb) break;
    click(rb);
    if (lb.classList.contains("done")) break;
  }
});

(async () => {
  console.log("── 1. ученик знает все пять сочетаний (30 подходов)");
  let runs = 0, lost = 0, dupRuns = 0; const shown = [];
  for (let k = 0; k < 30; k++) {
    reset(); E(`openExercise("collocations")`); await tick(15);
    const prs = pairsOf();
    if (prs.length < 5) continue;
    runs++;
    if (new Set(prs.map(p => p.l)).size !== prs.length) dupRuns++;
    playPerfect(prs);
    await tick(700);
    const fin = JSON.parse(E(`JSON.stringify(window.__fin)`));
    if (fin[0] && fin[0][0] < 5) {
      lost++;
      if (shown.length < 4) shown.push({ prs, fin: fin[0], xp: E(`window.__xp`),
        scr: txt().slice(0, 90) });
    }
  }
  console.log(`   подходов: ${runs}; с двумя одинаковыми словами слева: ${dupRuns}`);
  console.log(`   знающий всё ученик получил меньше 5 из 5: ${lost} раз`);
  shown.forEach(s => {
    console.log("   · " + s.prs.map(p => p.l + " + " + p.r).join(" / "));
    console.log("     итог: Верно " + s.fin[0] + " из " + s.fin[1] + " · " + s.xp + " XP");
    console.log("     экран: " + s.scr);
  });

  console.log("\n── 2. ученик перебирает варианты, пока не сойдётся");
  reset(); E(`openExercise("collocations")`); await tick(15);
  console.log("   пары:", JSON.stringify(pairsOf()));
  let miss = 0;
  for (const lb of L()) {
    click(lb);
    for (const rb of R()) {
      if (rb.classList.contains("done")) continue;
      click(rb);
      if (lb.classList.contains("done")) break;
      miss++;
    }
  }
  await tick(700);
  console.log("   промахов:", miss, "· итог:", E(`JSON.stringify(window.__fin)`),
              "· начислено:", E(`window.__xp`), "XP");
  console.log("   экран:", txt().slice(0, 130));

  console.log("\n── 3. пять пар соединены мгновенно, из домашки");
  reset(); E(`openExercise("collocations")`);
  E(`homeworkContext = { id: 501, title: "Письмо к пятнице" }`);
  await tick(15);
  playPerfect(pairsOf());
  await tick(700);
  console.log("   exRound.answered:", E(`exRound.answered`), "· exRoundRushed():", E(`exRoundRushed()`));
  console.log("   у репетитора:", E(`JSON.stringify(state.taskResults["501"]||null)`));

  console.log("\n── 4. последняя пара соединена — и сразу «← Тренировки»");
  reset(); E(`openExercise("collocations")`);
  E(`homeworkContext = { id: 501, title: "Письмо к пятнице" }`);
  await tick(15);
  playPerfect(pairsOf());
  E(`show("practice")`);                       // ученик ушёл, не дождавшись итога
  console.log("   homeworkContext после ухода:", E(`String(homeworkContext)`));
  await tick(900);
  console.log("   exFinish всё равно вызван:", E(`JSON.stringify(window.__fin)`),
              "· recordTaskResult:", E(`JSON.stringify(window.__rec)`),
              "· награды:", E(`JSON.stringify(window.__bump)`));
  console.log("   у репетитора:", E(`JSON.stringify(state.taskResults["501"]||null)`));

  console.log("\nошибок в окне:", require("./harness-full.js").errors.length);
})();
