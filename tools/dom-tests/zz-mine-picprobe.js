// «Слово и картинка»: ловушки берутся из слов с фото, отсеиваются только
// по ТОЧНОМУ совпадению перевода и по эмодзи. Ищем пары, где ловушка
// значит то же самое, что правильный ответ.
const { w } = require("./harness-full.js");
const out = w.eval(`(() => {
  const named = new Set(Object.keys(WORD_PHOTOS));
  const all = LEVELS.flatMap(l => (WORDS[l]||[]).map(x => ({...x, level: l})))
                    .filter(x => named.has(x.w.toLowerCase()));
  const res = [];
  for (const p of all) {
    for (const x of all) {
      if (x.w === p.w) continue;
      if (x.t === p.t) continue;                                  // отсев упражнения
      if (wordArt(x.w, x.cat) === wordArt(p.w, p.cat)) continue;  // отсев упражнения
      const a = ruTokens(p.t), b = ruTokens(x.t);
      const common = [...a].filter(t => b.has(t));
      if (common.length) res.push(p.w + " («" + p.t + "», " + p.level + ")  ←ловушка→  "
        + x.w + " («" + x.t + "», " + x.level + ")   общее: " + common.join(","));
    }
  }
  return JSON.stringify({ words: all.length, danger: res.length, sample: res.slice(0, 25) }, null, 1);
})()`);
console.log(out);
