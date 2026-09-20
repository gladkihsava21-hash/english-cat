// Общие блоки: exLater/exFinish, защита от прокликивания, очки.
const { w } = require("./harness-full.js");
const doc = w.document;
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const stage = () => doc.getElementById("ex-stage");

w.eval(`
  window.readGateMs = () => 0;
  window.__rounds = null; window.__fin = []; window.__xp = 0; window.__bump = [];
  const _mcq = runMCQ, _fin = exFinish, _award = award;
  window.runMCQ = function (rounds, opts) { window.__rounds = rounds; return _mcq(rounds, opts); };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin(c, t, n); };
  window.award = function (n) { window.__xp += n; return _award(n); };
  if (typeof bump === "function") { const _b = bump; window.bump = function (k) { window.__bump.push(k); return _b(k); }; }
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
`);

const reset = () => w.eval(`window.__rounds = null; window.__fin = []; window.__xp = 0; window.__bump = [];
  window.__exBoardBack && clearTimeout(window.__exBoardBack); window.boardTaskCard = null;`);

// Отвечает на текущий вопрос runMCQ верно. Возвращает false, если вопросов нет.
const answerRight = () => {
  const box = doc.getElementById("mcq-options");
  if (!box) return false;
  const rounds = w.__rounds;
  const i = Number((stage().querySelector(".test-counter") || {}).textContent
    ? stage().querySelector(".test-counter").textContent.split("/")[0].trim() : 0) - 1;
  const r = rounds[i];
  if (!r) return false;
  click(box.children[r.correct]);
  return true;
};

(async () => {

  // ── 1. exLater переживает уход ученика с экрана упражнения ─────────────
  // exLater сверяется только с exLaunch, а exLaunch двигает лишь
  // openExercise. Нажать «← Тренировки» — это show("practice"), и таймер
  // остаётся живым. За те же 1,1 с show() снимает homeworkContext.
  console.log("── 1. ученик уходит с экрана в течение 1,1 с после последнего верного ответа");
  reset();
  w.eval(`openExercise("mcq"); homeworkContext = { id: 777, title: "Домашка к четвергу" };
          state.taskResults = {};`);
  await tick();
  const total = w.eval("window.__rounds.length");
  for (let k = 0; k < total; k++) {
    if (!answerRight()) break;
    await tick(k === total - 1 ? 5 : 1200);   // последний ответ — уходим сразу
  }
  console.log("   вопросов в подходе:", total, "· ответил верно на все");
  console.log("   до ухода: подход закрыт?", w.eval("window.__fin.length") ? "да" : "нет",
              "· exLaunch =", w.eval("exLaunch"));
  w.eval(`show("practice")`);                 // «← Тренировки»
  console.log("   нажал «← Тренировки». homeworkContext =", w.eval("String(homeworkContext)"));
  await tick(1500);
  console.log("   через 1,5 с: exFinish вызван", w.eval("window.__fin.length"), "раз",
              w.eval("JSON.stringify(window.__fin)"));
  console.log("   результат домашки у репетитора:",
              w.eval(`JSON.stringify(state.taskResults["777"] || null)`));
  console.log("   счётчики достижений за этот подход:", w.eval("JSON.stringify(window.__bump)"));
  console.log("   экран, который сейчас видит ученик:", w.eval(
    `[...document.querySelectorAll(".screen")].filter(s => !s.classList.contains("hidden")).map(s => s.id).join(",")`));
  console.log("   а в скрытом #ex-stage дорисовано:",
              stage().textContent.replace(/\s+/g, " ").trim().slice(0, 70));

  // ── 2. Быстрый, но ВЕРНЫЙ подход объявляется прокликанным ─────────────
  console.log("\n── 2. ученик отвечает верно на все вопросы, но жмёт сразу, как варианты открылись");
  reset();
  w.eval(`state.xp = 0; state.activity = {}; state.taskResults = {};
          openExercise("mcq"); homeworkContext = { id: 778, title: "Домашка" };`);
  await tick();
  const n2 = w.eval("window.__rounds.length");
  for (let k = 0; k < n2; k++) { if (!answerRight()) break; await tick(1200); }
  await tick(200);
  console.log("   верно", w.eval("JSON.stringify(window.__fin)"), "· начислено award:", w.eval("window.__xp"));
  console.log("   среднее время на ответ:", (w.eval("exRound.thinkMs / exRound.answered")).toFixed(0), "мс");
  console.log("   exRoundRushed() =", w.eval("exRoundRushed()"));
  console.log("   state.xp после подхода:", w.eval("state.xp"));
  console.log("   что записано репетитору:", w.eval(`JSON.stringify(state.taskResults["778"] || null)`));
  console.log("   заголовок экрана:", stage().querySelector("h2") ? stage().querySelector("h2").textContent : "—");
  console.log("   достижения:", w.eval("JSON.stringify(window.__bump)"));

  // ── 3. runPairs: прокликивание не ловится вовсе, очки идут за перебор ──
  console.log("\n── 3. «Сопоставление» перебором: жмём подряд все кнопки справа");
  reset();
  w.eval(`state.xp = 0; state.activity = {}; homeworkContext = null;
          state.dictionary = [...WORDS.A1.slice(0, 12)].map(x => ({ w: x.w, t: x.t, added: Date.now(), seen: 1 }));
          openExercise("matching");`);
  await tick();
  for (let guard = 0; guard < 400; guard++) {
    const ls = [...doc.querySelectorAll("#pairs-l .pair-item")].filter(b => !b.classList.contains("done"));
    if (!ls.length) break;
    click(ls[0]);
    const rs = [...doc.querySelectorAll("#pairs-r .pair-item")].filter(b => !b.classList.contains("done"));
    click(rs[0]);           // всегда первая живая — типичный перебор
    await tick(1);
  }
  await tick(700);
  console.log("   итог:", w.eval("JSON.stringify(window.__fin)"), "· очков начислено:", w.eval("window.__xp"),
              "· state.xp =", w.eval("state.xp"));
  console.log("   exRound.answered =", w.eval("exRound.answered"), "· exRoundRushed() =", w.eval("exRoundRushed()"));
  console.log("   достижения:", w.eval("JSON.stringify(window.__bump)"));
  const xpLine = stage().querySelector(".xp-earned");
  const res = stage().querySelector(".empty-state p");
  console.log("   на экране результата:", res ? res.textContent.trim() : "—", "|", xpLine ? xpLine.textContent.trim() : "нет строки очков");

  // ── 4. revokeXP не откатывает засчитанную цель дня ────────────────────
  console.log("\n── 4. цель дня, набитая прокликанным подходом");
  reset();
  w.eval(`state.xp = 0; state.activity = {}; state.goal = 50; state.counters = {}; homeworkContext = null;
          state.dictionary = [...WORDS.A1.slice(0, 30)].map(x => ({ w: x.w, t: x.t, added: Date.now(), seen: 1 }));
          openExercise("mcq");`);
  await tick();
  const n4 = w.eval("window.__rounds.length");
  for (let k = 0; k < n4; k++) { if (!answerRight()) break; await tick(1200); }
  await tick(200);
  console.log("   подход прокликан:", w.eval("exRoundRushed()"),
              "· state.xp =", w.eval("state.xp"),
              "· активность за день =", w.eval("state.activity[dayKey()] || 0"),
              "· goalsHit =", w.eval("(state.counters||{}).goalsHit || 0"));

  process.exit(0);
})();
