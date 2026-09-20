// Временный тест: «Словообразование» (wordform) + добивка по парам.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const S = sel => doc.querySelector("#ex-stage " + sel);
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

w.eval(`
  window.__fin = []; window.__award = 0;
  const _fin = exFinish, _aw = award;
  exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin.apply(null, arguments); };
  award = function (n) { window.__award += n; return _aw.apply(null, arguments); };
  readGateMs = () => 0;
`);

// правильный ответ текущего раунда достаём из банка по предложению на экране
const rightNow = () => w.eval(`(function () {
  const t = document.querySelector("#ex-stage .wf-sentence").textContent.replace("…", "___");
  const rec = WORD_FORMS.find(r => r.s.replace(/\\s+/g, " ") === t.replace(/\\s+/g, " "));
  return rec ? JSON.stringify({ a: rec.a, ru: rec.ru, base: rec.base }) : "null";
})()`);

console.log("=== 1. Верный ответ с точкой в конце ===");
w.eval('openExercise("wordform")');
let rec = JSON.parse(rightNow());
console.log("предложение:", S(".wf-sentence").textContent.trim(), "| ответ банка:", rec.a);
doc.getElementById("type-input").value = rec.a + ".";
click(doc.getElementById("type-check"));
console.log("вердикт:", doc.getElementById("type-feedback").textContent.trim());

console.log("\n=== 2. Верный ответ с заглавной буквы ===");
w.eval('openExercise("wordform")');
rec = JSON.parse(rightNow());
doc.getElementById("type-input").value = rec.a[0].toUpperCase() + rec.a.slice(1);
click(doc.getElementById("type-check"));
console.log("вердикт:", doc.getElementById("type-feedback").textContent.trim());

console.log("\n=== 3. Кнопка «перевод» ПОСЛЕ неверного ответа ===");
w.eval('openExercise("wordform")');
rec = JSON.parse(rightNow());
doc.getElementById("type-input").value = "zzz";
click(doc.getElementById("type-check"));
console.log("до подсказки:", doc.getElementById("type-feedback").textContent.trim());
const hint = doc.getElementById("type-hint");
console.log("кнопка «перевод» жива?", !!hint, "| disabled:", hint ? hint.disabled : "—");
if (hint) click(hint);
console.log("после подсказки:", doc.getElementById("type-feedback").textContent.trim());
console.log("правильный ответ ещё на экране?", stageText().includes(rec.a));
console.log("кнопка «Дальше» на месте?", !!doc.getElementById("type-next"));

console.log("\n=== 4. Повторное нажатие «Проверить» после ответа ===");
w.eval('openExercise("wordform"); window.__award = 0;');
rec = JSON.parse(rightNow());
doc.getElementById("type-input").value = rec.a;
click(doc.getElementById("type-check"));
const a1 = w.eval("window.__award");
click(doc.getElementById("type-check"));
click(doc.getElementById("type-check"));
console.log("award после 1 ответа:", a1, "| после трёх нажатий:", w.eval("window.__award"),
            "| exLog:", w.eval("exLog.length"));

console.log("\n=== 5. Полный подход: сколько раз закрылся ===");
w.eval('openExercise("wordform"); window.__fin = [];');
(async () => {
  let n = 0;
  while (n++ < 30 && doc.getElementById("type-input")) {
    const r = JSON.parse(rightNow() || "null");
    doc.getElementById("type-input").value = r ? r.a : "zzz";
    click(doc.getElementById("type-check"));
    const nx = doc.getElementById("type-next");
    if (nx) click(nx);
    else await new Promise(res => setTimeout(res, 1000));   // верный уезжает сам
  }
  console.log("ходов:", n, "| exFinish:", w.eval("JSON.stringify(window.__fin)"),
              "| exLog:", w.eval("exLog.length"));
  console.log("экран:", stageText().slice(0, 90));

  console.log("\n=== 6. «Соедини пары» с одинаковым переводом: итоговый счёт ===");
  const SET_P = { title: "Пары", kind: "pairs", items: [
    { l: "big", r: "большой" }, { l: "large", r: "большой" },
    { l: "small", r: "маленький" }, { l: "tiny", r: "крошечный" } ] };
  w.eval("window.__fin = [];");
  w.eval(`openCustomTask(${JSON.stringify({ id: 55, title: SET_P.title, taskset: SET_P })})`);
  const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
  const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
  // ученик решает по смыслу: каждое слово — к первому подходящему переводу
  const RU = { big: "большой", large: "большой", small: "маленький", tiny: "крошечный" };
  L().forEach(lb => {
    const want = RU[lb.textContent];
    click(lb);
    const target = R().find(rb => rb.textContent === want && !rb.classList.contains("done"));
    if (target) click(target);
  });
  await new Promise(res => setTimeout(res, 700));
  console.log("итог:", w.eval("JSON.stringify(window.__fin)"), "| экран:", stageText().slice(0, 80));
  console.log("\nошибки страницы:", errors);
})();
