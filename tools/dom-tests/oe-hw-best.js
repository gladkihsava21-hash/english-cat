// Домашка-задание: честный подход, потом быстрый.
// Проверяем обещание из комментария к recordTaskResult:
// «Прокликанный подход лучший не улучшает».
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

w.eval(`
  readGateMs = () => 0;                 // паузу на чтение проверяет не этот тест
  renderHomework = function () {};      // sync.js в стенде не грузится
  window.homeworkIsDone = function (task) {   // копия из js/sync.js
    const r = (state.taskResults || {})[String(task.id)] || null;
    return !!r && !r.rushed;
  };
`);

const SET = {
  title: "Present Perfect", kind: "quiz",
  items: [
    { q: "I ___ never been to London.", options: ["have", "has", "am"], correct: 0 },
    { q: "She ___ just left.",          options: ["has", "have", "is"], correct: 0 },
    { q: "They ___ already eaten.",     options: ["have", "has", "was"], correct: 0 },
    { q: "He ___ lost his key.",        options: ["has", "have", "are"], correct: 0 },
    { q: "We ___ seen this film.",      options: ["have", "has", "is"], correct: 0 },
    { q: "It ___ been a long day.",     options: ["has", "have", "am"], correct: 0 },
  ],
};
const TASK = { id: 101, title: "Домашка: Present Perfect", taskset: SET };

// правильный вариант вопроса i — по тексту, порядок кнопок тасуется
const rightText = i => SET.items[i].options[SET.items[i].correct];

async function run(mode) {          // mode: "honest" | "rush"
  w.eval(`openCustomTask(${JSON.stringify(TASK)})`);
  for (let q = 0; q < SET.items.length; q++) {
    // ждём, пока варианты откроются (гейт 0 мс, но таймер всё равно тик)
    await sleep(20);
    if (mode === "honest") await sleep(500);      // ребёнок читает вопрос
    const opts = [...doc.querySelectorAll("#mcq-options .mcq-option")];
    if (!opts.length) throw new Error("нет вариантов на вопросе " + q + ": " + stageText().slice(0, 120));
    // честный подход: два последних вопроса — мимо (ребёнок не знает)
    const wrongOnPurpose = mode === "honest" && q >= 4;
    const want = rightText(q);
    const btn = wrongOnPurpose
      ? opts.find(b => b.textContent.trim() !== want)
      : opts.find(b => b.textContent.trim() === want);
    click(btn);
    if (wrongOnPurpose) {                     // ошибка ждёт нажатия «Дальше»
      await sleep(20);
      click(doc.getElementById("mcq-next"));
    } else {
      await sleep(1200);                      // exLater(next, 1100)
    }
  }
  await sleep(100);
}

const res = () => JSON.parse(w.eval('JSON.stringify(state.taskResults||{})'))["101"] || null;
const done = () => w.eval(`homeworkIsDone(${JSON.stringify({ id: 101 })})`);

(async () => {
  console.log("=== 1. Честный подход (читает вопросы, 4 из 6) ===");
  await run("honest");
  console.log("экран:", stageText().slice(0, 90));
  console.log("записано репетитору:", JSON.stringify(res()));
  console.log("домашка сдана?", done());

  console.log("\n=== 2. Тот же ребёнок жмёт быстро и угадывает все 6 ===");
  await run("rush");
  console.log("экран:", stageText().slice(0, 90));
  console.log("записано репетитору:", JSON.stringify(res()));
  console.log("домашка сдана?", done());

  const r = res();
  console.log("\nИТОГ:");
  console.log("  ожидание (по комментарию в recordTaskResult):",
              "лучший честный 4/6 остаётся, домашка сдана");
  console.log("  на деле: correct=" + r.correct + " rushed=" + r.rushed
              + " → сдана: " + done());
  if (r.rushed) {
    console.log("  ✗ БАГ: прокликанный подход стёр честный результат и снял «сдано»");
    process.exit(1);
  }
  console.log("  ✓ честный результат сохранён");
})();
