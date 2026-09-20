// Как часто в «Сопоставлении» в одном подходе оказываются два слова
// с неразличимым переводом. Меряем два уровня: буквально одинаковый
// текст кнопки и пересечение значимых слов перевода (тот же критерий,
// которым пользуются distractors() и pickDistinctT()).
const { w } = require("./harness-full.js");
const doc = w.document;
w.eval('window.readGateMs = () => 0;');

// Сколько в банке пар слов, чьи переводы пересекаются по значимому слову
console.log("пар слов в банке с одинаковым текстом перевода:",
  w.eval(`(() => { const m = {}; LEVELS.forEach(l => WORDS[l].forEach(x => (m[x.t] = m[x.t] || new Set()).add(x.w)));
    return Object.values(m).filter(s => s.size > 1).reduce((a, s) => a + s.size * (s.size - 1) / 2, 0); })()`));

const DICTS = {
  "первые 60 слов A1+A2": `[...WORDS.A1.slice(0,30), ...WORDS.A2.slice(0,30)]`,
  "случайные 60 слов A1..B2": `shuffled([...WORDS.A1, ...WORDS.A2, ...WORDS.B1, ...WORDS.B2]).slice(0,60)`,
};

for (const [label, expr] of Object.entries(DICTS)) {
  const stats = { same: 0, token: 0, runs: 0, sets: new Set() };
  for (let n = 0; n < 300; n++) {
    // новый словарь на каждый заход: у ученика он свой, а не один на всех
    w.eval(`state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
            state.dictionary = ${expr}.map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
            openExercise("matching");`);
    const texts = [...doc.querySelectorAll("#pairs-r .pair-item")].map(b => b.textContent.trim());
    stats.runs++;
    stats.sets.add([...texts].sort().join("|"));
    if (new Set(texts).size !== texts.length) stats.same++;
    const tok = texts.map(t => w.eval(`JSON.stringify([...ruTokens(${JSON.stringify(t)})])`)).map(JSON.parse);
    let clash = false;
    for (let a = 0; a < tok.length && !clash; a++)
      for (let b = a + 1; b < tok.length && !clash; b++)
        if (tok[a].some(x => tok[b].includes(x))) clash = true;
    if (clash) stats.token++;
  }
  console.log(`${label}: подходов ${stats.runs}, разных наборов ${stats.sets.size},`
    + ` с двумя одинаковыми кнопками ${stats.same}, с пересекающимся переводом ${stats.token}`);
}
