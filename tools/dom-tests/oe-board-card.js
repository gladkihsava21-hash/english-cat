// Запуск с доски: в адресе card=… → window.boardTaskCard (app.js trainFromHash).
// Проверяем, что итог уезжает в карточку задания только от того подхода,
// который с доски и запускали.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

w.eval(`
  readGateMs = () => 0;
  renderHomework = function () {};
  window.__board = [];
  window.reportBoardResult = function (card, info) {     // как в js/sync.js
    window.__board.push({ card, text: info.text });
    return Promise.resolve(true);
  };
  window.__closed = 0;
  window.close = function () { window.__closed++; };      // вкладку в стенде не закрываем
`);

// прокликать любое MCQ-упражнение до конца, отвечая первым вариантом
async function playAnyMCQ(limit = 20) {
  for (let n = 0; n < limit; n++) {
    await sleep(40);
    const opts = [...doc.querySelectorAll("#mcq-options .mcq-option")];
    if (!opts.length) return n;              // упражнение кончилось
    click(opts[0]);
    await sleep(40);
    const nx = doc.getElementById("mcq-next");
    if (nx) { click(nx); continue; }         // ошибка — «Дальше»
    await sleep(1200);
  }
  return limit;
}

(async () => {
  console.log("=== Ученик пришёл по ссылке с доски: index.html#train=spelling&card=card-42 ===");
  w.eval('window.boardTaskCard = "card-42";');   // ровно это делает trainFromHash
  w.eval('openExercise("spelling")');
  console.log("открыто задание с доски:", stageText().slice(0, 60));

  console.log("\n--- задание не понравилось: ушёл в «Тренировки», ничего не сдав ---");
  click(doc.querySelector('.nav-btn[data-nav="practice"]'));
  console.log("boardTaskCard после ухода:", w.eval("JSON.stringify(window.boardTaskCard)"));
  console.log("на доску пока ушло:", w.eval("JSON.stringify(window.__board)"));

  console.log("\n--- играет в «Выбери перевод» для себя ---");
  w.eval('openExercise("mcq")');
  const asked = await playAnyMCQ();
  await sleep(200);
  console.log("вопросов пройдено:", asked, "| экран:", stageText().slice(0, 60));
  console.log("уехало на доску:", w.eval("JSON.stringify(window.__board)"));
  console.log("заведён авто-возврат на доску:", w.eval("!!window.__exBoardBack"));
  await sleep(3800);
  console.log("через 3,6 с: window.close() позвали раз:", w.eval("window.__closed"),
              "(дальше location.replace('board.html'))");

  const board = JSON.parse(w.eval("JSON.stringify(window.__board)"));
  console.log("\nИТОГ: задание с доски ученик не делал.");
  if (board.length) {
    console.log("  ✗ БАГ: в карточку " + board[0].card + " записан результат чужого упражнения:");
    console.log("         «" + board[0].text + "» — репетитор видит это как сданное задание,");
    console.log("         а ученика через 3,6 с уносит из тренировки на доску.");
    process.exit(1);
  }
  console.log("  ✓ на доску ничего лишнего не ушло");
})();
