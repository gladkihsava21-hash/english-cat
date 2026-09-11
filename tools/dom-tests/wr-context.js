// «Слово в контексте» (context). Два подозрения:
//  1) неверные варианты делаются подстановкой слова в ЧУЖОЙ пример.
//     Когда донор из той же темы, получается предложение, где слово
//     употреблено безупречно, — ученик выбирает его и получает ошибку;
//  2) в разборе после подхода вопрос подписан «Лишнее среди: …» —
//     подписью из совсем другого упражнения («Найди лишнее»).
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms));

// --- 1) откуда берутся «неверные» варианты -------------------------------
// Повторяем ровно ту же выборку, что и context(), но запоминаем слово-донор.
const donorsInfo = JSON.parse(E(`JSON.stringify((() => {
  const out = [];
  const all = LEVELS.flatMap(l => WORDS[l] || []).filter(x => x.ex);
  for (let n = 0; n < 60; n++) {
    const pool = levelPool(5, ["ex"]);
    pool.forEach(p => {
      const donors = shuffled(all.filter(x => x.w !== p.w && x.ex))
        .map(x => {
          const re = new RegExp("\\\\b" + x.w.slice(0, Math.max(3, x.w.length - 2)) + "[a-z]*", "i");
          return re.test(x.ex) ? { from: x.w, cat: x.cat, s: x.ex.replace(re, p.w) } : null;
        })
        .filter(Boolean).slice(0, 2);
      if (donors.length < 2) return;
      out.push({ w: p.w, t: p.t, cat: p.cat, right: p.ex, donors });
    });
  }
  return out;
})())`));

let sameCat = 0, total = 0;
const showcase = [];
donorsInfo.forEach(r => r.donors.forEach(d => {
  total++;
  if (d.cat && r.cat && d.cat === r.cat) {
    sameCat++;
    if (showcase.length < 12) showcase.push(r.w + " (" + r.t + "): верным считается «" + r.right
      + "», ошибкой — «" + d.s + "» (донор «" + d.from + "», та же тема «" + d.cat + "»)");
  }
}));
console.log(`Неверных вариантов собрано: ${total}; из них подставлено в пример слова ТОЙ ЖЕ темы: ${sameCat}`);
showcase.forEach(x => console.log("   ·", x));

// --- 2) как вопрос подписан в разборе ------------------------------------
console.log("\nТекст вопроса, который увидит разбор:",
  JSON.stringify(E(`exQuestionText({ promptHTML: icon("context", 44), prompt: undefined })`)));

(async () => {
  E(`readGateMs = () => 0`);          // пауза на чтение тесту мешает, проверяем не её
  E(`localStorage.clear(); exLog = [];`);
  E(`openExercise("context")`);
  await tick(30);
  const opts = [...doc.querySelectorAll("#mcq-options .mcq-option")];
  console.log("вариантов на экране:", opts.length);
  if (opts.length) {
    click(opts[0]);
    await tick(30);
    console.log("запись в журнале подхода (exLog[0]):");
    console.log("  " + E(`JSON.stringify(exLog[0])`));
    // и как это выглядит на экране «Готово»
    E(`exFinish(0, 1)`);
    const rev = doc.querySelector(".ex-review-q");
    console.log("в разборе на экране:", rev ? rev.textContent.replace(/\s+/g, " ").trim() : "(нет)");
  }
})();
