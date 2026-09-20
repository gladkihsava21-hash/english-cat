// Разведка: уровни, дубли слов между уровнями, поведение levelPool/trainPool.
const { w } = require("./harness-full.js");

console.log("LEVELS =", w.eval("JSON.stringify(LEVELS)"));
console.log("studyLevel() =", w.eval("studyLevel()"));
console.log("state.level =", w.eval("state.level"));

// дубли внутри одного уровня и между соседними
console.log(w.eval(`(() => {
  const out = [];
  for (const l of LEVELS) {
    const seen = new Set(), dup = new Set();
    WORDS[l].forEach(x => { const k = x.w.toLowerCase(); if (seen.has(k)) dup.add(k); seen.add(k); });
    out.push(l + ": " + WORDS[l].length + " слов, дублей внутри " + dup.size + (dup.size ? " (" + [...dup].slice(0,5) + ")" : ""));
  }
  for (let i = 0; i + 1 < LEVELS.length; i++) {
    const a = new Set(WORDS[LEVELS[i]].map(x => x.w.toLowerCase()));
    const both = WORDS[LEVELS[i+1]].filter(x => a.has(x.w.toLowerCase())).map(x => x.w);
    out.push(LEVELS[i] + "∩" + LEVELS[i+1] + ": " + both.length + (both.length ? " (" + both.slice(0,5) + ")" : ""));
  }
  return out.join("\\n");
})()`));

// верхний уровень: nextLvl === lvl?
console.log(w.eval(`(() => {
  const lvl = LEVELS[LEVELS.length - 1];
  const next = LEVELS[Math.min(LEVELS.indexOf(lvl) + 1, LEVELS.length - 1)];
  return "верхний уровень " + lvl + " → nextLvl " + next + " (совпадают: " + (lvl === next) + ")";
})()`));
