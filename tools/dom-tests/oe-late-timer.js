// Ученик ответил на последний вопрос и сразу нажал «Главная».
// Пауза перед показом итога — 1100 мс (exLater). Что происходит потом?
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

w.eval(`
  readGateMs = () => 0;
  renderHomework = function () {};
  window.__fin = [];
  const _fin = exFinish;
  exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin.apply(null, arguments); };
`);

const SET = {
  title: "Артикли", kind: "quiz",
  items: [
    { q: "It is ___ apple.",  options: ["an", "a", "the"], correct: 0 },
    { q: "I see ___ cat.",    options: ["a", "an", "-"],   correct: 0 },
    { q: "___ sun is hot.",   options: ["The", "A", "An"], correct: 0 },
    { q: "She is ___ doctor.",options: ["a", "an", "the"], correct: 0 },
  ],
};
const TASK = { id: 202, title: "Домашка: артикли", taskset: SET };
const rightText = i => SET.items[i].options[SET.items[i].correct];

(async () => {
  w.eval(`openCustomTask(${JSON.stringify(TASK)})`);
  console.log("homeworkContext:", w.eval("JSON.stringify(homeworkContext)"));

  for (let q = 0; q < SET.items.length; q++) {
    await sleep(30);
    await sleep(600);          // ребёнок читает вопрос — подход честный, не прокликанный
    const opts = [...doc.querySelectorAll("#mcq-options .mcq-option")];
    click(opts.find(b => b.textContent.trim() === rightText(q)));
    if (q < SET.items.length - 1) await sleep(1200);
  }
  // последний ответ дан, идёт пауза 1100 мс — ученик жмёт «Главная»
  console.log("\nответил на все 4, итог ещё не показан. exFinish пока:",
              w.eval("JSON.stringify(window.__fin)"));
  const navHome = doc.querySelector('.nav-btn[data-nav="dashboard"]');
  console.log("нажимаем нижнюю кнопку «Главная»:", !!navHome);
  const launchBefore = w.eval("exLaunch");
  click(navHome);
  console.log("экран упражнения скрыт:",
              doc.getElementById("screen-exercise").classList.contains("hidden"));
  console.log("homeworkContext после ухода:", w.eval("JSON.stringify(homeworkContext)"));
  console.log("exLaunch не изменился:", w.eval("exLaunch") === launchBefore, "(", launchBefore, ")");

  await sleep(1400);   // досиживаем паузу exLater
  console.log("\nчерез 1,4 с:");
  console.log("  exFinish вызван:", w.eval("JSON.stringify(window.__fin)"));
  console.log("  что нарисовано в скрытом #ex-stage:", stageText().slice(0, 70));
  console.log("  экран, который видит ученик:",
              [...doc.querySelectorAll(".screen")].filter(s => !s.classList.contains("hidden"))
                .map(s => s.id).join(",") || "(определяем иначе)");
  const shown = ["dashboard", "exercise", "practice"].filter(
    s => !doc.getElementById("screen-" + s).classList.contains("hidden"));
  console.log("  видимые экраны:", shown.join(",") || "нет");
  const rec = JSON.parse(w.eval('JSON.stringify(state.taskResults||{})'))["202"] || null;
  console.log("  записано репетитору:", JSON.stringify(rec));

  console.log("\nИТОГ: ученик ответил верно на 4 из 4.");
  if (!rec) {
    console.log("  ✗ БАГ: результат домашки не записан — у репетитора «Ещё не сделано»,");
    console.log("         а итог подхода нарисован в невидимом экране.");
    process.exit(1);
  }
  console.log("  ✓ результат записан:", JSON.stringify(rec));
})();
