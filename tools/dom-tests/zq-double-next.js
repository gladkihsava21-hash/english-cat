// «Дальше →» после ошибки: обработчик next() висит на кнопке, которую
// следующий кадр выкидывает из DOM, но сам обработчик живёт. Второе
// нажатие по той же кнопке закрывает подход ВТОРОЙ раз: второй
// recordTaskResult (tries += 1), вторая плашка репетитору на доску,
// второй bump достижений, второй таймер возврата на доску.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

w.close = () => {};
w.eval(`
  window.__fin = []; window.__board = []; window.__bump = [];
  const _f = exFinish;
  window.exFinish = function (c, t, n) { window.__fin.push(c + "/" + t); return _f(c, t, n); };
  window.reportBoardResult = function (id, info) { window.__board.push(id + " ← " + info.text); return Promise.resolve(true); };
  if (typeof bump === "function") { const _b = bump; window.bump = function (k) { window.__bump.push(k); return _b(k); }; }
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = ["cat кот","dog собака","sun солнце","book книга"]
    .map(s => ({ w: s.split(" ")[0], t: s.split(" ")[1], added: Date.now(), seen: 1 }));
  homeworkContext = { id: "hw-2", title: "Слова" };
  window.boardTaskCard = "card-2";
  state.taskResults = {};
  stage.__x = 0;
`);

(async () => {
  // Свой набор из трёх вопросов, последний ответим неверно.
  w.eval(`openExercise("mcq");`);
  await wait(20);
  w.eval(`
    exRoundReset();
    runMCQ([
      { sub: "с", prompt: "cat",  options: ["кот", "пёс"],   correct: 0, statWord: "cat" },
      { sub: "с", prompt: "dog",  options: ["кот", "собака"], correct: 1, statWord: "dog" },
      { sub: "с", prompt: "sun",  options: ["солнце", "луна"], correct: 0, statWord: "sun" },
    ]);
  `);
  const opts = () => [...doc.querySelectorAll(".mcq-option")];
  for (let g = 0; g < 400; g++) {
    if (doc.getElementById("ex-again")) break;
    const box = doc.getElementById("mcq-options");
    if (!box) { await wait(20); continue; }
    if (opts().some(o => o.classList.contains("right") || o.classList.contains("wrong"))) {
      const nb = doc.getElementById("mcq-next");
      if (!nb) { await wait(60); continue; }
      const cnt = (doc.querySelector("#ex-stage .test-counter") || {}).textContent || "";
      const last = cnt.split("/").map(x => +x.trim());
      if (last[0] === last[1]) {
        console.log("последний вопрос отвечен неверно, на экране «Дальше →»");
        console.log("жмём «Дальше →» ДВАЖДЫ (нетерпеливый двойной тап):");
        click(nb); click(nb);
        await wait(50);
        break;
      }
      click(nb); await wait(30); continue;
    }
    if (box.classList.contains("mcq-wait")) { await wait(20); continue; }
    await wait(500);
    const o = opts();
    const cnt = (doc.querySelector("#ex-stage .test-counter") || {}).textContent || "";
    const last = cnt.split("/").map(x => +x.trim());
    click(last[0] === last[1] ? o[o.length - 1] : o[0]);   // последний — мимо
    await wait(30);
  }
  await wait(200);
  console.log("  exFinish вызван раз: " + w.eval("JSON.stringify(window.__fin)"));
  console.log("  репетитору в панель: " + w.eval("JSON.stringify(state.taskResults)"));
  console.log("  плашек на доску: " + w.eval("JSON.stringify(window.__board)"));
  console.log("  достижения bump: " + w.eval("JSON.stringify(window.__bump)"));
  console.log("  разбор ответов на экране: " + ((doc.querySelector("#ex-stage .ex-review summary") || {}).textContent || "—").trim());
})();
