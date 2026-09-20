// Гипотеза C. Игры зовут statUpdate(word, ok) с третьим параметром по
// умолчанию, то есть verified = true. А srs.js:73 считает так:
//
//     if (!selfReported) word.checked = (word.checked || 0) + 1;
//
// и комментарий рядом: «Считаем отдельно только то, что реально
// проверено вводом или выбором». По word.checked домашка и сдаётся —
// sync.js:715  wordDoneForHomework(d) → (d.checked || 0) >= 1 …
//
// «Колесо» не проверяет НИЧЕГО (его собственная подпись: «Проверять не
// буду»), а в «Найди пару» пару можно найти перебором. Оба ставят checked.
// Эталон рядом — runPairs (exercises.js:1664): там третьим параметром
// идёт !misses.get(...), и пара, найденная после промаха, домашку не
// закрывает.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
MQ.matches = true;

w.eval(`
  window.readGateMs = () => 0;
  state.dictionary = [...WORDS.A1].slice(0, 12)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
// та же формула, что в sync.js:715 (сам sync.js в стенд не грузится)
const done = () => JSON.parse(w.eval(`JSON.stringify(state.dictionary
  .filter(d => (d.checked || 0) >= 1 || d.status === "learned").map(d => d.w))`));
const wipe = () => w.eval(`state.dictionary.forEach(d => {
  delete d.checked; delete d.knew; delete d.status; delete d.reps;
  delete d.interval; delete d.due; delete d.lastReview; delete d.forgot; })`);
const dict = () => JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
const xp = () => w.eval("state.xp || 0");

(async () => {
  /* ---------- 1. КОЛЕСО ---------- */
  console.log("\n1. «Колесо»: жмём «Знал», не произнося ни слова и не открывая перевод");
  const xp0 = xp();
  w.eval('openExercise("wheel")');
  await tick();
  let clicks = 0;
  for (let g = 0; g < 80; g++) {
    const go = doc.getElementById("wheel-go");
    if (go) { click(go); await tick(20); continue; }
    const yes = doc.getElementById("wheel-yes");
    if (!yes) break;
    const before = doc.getElementById("wheel-count").textContent;
    click(yes);                     // «Перевод» не открывали — слова ребёнок не видел
    if (doc.getElementById("wheel-count").textContent !== before) clicks++;
    await tick(20);
  }
  await tick(500);
  const d1 = done();
  console.log("    нажатий «Знал»: " + clicks + ", очков за подход: " + (xp() - xp0));
  console.log("    слов, закрытых для домашки: " + d1.length + " " + JSON.stringify(d1));
  ok(d1.length === 0,
    "нажатием «Знал» ни одно слово не закрывается для репетитора (закрыто " + d1.length + ")");

  /* ---------- 2. НАЙДИ ПАРУ: каждая пара найдена ПОСЛЕ промаха ---------- */
  console.log("\n2. «Найди пару»: каждую пару находим только со второго раза (перебор)");
  wipe();
  w.eval('show("practice"); openExercise("memory")');
  await tick();
  const deck = JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i, text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const D = dict();
  const partnerOf = c => {
    const rec = c.en ? D.find(d => d.w === c.text) : D.find(d => d.t === c.text);
    return rec && deck.find(x => x.i !== c.i && x.text === (c.en ? rec.t : rec.w));
  };
  const ens = deck.filter(c => c.en);
  let misses = 0;
  for (const a of ens) {
    const right = partnerOf(a);
    if (!right) continue;
    const wrong = deck.find(x => !x.en && x.i !== right.i
      && !byI(x.i).classList.contains("done"));
    if (wrong) { click(byI(a.i)); click(byI(wrong.i)); misses++; await tick(1000); }
    click(byI(a.i)); click(byI(right.i));
    await tick(60);
  }
  await tick(800);
  const d2 = done();
  console.log("    промахов сделано: " + misses + " (то есть каждая пара — со второго раза)");
  console.log("    слов, закрытых для домашки: " + d2.length + " " + JSON.stringify(d2));
  ok(d2.length === 0,
    "перебором ни одно слово не закрывается для репетитора (закрыто " + d2.length + ")");

  /* ---------- 3. Эталон: «Сопоставление» (runPairs) — тот же перебор ---------- */
  console.log("\n3. Эталон — «Сопоставление» из exercises.js: тоже каждую пару со второго раза");
  wipe();
  w.eval('show("practice"); openExercise("matching")');
  await tick(80);
  const D2 = dict();
  let misses2 = 0;
  for (let step = 0; step < 40; step++) {
    const L = [...doc.querySelectorAll("#pairs-l .pair-item")].filter(x => !x.classList.contains("done"));
    const R = [...doc.querySelectorAll("#pairs-r .pair-item")].filter(x => !x.classList.contains("done"));
    if (!L.length || !R.length) break;
    const a = L[0];
    const rec = D2.find(d => d.w === a.textContent.trim() || d.t === a.textContent.trim());
    const want = rec ? (d => d.w === a.textContent.trim() ? rec.t : rec.w)(rec) : null;
    const right = R.find(x => x.textContent.trim() === want);
    const wrong = R.find(x => x !== right);
    if (wrong) { click(a); click(wrong); misses2++; await tick(40); }
    if (right) { click(a); click(right); await tick(40); }
    else break;
  }
  await tick(700);
  const d3 = done();
  console.log("    промахов сделано: " + misses2);
  console.log("    слов, закрытых для домашки: " + d3.length + " " + JSON.stringify(d3));
  console.log("    (так и задумано: пара, найденная после промаха, в checked не идёт)");

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "непроверенные ответы домашку не закрывают"));
  process.exit(fails ? 1 : 0);
})();
