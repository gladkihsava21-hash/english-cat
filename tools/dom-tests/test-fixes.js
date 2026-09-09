// Проверка трёх починок в упражнениях: «Свои предложения», «Собери слово»
// и поздние ответы лениво подгружаемых банков.
const { w } = require("./harness.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = sel => { const el = doc.querySelector(sel); if (!el) throw new Error("нет " + sel); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };

w.eval(`
  window.WORDS = { A1: [], A2: [], B1: [], B2: [], C1: [], C2: [] };
  window.grammarCheck = () => [];
  state.dictionary = [
    { w: "table", t: "стол", added: Date.now() },
    { w: "window", t: "окно", added: Date.now() },
    { w: "garden", t: "сад", added: Date.now() },
  ];
`);

console.log("\n1. «Свои предложения»: слова через запятую больше не закрывают домашку");
w.eval('openExercise("personal")');
const words = [...doc.querySelectorAll("#ex-stage .quiz-word")][0].textContent.split("·").map(s => s.trim());
ok(words.length === 3, "три слова: " + words.join(", "));
const stat = wrd => w.eval(`(state.dictionary.find(x=>x.w==="${wrd}")||{}).checked || 0`);
// подсовываем эти слова в словарь, иначе statUpdate по ним промолчит и проверять нечего
w.eval(`state.dictionary = ${JSON.stringify(words.map(x => ({ w: x, t: "перевод", added: Date.now() })))};`);
const before = words.map(stat);
doc.getElementById("pers-input").value = words.join(", ");   // просто слова, без предложения
click("#pers-check");
const after = words.map(stat);
ok(JSON.stringify(before) === JSON.stringify(after),
   "перечисление слов не засчиталось: было " + before.join("/") + ", стало " + after.join("/"));
ok(/список слов/.test(doc.getElementById("pers-feedback").textContent),
   "сказано, почему не принято: " + doc.getElementById("pers-feedback").textContent);
ok(!doc.getElementById("pers-next"), "подход не закрыт (нет кнопки «Дальше»)");
// а вот настоящий текст со всеми тремя словами — засчитывается
doc.getElementById("pers-input").value = "Yesterday I saw a " + words[0] + " near the " + words[1]
  + " and I liked the " + words[2] + " very much.";
click("#pers-check");
const real = words.map(stat);
ok(real.every((n, i) => n > after[i]), "настоящее предложение засчитано: " + real.join("/"));
ok(!!doc.getElementById("pers-next"), "появилась кнопка «Дальше»");
// и повторное нажатие ничего не добавляет
doc.getElementById("pers-check").disabled = false;
click("#pers-check");
ok(JSON.stringify(words.map(stat)) === JSON.stringify(real), "второе нажатие не начисляет заново");

console.log("\n2. «Собери слово»: пересборка после ответа больше не переигрывает раунд");
w.eval(`state.dictionary = [{ w: "table", t: "стол", added: Date.now() }];`);
w.eval('openExercise("scramble")');
const tiles = () => [...doc.querySelectorAll("#scr-tiles .scr-tile")];
const solveOnce = () => {
  // собираем слово буква за буквой: берём первую подходящую свободную плитку
  const want = doc.querySelector("#ex-stage .quiz-label").textContent;
  const target = w.eval('state.dictionary[0].w');
  target.split("").forEach(ch => {
    const t = tiles().find(b => !b.disabled && b.textContent === ch);
    t.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  });
  return want;
};
solveOnce();
ok(/Верно/.test(doc.getElementById("scr-feedback").textContent), "слово собрано верно");
const knewBefore = w.eval('(state.dictionary.find(x=>x.w==="table")||{}).knew || 0');
// пока висит пауза перед следующим словом — жмём «Сбросить» и собираем заново
click("#scr-clear");
const stillDisabled = tiles().every(b => b.disabled);
ok(stillDisabled, "«Сбросить» после ответа ничего не разблокирует");
ok(w.eval('(state.dictionary.find(x=>x.w==="table")||{}).knew || 0') === knewBefore,
   "счёт не переигран");

console.log("\n3. Поздний ответ ленивого банка не утаскивает ученика обратно");
ok(w.eval('typeof exLater === "function" && typeof exStillHere === "function"'), "помощники на месте");
const res = w.eval(`(function () {
  const before = exLaunch;
  // ученик открыл упражнение и тут же ушёл на другой экран
  openExercise("scramble");
  const token = exLaunch;
  document.getElementById("screen-exercise").classList.add("hidden");
  const afterLeaving = exStillHere(token);
  // ...а потом открыл другое упражнение
  openExercise("scramble");
  const afterOther = exStillHere(token);
  return [before !== token, afterLeaving, afterOther];
})()`);
ok(res[0] === true, "заход получает свой номер");
ok(res[1] === false, "ушёл с экрана — старый заход молчит");
ok(res[2] === false, "открыл другое упражнение — старый заход молчит");
const later = w.eval(`(function () {
  let fired = 0;
  openExercise("scramble");
  exLater(() => fired++, 0);
  openExercise("scramble");     // новый заход отменяет чужой таймер
  return new Promise(r => setTimeout(() => r(fired), 30));
})()`);
later.then(fired => {
  ok(fired === 0, "таймер прошлого захода не выстрелил (сработал раз: " + fired + ")");
  console.log("\n" + (fails ? "ПРОВАЛЕНО проверок: " + fails : "все проверки пройдены"));
  process.exit(fails ? 1 : 0);
});
