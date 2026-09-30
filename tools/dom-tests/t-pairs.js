// «Соедини пары» и одинаковые переводы.
//
// Раньше matching() брала trainPool(5) как есть: два слова с одним
// переводом («big — большой», «large — большой») давали справа две
// кнопки с одинаковой надписью, и ровно одна из них считалась «той
// самой». Ученик соединял верно по смыслу — получал красное «мимо»,
// минус к счёту и слово, помеченное забытым.
//
// Что проверяем теперь (два слоя защиты):
//  1) matching() не собирает расклад с двумя одинаковыми правыми
//     половинами вовсе (pickDistinctT, как в «Найди пару»);
//  2) если двойняшки всё же дошли до runPairs (набор репетитора
//     «синонимы» — там это обычное дело), ЛЮБАЯ из двух одинаковых
//     кнопок принимается за любое из слов-близнецов.
const { w } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

w.eval(`
  window.readGateMs = () => 0;
  const _s = statUpdate, _a = award, _f = exFinish;
  window.__stat = []; window.__xp = 0; window.__fin = [];
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok, v === undefined ? true : !!v]); return _s(word, ok, v); };
  window.award = function (n) { window.__xp += n; return _a(n); };
  window.exFinish = function (c, t, note) { window.__fin.push([c, t]); return _f(c, t, note); };
`);

console.log(w.eval(`(() => {
  const byT = {};
  WORDS.A2.forEach(x => (byT[x.t] = byT[x.t] || []).push(x.w));
  const dup = Object.entries(byT).filter(([, ws]) => ws.length > 1);
  return "в живой базе A2 слов с ОДИНАКОВЫМ переводом: " + dup.length + " групп — "
    + dup.slice(0, 4).map(([t, ws]) => t + " → " + ws.join("/")).join(" · ");
})()`));

const DICT = `state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w: "big",   t: "большой", added: Date.now(), seen: 1 },
    { w: "large", t: "большой", added: Date.now(), seen: 1 },
    { w: "cat",   t: "кот",     added: Date.now(), seen: 1 },
    { w: "dog",   t: "собака",  added: Date.now(), seen: 1 },
    { w: "sun",   t: "солнце",  added: Date.now(), seen: 1 },
  ];`;

const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

console.log("\n1. matching() не собирает расклад с двумя одинаковыми переводами справа");
{
  const seen = [];
  for (let k = 0; k < 12; k++) {
    w.eval(DICT + `openExercise("matching");`);
    const texts = R().map(b => b.textContent);
    const dups = texts.filter((t, i) => texts.indexOf(t) !== i);
    seen.push(...new Set(dups));
  }
  ok(seen.length === 0,
     "12 подходов подряд: дублей справа " + (seen.length ? "ЕСТЬ — " + seen.join(", ") : "нет"));
}

console.log("\n2. Набор репетитора «синонимы»: любая из двух одинаковых кнопок принимается");
{
  // runPairs напрямую — двойняшки доходят и мимо matching(): набор
  // репетитора с синонимами фильтровать нечем, там они законны.
  const tryTwin = (leftWord, btnIdx) => {
    w.eval(`window.__stat = []; window.__fin = [];
      stage().innerHTML = "";
      runPairs([{l:"run", r:"бежать", statWord:"run"}, {l:"jog", r:"бежать", statWord:"jog"}, {l:"walk", r:"идти", statWord:"walk"}]);`);
    click(L().find(x => x.textContent === leftWord));
    const begs = R().filter(x => x.textContent === "бежать");
    click(begs[btnIdx]);
    return !begs[btnIdx].classList.contains("bad")
        && L().find(x => x.textContent === leftWord).classList.contains("done");
  };
  ok(tryTwin("run", 0), "«run» → 1-я «бежать»: принято");
  ok(tryTwin("run", 1), "«run» → 2-я «бежать»: принято");
  ok(tryTwin("jog", 0), "«jog» → 1-я «бежать»: принято");
  ok(tryTwin("jog", 1), "«jog» → 2-я «бежать»: принято");
  // Верное по смыслу соединение не должно метить слово забытым
  const st = JSON.parse(w.eval("JSON.stringify(window.__stat)"));
  ok(st.length && st.every(x => x[1] === true),
     "statUpdate только с ok=true: " + JSON.stringify(st));
}

console.log("\n3. Защита от прокликивания в runPairs на месте");
ok(w.eval("typeof exRound.answered") === "number",
   "exRoundAnswer зовётся (answered=" + w.eval("exRound.answered") + ")");

console.log(fails ? "\nПРОБЛЕМ: " + fails : "\nвсё чисто");
process.exit(fails ? 1 : 0);
