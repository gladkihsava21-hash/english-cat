// разведка: может ли в «Слово и картинка» рядом с верным словом встать
// его синоним (одно и то же на фото), т.е. вторая правильная кнопка
const { w } = require("./harness-full.js");

const out = w.eval(`(() => {
  const named = new Set(Object.keys(WORD_PHOTOS));
  const all = LEVELS.flatMap(l => WORDS[l]).filter(x => named.has(x.w.toLowerCase()));
  // ровно тот фильтр, что стоит в picture()
  const pairs = [];
  for (const p of all) {
    for (const x of all) {
      if (x.w === p.w) continue;
      if (x.t === p.t) continue;
      if (wordArt(x.w, x.cat) === wordArt(p.w, p.cat)) continue;
      // синонимы: пересекаются значимые слова перевода
      const a = ruTokens(p.t), b = ruTokens(x.t);
      const common = [...b].filter(t => a.has(t));
      if (common.length) pairs.push([p.w, p.t, x.w, x.t, common.join("/")]);
    }
  }
  return JSON.stringify({ photoWords: all.length, bad: pairs.length, sample: pairs.slice(0, 30) });
})()`);
console.log(out);
