// runType: подсказка («C… (3 буквы)» в «Собери слово», перевод в
// словообразовании) нигде не отмечается. Ответ после подсказки идёт
// как полноценный: award(15), statUpdate(word, true, verified=true) →
// srsReview начисляет checked, то есть слово считается ПРОВЕРЕННЫМ и
// закрывает домашку. В runPairs для этого случая есть verified=false
// (пара, найденная перебором), в runType — нет.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

w.eval(`
  window.__xp = 0; window.__stat = [];
  const _a = award, _s = statUpdate;
  window.award = function (n) { window.__xp += n; return _a(n); };
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok, v === undefined ? true : !!v]); return _s(word, ok, v); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = ["cat кот","dog собака","sun солнце","book книга","milk молоко","red красный"]
    .map(s => ({ w: s.split(" ")[0], t: s.split(" ")[1], added: Date.now(), seen: 1 }));
  openExercise("spelling");
`);

(async () => {
  await wait(60);
  const prompt = (doc.querySelector("#ex-stage .quiz-word") || {}).textContent.trim();
  console.log("вопрос: " + prompt);
  click(doc.getElementById("type-hint"));
  const hint = (doc.getElementById("type-feedback") || {}).textContent;
  console.log("ученик нажал «Подсказка»: " + hint);
  // Пишем ответ, зная первую букву и длину
  const answer = w.eval(`JSON.stringify((state.dictionary.find(d => d.t === ${JSON.stringify(prompt.replace(/[«»]/g, ""))}) || {}).w)`);
  const word = JSON.parse(answer);
  doc.getElementById("type-input").value = word;
  click(doc.getElementById("type-check"));
  await wait(60);
  console.log("ответ: " + word + " → " + (doc.getElementById("type-feedback") || {}).textContent);
  console.log("award: " + w.eval("window.__xp") + " (столько же, сколько без подсказки)");
  console.log("statUpdate: " + w.eval("JSON.stringify(window.__stat)") + "  ← третье поле verified");
  console.log("запись слова: " + w.eval(
    `JSON.stringify((d=>({knew:d.knew,checked:d.checked,reps:d.reps,interval:d.interval,status:d.status}))(state.dictionary.find(x=>x.w===${JSON.stringify(word)})))`));
  console.log("\nдля сравнения — runPairs помечает найденное перебором как verified=false,");
  console.log("и такое слово не идёт в checked (домашку не закрывает).");
})();
