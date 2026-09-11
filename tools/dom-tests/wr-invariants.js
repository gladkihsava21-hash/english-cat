// Инварианты раздела «Письмо и речь» на многих зёрнах:
//   подход закрывается ровно один раз; верных не больше заданий;
//   на один ответ — один statUpdate и одно начисление.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

E(`window.readGateMs = () => 0;
   window.__mcq=null; window.__pairs=null; window.__type=null;
   window.__fin=[]; window.__stat=[]; window.__xp=0; window.__awards=0;
   const _m=runMCQ,_p=runPairs,_t=runType,_f=exFinish,_s=statUpdate,_a=award;
   window.runMCQ=function(r,o){window.__mcq=r;return _m(r,o);};
   window.runPairs=function(r,o){window.__pairs=r;return _p(r,o);};
   window.runType=function(r,o){window.__type=r;return _t(r,o);};
   window.exFinish=function(c,t,n){window.__fin.push([c,t]);return _f(c,t,n);};
   window.statUpdate=function(x,ok,v){window.__stat.push(String(x));return _s(x,ok,v);};
   window.award=function(n){window.__xp+=n;window.__awards++;return _a(n);};
   state.trainFolders=[];state.trainWords=[];state.trainMixNew=false;`);
const reset = () => E(`window.__mcq=null;window.__pairs=null;window.__type=null;
  window.__fin=[];window.__stat=[];window.__xp=0;window.__awards=0;exSessionXP=0;`);

const problems = [];
const note = s => { problems.push(s); console.log("   ! " + s); };

const playMCQ = async id => {
  reset(); E(`openExercise(${JSON.stringify(id)})`); await tick(15);
  const rs = JSON.parse(E(`JSON.stringify(window.__mcq||[])`));
  for (let k = 0; k < rs.length; k++) {
    const box = doc.getElementById("mcq-options");
    if (!box) { note(`${id}: вопрос ${k + 1} не отрисован`); break; }
    const pick = k % 2 === 0 ? rs[k].correct : (rs[k].correct + 1) % box.children.length;
    click(box.children[pick]);           // чередуем верно/неверно
    click(box.children[pick]);           // и сразу повторное нажатие
    await tick(15);
    // второе нажатие — только если кнопка ЖИВА в документе (как у пальца)
    let nb = doc.getElementById("mcq-next");
    if (nb) { click(nb); const again = doc.getElementById("mcq-next");
              if (again) { note(`${id}: «Дальше» осталась на экране после нажатия`); click(again); }
              await tick(15); } else await tick(1250);
  }
  await tick(200);
  const fin = JSON.parse(E(`JSON.stringify(window.__fin)`));
  const stat = JSON.parse(E(`JSON.stringify(window.__stat)`));
  const aw = E(`window.__awards`);
  const rightN = rs.filter((_, k) => k % 2 === 0).length;
  if (fin.length !== 1) note(`${id}: exFinish вызван ${fin.length} раз ${JSON.stringify(fin)}`);
  if (fin[0] && fin[0][0] > fin[0][1]) note(`${id}: верных больше заданий ${JSON.stringify(fin[0])}`);
  if (fin[0] && fin[0][0] !== rightN) note(`${id}: верных ${fin[0][0]}, а отвечено верно ${rightN}`);
  if (stat.length !== rs.length) note(`${id}: statUpdate ${stat.length} раз на ${rs.length} заданий`);
  if (aw !== rightN) note(`${id}: начислений ${aw} на ${rightN} верных`);
  return `${id}: заданий ${rs.length}, итог ${JSON.stringify(fin)}, statUpdate ${stat.length}, начислений ${aw}`;
};

