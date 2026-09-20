// «На слух»: аудирование. Играем ЧЕСТНО — 6 верных из 6, — но нажимаем
// сразу, как варианты разблокировались (слово уже прозвучало во время
// паузы на чтение). Смотрим, чем это кончается.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const REACT = Number(process.env.REACT || 300);   // мс после разблокировки

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0, revoked: 0, rounds: null };
  const _f = exFinish, _s = statUpdate, _a = award, _r = revokeXP, _m = runMCQ;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  window.revokeXP = function (n) { window.__log.revoked += n; return _r(n); };
  window.runMCQ = function (rounds, opts) { window.__log.rounds = rounds; return _m(rounds, opts); };
  state.taskResults = {};
  homeworkContext = { id: "hw-audio", title: "Аудирование к пятнице" };
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));

(async () => {
  w.eval('openExercise("listening")');
  await tick(50);
  const rounds = log().rounds;
  console.log("раундов:", rounds.length);

  for (let n = 0; n < rounds.length; n++) {
    // ждём, пока пауза на чтение снимет блокировку
    let guard = 0;
    while (guard++ < 200 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(30);
    const box = doc.querySelector("#ex-stage .mcq-options");
    if (!box) break;
    const idx = rounds[n].correct;                // ВЕРНЫЙ вариант
    await tick(REACT);                            // реакция ученика
    const btn = box.children[idx];
    console.log(`  раунд ${n + 1}: слышно «${rounds[n].audioText}», жму «${btn.textContent.trim()}»`);
    click(btn);
    await tick(60);
    const nb = doc.getElementById("mcq-next");    // появляется только на ошибке
    if (nb) { console.log("    (ответ засчитан НЕВЕРНЫМ)"); click(nb); }
    await tick(1250);                             // верный ответ доигрывается 1,1 с
  }
  await tick(200);
  const l = log();
  console.log("\nитог подхода   :", JSON.stringify(l.finish));
  console.log("статистика слов:", JSON.stringify(l.stat));
  console.log("начислено XP   :", l.xp, "| отобрано обратно:", l.revoked);
  const h2 = doc.querySelector("#ex-stage h2");
  console.log("экран результата:", h2 && h2.textContent.trim());
  const note = doc.querySelector("#ex-stage .rushed-note");
  if (note) console.log("текст          :", note.textContent.replace(/\s+/g, " ").trim());
  console.log("таблица репетитора:", w.eval("JSON.stringify(state.taskResults)"));
  console.log("ошибки:", errors);
  process.exit(0);
})();
