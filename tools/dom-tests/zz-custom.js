// Временный тест: «Задание репетитора» (custom) и словообразование.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const S = sel => doc.querySelector("#ex-stage " + sel);
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

w.eval(`
  window.__fin = []; window.__rec = []; window.__award = 0;
  const _fin = exFinish, _aw = award, _rec = recordTaskResult;
  exFinish = function (c, t, n) { window.__fin.push([c, t, n || ""]); return _fin.apply(null, arguments); };
  award = function (n) { window.__award += n; return _aw.apply(null, arguments); };
  recordTaskResult = function (c, t, m) { window.__rec.push([c, t]); return _rec.apply(null, arguments); };
  readGateMs = () => 0;
  renderHomework = function () {};
  // homeworkKind — как в js/sync.js (в стенде sync.js не грузится)
  window.homeworkKind = function (task) {
    if ((task.words || []).length) return "words";
    if (task.taskset || ["grammar", "wordform", "custom"].includes(task.game)) return "task";
    return "photo";
  };
`);

const SET_B = {
  title: "Набор Б — Present Perfect", kind: "quiz",
  items: [
    { q: "I ___ never been to London.", options: ["have", "has", "am"], correct: 0, why: "" },
    { q: "She ___ just left.", options: ["has", "have", "is"], correct: 0, why: "" },
  ],
};

console.log("=== 1. Домашка со словами И набором: какой набор увидит ученик ===");
// Ученик сначала прошёл ДРУГОЕ задание репетитора — набор Б
w.eval(`openCustomTask(${JSON.stringify({ id: 77, title: SET_B.title, taskset: SET_B })})`);
console.log("открыт набор Б:", stageText().slice(0, 80));
w.eval('show("dashboard")');   // ушёл на главную — homeworkContext снят
console.log("homeworkContext после ухода:", w.eval("JSON.stringify(homeworkContext)"),
            "| customTaskset жив:", w.eval("!!customTaskset"), w.eval("(customTaskset||{}).title"));

// А теперь репетитор выдал домашку «слова + набор А» (сервер ставит game=custom)
const SET_A = {
  title: "Набор А — артикли", kind: "quiz",
  items: [{ q: "It is ___ apple.", options: ["an", "a", "the"], correct: 0, why: "" }],
};
const taskA = { id: 88, title: "Слова и набор А", game: "custom",
                taskset: SET_A, words: [{ w: "table", t: "стол", level: "A1" }] };
console.log("homeworkKind(таск А) =", w.eval(`homeworkKind(${JSON.stringify(taskA)})`));
w.eval(`startHomeworkLesson(${JSON.stringify(taskA)})`);
console.log("заголовок:", doc.querySelector("#exercise-body h2").textContent.replace(/\s+/g, " ").trim());
console.log("на экране:", stageText().slice(0, 120));
console.log("это набор А?", /apple/.test(stageText()), "| это набор Б?", /London|left/.test(stageText()));

console.log("\n=== 2. Тот же путь на свежей загрузке (customTaskset ещё пуст) ===");
w.eval("customTaskset = null; window.__fin = [];");
w.eval(`startHomeworkLesson(${JSON.stringify(taskA)})`);
console.log("на экране:", stageText().slice(0, 140));
console.log("exFinish:", w.eval("JSON.stringify(window.__fin)"));

console.log("\n=== 3. «Соедини пары»: одинаковый перевод у двух пар ===");
const SET_P = {
  title: "Пары", kind: "pairs",
  items: [
    { l: "big", r: "большой" },
    { l: "large", r: "большой" },
    { l: "small", r: "маленький" },
  ],
};
w.eval(`openCustomTask(${JSON.stringify({ id: 99, title: SET_P.title, taskset: SET_P })})`);
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
console.log("слева:", L().map(b => b.textContent), "справа:", R().map(b => b.textContent));
// Ученик нажимает «big», потом ПЕРВЫЙ «большой» справа
click(L().find(b => b.textContent === "big"));
const firstBig = R().filter(b => b.textContent === "большой")[0];
click(firstBig);
console.log("после «big» → первый «большой»: класс =", firstBig.className);
console.log("верно ли по смыслу? big = большой — да. Программа:",
            /done/.test(firstBig.className) ? "засчитала" : "ОШИБКА");
