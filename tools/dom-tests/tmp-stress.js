// Повторные нажатия и уход с экрана: не проходит ли счёт дважды.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 25));
const st = () => doc.getElementById("ex-stage");

w.eval(`
  window.readGateMs = () => 0;
  window.__log = { finish: [], xp: 0, awards: [], bumps: [] };
  const _f = exFinish, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += n; window.__log.awards.push(n); return _a(n); };
  if (typeof bump === "function") { const _b = bump; window.bump = function (k) { window.__log.bumps.push(k); return _b(k); }; }
  window.__rounds = null;
  const _mcq = runMCQ;
  window.runMCQ = function (rounds, opts) { window.__rounds = rounds; return _mcq(rounds, opts); };
`);
const reset = () => w.eval("window.__log = { finish: [], xp: 0, awards: [], bumps: [] };");
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const roundIdx = () => { const c = st().querySelector(".test-counter"); return c ? +c.textContent.split("/")[0].trim() - 1 : 0; };
const rounds = () => JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));

(async () => {
  // ---- A. MCQ: жмём верный вариант трижды подряд ----
  console.log("\nA. notliteral: верный вариант нажат трижды");
  reset(); w.eval('openExercise("notliteral")'); await tick(50);
  let R = rounds();
  let opts = [...st().querySelectorAll(".mcq-option")];
  const c = R[roundIdx()].correct;
  click(opts[c]); click(opts[c]); click(opts[c]);
  await tick(60);
  console.log("   awards:", JSON.stringify(log().awards), "xp:", log().xp);

  // ---- B. MCQ: после верного жмём другой вариант ----
  await tick(1200);
  console.log("B. notliteral: после ответа нажат другой вариант");
  reset();
  R = rounds(); opts = [...st().querySelectorAll(".mcq-option")];
  const cc = R[roundIdx()].correct;
  click(opts[cc]);
  click(opts[(cc + 1) % opts.length]);
  await tick(60);
  console.log("   awards:", JSON.stringify(log().awards));

  // ---- C. MCQ: последний раунд неверно, «Дальше» нажата трижды ----
  console.log("\nC. notliteral: «Дальше» на последнем раунде нажата трижды");
  reset(); w.eval('openExercise("notliteral")'); await tick(50);
  R = rounds();
  for (let k = 0; k < R.length; k++) {
    const o = [...st().querySelectorAll(".mcq-option")];
    const idx = roundIdx();
    const wrong = (R[idx].correct + 1) % o.length;
    click(o[wrong]);
    await tick(40);
    const nb = st().querySelector("#mcq-next");
    if (k === R.length - 1) {
      reset();
      console.log("   кнопка есть:", !!nb, "| в документе:", nb ? nb.isConnected : "-");
      click(nb); 
      console.log("   после 1-го клика кнопка в документе:", nb.isConnected);
      click(nb); click(nb);
      await tick(60);
      console.log("   finish:", JSON.stringify(log().finish), "bumps:", JSON.stringify(log().bumps));
    } else if (nb) { click(nb); await tick(30); }
  }

  // ---- D. buildphrase: «Дальше» на последнем раунде нажата трижды ----
  console.log("\nD. buildphrase: «Дальше» на последнем раунде нажата трижды");
  reset(); w.eval('openExercise("buildphrase")'); await tick(50);
  let guard = 0, total = null;
  while (guard++ < 40) {
    const cnt = st().querySelector(".test-counter");
    if (cnt) total = +cnt.textContent.split("/")[1].trim();
    const idx = cnt ? +cnt.textContent.split("/")[0].trim() - 1 : -1;
    const tiles = [...st().querySelectorAll(".scr-tiles .scr-tile")].filter(b => !b.disabled);
    if (!tiles.length) break;
    // отвечаем НЕВЕРНО: в обратном порядке
    const t = st().querySelector(".quiz-word").textContent;
    const parts = JSON.parse(w.eval(`JSON.stringify(((PHRASES.phrasal||[]).concat(PHRASES.idioms||[]))
      .find(x => x.t === ${JSON.stringify(t)}).parts)`));
    for (const word of [...parts].reverse()) {
      const b = [...st().querySelectorAll(".scr-tiles .scr-tile")].find(x => !x.disabled && x.textContent === word);
      if (b) click(b);
    }
    await tick(40);
    const nb = st().querySelector("#bp-next");
    if (idx === total - 1) {
      reset();
      console.log("   последний раунд, кнопка есть:", !!nb);
      click(nb);
      console.log("   после 1-го клика в документе:", nb.isConnected);
      click(nb); click(nb);
      await tick(60);
      console.log("   finish:", JSON.stringify(log().finish), "bumps:", JSON.stringify(log().bumps));
      break;
    }
    if (nb) { click(nb); await tick(30); }
  }

  // ---- E. уход с экрана во время паузы 1,1 с ----
  console.log("\nE. buildphrase: верный ответ на последнем раунде, потом уход «К тренировкам»");
  reset(); w.eval('openExercise("buildphrase")'); await tick(50);
  guard = 0; total = null;
  while (guard++ < 40) {
    const cnt = st().querySelector(".test-counter");
    if (cnt) total = +cnt.textContent.split("/")[1].trim();
    const idx = cnt ? +cnt.textContent.split("/")[0].trim() - 1 : -1;
    const tiles = [...st().querySelectorAll(".scr-tiles .scr-tile")].filter(b => !b.disabled);
    if (!tiles.length) break;
    const t = st().querySelector(".quiz-word").textContent;
    const parts = JSON.parse(w.eval(`JSON.stringify(((PHRASES.phrasal||[]).concat(PHRASES.idioms||[]))
      .find(x => x.t === ${JSON.stringify(t)}).parts)`));
    for (const word of parts) {
      const b = [...st().querySelectorAll(".scr-tiles .scr-tile")].find(x => !x.disabled && x.textContent === word);
      if (b) click(b);
    }
    if (idx === total - 1) {
      reset();
      w.eval('show("practice")');   // ученик ушёл на экран тренировок
      console.log("   ушли на practice; экран упражнения скрыт:",
        doc.getElementById("screen-exercise").classList.contains("hidden"));
      await tick(1400);
      console.log("   finish после ухода:", JSON.stringify(log().finish), "bumps:", JSON.stringify(log().bumps));
      console.log("   что нарисовано в ex-stage:", (st().textContent || "").replace(/\s+/g, " ").trim().slice(0, 90));
      break;
    }
    await tick(1250);
  }
  process.exit(0);
})();
