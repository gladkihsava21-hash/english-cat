// «Категории»: ученик в итоге разложил ВСЕ слова по темам верно.
// Смотрим, что упражнение объявит в конце и что уедет репетитору.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], xp: 0 };
  const _f = exFinish, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, cat: x.cat, added: Date.now(), seen: 1 }));
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Открыли «Категории»");
  w.eval('openExercise("categories")');
  const tiles = [...doc.querySelectorAll(".cat-word")];
  const boxes = [...doc.querySelectorAll(".cat-box")];
  ok(tiles.length > 0 && boxes.length === 2, `слов ${tiles.length}, коробок ${boxes.length}`);

  console.log("\n2. По каждому слову: один раз промахнулись мимо темы, потом положили верно");
  // Верную коробку узнаём по подписи темы — ровно как её видит ученик.
  const placeAll = () => w.eval(`(function () {
    const boxes = [...document.querySelectorAll(".cat-box")];
    const out = { miss: 0, hit: 0 };
    for (const tile of [...document.querySelectorAll(".cat-word")]) {
      if (tile.disabled) continue;
      // какая коробка верная — знает сама игра; повторяем её выбор через
      // подпись: слово из темы CATEGORY_NAMES[cat] лежит в коробке с этим data-cat
      const rec = state.dictionary.find(d => d.w === tile.textContent)
               || Object.values(WORDS).flat().find(d => d.w === tile.textContent);
      const right = boxes.find(b => b.dataset.cat === (rec && rec.cat));
      const wrong = boxes.find(b => b !== right);
      tile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      if (wrong) { wrong.dispatchEvent(new MouseEvent("click", { bubbles: true })); out.miss++; }
      if (right) { right.dispatchEvent(new MouseEvent("click", { bubbles: true })); out.hit++; }
    }
    return out;
  })()`);
  const res = placeAll();
  console.log(`  промахов: ${res.miss}, верных раскладок: ${res.hit}`);

  // Все ли слова лежат в коробках и все ли — в СВОЕЙ?
  const check = w.eval(`(function () {
    const boxes = [...document.querySelectorAll(".cat-box")];
    let inBoxes = 0, misplaced = 0;
    for (const b of boxes) {
      for (const chip of b.querySelectorAll(".cat-chip")) {
        inBoxes++;
        const rec = state.dictionary.find(d => d.w === chip.textContent)
                 || Object.values(WORDS).flat().find(d => d.w === chip.textContent);
        if (!rec || rec.cat !== b.dataset.cat) misplaced++;
      }
    }
    const left = [...document.querySelectorAll(".cat-word")].filter(x => !x.disabled).length;
    return { inBoxes, misplaced, left };
  })()`);
  ok(check.misplaced === 0 && check.left === 0,
     `на экране всё разложено верно: в коробках ${check.inBoxes}, не в своей теме ${check.misplaced}, осталось ${check.left}`);

  await tick(200);   // exLater(exFinish, 500) — ждём итогов
  await tick(600);

  const log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const finish = log.finish[log.finish.length - 1] || [];
  const shown = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").match(/Верно \d+ из \d+/);
  console.log("  exFinish: " + JSON.stringify(log.finish) + ", на экране: " + (shown ? shown[0] : "—"));
  ok(finish[0] === finish[1],
     `итог совпадает с тем, что на экране: exFinish(${finish[0]}, ${finish[1]}) при ${check.inBoxes} верно разложенных`);

  console.log("  экран итогов целиком: «" +
    doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim().slice(0, 160) + "»");

  console.log("\n3. Одна ошибка, но ткнули в ту же неверную тему трижды");
  w.eval("window.__log = { finish: [], xp: 0 };");
  w.eval('openExercise("categories")');
  const res2 = w.eval(`(function () {
    const boxes = [...document.querySelectorAll(".cat-box")];
    const tiles = [...document.querySelectorAll(".cat-word")];
    const recOf = t => state.dictionary.find(d => d.w === t)
                    || Object.values(WORDS).flat().find(d => d.w === t);
    let taps = 0;
    tiles.forEach((tile, n) => {
      const rec = recOf(tile.textContent);
      const right = boxes.find(b => b.dataset.cat === (rec && rec.cat));
      const wrong = boxes.find(b => b !== right);
      tile.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      // только на ПЕРВОМ слове ошибаемся — но тыкаем трижды, как ребёнок,
      // которому коробка мигнула красным и «не сработала»
      if (n === 0 && wrong) for (let k = 0; k < 3; k++) {
        wrong.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        taps++;
      }
      right.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    return { taps, words: tiles.length };
  })()`);
  await tick(700);
  const log2 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const f2 = log2.finish[log2.finish.length - 1] || [];
  console.log(`  ошибочных нажатий по одной и той же коробке: ${res2.taps}, слов: ${res2.words}`);
  console.log("  exFinish: " + JSON.stringify(f2));
  ok(f2[0] === res2.words - 1,
     `одна ошибка стоит одного балла: ждали ${res2.words - 1} из ${res2.words}, получили ${f2[0]} из ${f2[1]}`);

  console.log("\nошибок JS: " + errors.length + (errors.length ? " " + errors.join(" | ") : ""));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
