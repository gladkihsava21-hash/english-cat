// «Блиц» собирает кнопки вариантов строкой и НЕ экранирует перевод:
//   `<button class="mcq-option" data-i="${i}">${o}</button>`   (js/exercises.js ~2658)
// Везде рядом текст ставится через esc() или textContent — здесь нет.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__pwned = 0;
  // Перевод с разметкой. Так слово попадает в словарь ученика штатно:
  // из домашки репетитора (task.words[].t), из «добавить слово» или
  // с синхронизации. Проверка ниже — про то, что с ним делает «Блиц».
  state.dictionary = [
    { w: "cat", t: '<b onclick="window.__pwned=1">кот</b>', ex: "", added: Date.now(), seen: 1 },
    ...WORDS.A1.slice(0, 20).map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 })),
  ];
  state.trainWords = ["cat"];          // играем ровно этим словом
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  console.log("\n1. Открываем «Блиц» со словом, у которого в переводе разметка");
  w.eval('openExercise("blitz")');
  await tick(20);
  const box = doc.getElementById("blitz-options");
  console.log("  слово на экране: " + doc.getElementById("blitz-word").textContent);
  console.log("  разметка вариантов: " + box.innerHTML.replace(/\s+/g, " ").slice(0, 220));
  const injected = box.querySelectorAll("b[onclick]");
  ok(injected.length === 0,
     "перевод попал в кнопку как ТЕКСТ, а не как разметка (найдено тегов: " + injected.length + ")");

  console.log("\n2. Ученик нажимает на этот вариант");
  if (injected.length) {
    click(injected[0]);
    await tick(10);
    const pwned = w.eval("window.__pwned");
    console.log("  обработчик из перевода сработал: " + (pwned ? "ДА" : "нет"));
    ok(!pwned, "чужой код из перевода не выполняется при нажатии");
  }

  console.log("\n3. Для сравнения — то же слово в обычном «Выборе варианта» (runMCQ)");
  w.eval('openExercise("mcq")');
  await tick(30);
  const mcqBox = doc.getElementById("mcq-options");
  const mcqInjected = mcqBox ? mcqBox.querySelectorAll("b[onclick]").length : -1;
  console.log("  тегов в вариантах «Выбора варианта»: " + mcqInjected
    + " (там b.textContent = opt, разметка не разбирается)");
  ok(mcqInjected === 0, "в общем блоке runMCQ разметка не проходит");

  console.log("\nошибок JS: " + errors.length);
  errors.forEach(e => console.log("   " + e));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
