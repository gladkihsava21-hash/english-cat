const { w } = require("./harness-full.js");
const doc = w.document;
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const stage = () => doc.getElementById("ex-stage");

w.eval(`
  window.readGateMs = () => 0;
  window.__rounds = null; window.__fin = []; window.__xp = 0; window.__bump = []; window.__stat = [];
  const _mcq = runMCQ, _fin = exFinish, _award = award, _stat = statUpdate;
  window.runMCQ = function (r, o) { window.__rounds = r; return _mcq(r, o); };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin(c, t, n); };
  window.award = function (n) { window.__xp += n; return _award(n); };
  window.statUpdate = function (a, b, c) { window.__stat.push([String(a), !!b]); return _stat(a, b, c); };
  if (typeof bump === "function") { const _b = bump; window.bump = function (k) { window.__bump.push(k); return _b(k); }; }
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
`);
const reset = () => w.eval(`window.__rounds=null; window.__fin=[]; window.__xp=0; window.__bump=[]; window.__stat=[];`);
const curIdx = () => Number(stage().querySelector(".test-counter").textContent.split("/")[0].trim()) - 1;
const answerRight = () => {
  const box = doc.getElementById("mcq-options");
  if (!box) return false;
  const r = w.__rounds[curIdx()];
  if (!r) return false;
  click(box.children[r.correct]);
  return true;
};

(async () => {
  // ── 1b. Тот же уход с экрана, но подход честный (думаем 600 мс на вопрос)
  console.log("── 1b. ЧЕСТНЫЙ подход домашки, ученик уходит с экрана после последнего ответа");
  reset();
  w.eval(`state.xp = 0; state.activity = {}; state.taskResults = {}; state.counters = {};
          openExercise("mcq"); homeworkContext = { id: 777, title: "Домашка к четвергу" };`);
  await tick();
  const total = w.eval("window.__rounds.length");
  for (let k = 0; k < total; k++) {
    await tick(600);            // читаем вопрос — подход не прокликанный
    if (!answerRight()) break;
    if (k < total - 1) await tick(1200);
  }
  console.log("   вопросов:", total, "· все верно · среднее время на ответ:",
              w.eval("(exRound.thinkMs / exRound.answered).toFixed(0)"), "мс · rushed =", w.eval("exRoundRushed()"));
  w.eval(`show("practice")`);   // нажал «← Тренировки», не дождавшись экрана «Готово!»
  await tick(1500);
  console.log("   exFinish отработал:", w.eval("JSON.stringify(window.__fin)"));
  console.log("   → результат домашки репетитору:", w.eval(`JSON.stringify(state.taskResults["777"] || null)`));
  console.log("   → достижения за подход:", w.eval("JSON.stringify(window.__bump)"));
  console.log("   → очки: state.xp =", w.eval("state.xp"));
  console.log("   ученик стоит на экране:", w.eval(
    `[...document.querySelectorAll(".screen")].filter(s=>!s.classList.contains("hidden")).map(s=>s.id).join(",")`));
  console.log("   а «Готово! Верно 8 из 8» нарисовано в скрытом #ex-stage:",
              JSON.stringify(stage().textContent.replace(/\s+/g," ").trim().slice(0, 60)));

  // Для сравнения: тот же подход, но ученик дождался экрана
  console.log("\n   контроль — тот же подход, ученик НЕ уходит:");
  reset();
  w.eval(`state.taskResults = {}; openExercise("mcq"); homeworkContext = { id: 779, title: "Домашка" };`);
  await tick();
  const t2 = w.eval("window.__rounds.length");
  for (let k = 0; k < t2; k++) { await tick(600); if (!answerRight()) break; if (k < t2 - 1) await tick(1200); }
  await tick(1500);
  console.log("   → результат домашки репетитору:", w.eval(`JSON.stringify(state.taskResults["779"] || null)`));

  // ── 3. runPairs перебором ────────────────────────────────────────────
  console.log("\n── 3. «Сопоставление» перебором (ученик не знает ни одного слова)");
  reset();
  w.eval(`state.xp = 0; state.activity = {}; state.counters = {}; homeworkContext = null;
          state.dictionary = WORDS.A1.slice(0, 12).map(x => ({ w: x.w, t: x.t, added: Date.now(), seen: 1 }));
          openExercise("matching");`);
  await tick();
  let tries = 0;
  for (let guard = 0; guard < 200; guard++) {
    const ls = [...doc.querySelectorAll("#pairs-l .pair-item")].filter(b => !b.classList.contains("done"));
    if (!ls.length) break;
    const l = ls[0];
    const rs = [...doc.querySelectorAll("#pairs-r .pair-item")].filter(b => !b.classList.contains("done"));
    for (const r of rs) { click(l); click(r); tries++; if (r.classList.contains("done")) break; }
    await tick(1);
  }
  await tick(700);
  console.log("   нажатий справа всего:", tries);
  console.log("   итог экрана:", w.eval("JSON.stringify(window.__fin)"), "· award начислил:", w.eval("window.__xp"),
              "· state.xp =", w.eval("state.xp"));
  console.log("   exRound.answered =", w.eval("exRound.answered"), "· exRoundRushed() =", w.eval("exRoundRushed()"),
              "→ пауза на чтение и учёт времени в runPairs не работают вовсе");
  console.log("   достижения:", w.eval("JSON.stringify(window.__bump)"));
  const ps = [...stage().querySelectorAll("p")].map(p => p.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
  console.log("   на экране результата:", JSON.stringify(ps.slice(0, 2)));
  console.log("   строка очков:", stage().querySelector(".xp-earned")
    ? stage().querySelector(".xp-earned").textContent.trim() : "нет");

  // ── 4. Цель дня набивается прокликанными подходами по кругу ───────────
  console.log("\n── 4. цель дня: три прокликанных подхода подряд");
  w.eval(`state.xp = 0; state.activity = {}; state.goal = 50; state.counters = {}; homeworkContext = null;
          state.dictionary = WORDS.A1.slice(0, 30).map(x => ({ w: x.w, t: x.t, added: Date.now(), seen: 1 }));`);
  for (let round = 1; round <= 3; round++) {
    reset();
    w.eval(`openExercise("mcq")`);
    await tick();
    const n = w.eval("window.__rounds.length");
    for (let k = 0; k < n; k++) { if (!answerRight()) break; await tick(1200); }
    await tick(200);
    console.log(`   подход ${round}: rushed=${w.eval("exRoundRushed()")}, state.xp=${w.eval("state.xp")}, `
      + `активность=${w.eval("state.activity[dayKey()] || 0")}, goalsHit=${w.eval("(state.counters||{}).goalsHit || 0")}`);
  }
  process.exit(0);
})();
