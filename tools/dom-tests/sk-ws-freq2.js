// СКЕПТИК: словарь ученика, в котором ЕСТЬ правдоподобная пара-перевёртыш
// (pan/nap, wolf/flow, tip/pit) среди обычных слов. Никаких галочек.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const seedRnd = s => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  const RUNS = Number(process.env.RUNS || 80);

  const cases = [
    { name: "30 слов, среди них pan/nap, tip/pit, wolf/flow", size: 30 },
    { name: "12 слов (новичок), среди них pan/nap, tip/pit, wolf/flow", size: 12 },
  ];
  for (const c of cases) {
    w.eval(`
      const extra = ["pan","nap","tip","pit","wolf","flow"];
      const base = [...WORDS.A1, ...WORDS.A2].filter(x => !extra.includes(x.w)).slice(0, ${c.size} - 6);
      const picks = extra.map(x => wordInfo(x)).filter(Boolean).concat(base);
      state.dictionary = picks.map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
      state.trainWords = []; state.trainFolders = []; homeworkScope = null;
    `);
    const have = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>d.w))"));
    let rounds = 0, withPair = 0, runsWithPair = 0;
    const ex = new Set();
    for (let i = 0; i < RUNS; i++) {
      w.Math.random = seedRnd((i + 101) * 2654435761);
      w.eval('openExercise("wordsearch")');
      await tick(5);
      let any = false;
      for (let r = 0; r < 6; r++) {
        const t = [...doc.querySelectorAll(".ws-target")].map(x => x.textContent);
        if (!t.length) break;
        rounds++;
        const set = new Set(t);
        for (const word of t) { const rev = [...word].reverse().join(""); if (rev !== word && set.has(rev)) { withPair++; any = true; ex.add(word + "/" + rev); break; } }
        const nb = doc.getElementById("ws-next");
        if (!nb) break;
        click(nb); await tick(2);
      }
      if (any) runsWithPair++;
    }
    console.log("\n" + c.name + "  (в словаре " + have.length + " слов)");
    console.log("  подходов: " + RUNS + ", из них хоть одна сетка с перевёртышем: " + runsWithPair
      + " (" + (runsWithPair * 100 / RUNS).toFixed(0) + "%)");
    console.log("  сеток: " + rounds + ", с перевёртышем: " + withPair
      + " (" + (rounds ? (withPair * 100 / rounds).toFixed(1) : 0) + "%)  пары: " + ([...ex].join(", ") || "—"));
  }
  process.exit(0);
})();
