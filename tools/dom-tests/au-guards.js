// Упражнения «На слух» тестируются с речью: без неё их теперь честно
// не пускает заслон на входе (см. openExercise).
process.env.TTS = "1";
// «На слух»: что переживает свой раунд.
//   G1. Автопрослушивание (setTimeout(play, 350)) после ухода с экрана.
//   G2. Скорость «Медленно» — глобальная и на весь сеанс.
//   G3. Последний верный ответ: пауза 1100 мс, ученик успел уйти.
//   G4. Аудирование с доски: честные 6 из 6 — что видит репетитор.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  window.__log = { speak: [], finish: [], board: [], rounds: null, type: null, toasts: 0 };
  const _f = exFinish, _sp = speak, _m = runMCQ, _t = runType, _at = achToast;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.speak    = function (t, o) { window.__log.speak.push([String(t), (o && o.rate) || TTS_RATE]); };
  window.runMCQ   = function (r, o) { window.__log.rounds = r; return _m(r, o); };
  window.runType  = function (r, o) { window.__log.type = r; return _t(r, o); };
  window.achToast = function (a) { window.__log.toasts++; return _at(a); };
  window.reportBoardResult = function (card, info) { window.__log.board.push([card, info]); return Promise.resolve(true); };
  state.taskResults = {};
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log.speak = []; window.__log.finish = []; window.__log.board = []; window.__log.toasts = 0;");

(async () => {
  console.log("G1. Ученик открыл диктант и сразу ушёл (до автопрослушивания)");
  reset();
  w.eval('readGateMs = () => 0; openExercise("dictation");');
  await tick(60);
  const sentence = JSON.parse(w.eval("JSON.stringify(window.__log.type)"))[0].audioText;
  console.log("   диктант собрался, первая фраза: " + JSON.stringify(sentence));
  click(doc.querySelector("#exercise-body [data-nav]"));       // «← Тренировки»
  console.log("   ученик нажал «← Тренировки» через ~60 мс");
  console.log("   озвучено к этому моменту: " + JSON.stringify(log().speak));
  await tick(500);
  const after = log().speak;
  console.log("   экран сейчас: " + (doc.getElementById("screen-practice").classList.contains("hidden") ? "не тренировки" : "Тренировки"));
  console.log("   озвучено после ухода: " + JSON.stringify(after));
  ok(after.length === 0, "после ухода с экрана ничего не произносится");

  console.log("\nG1b. Ученик открыл диктант и сразу открыл аудирование");
  reset();
  w.eval('openExercise("dictation");');
  await tick(60);
  const s2 = JSON.parse(w.eval("JSON.stringify(window.__log.type)"))[0].audioText;
  w.eval('openExercise("listening");');
  await tick(500);
  const r2 = JSON.parse(w.eval("JSON.stringify(window.__log.rounds)"));
  const spoken = log().speak.map(x => x[0]);
  console.log("   на экране аудирование, первое слово: " + JSON.stringify(r2[0].audioText));
  console.log("   прозвучало: " + JSON.stringify(spoken));
  ok(!spoken.includes(s2), "фраза брошенного диктанта не звучит поверх аудирования");

  console.log("\nG2. «Медленно» в диктанте — насколько это «здесь и сейчас»");
  reset();
  w.eval('openExercise("dictation");');
  await tick(60);
  const slow = [...doc.querySelectorAll(".speed-pill")].find(b => b.dataset.rate === "0.62");
  click(slow);
  console.log("   нажал «Медленно», TTS_RATE = " + w.eval("TTS_RATE"));
  click(doc.querySelector("#exercise-body [data-nav]"));
  await tick(60);
  w.eval('openExercise("listening");');
  await tick(500);
  console.log("   ушёл в аудирование: TTS_RATE = " + w.eval("TTS_RATE") +
              ", озвучка шла со скоростью " + JSON.stringify(log().speak.map(x => x[1])));
  w.eval('show("dictionary");');
  await tick(50);
  reset();
  w.eval('speak("cat");');
  console.log("   карточка слова в словаре: " + JSON.stringify(log().speak));
  ok(w.eval("TTS_RATE") === 0.92, "скорость вернулась к обычной вне диктанта");

  console.log("\nG3. Последний верный ответ в аудировании, ученик сразу ушёл");
  reset();
  w.eval(`
    state.counters = {};
    window.boardTaskCard = "card-77";        // упражнение открыто с доски
    openExercise("listening");
  `);
  await tick(60);
  const rounds = JSON.parse(w.eval("JSON.stringify(window.__log.rounds)"));
  for (let n = 0; n < rounds.length; n++) {
    let g = 0;
    while (g++ < 120 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(25);
    const box = doc.querySelector("#ex-stage .mcq-options");
    if (!box) break;
    await tick(600);                                   // отвечаем спокойно
    click(box.children[rounds[n].correct]);
    if (n === rounds.length - 1) break;                // на последнем не ждём
    let g2 = 0;
    while (g2++ < 60 && box.isConnected) await tick(40);
  }
  console.log("   ответил на последний вопрос и через 100 мс нажал «← Тренировки»");
  await tick(100);
  click(doc.querySelector("#exercise-body [data-nav]"));
  const before = log();
  console.log("   сразу после ухода: exFinish " + JSON.stringify(before.finish) +
              ", на доску " + JSON.stringify(before.board.length));
  await tick(1400);
  const a = log();
  console.log("   через 1,4 с: exFinish " + JSON.stringify(a.finish) +
              ", на доску ушло " + JSON.stringify(a.board.map(b => b[1] && b[1].text)) +
              ", наград всплыло " + a.toasts +
              ", counters.exercises = " + w.eval("JSON.stringify(state.counters.exercises || 0)"));
  console.log("   экран ученика: " + (doc.getElementById("screen-practice").classList.contains("hidden") ? "не тренировки" : "Тренировки") +
              "; вкладку уводит на доску таймером: " + !!w.eval("!!window.__exBoardBack"));
  ok(a.finish.length === 0, "подход, из которого ушли, не закрывается сам");

  console.log("\nG4. Аудирование с доски: честные 6 из 6, реакция 250 мс");
  reset();
  w.eval(`
    clearTimeout(window.__exBoardBack);
    window.boardTaskCard = "card-88";
    openExercise("listening");
  `);
  await tick(60);
  const r4 = JSON.parse(w.eval("JSON.stringify(window.__log.rounds)"));
  for (let n = 0; n < r4.length; n++) {
    let g = 0;
    while (g++ < 120 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(25);
    const box = doc.querySelector("#ex-stage .mcq-options");
    if (!box) break;
    await tick(250);
    click(box.children[r4[n].correct]);
    let g2 = 0;
    while (g2++ < 60 && box.isConnected) await tick(40);
  }
  await tick(200);
  const b4 = log();
  console.log("   верных: " + JSON.stringify(b4.finish));
  console.log("   репетитор на доске видит плашку: " + JSON.stringify(b4.board.map(x => x[1].text)));
  w.eval("clearTimeout(window.__exBoardBack); window.boardTaskCard = null;");

  console.log("\nпровалов: " + fails);
})();
