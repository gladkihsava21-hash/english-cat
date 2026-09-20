// СКЕПТИК: папка/домашка на 8 слов, в которой есть пара-перевёртыш.
// Добора из банка тут нет — пул ровно эти слова.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const seedRnd = s => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));
  const RUNS = 60;
  w.eval(`
    const eight = ["pan","nap","milk","bread","table","green","water","horse"];
    state.dictionary = eight.map(x => { const i = wordInfo(x) || { w:x, t:x };
      return { w: i.w, t: i.t, ex: i.ex, added: Date.now(), seen: 1 }; });
    state.trainWords = []; state.trainFolders = [];
    homeworkScope = eight.slice();
    homeworkContext = { id: "hw-x", title: "Домашка" };
    state.taskResults = {};
  `);
  let rounds = 0, withPair = 0, runsWithPair = 0;
  for (let i = 0; i < RUNS; i++) {
    w.Math.random = seedRnd((i + 5) * 2654435761);
    w.eval('openExercise("wordsearch")');
    await tick(5);
    let any = false;
    for (let r = 0; r < 6; r++) {
      const t = [...doc.querySelectorAll(".ws-target")].map(x => x.textContent);
      if (!t.length) break;
      rounds++;
      const set = new Set(t);
      for (const word of t) { const rev = [...word].reverse().join(""); if (rev !== word && set.has(rev)) { withPair++; any = true; break; } }
      const nb = doc.getElementById("ws-next"); if (!nb) break;
      click(nb); await tick(2);
    }
    if (any) runsWithPair++;
  }
  console.log("домашка/папка из 8 слов с парой pan/nap:");
  console.log("  подходов: " + RUNS + ", где хоть одна сетка содержит обоих: " + runsWithPair
    + " (" + (runsWithPair * 100 / RUNS).toFixed(0) + "%)");
  console.log("  сеток: " + rounds + ", с парой внутри: " + withPair
    + " (" + (withPair * 100 / rounds).toFixed(0) + "%)");
  process.exit(0);
})();
