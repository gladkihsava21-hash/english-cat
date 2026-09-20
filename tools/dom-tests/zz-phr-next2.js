// Кнопка «Дальше →» после ошибки не имеет защёлки: обработчик next
// остаётся живым на уже снятом со сцены узле. Смотрим, что именно
// происходит при повторном срабатывании и одинаково ли это в
// «Собери выражение» (свой next) и в runMCQ.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");

E("window.readGateMs = () => 0;");
E(`window.__log = { finish: [], xp: 0, rec: [], board: [] }; window.__rounds=null; window.__pool=null;
   const _f=exFinish,_a=award,_m=runMCQ,_r=recordTaskResult,_pp=EX_RUNNERS._phrasePool;
   window.exFinish=function(c,t,n){window.__log.finish.push([c,t]);return _f(c,t,n);};
   window.award=function(n){window.__log.xp+=n;return _a(n);};
   window.recordTaskResult=function(c,t,m){window.__log.rec.push([c,t]);return _r(c,t,m);};
   window.runMCQ=function(r,o){window.__rounds=r;return _m(r,o);};
   EX_RUNNERS._phrasePool=function(k,n,need){const r=_pp.call(EX_RUNNERS,k,n,need);window.__pool=r;return r;};`);
const log = () => JSON.parse(E("JSON.stringify(window.__log)"));
const start = id => E(`window.__log={finish:[],xp:0,rec:[],board:[]};window.__rounds=null;window.__pool=null;
  state.taskResults={}; localStorage.removeItem('savelyExSeen'); openExercise(${JSON.stringify(id)});
  homeworkContext={id:"hw-1",title:"Выражения к четвергу"};`);

(async () => {
  // --- buildphrase: последний раунд с ошибкой, «Дальше» срабатывает трижды
  start("buildphrase");
  await tick(20);
  const pool = JSON.parse(E("JSON.stringify((window.__pool||[]).filter(p=>(p.parts||[]).length>=2))"));
  for (let k = 0; k < pool.length; k++) {
    const seq = (k === pool.length - 1) ? [...pool[k].parts].reverse() : pool[k].parts;
    for (const word of seq) {
      const b = [...st().querySelectorAll("#tiles .scr-tile")].find(x => !x.disabled && x.textContent.trim() === word);
      if (b) click(b);
    }
    await tick(30);
    let nb = doc.getElementById("bp-next");
    if (!nb) { await tick(1200); continue; }
    if (k === pool.length - 1) {
      console.log("=== «Собери выражение», последний раунд, ошибка");
      console.log("до нажатия: кнопка в документе:", nb.isConnected);
      click(nb);
      console.log("после 1-го нажатия: кнопка в документе:", nb.isConnected,
                  "| exFinish:", log().finish.length);
      click(nb); click(nb);
      await tick(50);
      const L = log();
      console.log("после 3-х нажатий:  exFinish:", L.finish.length, JSON.stringify(L.finish),
                  "| recordTaskResult:", L.rec.length);
      console.log("у репетитора:", E("JSON.stringify(state.taskResults)"));
    } else { click(nb); await tick(30); }
  }

  // --- то же в runMCQ («Не буквально»)
  start("notliteral");
  await tick(20);
  const R = JSON.parse(E("JSON.stringify(window.__rounds||[])"));
  for (let k = 0; k < R.length; k++) {
    const opts = [...st().querySelectorAll(".mcq-option")];
    const last = k === R.length - 1;
    click(opts[last ? (R[k].correct + 1) % opts.length : R[k].correct]);
    await tick(40);
    const nb = doc.getElementById("mcq-next");
    if (!nb) { await tick(1250); continue; }
    if (last) {
      console.log("\n=== «Не буквально» (runMCQ), последний вопрос, ошибка");
      console.log("до нажатия: кнопка в документе:", nb.isConnected);
      click(nb);
      console.log("после 1-го нажатия: кнопка в документе:", nb.isConnected,
                  "| exFinish:", log().finish.length);
      click(nb); click(nb);
      await tick(50);
      const L = log();
      console.log("после 3-х нажатий:  exFinish:", L.finish.length, JSON.stringify(L.finish),
                  "| recordTaskResult:", L.rec.length);
      console.log("у репетитора:", E("JSON.stringify(state.taskResults)"));
    } else { click(nb); await tick(30); }
  }
  process.exit(0);
})();
