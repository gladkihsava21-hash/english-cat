// Гипотеза 3. «Лопни шар»: заплатка про свёрнутую вкладку
// (js/games.js, обработчик animationend) на мишени УБИВАЕТ раунд.
//
//   if (document.hidden) { b.remove(); return; }
//   if (opt === r.word.w) finishRound(false, "escaped"); else b.remove();
//
// Мишень, улетевшая при свёрнутой вкладке, просто исчезает — и лопать
// становится нечего: finishRound() зовётся только из клика по шару или
// из ухода мишени за край. Раунд не проигран, не выигран и не закрыт.
// Ученик возвращается на поле, где верного шара нет вовсе.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const fly = el => el.dispatchEvent(new w.Event("animationend", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

// вкладку сворачиваем по-настоящему: document.hidden — тот же геттер,
// который читает игра
let hiddenFlag = false;
Object.defineProperty(doc, "hidden", { get: () => hiddenFlag, configurable: true });
Object.defineProperty(doc, "visibilityState", {
  get: () => (hiddenFlag ? "hidden" : "visible"), configurable: true });

MQ.matches = false;   // движение включено — шары летят, как у обычного ученика

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  state.dictionary = [...WORDS.A1].slice(0, 14)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

const balls = () => [...doc.querySelectorAll("#bal-stage .bal")];
// Мишень ищем по всем уровням: колода добирает слова и соседнего уровня.
const target = () => {
  const ru = doc.getElementById("bal-ru").textContent.trim();
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d => ({ w: d.w, t: d.t })))"));
  const all = JSON.parse(w.eval(`JSON.stringify(LEVELS.flatMap(l => WORDS[l] || []).map(d => ({ w: d.w, t: d.t })))`));
  const rec = dict.find(d => d.t.trim() === ru) || all.find(d => d.t.trim() === ru);
  return balls().find(b => b.getAttribute("aria-label") === (rec && rec.w));
};

(async () => {
  console.log("\n1. Мишень улетела, пока вкладка была свёрнута");
  w.eval('openExercise("balloons")');
  await tick();
  ok(doc.getElementById("bal-count").textContent === "1 / 8", "раунд 1 из 8 начался");
  const tgt = target();
  ok(!!tgt, "мишень на поле найдена: " + (tgt && tgt.getAttribute("aria-label")));

  hiddenFlag = true;              // ученик ушёл в другую вкладку
  fly(tgt);                       // шар доиграл анимацию и «улетел»
  hiddenFlag = false;             // ученик вернулся
  await tick(60);

  const l1 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  ok(l1.stat.length === 0, "слово не записано ни в верные, ни в неверные: " + JSON.stringify(l1.stat));
  const left = balls().map(b => b.getAttribute("aria-label"));
  console.log("    на поле осталось:", JSON.stringify(left));
  ok(left.includes(tgt.getAttribute("aria-label")),
     "мишень «" + tgt.getAttribute("aria-label") + "» осталась на поле — иначе лопать нечего");

  console.log("\n2. Ученик вернулся и пытается доиграть раунд");
  for (const b of balls()) { click(b); await tick(20); }
  // Раунд закрывается сразу, а следующий рисуется через паузу на показ
  // ответа (0,85–1,5 с). Проверять счётчик раньше — проверять паузу.
  await tick(1700);
  const l2 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("    подсказка внизу: «" + doc.getElementById("bal-fb").textContent.trim() + "»");
  console.log("    счётчик раундов: " + doc.getElementById("bal-count").textContent);
  ok(doc.getElementById("bal-count").textContent !== "1 / 8",
     "раунд закрылся: счётчик ушёл дальше 1 / 8");

  console.log("\n3. Остальные шары тоже улетают — что остаётся ученику");
  balls().forEach(fly);
  await tick(1800);
  const l3 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("    шаров на поле: " + balls().length
    + ", счётчик: " + doc.getElementById("bal-count").textContent
    + ", итогов: " + l3.finish.length);
  ok(balls().length > 0 || l3.finish.length > 0,
     "поле не осталось пустым навсегда (иначе игра встала: ни шаров, ни итогов)");

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "раунд «Лопни шар» всегда доигрывается"));
  process.exit(fails ? 1 : 0);
})();
