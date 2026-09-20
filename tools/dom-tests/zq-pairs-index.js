// runPairs сверяет пару ПО ИНДЕКСУ в массиве pairs, а не по тексту.
// Два слова подхода с одним переводом («big — большой», «large — большой»)
// дают справа две кнопки с ОДИНАКОВОЙ надписью, и ровно одна считается
// «той самой». Ученик, соединивший верно по смыслу, получает красное
// «мимо», минус к итогу и слово, помеченное забытым.
//
// Готовый t-pairs.js этого не ловит: он перезапускает подход между
// попытками, а расклад каждый раз тасуется заново — «первая кнопка
// большой» в двух заходах принадлежит разным парам. Поэтому здесь
// shuffled() на время делаем тождественным: тогда точно известно, какая
// кнопка чья.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.readGateMs = () => 0;
  const _s = statUpdate, _f = exFinish, _a = award;
  window.__stat = []; window.__fin = []; window.__xp = 0;
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok, v === undefined ? true : !!v]); return _s(word, ok, v); };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__xp += n; return _a(n); };
  window.__shufOrig = shuffled;
  window.shuffled = a => [...a];         // порядок = порядок pairs
`);

const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

// ---- 1. Прямой вызов runPairs: две пары с одинаковой правой частью
w.eval(`
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w: "big",   t: "большой", added: Date.now(), seen: 1 },
    { w: "large", t: "большой", added: Date.now(), seen: 1 },
    { w: "cat",   t: "кот",     added: Date.now(), seen: 1 },
    { w: "dog",   t: "собака",  added: Date.now(), seen: 1 },
    { w: "sun",   t: "солнце",  added: Date.now(), seen: 1 },
  ];
  openExercise("matching");             // создаёт #ex-stage
  window.__stat = []; window.__fin = []; window.__xp = 0;
  exRoundReset();
  runPairs([
    { l: "big",   r: "большой", statWord: "big" },
    { l: "large", r: "большой", statWord: "large" },
    { l: "cat",   r: "кот",     statWord: "cat" },
  ]);
`);
console.log("слева : " + L().map(b => b.textContent).join(" | "));
console.log("справа: " + R().map(b => b.textContent).join(" | "));

// «big» слева → кнопка «большой», которая на экране ВТОРАЯ (она от пары large).
// Для ученика обе надписи одинаковы: «big — большой» верно в обоих случаях.
const big = L().find(b => b.textContent === "big");
const same = R().filter(b => b.textContent === "большой");
click(big);
click(same[1]);
const red = same[1].classList.contains("bad") && big.classList.contains("bad");
console.log("\n«big» → вторая кнопка «большой»: " + (red ? "МИМО (обе кнопки красные)" : "принято"));
console.log("statUpdate: " + w.eval("JSON.stringify(window.__stat)"));

// Доиграем до конца — посмотреть, что увидит ученик и репетитор.
click(L().find(b => b.textContent === "big"));
click(same[0]);
click(L().find(b => b.textContent === "large"));
click(same[1]);
click(L().find(b => b.textContent === "cat"));
click(R().find(b => b.textContent === "кот"));
w.eval("(() => { const t = window.__exLastTimers; })()");
// exFinish уходит через exLater(…,500)
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await wait(700);
  console.log("итог подхода (correct,total): " + w.eval("JSON.stringify(window.__fin)"));
  console.log("экран: " + (doc.querySelector("#ex-stage h2") || {}).textContent
    + " / " + ((doc.querySelector("#ex-stage p") || {}).textContent || "").trim());

  // ---- 2. То же в живом упражнении «Соедини пары» (matching): словарь
  // ученика, где два слова переведены одинаково — обычное дело.
  w.eval(`
    state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
    state.dictionary = [
      { w: "big",   t: "большой", added: Date.now(), seen: 1 },
      { w: "large", t: "большой", added: Date.now(), seen: 1 },
      { w: "cat",   t: "кот",     added: Date.now(), seen: 1 },
      { w: "dog",   t: "собака",  added: Date.now(), seen: 1 },
      { w: "sun",   t: "солнце",  added: Date.now(), seen: 1 },
    ];
    window.__stat = []; window.__fin = [];
    openExercise("matching");
  `);
  console.log("\n— живое упражнение «Соедини пары»:");
  console.log("справа: " + R().map(b => b.textContent).join(" | "));
  const dupes = R().filter(b => b.textContent === "большой").length;
  console.log("одинаковых надписей «большой» на экране: " + dupes);

  // shuffled тождественный, значит порядок слева = порядок справа: кнопка
  // R[k] принадлежит паре L[k]. Значит точно известно, какая из двух
  // одинаковых «большой» чужая, — жмём именно её.
  const ls = L().map(b => b.textContent), rs = R().map(b => b.textContent);
  const k1 = rs.indexOf("большой"), k2 = rs.lastIndexOf("большой");
  console.log(`«большой» принадлежит парам: ${ls[k1]} (кнопка ${k1 + 1}) и ${ls[k2]} (кнопка ${k2 + 1})`);
  const other = L()[k1];                       // слово из ПЕРВОЙ пары
  click(other);
  click(R()[k2]);                              // вторая кнопка с той же надписью
  const bad = R()[k2].classList.contains("bad");
  console.log(`ученик соединил «${ls[k1]}» с кнопкой «большой» (${k2 + 1}-й): `
    + (bad ? "МИМО — красная" : "принято"));
  console.log("statUpdate: " + w.eval("JSON.stringify(window.__stat)"));
  if (bad) console.log(`словарная запись «${ls[k1]}» после верного по смыслу ответа: ` + w.eval(
    `JSON.stringify((d => ({status:d.status,forgot:d.forgot,knew:d.knew,due:d.due}))(state.dictionary.find(x=>x.w===${JSON.stringify(ls[k1])})))`));
  w.eval("window.shuffled = window.__shufOrig;");
  console.log(red ? "\n✗ ВОСПРОИЗВЕЛОСЬ" : "\n(не воспроизвелось)");
})();
