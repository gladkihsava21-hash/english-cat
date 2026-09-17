// «Свои предложения»: три захода подряд, слова из словаря ученика,
// разбор грамматики — включая пропущенное сказуемое и опечатку в
// заданном слове. Всё по замечаниям методиста (17.09.2026):
//   • «он даёт написать только одно предложение, и дальше не идёт»;
//   • «конвейер, лонжитюд, департментал» — слова не из её словаря;
//   • «там пропущен is a medical procedure, он не считал» — грамматика;
//   • «я специально сделала ошибку в слове uniformity» — опечатка.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (cond, what) => { console.log((cond ? "  ✓ " : "  ✗ ") + what); if (!cond) fails++; };
const click = sel => {
  const el = doc.querySelector(sel);
  if (!el) throw new Error("нет элемента " + sel);
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
};
const txt = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
const words = () => (doc.querySelector("#ex-stage .quiz-word-small") || { textContent: "" })
  .textContent.split("·").map(s => s.trim()).filter(Boolean);
const write = t => { doc.getElementById("pers-input").value = t; };

console.log("\n1. Слова берутся из словаря ученика, а не из уровня");
w.eval('openExercise("personal")');
const dict = new Set(w.eval("state.dictionary.map(d => d.w.toLowerCase())"));
const first = words();
ok(first.length === 3, "три слова в задании: " + first.join(", "));
ok(first.every(x => dict.has(x.toLowerCase())),
   "все три — из словаря ученика: " + first.join(", "));

console.log("\n2. Не хватает слова: называем опечатку и разбираем грамматику");
// Фраза без сказуемого — отдельным предложением: правило смотрит на
// каждое предложение по отдельности, и «are» из соседнего его выключает.
write(`My brother a very good student at school. I like ${first[0]} and ${first[1]}.`);
click("#pers-check");
const fb = () => doc.getElementById("pers-feedback").textContent;
ok(/Не хватает/.test(fb()) && fb().includes(first[2]), "сказано, какого слова нет: " + fb());
ok(/нет сказуемого/.test(txt()),
   "разбор грамматики показан и на этом шаге (пропущено is)");
const typo = first[2].length > 5 ? first[2].slice(0, -2) + "xy" : first[2] + "x";
write(`I like ${first[0]} and ${first[1]} and ${typo} very much today.`);
click("#pers-check");
ok(fb().includes(`написано «${typo}»`), "опечатка названа по имени: " + fb());

console.log("\n3. Все слова на месте, но пропущено сказуемое");
write(`My brother a very good student at school. I like ${first[0]}, ${first[1]} and ${first[2]}.`);
click("#pers-check");
ok(/по грамматике есть замечания/.test(fb()), "замечания найдены: " + fb());
ok(/нет сказуемого/.test(txt()), "названо именно пропущенное сказуемое");
ok(!!doc.getElementById("pers-next"), "есть кнопка перехода");
ok(doc.getElementById("pers-next").textContent.includes("Дальше"),
   "на первом заходе кнопка «Дальше», а не «Завершить»");

console.log("\n4. «Дальше» даёт НОВУЮ тройку слов, выходить не надо");
click("#pers-next");
const second = words();
ok(second.length === 3 && second.join() !== first.join(),
   "вторая тройка другая: " + second.join(", "));
ok(!!doc.getElementById("pers-input") && doc.getElementById("pers-input").value === "",
   "поле ввода пустое и готово к работе");
ok(/2 \/ 3|2\/3/.test(txt()), "показан прогресс подхода: " + txt().slice(0, 40));

console.log("\n5. Третий заход — кнопка «Завершить», подход закрывается");
write(`I use ${second[0]} every day and my friend likes ${second[1]} and ${second[2]} too.`);
click("#pers-check");
click("#pers-next");
const third = words();
write(`I like ${third[0]} and ${third[1]}, and my sister enjoys ${third[2]} too.`);
click("#pers-check");
ok(doc.getElementById("pers-next").textContent.includes("Завершить"),
   "на последнем заходе кнопка «Завершить»");
click("#pers-next");
ok(/подход|результат|из 3|Ещё раз|итог/i.test(txt()), "подход завершён: " + txt().slice(0, 60));

console.log("\n6. Правильный текст замечаний не получает");
w.eval('openExercise("personal")');
const again = words();
const clean = `I like ${again[0]}, ${again[1]} and ${again[2]} very much today.`;
write(clean);
click("#pers-check");
ok(/явных ошибок я не вижу/.test(fb()), "чистый текст проходит молча: " + fb()
   + " | замечания: " + w.eval("JSON.stringify(grammarCheck(" + JSON.stringify(clean) + "))"));

console.log("\n7. Ошибок обработчиков нет");
ok(errors.length === 0, "ошибок: " + (errors.join(" | ") || "нет"));

console.log("\n" + (fails ? `ПРОВАЛЕНО: ${fails}` : "«Свои предложения»: заходы, свои слова и разбор грамматики работают"));
process.exit(fails ? 1 : 0);