const playType = async id => {
  reset(); E(`openExercise(${JSON.stringify(id)})`); await tick(15);
  const rs = JSON.parse(E(`JSON.stringify(window.__type||[])`));
  for (let k = 0; k < rs.length; k++) {
    const inp = doc.getElementById("type-input");
    if (!inp) { note(`${id}: поле ${k + 1} не отрисовано`); break; }
    inp.value = k % 2 === 0 ? rs[k].answer : "zzz nonsense";
    const cb = doc.getElementById("type-check");
    click(cb); click(cb);                 // повторное нажатие «Проверить»
    await tick(15);
    let nb = doc.getElementById("type-next");
    if (nb) { click(nb); const again = doc.getElementById("type-next");
              if (again) { note(`${id}: «Дальше» осталась на экране после нажатия`); click(again); }
              await tick(15); } else await tick(1000);
  }
  await tick(200);
  const fin = JSON.parse(E(`JSON.stringify(window.__fin)`));
  const stat = JSON.parse(E(`JSON.stringify(window.__stat)`));
  const aw = E(`window.__awards`);
  const rightN = rs.filter((_, k) => k % 2 === 0).length;
  if (fin.length !== 1) note(`${id}: exFinish вызван ${fin.length} раз ${JSON.stringify(fin)}`);
  if (fin[0] && fin[0][0] > fin[0][1]) note(`${id}: верных больше заданий ${JSON.stringify(fin[0])}`);
  if (fin[0] && fin[0][0] !== rightN) note(`${id}: верных ${fin[0][0]}, а образец введён ${rightN} раз`);
  if (stat.length !== rs.length) note(`${id}: statUpdate ${stat.length} раз на ${rs.length} заданий`);
  return `${id}: заданий ${rs.length}, итог ${JSON.stringify(fin)}, statUpdate ${stat.length}, начислений ${aw}`;
};

const playPairs = async id => {
  reset(); E(`openExercise(${JSON.stringify(id)})`); await tick(15);
  const prs = JSON.parse(E(`JSON.stringify((window.__pairs||[]).map(p=>({l:p.l,r:p.r})))`));
  const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
  const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
  // ученик видит только ТЕКСТ кнопок: перебирает все одинаковые слева
  for (const p of prs) {
    const rb0 = R().find(b => b.textContent.trim() === p.r && !b.classList.contains("done"));
    if (!rb0) { note(`${id}: справа нет «${p.r}»`); continue; }
    let okMatched = false;
    for (const lb of L().filter(b => b.textContent.trim() === p.l && !b.classList.contains("done"))) {
      click(lb);
      const rb = R().find(b => b.textContent.trim() === p.r && !b.classList.contains("done"));
      if (!rb) break;
      click(rb);
      if (lb.classList.contains("done")) { okMatched = true; break; }
    }
    if (!okMatched) note(`${id}: «${p.l} + ${p.r}» не соединилось ни с одной из одинаковых кнопок слева`);
  }
  await tick(700);
  const fin = JSON.parse(E(`JSON.stringify(window.__fin)`));
  const aw = E(`window.__awards`);
  if (fin.length !== 1) note(`${id}: exFinish вызван ${fin.length} раз ${JSON.stringify(fin)}`);
  if (fin[0] && fin[0][0] > fin[0][1]) note(`${id}: верных больше заданий ${JSON.stringify(fin[0])}`);
  if (aw !== prs.length) note(`${id}: начислений ${aw} на ${prs.length} пар`);
  return `${id}: пар ${prs.length}, итог ${JSON.stringify(fin)}, начислений ${aw}`;
};

const playPersonal = async () => {
  reset(); E(`openExercise("personal")`); await tick(15);
  const words = [...doc.querySelectorAll(".quiz-word")].map(x => x.textContent.trim()).join("");
  const ws = words.split("·").map(s => s.trim()).filter(Boolean);
  doc.getElementById("pers-input").value =
    "I " + ws.join(" and I ") + " every day with my friend at school.";
  const cb = doc.getElementById("pers-check");
  click(cb); click(cb); click(cb);       // тройное нажатие «Проверить»
  await tick(20);
  const nb = doc.getElementById("pers-next");
  if (nb) { click(nb); const again = doc.getElementById("pers-next");
            if (again) { note("personal: «Дальше» осталась на экране после нажатия"); click(again); } }
  await tick(200);
  const fin = JSON.parse(E(`JSON.stringify(window.__fin)`));
  const stat = JSON.parse(E(`JSON.stringify(window.__stat)`));
  const aw = E(`window.__awards`);
  if (fin.length !== 1) note(`personal: exFinish вызван ${fin.length} раз ${JSON.stringify(fin)}`);
  if (stat.length !== ws.length) note(`personal: statUpdate ${stat.length} раз на ${ws.length} слов ${JSON.stringify(stat)}`);
  if (aw !== 1) note(`personal: начислений ${aw}`);
  return `personal: слов ${ws.length} (${ws.join(", ")}), итог ${JSON.stringify(fin)}, statUpdate ${stat.length}, начислений ${aw}`;
};

(async () => {
  for (const id of ["context", "synonyms"]) console.log(" ", await playMCQ(id));
  console.log(" ", await playType("translate"));
  console.log(" ", await playPairs("collocations"));
  console.log(" ", await playPersonal());
  console.log("\nнарушений инвариантов:", problems.length);
  console.log("ошибок в окне:", require("./harness-full.js").errors.length);
})();
