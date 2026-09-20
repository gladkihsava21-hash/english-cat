// Папка с выражениями: уровневый фильтр в _phrasePool стоит ДО фильтра по
// папке. Проверяем, что будет, если ученица сложила в папку выражения не
// своего уровня — ровно так, как их отдаёт «+ Фразовые глаголы, идиомы,
// сочетания» в словаре (там список без оглядки на уровень).
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const st = () => doc.getElementById("ex-stage");
const txt = () => (st().textContent || "").replace(/\s+/g, " ").trim();

const put = (kind, level, folder, howMany) => w.eval(`(function () {
  const src = PHRASES[${JSON.stringify(kind)}].filter(x => x.level === ${JSON.stringify(level)}).slice(0, ${howMany});
  state.dictionary = src.map(x => ({ w: x.w, t: x.t, ex: x.ex, kind: x.kind, level: x.level,
                                     parts: x.parts, literal: x.literal, added: Date.now(), seen: 1,
                                     folders: [${JSON.stringify(folder)}] }));
  state.folders = [${JSON.stringify(folder)}];
  state.trainFolders = [${JSON.stringify(folder)}];
  state.trainWords = [];
  return src.map(x => x.w);
})()`);

const show1 = (id, title) => {
  w.eval(`openExercise(${JSON.stringify(id)})`);
  console.log(`   ${id}: ${txt().slice(0, 160)}`);
};

console.log("Ученик A2. В папке «Сочетания» — 12 коллокаций уровня B2,");
console.log("которые он сам добавил из словаря.");
let words = put("colloc", "B2", "Сочетания", 12);
console.log("   в папке:", words.join(", "));
console.log("   studyLevel:", w.eval("studyLevel()"));
console.log("   trainingScope размер:", w.eval("trainingScope() ? trainingScope().size : 'null'"));
console.log("   _phrasePool('colloc',8,['parts','t']).length =",
  w.eval("EX_RUNNERS._phrasePool('colloc', 8, ['parts','t']).length"));
show1("collocpair");

console.log("\nТе же 12 коллокаций, но уровня B1 (сосед сверху от A2):");
words = put("colloc", "B1", "Сочетания", 12);
console.log("   _phrasePool('colloc',8,['parts','t']).length =",
  w.eval("EX_RUNNERS._phrasePool('colloc', 8, ['parts','t']).length"));
show1("collocpair");

console.log("\nПапка «Идиомы»: 12 идиом уровня C1, ученик A2:");
words = put("idioms", "C1", "Идиомы", 12);
console.log("   в папке:", words.slice(0, 5).join(", "), "…");
console.log("   _phrasePool('any',8,['literal','t']).length =",
  w.eval("EX_RUNNERS._phrasePool('any', 8, ['literal','t']).length"));
show1("notliteral");
show1("buildphrase");

console.log("\nПапка «Фразовые глаголы»: 12 phrasal уровня B2, ученик A2:");
words = put("phrasal", "B2", "Фразовые глаголы", 12);
console.log("   в папке:", words.slice(0, 5).join(", "), "…");
show1("buildphrase");
show1("notliteral");

console.log("\nКонтроль: те же phrasal уровня A2 (свой уровень):");
words = put("phrasal", "A2", "Фразовые глаголы", 12);
show1("buildphrase");
process.exit(0);
