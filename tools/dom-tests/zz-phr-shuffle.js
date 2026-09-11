// shuffled() = [...arr].sort(() => Math.random() - 0.5) — это не перемешивание.
// runMCQ всегда строит options = shuffled([верный, ...отвлекающие]), то есть
// верный ответ ВСЕГДА стоит первым во входном массиве, и смещение сортировки
// садится ровно на его позицию.
const { w } = require("./harness-full.js");
const E = s => w.eval(s);
const pct = h => { const N = h.reduce((a, b) => a + b, 0);
  return h.map((n, k) => `${k + 1}-й ${(n / N * 100).toFixed(1)}%`).join(", "); };

console.log("Куда попадает элемент, стоявший ПЕРВЫМ (4 варианта, 200 000 прогонов)\n");
console.log("  shuffled() проекта, генератор стенда:");
console.log("   ", E(`(() => { const h=[0,0,0,0];
  for (let i=0;i<200000;i++) h[shuffled(["A","B","C","D"]).indexOf("A")]++;
  return h.map((n,k)=>(k+1)+"-й "+(n/2000).toFixed(1)+"%").join(", "); })()`));

const sortShuffle = a => [...a].sort(() => Math.random() - 0.5);
const fisherYates = a => { const b = [...a];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]]; } return b; };
const run = f => { const h = [0, 0, 0, 0];
  for (let i = 0; i < 200000; i++) h[f(["A", "B", "C", "D"]).indexOf("A")]++; return h; };
console.log("  та же сортировка на штатном Math.random (не генератор стенда):");
console.log("   ", pct(run(sortShuffle)));
console.log("  честный Фишер–Йетс для сравнения:");
console.log("   ", pct(run(fisherYates)));

console.log("\nТо же на живых вопросах «Не буквально» и «Что с чем» — см. zz-phr-inv.js, п.1.");
console.log("Ученик, который жмёт первый вариант не читая, получает ~36% вместо 25%.");
