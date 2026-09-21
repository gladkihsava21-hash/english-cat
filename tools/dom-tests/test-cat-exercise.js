// Кот Савелий в упражнениях: живая реакция на ответ рядом с разбором
// (catAnswerNote в общих движках runMCQ / runType / runPairs).
//
// Проверяем DOM, а не глаза: у верного ответа — радость (happy/love) и
// реплика из набора похвалы, у неверного — поддержка (wink/hello), реплики
// не повторяются подряд, разбор ответа котом не перекрыт и не затёрт.
// Доступность: вся строка кота aria-hidden — результат скринридеру говорит
// сам разбор (role="status" у .type-feedback, aria-label у вариантов).
const { w } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 80));

// Пауза на чтение тестируется в других прогонах; здесь она про кота не нужна.
w.eval(`window.readGateMs = () => 0;`);

const note = () => doc.querySelector("#ex-stage .cat-answer");
const pose = () => (note() && note().querySelector(".cat-avatar").dataset.cat) || "";
const say = () => (note() && note().querySelector(".cat-answer-say").textContent) || "";
const OK_SAYS = () => w.eval(`CAT_ANSWER_SAY.ok.join("\\n")`).split("\n");
const OOPS_SAYS = () => w.eval(`CAT_ANSWER_SAY.oops.join("\\n")`).split("\n");

(async () => {
  // Движки рендерят в #ex-stage; его создаёт openExercise — здесь ставим руками,
  // чтобы гонять общие движки напрямую, без конвейера слов.
  w.eval(`document.getElementById("exercise-body").innerHTML = '<div id="ex-stage"></div>';`);

  console.log("\n1. runMCQ: верный ответ — кот радуется рядом с вариантами");
  w.eval(`stage().innerHTML = "";
    runMCQ([{ prompt: "cat", options: ["кот", "собака", "солнце"], correct: 0, statWord: "cat" }]);`);
  await tick(150);   // таймер паузы на чтение снимает блокировку вариантов
  let box = doc.getElementById("mcq-options");
  click(box.children[0]);   // «кот» — верно
  ok(!!note(), "появилась строка кота (.cat-answer)");
  ok(note() && box.nextElementSibling === note(), "кот стоит сразу после вариантов");
  ok(note() && note().getAttribute("aria-hidden") === "true",
     "реплика кота aria-hidden — скринридер не дублирует разбор");
  ok(["happy", "love"].includes(pose()), "поза радости: " + pose());
  ok(OK_SAYS().includes(say()), "реплика из набора похвалы: «" + say() + "»");
  ok(!!note().querySelector(".cat-avatar svg"), "кот нарисован (svg на месте)");
  ok(box.children[0].classList.contains("right"), "вариант подсвечен как верный — механика не тронута");

  console.log("\n2. runMCQ: неверный ответ — поддержка, разбор не перекрыт");
  w.eval(`stage().innerHTML = "";
    runMCQ([{ prompt: "dog", options: ["кот", "собака"], correct: 1,
              statWord: "dog", why: "dog — это собака." }]);`);
  await tick(150);
  box = doc.getElementById("mcq-options");
  click(box.children[0]);   // «кот» — неверно
  ok(!!note(), "строка кота появилась и на ошибке");
  ok(["wink", "hello"].includes(pose()), "поза поддержки (не «грустный кот»): " + pose());
  ok(OOPS_SAYS().includes(say()), "реплика из набора поддержки: «" + say() + "»");
  const why = doc.querySelector(".quiz-why");
  ok(!!why && why.textContent.includes("собака"), "объяснение «почему» на месте");
  // Порядок сверху вниз: варианты → кот → объяснение → «Дальше».
  ok(box.nextElementSibling === note() && note().nextElementSibling === why,
     "кот между вариантами и разбором, разбор сдвинут, а не перекрыт");
  const nextBtn = doc.getElementById("mcq-next");
  ok(!!nextBtn && !note().contains(nextBtn), "кнопка «Дальше» жива и лежит вне строки кота");
  ok(box.children[1].classList.contains("right")
     && !!box.children[1].querySelector(".ans-mark"),
     "верный вариант по-прежнему подсвечен знаком");

  console.log("\n3. runType: неверный ответ — кот сразу под вердиктом");
  w.eval(`stage().innerHTML = "";
    runType([{ sub: "проверка", prompt: "«кот»", answer: "cat", statWord: "cat" }]);`);
  const input = doc.getElementById("type-input");
  input.value = "dog";
  click(doc.getElementById("type-check"));
  const fb = doc.getElementById("type-feedback");
  ok(fb.textContent.includes("Правильно: cat"), "разбор «Правильно: …» не затёрт котом");
  ok(fb.nextElementSibling === note(), "кот встал сразу после фидбека");
  ok(OOPS_SAYS().includes(say()) && ["wink", "hello"].includes(pose()),
     "поддержка: «" + say() + "», поза " + pose());
  ok(!!doc.getElementById("type-next"), "кнопка «Дальше» появилась ниже");
  const say1 = say();

  console.log("\n4. Реплики не повторяются подряд (ротация)");
  w.eval(`stage().innerHTML = "";
    runType([{ sub: "проверка", prompt: "«кот»", answer: "cat", statWord: "cat" }]);`);
  doc.getElementById("type-input").value = "dog";
  click(doc.getElementById("type-check"));
  ok(say() !== say1, `вторая поддержка другая: «${say1}» → «${say()}»`);

  console.log("\n5. runType: верный ответ — радость");
  w.eval(`stage().innerHTML = "";
    runType([{ sub: "проверка", prompt: "«собака»", answer: "dog", statWord: "dog" }]);`);
  doc.getElementById("type-input").value = "dog";
  click(doc.getElementById("type-check"));
  ok(OK_SAYS().includes(say()) && ["happy", "love"].includes(pose()),
     "похвала: «" + say() + "», поза " + pose());

  console.log("\n6. runPairs: одна строка кота на весь подход, обновляется на месте");
  w.eval(`stage().innerHTML = "";
    runPairs([{ l: "cat", r: "кот", statWord: "cat" },
              { l: "dog", r: "собака", statWord: "dog" }]);`);
  const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
  const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
  click(L().find(b => b.textContent === "cat"));
  click(R().find(b => b.textContent === "собака"));   // промах
  ok(!!note() && OOPS_SAYS().includes(say()), "промах в парах — поддержка: «" + say() + "»");
  const firstNote = note();
  click(L().find(b => b.textContent === "cat"));
  click(R().find(b => b.textContent === "кот"));      // верно
  ok(note() === firstNote, "элемент тот же — сетка не дёргается");
  ok(OK_SAYS().includes(say()) && ["happy", "love"].includes(pose()),
     "верная пара — радость: «" + say() + "»");
  ok(doc.querySelectorAll("#ex-stage .cat-answer").length === 1, "строка кота одна, не плодится");

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "кот отвечает на ответы во всех трёх движках"));
  process.exit(fails ? 1 : 0);
})();
