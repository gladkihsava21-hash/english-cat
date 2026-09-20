const { w } = require("./harness-full.js");
const doc = w.document;
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const stage = () => doc.getElementById("ex-stage");

w.eval(`
  window.readGateMs = () => 0;
  window.__rounds = null; window.__fin = []; window.__type = null;
  const _mcq = runMCQ, _fin = exFinish, _type = runType;
  window.runMCQ  = function (r, o) { window.__rounds = r; return _mcq(r, o); };
  window.runType = function (r, o) { window.__type = r; return _type(r, o); };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin(c, t, n); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
`);

(async () => {
  // ── A. Очки за прокликивание остаются, если подход не доигрывать ──────
  // award() зовёт addXP сразу, а снимает очки только exFinish. Ученик,
  // который жмёт наугад и уходит с экрана, не доиграв, не попадает под
  // проверку вовсе: exRoundRushed() требует четырёх ЗАКРЫТЫХ ответов.
  console.log("── A. очки за прокликивание, если выходить, не доиграв подход");
  w.eval(`state.xp = 0; state.activity = {}; state.counters = {};
          state.dictionary = WORDS.A1.slice(0, 40).map(x => ({ w: x.w, t: x.t, added: Date.now(), seen: 1 }));`);
  for (let round = 1; round <= 5; round++) {
    w.eval(`window.__fin = []; openExercise("mcq")`);
    await tick();
    // жмём наугад ПЕРВУЮ кнопку — как ребёнок, набивающий очки
    for (let k = 0; k < 3; k++) {
      const box = doc.getElementById("mcq-options");
      if (!box) break;
      click(box.children[0]);
      await tick(1200);
      const nb = doc.getElementById("mcq-next");
      if (nb) { click(nb); await tick(5); }
    }
    w.eval(`show("practice")`);           // «← Тренировки», подход брошен
    await tick(60);
    console.log(`   заход ${round}: ответов ${w.eval("exRound.answered")}, `
      + `exFinish ${w.eval("window.__fin.length")} раз, state.xp = ${w.eval("state.xp")}, `
      + `активность за день = ${w.eval("state.activity[dayKey()] || 0")}`);
  }
  console.log("   → защита сработала бы только на закрытом подходе (RUSH_MIN_ANSWERS = "
    + w.eval("RUSH_MIN_ANSWERS") + " ЗАКРЫТЫХ ответов и exFinish)");

  // ── B. Одно и то же предложение диктуется дважды за подход ────────────
  // pickFresh отбирает по ключу «текст предложения», а в банке у разных
  // слов пример бывает общий — тогда два разных задания дают одинаковый
  // текст, и оба попадают в подход.
  console.log("\n── B. диктант по папке: два слова с общим примером");
  console.log("   в банке A1:", w.eval(`(() => {
    const byEx = {}; WORDS.A1.forEach(x => { if (x.ex) (byEx[x.ex] = byEx[x.ex] || []).push(x.w); });
    return Object.entries(byEx).filter(([, ws]) => ws.length > 1)
      .map(([e, ws]) => JSON.stringify(e) + " — у " + ws.join(" и ")).join("; ");
  })()`));
  w.eval(`
    localStorage.removeItem("savelyExSeen");
    const pick = n => WORDS.A1.find(x => x.w === n);
    state.dictionary = ["banana", "monkey", "keep", "play", "king", "rule"]
      .map(pick).filter(Boolean)
      .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1, folders: ["Урок 3"] }));
    state.trainFolders = ["Урок 3"];
    window.__type = null; window.__fin = [];
    openExercise("dictation");
  `);
  await tick(60);
  const rounds = w.eval(`window.__type ? JSON.stringify(window.__type.map(r => r.answer)) : "null"`);
  console.log("   что продиктовано за подход:", rounds);
  const arr = JSON.parse(rounds || "null") || [];
  const dupd = arr.filter((x, i) => arr.indexOf(x) !== i);
  console.log(dupd.length
    ? "   ✗ ОДНО И ТО ЖЕ ПРЕДЛОЖЕНИЕ ДВАЖДЫ: " + JSON.stringify(dupd)
      + " — ученик слышит его второй раз и получает второй балл за ту же работу"
    : "   повторов в этом подходе нет");
  w.eval(`state.trainFolders = [];`);

  // ── C. Двойное нажатие «Дальше →» на последнем вопросе ────────────────
  console.log("\n── C. «Дальше →» на последнем вопросе нажали дважды");
  w.eval(`window.__fin = []; state.xp = 0; state.taskResults = {};
          stage().innerHTML = "";
          homeworkContext = { id: 900, title: "Домашка" };
          runMCQ([{ sub: "s", prompt: "cat", options: ["кот", "пёс"], correct: 0 }]);`);
  await tick();
  click(doc.getElementById("mcq-options").children[1]);   // отвечаем неверно → появится «Дальше»
  await tick();
  const nb = doc.getElementById("mcq-next");
  console.log("   кнопка «Дальше» есть:", !!nb);
  click(nb);
  click(nb);   // второе нажатие по той же кнопке (в jsdom она уже вне документа)
  await tick(100);
  console.log("   exFinish вызван:", w.eval("window.__fin.length"), "раз",
              w.eval("JSON.stringify(window.__fin)"));
  console.log("   записей репетитору (tries):",
              w.eval(`JSON.stringify(state.taskResults["900"] || null)`));
  console.log("   (в живом браузере вторая половина двойного тапа попадает уже");
  console.log("    в перерисованный экран — см. вывод про воспроизводимость)");

  process.exit(0);
})();
