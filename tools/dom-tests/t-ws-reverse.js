// «Поиск слов»: два слова-перевёртыша в одной сетке (dam / mad).
// Проверяем, кому засчитывается найденное слово.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], xp: 0, stat: [] };
  const _f = exFinish, _a = award, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + (o ? ":+" : ":-")); return _s(word, o, v); };
  // Словарь ученика: два перевёртыша (оба уровня A2 в банке сайта) и два
  // обычных слова. Отбор галочками — чтобы добора из банка не было и в
  // сетку попали ровно эти четыре.
  state.dictionary = ["dam", "mad", "milk", "book"].map(x => {
    const info = wordInfo(x) || { w: x, t: x };
    return { w: info.w, t: info.t, ex: info.ex, added: Date.now(), seen: 1 };
  });
  state.trainWords = ["dam", "mad", "milk", "book"];
  // Перехватываем сетку: нужно знать, где что лежит
  window.__placed = null;
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Открываем «Поиск слов» со словарём dam / mad / milk / book");
  w.eval('openExercise("wordsearch")');
  await tick(30);

  const targets = [...doc.querySelectorAll(".ws-target")].map(x => x.textContent);
  console.log("  слова этой сетки: " + JSON.stringify(targets));
  ok(targets.includes("dam") && targets.includes("mad"),
     "оба перевёртыша попали в одну сетку");
  if (!targets.includes("dam") || !targets.includes("mad")) {
    console.log("  (не сошлось на этом зерне — попробуй SEED=<другое>)");
    process.exit(1);
  }

  // Читаем сетку из DOM и находим, где лежит «dam»
  const SIZE = 9;
  const cells = [...doc.querySelectorAll(".ws-cell")];
  const at = (r, c) => cells[r * SIZE + c];
  const grid = [];
  for (let r = 0; r < SIZE; r++) grid.push([...Array(SIZE)].map((_, c) => at(r, c).textContent));

  // Ищем «dam» в сетке: по строкам и по столбцам, в обе стороны
  const findWord = word => {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c + word.length <= SIZE; c++) {
      if (grid[r].slice(c, c + word.length).join("") === word)
        return { a: [r, c], b: [r, c + word.length - 1] };
    }
    for (let c = 0; c < SIZE; c++) for (let r = 0; r + word.length <= SIZE; r++) {
      let s = ""; for (let k = 0; k < word.length; k++) s += grid[r + k][c];
      if (s === word) return { a: [r, c], b: [r + word.length - 1, c] };
    }
    return null;
  };
  const damPos = findWord("dam");
  const madPos = findWord("mad");
  console.log("  «dam» в сетке: " + JSON.stringify(damPos) + ", «mad»: " + JSON.stringify(madPos));

  console.log("\n2. Ученик находит ровно «dam»: жмёт его первую и последнюю букву");
  w.eval("window.__log.stat = []; window.__log.xp = 0");
  click(at(damPos.a[0], damPos.a[1]));
  click(at(damPos.b[0], damPos.b[1]));
  await tick(30);

  const done = [...doc.querySelectorAll(".ws-target.ws-done")].map(x => x.textContent);
  const stat = JSON.parse(w.eval("JSON.stringify(window.__log.stat)"));
  const xp = w.eval("window.__log.xp");
  console.log("  вычеркнуто на экране: " + JSON.stringify(done) + ", SRS: " + JSON.stringify(stat) + ", очки: " + xp);
  ok(done.length === 1 && done[0] === "dam",
     "вычеркнуто именно то слово, которое ученик нашёл (ждали dam)");
  ok(stat.length === 1 && stat[0] === "dam:+",
     "в SRS ушло именно найденное слово (ждали dam:+)");

  console.log("\n3. Ученик жмёт ТЕ ЖЕ ДВЕ буквы ещё раз (он ищет «dam», его-то и не вычеркнули)");
  w.eval("window.__log.stat = []; window.__log.xp = 0");
  click(at(damPos.a[0], damPos.a[1]));
  click(at(damPos.b[0], damPos.b[1]));
  await tick(30);
  const done2 = [...doc.querySelectorAll(".ws-target.ws-done")].map(x => x.textContent);
  const stat2 = JSON.parse(w.eval("JSON.stringify(window.__log.stat)"));
  const xp2 = w.eval("window.__log.xp");
  console.log("  вычеркнуто: " + JSON.stringify(done2) + ", SRS: " + JSON.stringify(stat2) + ", очки за повтор: " + xp2);
  ok(stat2.length === 0 && xp2 === 0,
     "повторное нажатие тех же клеток ничего не начисляет");

  console.log("\n4. Ученик жмёт «Дальше», не найдя второго слова");
  w.eval("window.__log.stat = []");
  click(doc.getElementById("ws-next"));
  await tick(30);
  const stat3 = JSON.parse(w.eval("JSON.stringify(window.__log.stat)"));
  console.log("  что ушло в SRS при переходе: " + JSON.stringify(stat3));
  ok(!stat3.includes("dam:-"),
     "найденное учеником «dam» не помечено как забытое");

  console.log("\nошибок JS: " + errors.length);
  errors.forEach(e => console.log("   " + e));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
