// «Ввод слова»: вопрос — русский перевод, ответ — ровно одно английское слово.
// Если у ученика несколько слов с одинаковым переводом (папка «Синонимы»),
// один и тот же вопрос выпадает несколько раз, и ученик, знающий ВСЕ три
// слова, получает две ошибки из трёх.
const { w } = require("./harness-full.js");
const doc = w.document;
const S = sel => doc.querySelector("#ex-stage " + sel);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const typeIn = v => { const i = S("#type-input"); i.value = v;
  i.dispatchEvent(new w.Event("input", { bubbles: true })); };

w.eval(`window.readGateMs = () => 0;
  window.__stat = []; window.__fin = [];
  const _s = statUpdate, _f = exFinish;
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _s(word, ok, v); };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
`);

w.eval(`
  state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w:"big",   t:"большой", added:Date.now(), seen:1, folders:["Синонимы"] },
    { w:"large", t:"большой", added:Date.now(), seen:1, folders:["Синонимы"] },
    { w:"huge",  t:"большой", added:Date.now(), seen:1, folders:["Синонимы"] },
  ];
  state.trainFolders = ["Синонимы"];
  window.__stat = []; window.__fin = [];
  openExercise("spelling");
`);
console.log("словарь ученика: big / large / huge — все «большой», папка «Синонимы»");
console.log("подход:", S(".test-counter").textContent.trim(), "вопросов\n");

const answers = ["big", "large", "huge"];   // ученик знает все три
let step = 0;
const play = () => {
  while (step < 6) {
    const q = S(".quiz-word");
    if (!q) break;
    const cnt = S(".test-counter").textContent.trim();
    const my = answers[step];
    typeIn(my);
    click(S("#type-check"));
    const fb = S("#type-feedback");
    console.log(`  ${cnt}  вопрос «${q.textContent.trim()}» → ученик пишет «${my}»: ${fb.textContent.trim()}`);
    step++;
    const nb = S("#type-next");
    if (nb) { click(nb); continue; }
    return false;   // верный ответ уезжает по таймеру — ждём
  }
  return true;
};
(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms || 60));
  for (let guard = 0; guard < 10; guard++) {
    if (play()) break;
    await tick(1000);
  }
  console.log("\n  statUpdate:", w.eval("JSON.stringify(window.__stat)"));
  console.log("  exFinish:", w.eval("JSON.stringify(window.__fin)"));
  console.log("  итог на экране:", (S("h2") ? S("h2").textContent : "") + " " + (S("p") ? S("p").textContent.trim() : ""));
  console.log("  словарь:", w.eval(`JSON.stringify(state.dictionary.map(d=>d.w+": knew="+(d.knew||0)+" forgot="+(d.forgot||0)+" due="+d.due))`));
})();
