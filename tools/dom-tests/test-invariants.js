// Ловим «тихое враньё»: подход, закрытый дважды, «верно 7 из 6»,
// слово, засчитанное без ответа. Играем полный подход каждого
// упражнения и следим за exFinish/statUpdate/award.
//
// Пауза на чтение (readGateMs) в тесте обнулена: она защищает от
// прокликивания живого ученика, а нам нужны сами подсчёты.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const bad = what => { console.log("  ✗ " + what); fails++; };

w.eval(`
  window.readGateMs = () => 0;
  window.__log = { finish: [], stat: [], xp: 0 };
  const _finish = exFinish, _stat = statUpdate, _award = award;
  window.exFinish = function (c, t, note) { window.__log.finish.push([c, t]); return _finish(c, t, note); };
  window.statUpdate = function (word, okv, v) { window.__log.stat.push([String(word), !!okv]); return _stat(word, okv, v); };
  window.award = function (n) { window.__log.xp += n; return _award(n); };
`);

const IDS = w.eval("EXERCISES.filter(e => !e.hidden && e.id !== 'flashcards' && e.id !== 'blitz').map(e => e.id)");
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

const step = () => {
  const stage = doc.getElementById("ex-stage");
  if (!stage) return false;
  // сначала заполняем поля — иначе «Проверить» ничего не примет
  const inputs = [...stage.querySelectorAll("input.type-input, textarea.type-input")]
    .filter(el => !el.disabled && !el.value);
  if (inputs.length) {
    inputs.forEach((el, k) => {
      el.value = el.tagName === "TEXTAREA"
        ? "I saw a big dog in the park and it was very friendly today."
        : (k ? "wrong" : "answer");
    });
    return true;
  }
  const btns = [...stage.querySelectorAll("button, .mcq-option, .pair-item, .cat-box, .scr-tile, .ws-cell")]
    .filter(b => !b.disabled && !b.dataset.nav && b.getAttribute("aria-disabled") !== "true");
  if (!btns.length) return false;
  btns[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  return true;
};

(async () => {
  for (const id of IDS) {
    w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
    errors.length = 0;
    w.eval(`openExercise(${JSON.stringify(id)})`);
    await tick();
    let idle = 0;
    // терпение: после верного ответа раунд доигрывается таймером в 1,1 с,
    // и всё это время нажимать нечего — раньше цикл сдавался за 50 мс
    for (let n = 0; n < 900 && idle < 60; n++) {
      if (!step()) idle++; else idle = 0;
      await tick();
      if (w.eval("window.__log.finish.length")) break;
    }
    await tick(50);
    const { finish, stat, xp } = JSON.parse(w.eval("JSON.stringify(window.__log)"));
    if (errors.length) bad(`${id}: ошибка обработчика — ${errors[0]}`);
    if (finish.length > 1) bad(`${id}: подход закрыт ${finish.length} раза: ${JSON.stringify(finish)}`);
    for (const [c, t] of finish) {
      if (c > t) bad(`${id}: «верно ${c} из ${t}» — верных больше, чем заданий`);
      if (c < 0 || t < 0) bad(`${id}: отрицательный счёт ${c}/${t}`);
    }
    const seen = {};
    stat.forEach(([word]) => { seen[word] = (seen[word] || 0) + 1; });
    const many = Object.entries(seen).filter(([, n]) => n > 2);
    if (many.length) bad(`${id}: слово засчитано больше двух раз: ${JSON.stringify(many.slice(0, 5))}`);
    const mark = finish.length === 1 ? "✓" : (finish.length ? "!" : "…");
    console.log(`  ${mark} ${id}: закрыто ${finish.length}${finish.length ? " " + JSON.stringify(finish[0]) : ""}, слов ${stat.length}, очков ${xp}`);
  }
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "инварианты держатся"));
  process.exit(fails ? 1 : 0);
})();
