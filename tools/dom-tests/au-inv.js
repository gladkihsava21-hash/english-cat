// Упражнения «На слух» тестируются с речью: без неё их теперь честно
// не пускает заслон на входе (см. openExercise).
process.env.TTS = "1";
// Инварианты «На слух»: подход закрывается один раз, ответ считается
// один раз, нетерпеливый ребёнок ничего не набивает.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0, rounds: null, type: null };
  const _f = exFinish, _s = statUpdate, _a = award, _m = runMCQ, _t = runType;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  window.runMCQ = function (r, o) { window.__log.rounds = r; return _m(r, o); };
  window.runType = function (r, o) { window.__log.type = r; return _t(r, o); };
  readGateMs = () => 0;
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log.finish = []; window.__log.stat = []; window.__log.xp = 0;");

(async () => {
  console.log("A. Аудирование целиком: 6 раундов, ребёнок долбит по кнопкам");
  w.eval('openExercise("listening");');
  await tick(60);
  const rounds = log().rounds;
  reset();
  let right = 0;
  for (let n = 0; n < rounds.length; n++) {
    let g = 0;
    while (g++ < 100 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(20);
    const box = doc.querySelector("#ex-stage .mcq-options");
    if (!box) break;
    await tick(450);
    const pick = n % 2 ? rounds[n].correct : (rounds[n].correct + 1) % box.children.length;
    if (pick === rounds[n].correct) right++;
    click(box.children[pick]);              // ответ
    click(box.children[pick]);              // ребёнок ткнул ещё раз
    click(box.children[(pick + 1) % box.children.length]);   // и в соседнюю
    await tick(30);
    const nb = doc.getElementById("mcq-next");
    if (nb) { click(nb); click(nb); }       // «Дальше» два раза подряд
    let g2 = 0;
    while (g2++ < 60 && box.isConnected) await tick(40);
  }
  await tick(300);
  const a = log();
  console.log("   верных на самом деле:", right);
  ok(a.finish.length === 1, `подход закрыт один раз: ${JSON.stringify(a.finish)}`);
  ok(a.finish[0] && a.finish[0][0] === right, `счёт совпал с реальностью: ${a.finish[0] && a.finish[0][0]} vs ${right}`);
  ok(a.finish[0] && a.finish[0][0] <= a.finish[0][1], "верных не больше, чем вопросов");
  ok(a.stat.length === rounds.length, `слов зачтено ${a.stat.length}, раундов ${rounds.length}`);
  ok(a.xp === right * 10, `очки ${a.xp} = ${right} × 10`);

  console.log("\nB. Диктант целиком: та же долбёжка");
  w.eval('openExercise("dictation");');
  await tick(60);
  const rt = log().type;
  reset();
  let right2 = 0;
  for (let n = 0; n < rt.length; n++) {
    const inp = doc.getElementById("type-input");
    if (!inp) break;
    const good = n % 2 === 0;
    inp.value = good ? rt[n].answer : "qqq";
    if (good) right2++;
    const cb = doc.getElementById("type-check");
    click(cb); click(cb); click(cb);        // «Проверить» три раза
    await tick(30);
    const nb = doc.getElementById("type-next");
    if (nb) { click(nb); }
    await tick(40);
  }
  await tick(300);
  const b = log();
  console.log("   верных на самом деле:", right2);
  ok(b.finish.length === 1, `подход закрыт один раз: ${JSON.stringify(b.finish)}`);
  ok(b.finish[0] && b.finish[0][0] === right2, `счёт совпал: ${b.finish[0] && b.finish[0][0]} vs ${right2}`);
  ok(b.stat.length === rt.length, `слов зачтено ${b.stat.length}, раундов ${rt.length}`);
  ok(b.xp === right2 * 15, `очки ${b.xp} = ${right2} × 15`);

  console.log("\nC. Диктант: два нажатия «Дальше» на ПОСЛЕДНЕМ раунде");
  w.eval(`
    window.__log.board = [];
    window.reportBoardResult = function (c, i) { window.__log.board.push(i.text); return Promise.resolve(true); };
    window.boardTaskCard = "card-1"; state.taskResults = {};
    homeworkContext = { id: "hw-dd", title: "Диктант" };
    openExercise("dictation");
  `);
  await tick(60);
  const rt2 = log().type;
  reset();
  for (let n = 0; n < rt2.length; n++) {
    const inp = doc.getElementById("type-input");
    if (!inp) break;
    inp.value = rt2[n].answer;
    click(doc.getElementById("type-check"));
    await tick(30);
    const nb = doc.getElementById("type-next");
    if (nb) {
      if (n === rt2.length - 1) { click(nb); click(nb); }   // последний — дважды
      else click(nb);
    }
    await tick(40);
  }
  await tick(200);
  const c = log();
  ok(c.finish.length === 1, `exFinish вызван ${c.finish.length} раз(а): ${JSON.stringify(c.finish)}`);
  console.log("   репетитору в домашку:", w.eval('JSON.stringify(state.taskResults["hw-dd"])'));
  console.log("   на доску отправлено плашек:", JSON.stringify(c.board));
  w.eval('clearTimeout(window.__exBoardBack); window.boardTaskCard = null; homeworkContext = null;');

  console.log("\nD. Аудирование: нажатие ДО того, как варианты открылись");
  w.eval('readGateMs = (t, audio) => audio ? 1500 : 0; openExercise("listening");');
  await tick(60);
  const rd = log().rounds;
  reset();
  const box = doc.querySelector("#ex-stage .mcq-options");
  console.log("   пауза идёт:", box.classList.contains("mcq-wait"));
  click(box.children[rd[0].correct]);
  const early = log();
  ok(early.stat.length === 0 && early.xp === 0, "ранний тык не засчитан");
  let g = 0;
  while (g++ < 100 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(25);
  await tick(500);
  click(box.children[rd[0].correct]);
  await tick(30);
  const late = log();
  ok(late.stat.length === 1 && late.xp === 10, `после открытия ответ засчитан один раз: ${JSON.stringify(late.stat)}, xp ${late.xp}`);
  w.eval('readGateMs = () => 0;');

  console.log("\nпровалов: " + fails);
})();
