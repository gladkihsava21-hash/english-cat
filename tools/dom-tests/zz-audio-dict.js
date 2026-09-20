// «На слух»: диктант. Проверяем сверку ответа — не объявляется ли
// верно записанная фраза ошибкой.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [], stat: [], xp: 0 };");

console.log("1. Чистая сверка dictationDiff: ученик написал фразу ЗНАК В ЗНАК");
const cases = [
  ["It’s a bone.", "It's a bone."],                       // банк A1, слово bone
  ["It’s the habit.", "It's the habit."],                 // банк A1, слово habit
  ["There’s a flea on the dog.", "There's a flea on the dog."],
  ["I'm applying for a summer job at the café.", "I'm applying for a summer job at the cafe."],
  ["Seoul has 2 international airports.", "Seoul has two international airports."],
  ["I have breakfast at 8 a.m.", "I have breakfast at 8 am."],
  ["She lives in a small village.", "She lives in a small village."],   // контроль
];
for (const [sample, typed] of cases) {
  const d = JSON.parse(w.eval(`JSON.stringify(dictationDiff(${JSON.stringify(typed)}, ${JSON.stringify(sample)}))`));
  console.log(`  ${d.ok ? "верно " : "ОШИБКА"} | образец ${JSON.stringify(sample)}`);
  console.log(`           | ученик  ${JSON.stringify(typed)}`);
  if (!d.ok) console.log(`           | «не расслышал»: ${JSON.stringify(d.missed)}, лишние: ${JSON.stringify(d.extra)}`);
}

console.log("\n2. Тот же случай целиком: домашка репетитора со словом bone");
(async () => {
  // Репетитор задала слово bone — startHomeworkLesson кладёт его в словарь
  // и открывает диктант (task.game === "dictation").
  w.eval(`
    const rec = WORDS.A1.find(x => x.w === "bone");
    state.dictionary = [{ w: rec.w, t: rec.t, ex: rec.ex, exr: rec.exr, level: "A1",
                          added: Date.now(), seen: 1, status: "learning", knew: 3 }];
    state.taskResults = {};
    homeworkContext = { id: "hw1", title: "Слова к четвергу" };
    homeworkScope = ["bone"];
  `);
  reset();
  w.eval('openExercise("dictation")');
  await tick(60);
  const label = doc.querySelector("#ex-stage .quiz-label");
  console.log("  экран:", label && label.textContent.trim());
  const ta = doc.getElementById("type-input");
  // Ученик услышал «It's a bone» и написал ровно это — обычной клавиатурой,
  // то есть прямым апострофом.
  ta.value = "It's a bone.";
  click(doc.getElementById("type-check"));
  await tick(60);
  const fb = doc.getElementById("type-feedback");
  console.log("  вердикт:", JSON.stringify(fb.textContent.trim()));
  const review = doc.querySelector("#ex-stage .dict-review");
  console.log("  разбор :", review ? JSON.stringify(review.textContent.replace(/\s+/g, " ").trim()) : "—");
  // доигрываем подход до конца
  let guard = 0;
  while (guard++ < 20 && !log().finish.length) {
    const nb = doc.getElementById("type-next");
    if (nb) { click(nb); await tick(40); continue; }
    const inp = doc.getElementById("type-input");
    if (inp && !inp.disabled) { inp.value = "zzz"; click(doc.getElementById("type-check")); }
    await tick(40);
  }
  const l = log();
  console.log("  итог подхода:", JSON.stringify(l.finish));
  console.log("  statUpdate  :", JSON.stringify(l.stat));
  console.log("  словарь bone:", w.eval("JSON.stringify(state.dictionary[0])"));
  console.log("  таблица репетитора:", w.eval("JSON.stringify(state.taskResults)"));
  console.log("  ошибки обработчиков:", errors);
  process.exit(0);
})();
