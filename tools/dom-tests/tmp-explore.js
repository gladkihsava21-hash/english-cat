// Разведка: как реально играются notliteral / buildphrase / collocpair.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

w.eval(`
  window.readGateMs = () => 0;
  window.__log = { finish: [], stat: [], xp: 0, awards: [] };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word)); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; window.__log.awards.push(n); return _a(n); };
`);

const reset = () => w.eval("window.__log = { finish: [], stat: [], xp: 0, awards: [] };");
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));

(async () => {
  // ---- notliteral: играем ЧЕСТНО (выбираем верный вариант) ----
  console.log("\n=== notliteral ===");
  reset(); errors.length = 0;
  w.eval('openExercise("notliteral")');
  await tick(60);
  // сколько раундов?
  console.log("прогресс:", doc.querySelector("#ex-stage .test-counter") && doc.querySelector("#ex-stage .test-counter").textContent);
  console.log("подпись:", doc.querySelector("#ex-stage .quiz-label") && doc.querySelector("#ex-stage .quiz-label").textContent);
  console.log("промпт:", doc.querySelector("#ex-stage .quiz-word") && doc.querySelector("#ex-stage .quiz-word").textContent);
  console.log("варианты:", [...doc.querySelectorAll("#ex-stage .mcq-option")].map(b => b.textContent));
  console.log("errors:", errors);

  // ---- buildphrase ----
  console.log("\n=== buildphrase ===");
  reset(); errors.length = 0;
  w.eval('openExercise("buildphrase")');
  await tick(60);
  console.log("прогресс:", doc.querySelector("#ex-stage .test-counter") && doc.querySelector("#ex-stage .test-counter").textContent);
  console.log("перевод:", doc.querySelector("#ex-stage .quiz-word") && doc.querySelector("#ex-stage .quiz-word").textContent);
  console.log("плитки:", [...doc.querySelectorAll("#ex-stage .scr-tiles .scr-tile")].map(b => b.textContent));
  console.log("errors:", errors);

  // ---- collocpair ----
  console.log("\n=== collocpair ===");
  reset(); errors.length = 0;
  w.eval('openExercise("collocpair")');
  await tick(60);
  console.log("прогресс:", doc.querySelector("#ex-stage .test-counter") && doc.querySelector("#ex-stage .test-counter").textContent);
  console.log("подпись:", doc.querySelector("#ex-stage .quiz-label") && doc.querySelector("#ex-stage .quiz-label").textContent);
  console.log("промпт:", doc.querySelector("#ex-stage .quiz-word") && doc.querySelector("#ex-stage .quiz-word").textContent);
  console.log("варианты:", [...doc.querySelectorAll("#ex-stage .mcq-option")].map(b => b.textContent));
  console.log("errors:", errors);
  process.exit(0);
})();
