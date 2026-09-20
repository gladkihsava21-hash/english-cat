// «Поиск слов»: инварианты счёта и повторные закрытия раунда.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + ":" + (o ? "+" : "-")); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

// Находим слово честно: жмём первую и последнюю клетку. Координаты берём
// из самой сетки — перебираем все прямые линии и ищем ту, что читается
// как слово из списка «Найди:».
const findWord = (word) => w.eval(`(function () {
  const want = ${JSON.stringify(word)};
  const cells = [...document.querySelectorAll(".ws-cell")];
  const SIZE = Math.sqrt(cells.length);
  const at = (r, c) => cells[r * SIZE + c];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const end = [r + dr * (want.length - 1), c + dc * (want.length - 1)];
      if (end[0] >= SIZE || end[1] >= SIZE) continue;
      let s = "";
      for (let k = 0; k < want.length; k++) s += at(r + dr * k, c + dc * k).textContent;
      if (s === want || [...s].reverse().join("") === want) {
        at(r, c).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        at(end[0], end[1]).dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      }
    }
  }
  return false;
})()`);

const targets = () => JSON.parse(w.eval(
  'JSON.stringify([...document.querySelectorAll(".ws-target")].map(x => x.textContent))'));

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Проходим все шесть сеток, находя ВСЕ слова");
  w.eval('openExercise("wordsearch")');
  let seen = 0, placedTotal = 0, guard = 0;
  while (guard++ < 20 && doc.getElementById("ws-grid")) {
    const list = targets();
    placedTotal += list.length;
    seen++;
    list.forEach(t => ok(findWord(t) === true, `сетка ${seen}: слово «${t}» найдено`));
    await tick(700);   // авто-переход через 600 мс
  }
  const log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("  сеток пройдено: " + seen + ", слов спрятано: " + placedTotal);
  console.log("  exFinish: " + JSON.stringify(log.finish));
  ok(log.finish.length === 1, "итоги подведены ровно один раз: " + log.finish.length);
  const [c, t] = log.finish[0] || [];
  ok(c === t && t === placedTotal,
     `нашли всё — «Верно ${c} из ${t}» при ${placedTotal} спрятанных`);
  ok(!log.stat.some(s => s.endsWith(":-")),
     "ни одно найденное слово не помечено как забытое: " + log.stat.filter(s => s.endsWith(":-")).join(", "));
  const dup = log.stat.filter((x, i) => log.stat.indexOf(x) !== i);
  ok(dup.length === 0, "ни одно слово не отмечено дважды: " + JSON.stringify(dup));

  console.log("\n2. Нашли последнее слово и тут же жмём «Дальше» (окно 600 мс)");
  w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
  w.eval('openExercise("wordsearch")');
  const list2 = targets();
  list2.forEach(t => findWord(t));
  const next = doc.getElementById("ws-next");
  click(next);                       // раунд закрыт вручную
  await tick(900);                   // и отложенное закрытие тоже успевает
  const l2 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const stat2 = l2.stat.filter((x, i) => l2.stat.indexOf(x) !== i);
  console.log("  отметок SRS: " + JSON.stringify(l2.stat));
  ok(stat2.length === 0, "раунд не закрылся дважды (повторных отметок нет): " + JSON.stringify(stat2));

  console.log("\n3. Жмём «Дальше» сразу, не ища ничего: что уходит в SRS");
  w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
  w.eval('openExercise("wordsearch")');
  const list3 = targets();
  click(doc.getElementById("ws-next"));
  const l3 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("  слов в сетке: " + JSON.stringify(list3) + " → SRS: " + JSON.stringify(l3.stat));
  ok(l3.stat.length === 0,
     "ни одно слово не помечено «забыл» за долю секунды на экране: " + JSON.stringify(l3.stat));

  console.log("\nошибок JS: " + errors.length + (errors.length ? " " + errors.join(" | ") : ""));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
