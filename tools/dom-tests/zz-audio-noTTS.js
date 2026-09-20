// Ветка без синтеза речи (TTS_OK = false — как во встроенном браузере
// Telegram/ВК). Хаб тренировок про это знает и гасит плитки. А другие
// входы в те же упражнения?
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  window.__log = { finish: [], stat: [], board: [], rounds: null, type: null };
  const _f = exFinish, _s = statUpdate, _m = runMCQ, _t = runType;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.runMCQ = function (r, o) { window.__log.rounds = r; return _m(r, o); };
  window.runType = function (r, o) { window.__log.type = r; return _t(r, o); };
  // доска зовёт reportBoardResult — перехватываем, сети в тесте нет
  window.reportBoardResult = function (card, info) { window.__log.board.push([card, info]); return Promise.resolve(true); };
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));

(async () => {
  console.log("TTS_OK =", w.eval("TTS_OK"));

  console.log("\n1. Хаб тренировок знает, что озвучки нет");
  w.eval("renderPracticeHub()");
  const help = doc.querySelector("#practice-grid .audio-help");
  ok(!!help, "подсказка «Здесь нет английской озвучки» показана");
  const cards = [...doc.querySelectorAll("#practice-grid .ex-card")]
    .filter(c => /Аудирование|Диктант/.test(c.textContent));
  ok(cards.length === 2 && cards.every(c => c.disabled), "обе плитки «На слух» заблокированы");

  console.log("\n2. Домашка репетитора: те же упражнения, вход в обход хаба");
  w.eval(`
    const rec = WORDS.A2.find(x => x.w === "flea") || WORDS.A2[0];
    homeworkTasks = [];
    startHomeworkLesson({ id: "hw-2", title: "Диктант к среде", game: "dictation",
                          words: [{ w: rec.w, t: rec.t, ex: rec.ex, level: "A2" }] });
  `);
  await tick(60);
  const st = doc.getElementById("ex-stage");
  const opened = !!doc.getElementById("type-input");
  ok(!opened, "диктант без озвучки не открылся (или объяснил, что звука нет)");
  console.log("     экран:", (st.querySelector("h2") || st.querySelector(".quiz-label") || {}).textContent);
  ok(!!st.querySelector(".audio-help"), "на экране упражнения есть предупреждение про озвучку");

  console.log("\n3. Ссылка с доски: #train=listening&card=…");
  w.eval(`window.boardTaskCard = "card-77"; homeworkContext = null;`);
  w.eval('openExercise("listening")');
  await tick(60);
  const box = doc.querySelector("#ex-stage .mcq-options");
  ok(!box, "аудирование по ссылке с доски без озвучки не играется");

  if (box) {
    // Ученик ничего не слышит и тыкает наугад — доигрываем подход.
    const rounds = log().rounds;
    w.eval("window.__log.finish = []; window.__log.stat = []; window.__log.board = [];");
    for (let n = 0; n < rounds.length; n++) {
      let guard = 0;
      while (guard++ < 200 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(30);
      const b2 = doc.querySelector("#ex-stage .mcq-options");
      if (!b2) break;
      click(b2.children[(rounds[n].correct + 1) % b2.children.length]);   // мимо: не слышал
      await tick(60);
      const nb = doc.getElementById("mcq-next");
      if (nb) click(nb);
      await tick(80);
    }
    await tick(200);
    const l = log();
    console.log("     итог  :", JSON.stringify(l.finish));
    console.log("     слова :", JSON.stringify(l.stat));
    console.log("     на доску репетитору:", JSON.stringify(l.board));
    const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.filter(d => d.forgot))"));
    console.log("     помечено «забыл»:", dict.map(d => d.w + " forgot=" + d.forgot).join(", ") || "—");
  }

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "всё чисто") + "; ошибки: " + JSON.stringify(errors));
  process.exit(0);
})();
