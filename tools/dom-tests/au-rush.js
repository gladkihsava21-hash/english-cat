// Упражнения «На слух» тестируются с речью: без неё их теперь честно
// не пускает заслон на входе (см. openExercise).
process.env.TTS = "1";
// «На слух» → Аудирование. Ученик играет ЧЕСТНО: слушает слово, читает
// варианты (они видны, но бледные и не нажимаются — .mcq-wait), и жмёт
// верный, как только замок снят. Все 6 из 6 верных.
//
// Вопрос: что говорит тренажёр и что уходит репетитору.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));

w.eval(`
  window.__log = { finish: [], xp: 0, revoked: 0, rounds: null };
  const _f = exFinish, _a = award, _r = revokeXP, _m = runMCQ;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award    = function (n) { window.__log.xp += n; return _a(n); };
  window.revokeXP = function (n) { window.__log.revoked += n; return _r(n); };
  window.runMCQ   = function (r, o) { window.__log.rounds = r; return _m(r, o); };
  state.taskResults = {};
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));

async function play(react, hwId) {
  w.eval(`
    window.__log.finish = []; window.__log.xp = 0; window.__log.revoked = 0;
    homeworkContext = { id: ${JSON.stringify(hwId)}, title: "Аудирование к пятнице" };
    openExercise("listening");
  `);
  await tick(60);
  const rounds = log().rounds;
  for (let n = 0; n < rounds.length; n++) {
    let guard = 0;
    while (guard++ < 300 && doc.querySelector("#ex-stage .mcq-options.mcq-wait")) await tick(25);
    const box = doc.querySelector("#ex-stage .mcq-options");
    if (!box) break;
    await tick(react);                       // ученик тянется к экрану
    click(box.children[rounds[n].correct]);  // ВЕРНЫЙ вариант
    // верный ответ уезжает сам через 1100 мс — ждём смены экрана
    let g2 = 0;
    while (g2++ < 60 && box.isConnected) await tick(40);
  }
  await tick(200);
  const stage = doc.getElementById("ex-stage");
  const head = (stage.querySelector("h2") || {}).textContent || "";
  const body = stage.textContent.replace(/\s+/g, " ").trim();
  const res = JSON.parse(w.eval(`JSON.stringify(state.taskResults[${JSON.stringify(hwId)}] || null)`));
  return { rounds: rounds.length, head, body, res, ...log() };
}

(async () => {
  console.log("gate для аудио:", w.eval("readGateMs('x', true)"), "мс;",
              "порог «прокликал»:", w.eval("RUSH_EXTRA_MS"), "мс сверх gate;",
              "минимум ответов:", w.eval("RUSH_MIN_ANSWERS"));
  console.log("вариант ответа во время паузы: видим (opacity .38), но не нажимается\n");

  for (const react of [250, 400, 900]) {
    const r = await play(react, "hw-" + react);
    console.log(`--- ученик жмёт через ${react} мс после того, как варианты открылись`);
    console.log(`    верных: ${r.finish.map(f => f.join(" из ")).join(" | ")}`);
    console.log(`    экран : «${r.head}»`);
    console.log(`    очки  : начислено ${r.xp}, отобрано ${r.revoked}`);
    console.log(`    репетитору: ${JSON.stringify(r.res)}`);
    if (/Слишком быстро/.test(r.head)) {
      console.log("    текст : " + r.body.slice(0, 240));
    }
    console.log("");
  }
})();
