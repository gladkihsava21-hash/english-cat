// Временный тест: «Грамматика» (ОГЭ) — зачёт, повторные нажатия, домашка.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const S = sel => doc.querySelector("#ex-stage " + sel);
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];

w.eval(`
  window.__fin = []; window.__stat = []; window.__award = 0; window.__rec = [];
  const _fin = exFinish, _stat = statUpdate, _aw = award, _rec = recordTaskResult;
  exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin.apply(null, arguments); };
  statUpdate = function (word, ok) { window.__stat.push([word, ok]); return _stat.apply(null, arguments); };
  award = function (n) { window.__award += n; return _aw.apply(null, arguments); };
  recordTaskResult = function (c, t, m) { window.__rec.push([c, t]); return _rec.apply(null, arguments); };
  readGateMs = () => 0;
  renderHomework = function () {};
`);

const openTopic = name => {
  w.eval('openExercise("grammar")');
  const b = SA(".gr-topic").find(x => x.textContent.includes(name));
  if (!b) throw new Error("нет темы " + name);
  click(b);
};

console.log("=== 1. Пауза на чтение: клик до открытия вариантов ===");
w.eval("readGateMs = () => 5000");
openTopic("Артикли");
let opts = SA(".mcq-option");
console.log("вариантов:", opts.length, "| ждём паузу");
click(opts[0]);
console.log("после раннего клика: помечен?", opts[0].className,
            "| счётчик:", S(".test-counter").textContent.trim(),
            "| award:", w.eval("window.__award"));
w.eval("readGateMs = () => 0");

console.log("\n=== 2. Повторное нажатие на вариант ===");
openTopic("Артикли");
const beforeAward = w.eval("window.__award");
opts = SA(".mcq-option");
// узнаём правильный: у runMCQ он r.correct — прокликаем первый и посмотрим
click(opts[0]);
const cls1 = opts[0].className;
click(opts[0]);        // ещё раз по тому же
click(opts[1]);        // и по соседнему
console.log("класс первого:", cls1, "| award за раунд:", w.eval("window.__award") - beforeAward,
            "| exLog длина:", w.eval("exLog.length"));

console.log("\n=== 3. Полный подход: сколько раз закрылся ===");
w.eval("window.__fin = []; window.__award = 0;");
openTopic("Артикли");
let guard = 0;
const playOne = () => {
  const o = SA(".mcq-option");
  if (!o.length) return false;
  click(o[0]);
  const nx = doc.getElementById("mcq-next");
  if (nx) { click(nx); return true; }
  return "wait";     // верный ответ — уезжает по таймеру
};
const step = () => new Promise(res => {
  const r = playOne();
  if (r === "wait") setTimeout(res, 1300); else setTimeout(res, 0);
});
(async () => {
  while (guard++ < 60 && SA(".mcq-option").length) await step();
  console.log("ходов:", guard, "| exFinish:", w.eval("JSON.stringify(window.__fin)"),
              "| exLog:", w.eval("exLog.length"));
  console.log("экран:", S("h2") ? S("h2").textContent : "—",
              "|", S("p") ? S("p").textContent.trim().slice(0, 60) : "");

  console.log("\n=== 4. Домашка: второй подход по ДРУГОЙ теме ===");
  w.eval(`
    state.taskResults = {};
    homeworkContext = { id: "hw1", title: "Грамматика к четвергу" };
  `);
  const playTopic = async name => {
    openTopic(name);
    let g = 0;
    while (g++ < 60 && SA(".mcq-option").length) await step();
  };
  await playTopic("Артикли");
  console.log("после 1-го подхода:", w.eval("JSON.stringify(state.taskResults.hw1)"));
  await playTopic("Модальные глаголы");
  console.log("после 2-го подхода:", w.eval("JSON.stringify(state.taskResults.hw1)"));
  console.log("recordTaskResult вызван:", w.eval("JSON.stringify(window.__rec)"));

  console.log("\nошибки страницы:", errors);
})();
