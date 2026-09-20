// runPairs: итог подхода = pairs.length − errors, где errors — это число
// НЕВЕРНЫХ НАЖАТИЙ, а не число неотгаданных пар. Одна пара, по которой
// ученик потыкал, уводит счёт всего подхода в ноль. И каждое такое
// нажатие отдельно бьёт по слову: statUpdate → srsReview(ok=false)
// вызывается на каждый клик, ease падает на 0.2 за клик.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

w.eval(`
  window.readGateMs = () => 0;
  const _f = exFinish, _s = statUpdate;
  window.__fin = []; window.__stat = [];
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, ok, v) { window.__stat.push(String(word) + (ok ? "+" : "−")); return _s(word, ok, v); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w: "cat", t: "кот",     added: Date.now(), seen: 1 },
    { w: "dog", t: "собака",  added: Date.now(), seen: 1 },
    { w: "sun", t: "солнце",  added: Date.now(), seen: 1 },
    { w: "book", t: "книга",  added: Date.now(), seen: 1 },
    { w: "milk", t: "молоко", added: Date.now(), seen: 1 },
  ];
  window.__shufOrig = shuffled; window.shuffled = a => [...a];
  openExercise("matching");
  window.__fin = []; window.__stat = [];
`);

const dict = JSON.parse(w.eval(`JSON.stringify(state.dictionary.reduce((a,d)=>(a[d.w]=d.t,a),{}))`));

(async () => {
  console.log("пары на экране: " + L().map(b => b.textContent).join(" | ")
    + "   ↔   " + R().map(b => b.textContent).join(" | "));

  // Четыре пары ученик соединяет С ПЕРВОГО РАЗА, на пятой («milk») тыкает.
  const order = L().map(b => b.textContent);
  const hard = order[order.length - 1];
  for (const word of order.slice(0, -1)) {
    click(L().find(b => b.textContent === word && !b.classList.contains("done")));
    click(R().find(b => b.textContent === dict[word] && !b.classList.contains("done")));
  }
  console.log("\nчетыре пары из пяти — с первого раза, без ошибок");
  console.log("statUpdate: " + w.eval("JSON.stringify(window.__stat)"));

  // Пятая пара осталась одна слева и одна справа — но ученик ещё не знает
  // слова и «прощупывает» уже занятые кнопки… они done, так что для чистоты
  // опыта тыкаем по последней паре ДО того, как остальные закрыты. Повторим
  // подход заново.
  w.eval(`window.__fin = []; window.__stat = []; openExercise("matching");`);
  const ls = L().map(b => b.textContent), rs = R().map(b => b.textContent);
  console.log("\n— второй подход, тот же расклад: " + ls.join(" | ") + " ↔ " + rs.join(" | "));
  const victim = ls[0];
  console.log(`ученик не помнит «${victim}» и жмёт по очереди 4 чужие кнопки, потом свою:`);
  for (let k = 1; k < rs.length; k++) {          // четыре ЧУЖИЕ кнопки
    click(L().find(b => b.textContent === victim));
    click(R()[k]);
  }
  click(L().find(b => b.textContent === victim));
  click(R().find(b => b.textContent === dict[victim]));
  // остальные четыре пары — верно с первого раза
  for (const word of ls.slice(1)) {
    click(L().find(b => b.textContent === word && !b.classList.contains("done")));
    click(R().find(b => b.textContent === dict[word] && !b.classList.contains("done")));
  }
  await wait(700);
  console.log("statUpdate по кликам: " + w.eval("JSON.stringify(window.__stat)"));
  console.log("итог (correct,total): " + w.eval("JSON.stringify(window.__fin)"));
  console.log("экран: " + ((doc.querySelector("#ex-stage h2") || {}).textContent || "").trim()
    + " · " + ((doc.querySelector("#ex-stage p") || {}).textContent || "").trim());
  console.log(`слово «${victim}» в словаре после подхода: ` + w.eval(
    `JSON.stringify((d=>({forgot:d.forgot,knew:d.knew,ease:d.ease,reps:d.reps,interval:d.interval}))(state.dictionary.find(x=>x.w===${JSON.stringify(victim)})))`));
  console.log("\nвсе пять пар в итоге соединены верно; четыре — с первого раза.");
  w.eval("window.shuffled = window.__shufOrig;");
})();
