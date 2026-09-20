// СКЕПТИК: без всяких галочек — обычный словарь, обычная игра «Категории».
// Как часто на экране оказывается слово, чья пометка темы заведомо не та,
// И при этом на экране есть коробка с ЕГО настоящей темой.
const { w } = require("./harness-full.js");
const doc = w.document;
const seedRnd = s => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

// пометка в банке -> куда слово относится на самом деле (вычитано руками)
const MIS = {
  head: ["animals", "body"], body: ["animals", "body"], face: ["animals", "body"],
  skin: ["animals", "body"], shoulder: ["animals", "body"], toe: ["animals", "body"],
  cave: ["body", "nature"], north: ["body", null], southern: ["body", null],
  northern: ["body", null], western: ["body", null], fax: ["body", "tech"],
  cold: ["travel", "weather"], fever: ["travel", "health"], cure: ["travel", "health"],
  ski: ["weather", "sports"], sailing: ["weather", "sports"], pipe: ["weather", null],
};

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  w.eval(`
    state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
      .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
    state.trainWords = []; state.trainFolders = []; homeworkScope = null;
  `);
  let runs = 0, withMis = 0, trap = 0;
  const traps = [];
  for (let i = 0; i < 150; i++) {
    w.Math.random = seedRnd((i + 3) * 2654435761);
    w.eval('openExercise("categories")');
    await tick(2);
    const boxes = [...doc.querySelectorAll(".cat-box")].map(b => b.dataset.cat);
    const words = [...doc.querySelectorAll(".cat-word")];
    if (boxes.length < 2 || !words.length) continue;
    runs++;
    let mis = false, tr = false;
    words.forEach(el => {
      const m = MIS[el.textContent];
      if (!m) return;
      mis = true;
      // ловушка: настоящая тема слова — ВТОРАЯ коробка на экране
      if (m[1] && boxes.includes(m[1]) && boxes.includes(m[0])) {
        tr = true;
        if (traps.length < 6) traps.push(el.textContent + " (" + el.title + ") — в банке "
          + m[0] + ", на экране обе коробки: " + boxes.join(" + "));
      }
    });
    if (mis) withMis++;
    if (tr) trap++;
  }
  console.log("Прогонов «Категорий» с обычным словарём: " + runs);
  console.log("  где на экране есть слово с заведомо чужой пометкой: " + withMis + " (" + Math.round(withMis*100/runs) + "%)");
  console.log("  где ОБЕ коробки на экране и ученик по смыслу обязан ошибиться: " + trap + " (" + Math.round(trap*100/runs) + "%)");
  traps.forEach(t => console.log("    • " + t));
  process.exit(0);
})();
