// Ученик ушёл с экрана посреди подхода: ничего не должно засчитаться
// задним числом, и подход не должен закрыться из-за чужого таймера.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];

w.eval(`window.readGateMs = () => 0;
  window.__fin = []; window.__stat = []; window.__xp = 0;
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _s(word, ok, v); };
  window.award = function (n) { window.__xp += n; return _a(n); };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [...WORDS.A1.slice(0, 16)].map(x => ({ w:x.w, t:x.t, ex:x.ex, def:x.def, cat:x.cat, added:Date.now(), seen:1 }));
`);
const clear = () => w.eval("window.__fin = []; window.__stat = []; window.__xp = 0;");
const log = () => JSON.parse(w.eval("JSON.stringify({fin: window.__fin, stat: window.__stat, xp: window.__xp})"));

(async () => {
  let bad = 0;
  // 1) mcq: ответил верно и сразу ушёл — таймер next() не должен рисовать поверх
  for (const id of ["picture", "mcq"]) {
    w.eval(`openExercise(${JSON.stringify(id)})`);
    await tick(60);
    click(SA(".mcq-option")[0]);
    clear();
    click(doc.querySelector("[data-nav='practice']"));   // ← Тренировки
    w.eval('openExercise("scramble")');                  // и открыл другое упражнение
    const before = doc.getElementById("ex-stage").textContent.slice(0, 40);
    await tick(1600);
    const l = log();
    const after = doc.getElementById("ex-stage").textContent.slice(0, 40);
    const okk = l.fin.length === 0 && l.stat.length === 0 && before.trim() === after.trim();
    console.log(`${okk ? "  ✓" : "  ✗"} ${id}: после ухода — exFinish ${JSON.stringify(l.fin)}, statUpdate ${JSON.stringify(l.stat)}, экран не перерисован: ${before.trim() === after.trim()}`);
    if (!okk) bad++;
  }
  // 2) scramble: собрал слово и ушёл в паузе перед следующим
  w.eval('openExercise("scramble")');
  await tick(40);
  let tiles = SA(".scr-tile");
  tiles.forEach(t => click(t));           // все плитки — раунд закрылся
  clear();
  click(doc.querySelector("[data-nav='practice']"));
  w.eval('openExercise("mcq")');
  const b2 = doc.getElementById("ex-stage").textContent.slice(0, 40);
  await tick(2100);
  const l2 = log();
  const a2 = doc.getElementById("ex-stage").textContent.slice(0, 40);
  console.log(`${l2.fin.length === 0 && l2.stat.length === 0 && b2 === a2 ? "  ✓" : "  ✗"} scramble: после ухода — exFinish ${JSON.stringify(l2.fin)}, statUpdate ${JSON.stringify(l2.stat)}, экран цел: ${b2 === a2}`);
  if (!(l2.fin.length === 0 && l2.stat.length === 0 && b2 === a2)) bad++;

  // 3) matching: соединил последнюю пару и ушёл — подход не должен записаться
  w.eval('openExercise("matching")');
  const t2w = new Map(JSON.parse(w.eval(`JSON.stringify(state.dictionary.map(d=>[d.w,d.t]))`)));
  const L = SA("#pairs-l .pair-item");
  for (const lb of L) {
    click(lb);
    const rb = SA("#pairs-r .pair-item").find(x => x.textContent === t2w.get(lb.textContent) && !x.classList.contains("done"));
    click(rb);
  }
  clear();
  click(doc.querySelector("[data-nav='practice']"));
  w.eval('openExercise("spelling")');
  const b3 = doc.getElementById("ex-stage").textContent.slice(0, 40);
  await tick(900);
  const l3 = log();
  const a3 = doc.getElementById("ex-stage").textContent.slice(0, 40);
  console.log(`${l3.fin.length === 0 && b3 === a3 ? "  ✓" : "  ✗"} matching: после ухода — exFinish ${JSON.stringify(l3.fin)}, экран цел: ${b3 === a3}`);
  if (!(l3.fin.length === 0 && b3 === a3)) bad++;

  // 4) вернулся на экран упражнения БЕЗ переоткрытия (кнопка «назад» в браузере):
  //    старые обработчики живы, а exLater уже чужой?
  w.eval('openExercise("matching")');
  const t2w2 = new Map(JSON.parse(w.eval(`JSON.stringify(state.dictionary.map(d=>[d.w,d.t]))`)));
  const L4 = SA("#pairs-l .pair-item");
  click(doc.querySelector("[data-nav='practice']"));   // ушёл
  w.eval('show("exercise")');                          // и вернулся тем же экраном
  clear();
  for (const lb of L4) {
    click(lb);
    const rb = SA("#pairs-r .pair-item").find(x => x.textContent === t2w2.get(lb.textContent) && !x.classList.contains("done"));
    click(rb);
  }
  await tick(900);
  const l4 = log();
  console.log(`  вернулся кнопкой «назад» и доиграл: exFinish ${JSON.stringify(l4.fin)}, очков ${l4.xp} (пар ${L4.length})`);
  console.log(bad ? "\nПРОБЛЕМ: " + bad : "\nуход с экрана обработан верно");
})();
