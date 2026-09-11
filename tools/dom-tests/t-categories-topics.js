// «Категории»: темы, по которым игра раскладывает слова, должны быть
// правдой. Раньше head/body/face/skin лежали в банке с темой «Животные»,
// и ученик, положивший «тело» в коробку «Тело», получал «неверно».
//
// После чистки банка (22 слова перекрашены) и общего списка тем для игр
// проверяем две вещи:
//   1. части тела — в «Теле», и одну тему игра на две коробки не делит,
//      а честно говорит, почему не может;
//   2. словарь из «тела» и «животных»: каждое слово, положенное по
//      смыслу, засчитывается — итог «8 из 8».
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms));

w.eval(`
  window.__log = { finish: [] };
  const _f = exFinish;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.__use = function (pick) {
    state.dictionary = pick.map(x => {
      const i = wordInfo(x);
      return { w: i.w, t: i.t, ex: i.ex, added: Date.now(), seen: 1 };
    });
    state.trainWords = pick.slice();          // галочки: ровно эти слова
    window.__log.finish = [];
    return JSON.stringify(pick.map(x => [x, wordInfo(x).t, wordInfo(x).cat]));
  };
`);

(async () => {
  console.log("\n1. Только части тела: head, body, face, skin, hand, leg, nose, ear");
  const tags1 = JSON.parse(w.eval(`__use(["head","body","face","skin","hand","leg","nose","ear"])`));
  tags1.forEach(([a, b, c]) => console.log("    " + a + " — " + b + " — " + c));
  ok(tags1.every(([, , c]) => c === "body"),
     "все восемь — в теме «Тело» (раньше head/body/face/skin были «Животными»)");
  w.eval('openExercise("categories")');
  await tick(30);
  const text1 = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
  ok(doc.querySelectorAll(".cat-box").length === 0, "коробок нет: одну тему на две не разложить");
  ok(/нужны слова хотя бы из двух/.test(text1), "игра объясняет, почему не может: «" + text1.slice(0, 80) + "…»");

  console.log("\n2. Тело и животные: кладём каждое слово по смыслу");
  const body = ["head", "face", "hand", "nose"], anim = ["cat", "dog", "horse", "cow"];
  const tags2 = JSON.parse(w.eval(`__use(${JSON.stringify([...body, ...anim])})`));
  tags2.forEach(([a, b, c]) => console.log("    " + a + " — " + b + " — " + c));
  ok(tags2.every(([a, , c]) => c === (body.includes(a) ? "body" : "animals")),
     "в банке каждое слово в своей теме");
  w.eval('openExercise("categories")');
  await tick(30);
  const boxes = [...doc.querySelectorAll(".cat-box")];
  const cats = boxes.map(b => b.dataset.cat).sort();
  ok(JSON.stringify(cats) === JSON.stringify(["animals", "body"]),
     "на экране коробки «Тело» и «Животные»: " + JSON.stringify(cats));
  for (const wd of [...body, ...anim]) {
    const tile = [...doc.querySelectorAll(".cat-word")].find(x => x.textContent.trim() === wd && !x.disabled);
    const box = boxes.find(b => b.dataset.cat === (body.includes(wd) ? "body" : "animals"));
    if (!tile || !box) { ok(false, "не нашёл на экране слово или коробку для «" + wd + "»"); continue; }
    click(tile); click(box);
    await tick(10);
  }
  await tick(900);
  const fin = JSON.parse(w.eval("JSON.stringify(window.__log.finish)"));
  ok(fin.length === 1 && fin[0][0] === 8 && fin[0][1] === 8,
     "всё разложено по смыслу — «Верно 8 из 8»: " + JSON.stringify(fin));

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "«Категории» раскладывают по правдивым темам"));
  process.exit(fails ? 1 : 0);
})();
