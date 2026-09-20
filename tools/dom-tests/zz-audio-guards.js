// «На слух»: защёлки и утечки. Повторные нажатия, ранние нажатия,
// таймер озвучки, переживший упражнение, глобальная скорость речи.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0, speak: [], rounds: null, type: null };
  const _f = exFinish, _s = statUpdate, _a = award, _sp = speak, _m = runMCQ, _t = runType;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  window.speak = function (t, o) { window.__log.speak.push(String(t)); return _sp(t, o); };
  window.runMCQ = function (r, o) { window.__log.rounds = r; return _m(r, o); };
  window.runType = function (r, o) { window.__log.type = r; return _t(r, o); };
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval(`window.__log.finish = []; window.__log.stat = []; window.__log.xp = 0; window.__log.speak = [];`);

(async () => {
  console.log("A. Аудирование: повторные нажатия после ответа");
  w.eval('openExercise("listening")');
  await tick(50);
  const rounds = log().rounds;
  let guard = 0;
  while (guard++ < 200 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(30);
  reset();
  const box = doc.querySelector("#ex-stage .mcq-options");
  const right = box.children[rounds[0].correct];
  click(right);
  const a = log();
  click(right); click(right);
  click(box.children[(rounds[0].correct + 1) % box.children.length]);
  const b = log();
  ok(a.xp === b.xp, `очки не выросли от повторных нажатий: ${a.xp} → ${b.xp}`);
  ok(a.stat.length === b.stat.length, `слово засчитано один раз: ${a.stat.length} → ${b.stat.length}`);

  console.log("\nB. Аудирование: нажатие ДО того, как варианты открылись");
  w.eval('openExercise("listening")');
  await tick(50);
  reset();
  const box2 = doc.querySelector("#ex-stage .mcq-options");
  ok(box2.classList.contains("mcq-wait"), "варианты ещё заблокированы (пауза на чтение)");
  click(box2.children[0]);
  ok(log().stat.length === 0, "раннее нажатие не засчитано");
  guard = 0;
  while (guard++ < 200 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(30);
  ok(log().stat.length === 0, "и не всплыло, когда варианты открылись");

  console.log("\nC. Диктант: «Проверить» трижды, «Дальше» дважды");
  w.eval(`state.trainFolders = []; state.trainWords = []; homeworkScope = null;`);
  w.eval('openExercise("dictation")');
  await tick(50);
  const rt = log().type;
  reset();
  const ta = doc.getElementById("type-input");
  ta.value = rt[0].sample;
  const checkBtn = doc.getElementById("type-check");
  click(checkBtn); click(checkBtn); click(checkBtn);
  const c1 = log();
  ok(c1.xp === 15, `очки за верный ответ начислены один раз: ${c1.xp}`);
  ok(c1.stat.length === 1, `слово засчитано один раз: ${JSON.stringify(c1.stat)}`);
  const nb = doc.getElementById("type-next");
  click(nb); click(nb);          // второй клик уже по оторванной кнопке
  await tick(60);
  const counter = doc.querySelector("#ex-stage .test-counter");
  ok(counter && counter.textContent.trim() === "2 / " + rt.length,
     "после «Дальше» стоим на втором вопросе, а не на третьем: " + (counter && counter.textContent.trim()));

  console.log("\nD. Таймер озвучки переживает упражнение");
  reset();
  w.eval('openExercise("listening")');
  const listened = log().rounds ? null : null;
  const word = JSON.parse(w.eval("JSON.stringify(window.__log.rounds[0].audioText)"));
  await tick(100);                       // ученик передумал через 0,1 с
  w.eval('openExercise("dictation")');
  const sentence = JSON.parse(w.eval("JSON.stringify(window.__log.type[0].sample)"));
  await tick(600);
  const spoken = log().speak;
  console.log("  озвучено после ухода:", JSON.stringify(spoken));
  ok(!spoken.includes(word),
     `слово «${word}» из брошенного упражнения не звучит поверх диктанта`);

  console.log("\nE. «Медленно» в диктанте — настройка на весь сайт");
  w.eval('openExercise("dictation")');
  await tick(50);
  const before = w.eval("TTS_RATE");
  const slow = [...doc.querySelectorAll("#ex-stage .speed-pill")].find(b => b.dataset.rate === "0.62");
  click(slow);
  const after = w.eval("TTS_RATE");
  w.eval('openExercise("listening")');
  await tick(50);
  const later = w.eval("TTS_RATE");
  console.log(`  TTS_RATE: было ${before}, после «Медленно» ${after}, в аудировании ${later}`);
  ok(later === before, "скорость речи не утекла в другое упражнение");

  console.log("\nF. Диктант: «Проверить» с пустым полем");
  w.eval('openExercise("dictation")');
  await tick(50);
  reset();
  click(doc.getElementById("type-check"));
  const fb = doc.getElementById("type-feedback");
  ok(fb.textContent.trim() !== "", "пустой ответ получает хоть какой-то отклик: " + JSON.stringify(fb.textContent));

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "всё чисто") + "; ошибки обработчиков: " + JSON.stringify(errors));
  process.exit(0);
})();
