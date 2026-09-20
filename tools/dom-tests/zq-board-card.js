// window.boardTaskCard ставится один раз при заходе по ссылке с доски
// (#train=…&card=…) и НИКОГДА не снимается. exFinish шлёт результат на
// доску при каждом финише, пока флаг стоит. Соседний homeworkContext
// снимается в show() при уходе с экрана упражнения — то есть замысел
// «результат уходит в ту карточку, из которой пришли» есть, но на
// boardTaskCard он не распространён.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

w.close = () => { console.log("   [window.close() — во вкладке, открытой не скриптом, молча ничего не делает]"); };
w.eval(`
  window.readGateMs = () => 0;
  window.__board = [];
  window.reportBoardResult = function (cardId, info) {
    window.__board.push(cardId + " ← " + info.text);
    return Promise.resolve(true);
  };
  window.__nav = [];
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w: "cat", t: "кот", added: Date.now(), seen: 1 },
    { w: "dog", t: "собака", added: Date.now(), seen: 1 },
    { w: "sun", t: "солнце", added: Date.now(), seen: 1 },
    { w: "book", t: "книга", added: Date.now(), seen: 1 },
    { w: "milk", t: "молоко", added: Date.now(), seen: 1 },
    { w: "red", t: "красный", added: Date.now(), seen: 1 },
    { w: "blue", t: "синий", added: Date.now(), seen: 1 },
    { w: "run", t: "бегать", added: Date.now(), seen: 1 },
  ];
`);

// Ученик пришёл по ссылке с доски: карточка задания — «task-77».
w.eval(`window.boardTaskCard = "task-77";
        homeworkContext = { id: "hw-77", title: "Перевод слов к четвергу" };`);

// Отыгрываем весь подход: ждём, пока пройдёт пауза на чтение (её ставит
// setTimeout, поэтому именно ждём, а не жмём сразу), выбираем вариант,
// на ошибке жмём «Дальше →», на верном — ждём автопереход.
async function playMCQ(wrong) {
  for (let guard = 0; guard < 200; guard++) {
    if (doc.getElementById("ex-again")) return;      // подход закрыт
    const nb = doc.getElementById("mcq-next");
    if (nb) { click(nb); await wait(30); continue; }
    const opts = [...doc.querySelectorAll(".mcq-option")];
    if (!opts.length) { await wait(60); continue; }
    if (opts.some(o => o.classList.contains("right") || o.classList.contains("wrong"))) {
      await wait(200); continue;                     // верный ответ уезжает сам
    }
    await wait(600);          // читаем вопрос — иначе подход сочтут прокликанным
    click(wrong ? opts[opts.length - 1] : opts[0]);
    await wait(60);
  }
}

(async () => {
  console.log("1) подход по ссылке с доски");
  w.eval(`openExercise("mcq");`);
  // отвечаем как попало, пока идут раунды (таймер 1100 мс на верных)
  await playMCQ(false);
  console.log("   на доску ушло: " + w.eval("JSON.stringify(window.__board)"));
  console.log("   в панель репетитора (taskResults): " + w.eval("JSON.stringify(state.taskResults)"));

  console.log("\n2) ученик жмёт «Ещё раз» и проходит ХУЖЕ");
  click(doc.getElementById("ex-again"));
  await playMCQ(true);
  console.log("   на доску ушло: " + w.eval("JSON.stringify(window.__board)"));
  console.log("   в панели репетитора: " + w.eval("JSON.stringify(state.taskResults)"));

  console.log("\n3) ученик уходит в «Тренировки» и открывает ДРУГОЕ упражнение");
  w.eval(`show("practice");`);
  console.log("   homeworkContext после ухода: " + w.eval("String(homeworkContext)"));
  console.log("   window.boardTaskCard после ухода: " + w.eval("String(window.boardTaskCard)"));
  w.eval(`openExercise("matching");`);
  const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
  const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
  // соединяем все пары верно, подсматривая соответствие через state
  const map = w.eval(`JSON.stringify(state.dictionary.reduce((a, d) => (a[d.w] = d.t, a), {}))`);
  const dict = JSON.parse(map);
  let guard = 0;
  while (L().some(b => !b.classList.contains("done")) && guard++ < 20) {
    const l = L().find(b => !b.classList.contains("done"));
    const want = dict[l.textContent];
    const r = R().find(b => !b.classList.contains("done") && b.textContent === want);
    if (!r) break;
    click(l); click(r);
  }
  await wait(800);
  console.log("   экран: " + ((doc.querySelector("#ex-stage h2") || {}).textContent || "").trim()
    + " · " + ((doc.querySelector("#ex-stage p") || {}).textContent || "").trim());
  console.log("   на доску ушло: " + w.eval("JSON.stringify(window.__board)"));
  console.log("   в панели репетитора: " + w.eval("JSON.stringify(state.taskResults)"));
})();
