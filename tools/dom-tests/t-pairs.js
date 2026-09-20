// runPairs сверяет пару ПО ИНДЕКСУ в массиве pairs, а не по тексту.
// Если два слова подхода переведены одинаково («big — большой»,
// «large — большой»), справа стоят две кнопки с одинаковой надписью,
// и ровно одна из них считается «той самой». Ученик соединяет верно
// по смыслу — получает красное «мимо», минус к счёту и слово, помеченное
// забытым.
const { w } = require("./harness-full.js");
const doc = w.document;

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

// Заход: открыть свежий подход и соединить «big» с k-й (0/1) кнопкой «большой».
function attempt(k) {
  w.eval(DICT + `window.__stat = []; window.__xp = 0; window.__fin = []; openExercise("matching");`);
  const bigBtn = L().find(b => b.textContent === "big");
  const same = R().filter(b => b.textContent === "большой");
  if (!bigBtn || same.length !== 2) return null;
  click(bigBtn);
  click(same[k]);
  return {
    red: same[k].classList.contains("bad"),
    stat: JSON.parse(w.eval("JSON.stringify(window.__stat)")),
    left: L().map(b => b.textContent).join(" | "),
    right: R().map(b => b.textContent).join(" | "),
  };
}

const a = attempt(0), b = attempt(1);
if (!a || !b) { console.log("✗ расклад не собрался"); process.exit(1); }
console.log("\nэкран: слева [" + a.left + "]  справа [" + a.right + "]");
console.log("«big» → 1-я кнопка «большой»:", a.red ? "МИМО (красная)" : "принято", "| statUpdate", JSON.stringify(a.stat));
console.log("«big» → 2-я кнопка «большой»:", b.red ? "МИМО (красная)" : "принято", "| statUpdate", JSON.stringify(b.stat));

const bug = a.red || b.red;
if (bug) {
  const bad = a.red ? a : b;
  console.log("\n✗ ВОСПРОИЗВЕЛОСЬ: две кнопки с одной и той же надписью «большой»,");
  console.log("  и одна из них засчитана как ошибка. Ученик соединил верно по смыслу.");
  console.log("  словарная запись «big» после этого:", w.eval(
    `JSON.stringify((d => ({forgot: d.forgot, knew: d.knew, reps: d.reps, ease: d.ease, status: d.status, due: d.due}))(state.dictionary.find(x => x.w === "big")))`));
} else {
  console.log("\n(обе приняты — не воспроизвелось)");
}

// Тот же расклад через своё задание репетитора (конструктор): две пары
// с одинаковой правой частью — обычное дело в наборе «синонимы».
console.log("\n— то же в наборе репетитора (runPairs напрямую):");
w.eval(`window.__stat = []; window.__fin = [];
  stage().innerHTML = "";
  runPairs([{l:"run", r:"бежать"}, {l:"jog", r:"бежать"}, {l:"walk", r:"идти"}]);`);
const runBtn = L().find(x => x.textContent === "run");
const begs = R().filter(x => x.textContent === "бежать");
console.log("  справа:", R().map(x => x.textContent).join(" | "));
click(runBtn); click(begs[0]);
const red0 = begs[0].classList.contains("bad");
console.log("  «run» → 1-я «бежать»:", red0 ? "МИМО" : "принято");
if (!red0) {
  // первая подошла — значит вторая заведомо не подойдёт: проверим на jog наоборот
  w.eval(`stage().innerHTML = ""; runPairs([{l:"run", r:"бежать"}, {l:"jog", r:"бежать"}, {l:"walk", r:"идти"}]);`);
  const jog = L().find(x => x.textContent === "jog");
  const b2 = R().filter(x => x.textContent === "бежать");
  click(jog); click(b2[0]);
  console.log("  «jog» → 1-я «бежать»:", b2[0].classList.contains("bad") ? "МИМО" : "принято");
}

console.log("\n— защита от прокликивания в runPairs:");
console.log("  exRoundAnswer из runPairs не зовётся вовсе → exRound.answered =",
  w.eval("exRound.answered"), ", exRoundRushed() =", w.eval("exRoundRushed()"));
process.exit(bug ? 1 : 0);
