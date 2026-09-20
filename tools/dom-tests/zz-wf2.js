// Временный тест 2: точка в ответе, подсказка после ответа, счёт пар.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

w.eval(`
  window.__fin = [];
  const _fin = exFinish;
  exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin.apply(null, arguments); };
  readGateMs = () => 0;
  renderHomework = function () {};
`);

console.log("=== A. Сколько заданий словообразования кончаются пропуском ===");
console.log(w.eval(`(function(){
  const tail = WORD_FORMS.filter(r => /___[.!?]?\\s*$/.test(r.s.trim()));
  return "всего " + WORD_FORMS.length + ", пропуск в конце предложения: " + tail.length
       + " — например: " + (tail[0] ? tail[0].s + "  (" + tail[0].a + ")" : "—");
})()`));

console.log("\n=== B. Та же точка в «Вводе слова» (spelling) — для сравнения ===");
w.eval(`state.dictionary = [{ w: "table", t: "стол", added: Date.now() }];`);
w.eval('openExercise("spelling")');
doc.getElementById("type-input").value = "table.";
click(doc.getElementById("type-check"));
console.log("spelling «table.» →", doc.getElementById("type-feedback").textContent.trim());

console.log("\n=== C. «Впиши слово» из конструктора — та же строгая сверка ===");
const SET_G = { title: "Впиши", kind: "gap", items: [
  { q: "She is a good ___.", hint: "", answer: "teacher", alt: [], why: "" } ] };
w.eval(`openCustomTask(${JSON.stringify({ id: 41, title: SET_G.title, taskset: SET_G })})`);
doc.getElementById("type-input").value = "teacher.";
click(doc.getElementById("type-check"));
console.log("custom gap «teacher.» →", doc.getElementById("type-feedback").textContent.trim());

console.log("\n=== D. Подсказка после НЕверного ответа: что остаётся на экране ===");
w.eval('openExercise("wordform")');
const rec = JSON.parse(w.eval(`(function () {
  const t = document.querySelector("#ex-stage .wf-sentence").textContent.replace("…", "___");
  const r = WORD_FORMS.find(x => x.s.replace(/\\s+/g," ") === t.replace(/\\s+/g," "));
  return r ? JSON.stringify({a:r.a, ru:r.ru}) : "null";
})()`));
doc.getElementById("type-input").value = "zzz";
click(doc.getElementById("type-check"));
console.log("экран ДО подсказки:\n  " + stageText());
click(doc.getElementById("type-hint"));
console.log("экран ПОСЛЕ подсказки:\n  " + stageText());
console.log("правильный ответ «" + rec.a + "» виден?", stageText().includes(rec.a));

console.log("\n=== E. Пары с одинаковым переводом: доводим до конца ===");
const SET_P = { title: "Пары", kind: "pairs", items: [
  { l: "big", r: "большой" }, { l: "large", r: "большой" },
  { l: "small", r: "маленький" }, { l: "tiny", r: "крошечный" } ] };
w.eval("window.__fin = [];");
w.eval(`openCustomTask(${JSON.stringify({ id: 56, title: SET_P.title, taskset: SET_P })})`);
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
const RU = { big: "большой", large: "большой", small: "маленький", tiny: "крошечный" };
let wrongClicks = 0;
const solve = () => {
  for (const lb of L()) {
    if (lb.classList.contains("done")) continue;
    click(lb);
    for (const rb of R()) {
      if (rb.classList.contains("done") || rb.textContent !== RU[lb.textContent]) continue;
      click(rb);
      if (!rb.classList.contains("done")) wrongClicks++; else break;
    }
  }
};
solve(); solve(); solve();
setTimeout(() => {
  console.log("неверных нажатий по СМЫСЛУ верных пар:", wrongClicks);
  console.log("итог подхода:", w.eval("JSON.stringify(window.__fin)"));
  console.log("экран:", stageText().slice(0, 100));
  console.log("\nошибки страницы:", errors);
}, 800);
