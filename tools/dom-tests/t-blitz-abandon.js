// «Блиц»: ученик бросил игру и ушёл с экрана упражнения.
// Проверяем, доигрывает ли отсчёт сам себя — начисляет ли очки,
// пишет ли рекорд и засчитывает ли достижение за брошенную игру.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { xp: 0, bump: [], stat: [] };
  const _a = award, _b = bump, _s = statUpdate;
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  window.bump = function (c, by) { window.__log.bump.push(c); return _b(c, by); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word)); return _s(word, o, v); };
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 40)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
  state.blitzBest = 0;
  state.counters = {};
  state.xp = 0;
`);

// Секундный отсчёт «Блица» ускоряем в 200 раз: логика та же, ждать
// минуту в тесте незачем. Подменяем ТОЛЬКО интервал в 1000 мс.
const realSetInterval = w.setInterval.bind(w);
w.setInterval = (fn, ms, ...rest) => realSetInterval(fn, ms === 1000 ? 5 : ms, ...rest);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Открыли «Блиц», ответили на два слова, ушли на «Тренировки»");
  w.eval('openExercise("blitz")');
  ok(!!doc.getElementById("blitz-word"), "игра открылась: слово " + doc.getElementById("blitz-word").textContent);

  // Отвечаем ВЕРНО: перевод берём из словаря по слову на экране.
  for (let k = 0; k < 2; k++) {
    w.eval(`(function () {
      const word = document.getElementById("blitz-word").textContent;
      const rec = state.dictionary.find(d => d.w === word)
               || Object.values(WORDS).flat().find(d => d.w === word);
      const b = [...document.querySelectorAll("#blitz-options .mcq-option")]
        .find(x => rec && x.textContent === rec.t);
      (b || document.querySelector("#blitz-options .mcq-option"))
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    })()`);
  }
  const scoreBefore = doc.getElementById("blitz-score").textContent;
  console.log("  счёт на момент ухода: " + scoreBefore);

  // Уходим ровно так, как ученик: кнопкой «← Тренировки» в шапке.
  const back = doc.querySelector("#exercise-body [data-nav='practice']");
  ok(!!back, "кнопка «← Тренировки» на месте");
  w.eval("window.__log = { xp: 0, bump: [], stat: [] };");
  click(back);
  ok(doc.getElementById("screen-exercise").classList.contains("hidden"),
     "экран упражнения скрыт — ученик ушёл");

  console.log("\n2. Ждём, пока брошенный отсчёт дойдёт до нуля");
  await tick(600);   // 60 «секунд» по 5 мс + запас

  const log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const st = JSON.parse(w.eval("JSON.stringify({ xp: state.xp, best: state.blitzBest, counters: state.counters })"));
  console.log("  после ухода: award=" + log.xp + ", bump=" + JSON.stringify(log.bump)
              + ", state.xp=" + st.xp + ", blitzBest=" + st.best
              + ", counters=" + JSON.stringify(st.counters));
  ok(log.xp === 0, "очки за брошенную игру НЕ начислены (award после ухода: " + log.xp + ")");
  ok(log.bump.length === 0, "достижение «упражнения» НЕ засчитано (bump: " + JSON.stringify(log.bump) + ")");
  ok(st.best === 0, "рекорд «Блица» НЕ переписан (best: " + st.best + ")");

  const stageHtml = doc.getElementById("ex-stage").innerHTML;
  ok(!/Время, мяу/.test(stageHtml), "экран итогов НЕ нарисован в покинутом упражнении");

  console.log("\nошибок JS: " + errors.length + (errors.length ? " " + errors.join(" | ") : ""));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
