// Что происходит, если ученик уходит с экрана в паузу между раундами
// (1100 мс после верного ответа) — на последнем вопросе подхода.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");

E("window.readGateMs = () => 0;");
E(`window.__log = { finish: [], xp: 0, rec: [] };
   window.__rounds = null;
   const _f = exFinish, _a = award, _m = runMCQ, _r = recordTaskResult;
   window.exFinish = function (c,t,n){ window.__log.finish.push([c,t]); return _f(c,t,n); };
   window.award = function (n){ window.__log.xp += n; return _a(n); };
   window.recordTaskResult = function (c,t,m){ window.__log.rec.push([c,t,JSON.stringify(m)]); return _r(c,t,m); };
   window.runMCQ = function (r,o){ window.__rounds = r; return _m(r,o); };`);
const log = () => JSON.parse(E("JSON.stringify(window.__log)"));

async function play(id, leaveOnLast) {
  E(`window.__log = { finish: [], xp: 0, rec: [] }; localStorage.removeItem('savelyExSeen');
     state.taskResults = {};
     homeworkContext = { id: "hw-1", title: "Фразовые глаголы к четвергу" };`);
  E(`openExercise(${JSON.stringify(id)})`);
  E(`homeworkContext = { id: "hw-1", title: "Фразовые глаголы к четвергу" };`);
  await tick(10);
  const R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
  for (let k = 0; k < R.length; k++) {
    const opts = [...st().querySelectorAll(".mcq-option")];
    if (!opts.length) break;
    click(opts[R[k].correct]);
    if (k === R.length - 1 && leaveOnLast) {
      await tick(200);                       // прошло 0,2 с из 1,1 с паузы
      E('show("practice")');                 // ученик жмёт «← Тренировки»
      await tick(1400);                      // пауза дотикивает
    } else {
      await tick(1250);
    }
  }
  return { n: R.length, log: log(),
           res: JSON.parse(E("JSON.stringify(state.taskResults)")),
           hw: E("String(homeworkContext)") };
}

(async () => {
  for (const id of ["notliteral", "collocpair"]) {
    const a = await play(id, false);
    console.log(`\n${id}: подход из домашки пройден до конца, ученик остался на экране`);
    console.log(`   exFinish: ${JSON.stringify(a.log.finish)} | recordTaskResult: ${JSON.stringify(a.log.rec)}`);
    console.log(`   state.taskResults: ${JSON.stringify(a.res)}`);

    const b = await play(id, true);
    console.log(`${id}: то же, но после ПОСЛЕДНЕГО верного ответа ученик через 0,2 с ушёл «← Тренировки»`);
    console.log(`   exFinish: ${JSON.stringify(b.log.finish)} | recordTaskResult: ${JSON.stringify(b.log.rec)}`);
    console.log(`   state.taskResults: ${JSON.stringify(b.res)}  ← у репетитора`);
    console.log(`   очки за подход начислены: ${b.log.xp}`);
  }
  process.exit(0);
})();
