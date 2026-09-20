// «Сопоставление»: два слова с ОДИНАКОВЫМ переводом попадают в один
// подход, и в правом столбце оказываются две буквально одинаковые кнопки.
// Ученик выбирает слева big и жмёт кнопку с надписью «большой» — ровно
// тот перевод, который у него спросили, — и получает ошибку.
const { w } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const bad = t => { console.log("  ✗ " + t); fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.readGateMs = () => 0;
  window.__log = { stat: [], finish: [], xp: 0 };
  const _stat = statUpdate, _fin = exFinish, _aw = award;
  window.statUpdate = function (word, ok, v) { window.__log.stat.push([String(word), !!ok, v !== false]); return _stat(word, ok, v); };
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _fin(c, t, n); };
  window.award = function (n) { window.__log.xp += n; return _aw(n); };
`);

// Словарь ученика: big и large — оба «большой» (это реальные записи банка)
w.eval(`
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = ["big", "large", "cat", "dog", "book"].map(x => {
    const r = wordInfo(x);
    return { w: r.w, t: r.t, ex: r.ex, added: Date.now(), seen: 1 };
  });
`);
console.log("словарь ученика:", w.eval("JSON.stringify(state.dictionary.map(d => d.w + ' = ' + d.t))"));

let done = false;
for (let attempt = 1; attempt <= 12 && !done; attempt++) {
  w.eval('window.__log = { stat: [], finish: [], xp: 0 }; openExercise("matching")');
  const rights = [...doc.querySelectorAll("#pairs-r .pair-item")];
  const texts = rights.map(b => b.textContent);
  const dup = texts.filter(t => t === "большой").length;
  if (attempt === 1) {
    console.log("правый столбец:", JSON.stringify(texts));
    if (dup < 2) bad("двух одинаковых кнопок нет — гипотеза не воспроизвелась");
    else console.log("  одинаковых кнопок «большой» справа:", dup, "— различить их ученику нечем");
  }
  const leftBig = [...doc.querySelectorAll("#pairs-l .pair-item")].find(b => b.textContent === "big");
  const firstBol = rights.find(b => b.textContent === "большой");
  click(leftBig);          // ученик выбрал слово big
  click(firstBol);         // и нажал кнопку с надписью «большой»
  if (/\bbad\b/.test(firstBol.className)) {
    console.log(`\nпопытка ${attempt}: нажата кнопка «${firstBol.textContent}» для слова «big»`);
    console.log('  class="' + firstBol.className + '"  ← ответ помечен ошибкой');
    console.log("  statUpdate:", w.eval("JSON.stringify(window.__log.stat)"));
    console.log("  → на кнопке написан ровно верный перевод слова big,");
    console.log("    но упражнение засчитало ошибку и записало её в статистику слова");
    done = true;
  }
}
if (!done) bad("за 12 подходов ни разу не попали в чужую одинаковую кнопку");

console.log("\n" + (fails ? "НЕ ВОСПРОИЗВЕЛОСЬ: " + fails : "ВОСПРОИЗВЕДЕНО"));
process.exit(fails ? 1 : 0);
