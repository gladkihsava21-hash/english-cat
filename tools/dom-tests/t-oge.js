/* Раздел ОГЭ: словообразование, грамматика, неправильные глаголы,
 * задание репетитора.
 *
 * Первая часть — честный прогон: подход закрывается один раз и тем
 * счётом, который ученик набрал. Она проходит.
 *
 * Вторая часть — места, где упражнение врёт. На сегодняшнем коде она
 * ПАДАЕТ: это описание найденных багов, а не проверка починки. Когда
 * починишь — она должна позеленеть.
 *
 *   node t-oge.js          весь набор
 *   SEED=7 node t-oge.js   другое зерно (находки от него не зависят)
 */
const { w } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => { const n = typeof el === "string" ? doc.querySelector(el) : el;
  if (!n) throw new Error("нет " + el); n.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

w.eval(`
  window.__fin = []; window.__award = 0; window.__board = [];
  const _fin = exFinish; exFinish = function (c,t,n){ window.__fin.push([c,t]); return _fin.call(null,c,t,n); };
  const _aw = award;    award    = function (n){ window.__award += n; return _aw.call(null,n); };
  const _rt = runType, _mc = runMCQ, _pr = runPairs;
  runType = function(r,o){ window.__rounds=r; return _rt(r,o); };
  runMCQ  = function(r,o){ window.__rounds=r; return _mc(r,o); };
  runPairs= function(r,o){ window.__rounds=r; return _pr(r,o); };
  window.reportBoardResult = function (card, res) { window.__board.push([card, res.text]); };
  window.__reset = () => { window.__fin = []; window.__award = 0; window.__board = []; };
`);
const fin = () => w.eval("JSON.stringify(window.__fin)");
const reset = () => w.eval("window.__reset()");
w.eval("window.__realGate = readGateMs;");
const gate0 = () => w.eval("readGateMs = () => 0;");

(async () => {
gate0();

console.log("\n1. Честный прогон: счёт совпадает с ответами, подход закрывается один раз");
reset();
w.eval('homeworkContext = null; openExercise("wordform")');
let n = w.eval("window.__rounds.length");
for (let k = 0; k < n; k++) {
  while (!doc.getElementById("type-input") || doc.getElementById("type-input").disabled) await sleep(60);
  doc.getElementById("type-input").value = w.eval(`window.__rounds[${k}].answer`);
  click("#type-check");
}
await sleep(1000);
ok(fin() === "[[8,8]]" && w.eval("window.__award") === 120, "словообразование 8/8, 120 очков — " + fin());

reset();
w.eval('openExercise("grammar")');
click([...doc.querySelectorAll(".gr-topic")][0]);
const gt = w.eval("window.__rounds.length");
for (let k = 0; k < gt; k++) { await sleep(20);
  click([...doc.querySelectorAll(".mcq-option")][w.eval(`window.__rounds[${k}].correct`)]); await sleep(1150); }
ok(fin() === `[[${gt},${gt}]]`, `грамматика ${gt}/${gt} — ` + fin());

reset();
w.eval('openExercise("irregular")');
click(doc.querySelectorAll(".irr-group")[0]); click("#irr-go");
const verbs = JSON.parse(w.eval("JSON.stringify(IRREGULAR_VERBS)"));
let given = 0;
while (doc.getElementById("irr-p") && given < 30) {
  const r = verbs.find(x => x.v === doc.querySelector("#ex-stage .quiz-word").textContent.trim());
  doc.getElementById("irr-p").value = r.p; doc.getElementById("irr-pp").value = r.pp;
  click("#irr-check"); given++;
  const nb = doc.getElementById("irr-next"); if (!nb) break; click(nb);
}
ok(fin() === `[[${given},${given}]]`, `неправильные глаголы ${given}/${given} — ` + fin());

console.log("\n2. Неправильные глаголы: круг работы над ошибками не кончается");
reset();
w.eval('openExercise("irregular")');
click(doc.querySelectorAll(".irr-group")[4]);   // «Особые случаи» — 3 глагола
click("#irr-go");
let screens = 0;
while (doc.getElementById("irr-p") && screens < 120) {
  doc.getElementById("irr-p").value = "zzz"; doc.getElementById("irr-pp").value = "zzz";
  click("#irr-check"); screens++;
  const nb = doc.getElementById("irr-next"); if (!nb) break; click(nb);
}
ok(screens < 120, "3 глагола, ученик не знает ни одного: экранов подряд " + screens
   + ", подход закрылся " + fin()
   + ", счётчик «" + (doc.querySelector("#ex-stage .test-counter") || {}).textContent + "»");

console.log("\n3. Домашка «Грамматика»: вторая попытка на другой теме стирает лучший результат");
reset();
w.eval(`state.taskResults = {}; homeworkContext = { id: 42, title: "Грамматика" }; openExercise("grammar")`);
const topics = [...doc.querySelectorAll(".gr-topic")];
click(topics[0]);
const a1 = w.eval("window.__rounds.length");
for (let k = 0; k < a1; k++) { await sleep(450);
  click([...doc.querySelectorAll(".mcq-option")][w.eval(`window.__rounds[${k}].correct`)]); await sleep(1150); }
const rec1 = w.eval('JSON.stringify(state.taskResults["42"])');
w.eval(`homeworkContext = { id: 42, title: "Грамматика" };`);
click("#ex-again");
click([...doc.querySelectorAll(".gr-topic")].find(t => /Прошедшее/.test(t.textContent)));
const a2 = w.eval("window.__rounds.length");
for (let k = 0; k < a2; k++) { await sleep(450);
  const opts = [...doc.querySelectorAll(".mcq-option")];
  click(opts[(w.eval(`window.__rounds[${k}].correct`) + 1) % opts.length]);
  await sleep(20); if (doc.getElementById("mcq-next")) click("#mcq-next"); }
await sleep(60);
const rec2 = w.eval('JSON.stringify(state.taskResults["42"])');
ok(/"correct":16/.test(rec2) && /"first":16/.test(rec2) && /"tries":2/.test(rec2),
   `тема на ${a1} заданий → ${rec1}; потом тема на ${a2} заданий, все мимо → ${rec2}`);

console.log("\n4. Ушёл с экрана сразу после последнего верного ответа");
reset();
w.eval(`state.taskResults = {}; homeworkContext = { id: 43, title: "Словообразование" }; window.boardTaskCard = 7;`);
w.eval('openExercise("wordform")');
const wn = w.eval("window.__rounds.length");
for (let k = 0; k < wn; k++) {
  while (!doc.getElementById("type-input") || doc.getElementById("type-input").disabled) await sleep(60);
  doc.getElementById("type-input").value = w.eval(`window.__rounds[${k}].answer`);
  click("#type-check");
  if (k === wn - 1) break;
}
click('#exercise-body [data-nav]');       // «← Тренировки» в шапке
await sleep(1100);
ok(w.eval("window.__fin.length") === 0,
   "подход, из которого ушли, всё равно закрылся: " + fin()
   + "; домашка записана: " + w.eval('JSON.stringify(state.taskResults["43"] || null)')
   + "; на доску ушло: " + w.eval("JSON.stringify(window.__board)"));
w.eval("window.boardTaskCard = null; clearTimeout(window.__exBoardBack);");

console.log("\n5. «Соедини пары» репетитора: две пары с одинаковой правой половиной");
reset();
w.eval(`homeworkContext = null;`);
w.eval(`openCustomTask({ id: 51, title: "Синонимы", taskset: { title: "Синонимы", kind: "pairs", items: [
  { l: "big", r: "большой" }, { l: "large", r: "большой" },
  { l: "small", r: "маленький" }, { l: "little", r: "маленький" } ] } })`);
// «большой» на экране две штуки, и они неразличимы. Ученик берёт large
// и жмёт «большой» — по смыслу он прав в обоих случаях.
const largeEl = L().find(x => x.textContent === "large");
const bols = R().filter(x => x.textContent === "большой");
let refused = 0;
bols.forEach(b => {
  click(largeEl); click(b);
  if (!largeEl.classList.contains("done")) refused++;
});
ok(refused === 0, `кнопок «большой» на экране ${bols.length}, отличить их ученику нечем;`
   + ` «large → большой» объявлено ошибкой на ${refused} из ${bols.length}`);
// доигрываем, чтобы посмотреть итог
let guard = 0;
const KEY = { big: "большой", large: "большой", small: "маленький", little: "маленький" };
while (L().some(x => !x.classList.contains("done")) && guard++ < 40) {
  const l = L().find(x => !x.classList.contains("done"));
  for (const r of R().filter(x => x.textContent === KEY[l.textContent] && !x.classList.contains("done"))) {
    click(l); click(r);
    if (l.classList.contains("done")) break;
  }
}
await sleep(600);
ok(fin() === "[[4,4]]", "всё соединено по смыслу верно, объявлено " + fin());

console.log("\n6. «Соедини пары»: одна ошибка, но палец коснулся дважды");
reset();
w.eval(`openCustomTask({ id: 52, title: "Пары", taskset: { title: "Пары", kind: "pairs", items: [
  { l: "cat", r: "кот" }, { l: "dog", r: "собака" }, { l: "bird", r: "птица" } ] } })`);
const KEY2 = { cat: "кот", dog: "собака", bird: "птица" };
const catL = L().find(x => x.textContent === "cat");
const dogR = R().find(x => x.textContent === "собака");
click(catL); click(dogR); click(dogR);
for (const l of L()) { if (l.classList.contains("done")) continue;
  click(l); click(R().find(x => x.textContent === KEY2[l.textContent] && !x.classList.contains("done"))); }
await sleep(600);
ok(fin() === "[[2,3]]", "одна ошибка стоит одного балла, а не двух: " + fin());

console.log("\n7. «Впиши слово»: сверка посимвольная");
reset();
w.eval(`openCustomTask({ id: 63, title: "Времена", taskset: { title: "Времена", kind: "gap", items: [
  { q: "She ___ a book now.", answer: "is reading", alt: [], why: "" },
  { q: "She ___ like coffee.", answer: "doesn't", alt: [], why: "" } ] } })`);
await sleep(20);
doc.getElementById("type-input").value = "is  reading";
click("#type-check");
const f1 = doc.getElementById("type-feedback").textContent;
ok(/Верно/.test(f1), "«is  reading» (двойной пробел) — " + f1);
if (doc.getElementById("type-next")) click("#type-next"); else await sleep(950);
await sleep(20);
doc.getElementById("type-input").value = "doesn’t";
click("#type-check");
const f2 = doc.getElementById("type-feedback").textContent;
ok(/Верно/.test(f2), "«doesn’t» (апостроф с телефона) — " + f2);

console.log("\n8. Пауза на чтение считает длину вместе с html-разметкой");
const g8 = JSON.parse(w.eval(`(function(){
  const sub = "Present Simple и Continuous";
  const s1 = "I ___ tired.";
  const s2 = "By the time we arrived at the station the last train ___ already left the platform.";
  const html = s => '<span class="wf-sentence">' + s.replace("___", '<span class="wf-gap">…</span>') + '</span>';
  const f = window.__realGate;
  return JSON.stringify({ a: f(html(s1) + " " + sub, false), b: f(html(s2) + " " + sub, false),
                          at: f(s1 + " " + sub, false),      bt: f(s2 + " " + sub, false) });
})()`));
ok(g8.a < g8.b, `как есть (с тегами): короткий ${g8.a} мс, длинный ${g8.b} мс; `
   + `без тегов было бы ${g8.at} и ${g8.bt}`);

console.log("\n9. Неправильные глаголы: разбор ответов и учёт времени");
reset();
gate0();
w.eval('openExercise("irregular")');
click(doc.querySelectorAll(".irr-group")[3]); click("#irr-go");
let g4 = 0;
while (doc.getElementById("irr-p") && g4++ < 20) {
  const r = verbs.find(x => x.v === doc.querySelector("#ex-stage .quiz-word").textContent.trim());
  doc.getElementById("irr-p").value = r.p; doc.getElementById("irr-pp").value = r.pp;
  click("#irr-check");
  const nb = doc.getElementById("irr-next"); if (!nb) break; click(nb);
}
ok(w.eval("exLog.length") > 0 && w.eval("exRound.answered") > 0,
   "после подхода есть «Разбор ответов» (строк " + w.eval("exLog.length")
   + ") и учтено время (" + w.eval("exRound.answered") + " ответов)");

console.log("\n10. Словообразование: «перевод» после ответа затирает правильный ответ");
reset();
w.eval('openExercise("wordform")');
await sleep(20);
doc.getElementById("type-input").value = "ерунда";
click("#type-check");
const было = doc.getElementById("type-feedback").textContent;
click("#type-hint");
const стало = doc.getElementById("type-feedback").textContent;
ok(/Правильно/.test(стало), `было «${было}» → стало «${стало}»`);

console.log("\n11. Грамматика: подход без ошибок объявлен прокликанным");
// Порог смотрит ТОЛЬКО на время после того, как варианты открылись
// (exRoundAnswer(performance.now() - openedAt, ...)), поэтому длину самой
// паузы для скорости прогона сокращаем — на вердикт она не влияет.
reset();
w.eval(`readGateMs = () => 50; homeworkContext = { id: 71, title: "Грамматика" }; state.taskResults = {};`);
w.eval('openExercise("grammar")');
click([...doc.querySelectorAll(".gr-topic")][0]);
const rt = w.eval("window.__rounds.length");
for (let k = 0; k < rt; k++) {
  await sleep(400);       // 50 мс пауза + ~350 мс на выбор варианта
  click([...doc.querySelectorAll(".mcq-option")][w.eval(`window.__rounds[${k}].correct`)]);
  await sleep(1150);
}
const head = (doc.querySelector("#ex-stage h2") || {}).textContent;
ok(head !== "Слишком быстро",
   `${rt} верных из ${rt}, среднее время на выбор варианта `
   + `${w.eval("Math.round(exRound.thinkMs / Math.max(1, exRound.answered))")} мс → экран «${head}», `
   + `запись репетитору ${w.eval('JSON.stringify(state.taskResults["71"])')}`);
gate0();

console.log("\n12. Неправильные глаголы: повторное нажатие «Дальше» съедает глагол");
reset();
w.eval(`homeworkContext = null;`);
w.eval('openExercise("irregular")');
click(doc.querySelectorAll(".irr-group")[0]); click("#irr-go");
const shown = [];
let g12 = 0, once = false;
while (doc.getElementById("irr-p") && g12++ < 30) {
  const v = doc.querySelector("#ex-stage .quiz-word").textContent.trim();
  shown.push(v);
  const r = verbs.find(x => x.v === v);
  doc.getElementById("irr-p").value = r.p; doc.getElementById("irr-pp").value = r.pp;
  click("#irr-check");
  const nb = doc.getElementById("irr-next"); if (!nb) break;
  click(nb);
  if (!once) { once = true; click(nb); }   // повторное событие click по той же кнопке
}
ok(fin() === `[[${shown.length},${shown.length}]]`,
   `показано и отвечено верно ${shown.length} глаголов, объявлено ` + fin());

console.log("\n" + (fails ? "ПРОВАЛЕНО проверок: " + fails : "все проверки пройдены"));
process.exit(fails ? 1 : 0);
})();
