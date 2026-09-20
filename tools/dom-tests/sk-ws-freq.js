// СКЕПТИК: как часто перевёртыш вообще попадает в одну сетку у обычного
// ученика (без принудительного словаря из четырёх слов).
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

const seedRnd = s => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  const RUNS = Number(process.env.RUNS || 60);

  const scenarios = [
    { name: "весь словарь (40 своих слов, добор из банка A2+B1)", setup: `
        state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 40)
          .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
        state.trainWords = []; state.trainFolders = []; homeworkScope = null;` },
    { name: "весь словарь: 200 слов ученика, без добора", setup: `
        state.dictionary = [...WORDS.A1, ...WORDS.A2, ...WORDS.B1].slice(0, 200)
          .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
        state.trainWords = []; state.trainFolders = []; homeworkScope = null;` },
  ];

  for (const sc of scenarios) {
    w.eval(sc.setup);
    let rounds = 0, roundsWithPair = 0;
    const examples = new Set();
    for (let i = 0; i < RUNS; i++) {
      w.Math.random = seedRnd((i + 7) * 2654435761);
      w.eval('openExercise("wordsearch")');
      await tick(5);
      for (let r = 0; r < 6; r++) {
        const t = [...doc.querySelectorAll(".ws-target")].map(x => x.textContent);
        if (!t.length) break;
        rounds++;
        const set = new Set(t);
        let hit = null;
        for (const word of t) { const rev = [...word].reverse().join(""); if (rev !== word && set.has(rev)) hit = word + "/" + rev; }
        if (hit) { roundsWithPair++; examples.add(hit); }
        const nb = doc.getElementById("ws-next");
        if (!nb) break;
        click(nb);
        await tick(2);
      }
    }
    console.log("\n" + sc.name);
    console.log("  сеток осмотрено: " + rounds + ", с перевёртышем внутри: " + roundsWithPair
      + " (" + (rounds ? (roundsWithPair * 100 / rounds).toFixed(1) : 0) + "%)");
    console.log("  какие пары встречались: " + ([...examples].join(", ") || "—"));
  }
  process.exit(0);
})();
