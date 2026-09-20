// Гипотеза 2. Игры зовут statUpdate() без третьего аргумента, то есть
// объявляют ответ ПРОВЕРЕННЫМ.
//
// В движке (js/exercises.js:764) третий аргумент verified как раз для
// такого: verified=false → srsReview(d, ok, true) → word.checked НЕ растёт.
// А wordDoneForHomework (js/sync.js:713) закрывает слово в домашке ровно
// по checked >= 1. Комментарий там прямым текстом: одно нажатие «Помню»
// без проверки закрывало слово, и репетитор видел «сдал 10 из 10».
//
// «Колесо» — игра, которая сама пишет «Проверять не буду»: ученик может
// нажать «Перевод», прочитать ответ с экрана и нажать «Знал».
// «Найди пару» — тот же механизм, что runPairs (js/exercises.js:1657),
// но runPairs передаёт verified = !misses.get(i), а memory() — ничего.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

MQ.matches = true;

const D = word => JSON.parse(w.eval(`JSON.stringify(
  state.dictionary.find(d => d.w === ${JSON.stringify(word)}) || null)`));
// та же проверка, что wordDoneForHomework в js/sync.js:713 (sync.js стенд
// не грузит — он ходит в сеть; условие копируем дословно)
const done = word => { const d = D(word); return !!d && ((d.checked || 0) >= 1 || d.status === "learned"); };

w.eval(`
  window.__stat = [];
  const _s = statUpdate;
  window.statUpdate = function (word, o, v) {
    window.__stat.push([String(word), !!o, v === undefined ? "(не передан)" : v]);
    return _s(word, o, v);
  };
  state.dictionary = [...WORDS.A1].slice(0, 8)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1, knew: 0, checked: 0 }));
`);

(async () => {
  /* ---------- КОЛЕСО: «Перевод» → «Знал» ---------- */
  console.log("\n1. «Колесо»: посмотрел перевод на экране и нажал «Знал»");
  w.eval('openExercise("wheel")');
  await tick();
  click(doc.getElementById("wheel-go"));
  await tick(60);
  const word = doc.querySelector("#wheel-panel .quiz-word").textContent.trim();
  ok(done(word) === false, `до игры слово «${word}» в домашке не засчитано`);
  click(doc.getElementById("wheel-show"));       // «Перевод» — ответ на экране
  const shown = doc.getElementById("wheel-answer");
  ok(shown && !shown.hidden, "перевод показан на экране: «" + shown.textContent.trim() + "»");
  click(doc.getElementById("wheel-yes"));        // «Знал»
  await tick(60);
  const d1 = D(word);
  const st1 = JSON.parse(w.eval("JSON.stringify(window.__stat)"));
  console.log("    statUpdate:", JSON.stringify(st1));
  console.log("    запись словаря:", JSON.stringify(
    { knew: d1.knew, checked: d1.checked, interval: d1.interval, due: d1.due, status: d1.status }));
  ok(!done(word),
    `слово «${word}» НЕ должно закрывать домашку: ученик прочитал перевод с экрана `
    + `и сам себе поставил «Знал». checked=${d1.checked}`);

  /* ---------- НАЙДИ ПАРУ: пара найдена перебором ---------- */
  console.log("\n2. «Найди пару»: пара найдена после промаха");
  w.eval(`window.__stat = [];
    state.dictionary = [...WORDS.A1].slice(0, 8)
      .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1, knew: 0, checked: 0 }));
    show("practice"); openExercise("memory")`);
  await tick();
  const cards = JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i,
      text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d => ({ w: d.w, t: d.t })))"));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const en0 = cards.find(c => c.en);
  const rec = dict.find(d => d.w === en0.text);
  const right = cards.find(c => !c.en && c.text === rec.t);
  const wrong = cards.find(c => !c.en && c.text !== rec.t);

  // промах: слово + чужой перевод
  click(byI(en0.i)); click(byI(wrong.i));
  await tick(1000);
  const movesTxt = doc.getElementById("mem-count").textContent;
  ok(/ходов: 1/.test(movesTxt), "промах засчитан как ход: " + movesTxt);
  // теперь перебором находим верный
  click(byI(en0.i)); click(byI(right.i));
  await tick(60);
  const d2 = D(en0.text);
  const st2 = JSON.parse(w.eval("JSON.stringify(window.__stat)"));
  console.log("    statUpdate:", JSON.stringify(st2));
  console.log("    запись словаря:", JSON.stringify(
    { knew: d2.knew, checked: d2.checked, interval: d2.interval, status: d2.status }));
  ok(!done(en0.text),
    `слово «${en0.text}» найдено перебором — домашку закрывать не должно. `
    + `checked=${d2.checked}`);

  /* ---------- ДЛЯ СРАВНЕНИЯ: «Соедини пары» из движка ---------- */
  console.log("\n3. Для сравнения: как это делает runPairs (js/exercises.js:1657)");
  const cmp = w.eval(`(function () {
    const m = String(runPairs).match(/statUpdate\\([^)]*\\)/);
    const g = String(EX_RUNNERS.memory).match(/statUpdate\\([^)]*\\)/);
    const h = String(EX_RUNNERS.wheel).match(/statUpdate\\([^)]*\\)/);
    return JSON.stringify({ runPairs: m && m[0], memory: g && g[0], wheel: h && h[0] });
  })()`);
  console.log("    " + cmp);

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "непроверенные ответы домашку не закрывают"));
  process.exit(fails ? 1 : 0);
})();
