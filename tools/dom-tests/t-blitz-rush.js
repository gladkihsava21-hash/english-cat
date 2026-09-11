// «Блиц»: что засчитывается за минуту, если ученик ничего не делает,
// и что — если он просто тыкает наугад.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { xp: 0, bump: [], stat: [] };
  const _a = award, _b = bump, _s = statUpdate;
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  window.bump = function (c, by) { window.__log.bump.push(c); return _b(c, by); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + (o ? ":+" : ":-")); return _s(word, o, v); };
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 40)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
  state.blitzBest = 0; state.counters = {}; state.xp = 0;
`);

// Секунда «Блица» — 5 мс: логика та же, ждать минуту незачем.
const realSetInterval = w.setInterval.bind(w);
w.setInterval = (fn, ms, ...rest) => realSetInterval(fn, ms === 1000 ? 5 : ms, ...rest);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Открыли «Блиц» и НИ РАЗУ не ответили — просто ждём минуту");
  w.eval('openExercise("blitz")');
  await tick(500);
  let log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const st1 = JSON.parse(w.eval('JSON.stringify({best: state.blitzBest, counters: state.counters, xp: state.xp})'));
  console.log("  экран: " + (doc.getElementById("ex-stage").textContent || "").replace(/\s+/g, " ").trim().slice(0, 70));
  console.log("  award: " + log.xp + ", bump: " + JSON.stringify(log.bump) + ", state: " + JSON.stringify(st1));
  ok(!log.bump.includes("exercises"),
     "подход без единого ответа не засчитан в достижение «упражнения»");

  console.log("\n2. Минута случайных тыков (ученик не читает, просто жмёт первый вариант)");
  w.eval("window.__log = { xp: 0, bump: [], stat: [] }; state.counters = {}; state.xp = 0;");
  w.eval('openExercise("blitz")');
  let taps = 0;
  for (let k = 0; k < 400; k++) {
    const b = doc.querySelector("#blitz-options .mcq-option");
    if (!b) break;
    click(b); taps++;
    await tick(1);
  }
  await tick(400);
  log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const st2 = JSON.parse(w.eval('JSON.stringify({best: state.blitzBest, counters: state.counters, xp: state.xp})'));
  const plus = log.stat.filter(x => x.endsWith(":+")).length;
  const minus = log.stat.filter(x => x.endsWith(":-")).length;
  console.log("  тыков: " + taps + ", отметок в SRS: " + log.stat.length
    + " (знает: " + plus + ", не знает: " + minus + ")");
  console.log("  очков за подход: " + log.xp + ", bump: " + JSON.stringify(log.bump) + ", state: " + JSON.stringify(st2));
  console.log("  для сравнения: подход «Выбора варианта» из 8 вопросов даёт максимум 80 очков");
  ok(log.xp <= 80, "прокликанный «Блиц» не даёт больше очков, чем честный подход MCQ");
  ok(log.stat.length === 0,
     "прокликанный «Блиц» не переписывает статусы слов в словаре (SRS)");

  console.log("\n3. Есть ли у «Блица» защита от прокликивания, как у остальных упражнений");
  const rushGuard = /exRoundAnswer|exRoundRushed|readGateMs/.test(
    require("fs").readFileSync(require("path").join(__dirname, "..", "..", "js", "exercises.js"), "utf8")
      .split("blitz() {")[1].split("collocations() {")[0]);
  ok(rushGuard, "в теле blitz() есть хоть что-то из защиты от прокликивания");

  console.log("\n4. Показывает ли «Блиц», верный ли был ответ");
  w.eval('openExercise("blitz")');
  await tick(10);
  const before = doc.getElementById("blitz-word").textContent;
  const btn = doc.querySelector("#blitz-options .mcq-option");
  const label = btn.textContent;
  click(btn);
  await tick(10);
  const after = doc.getElementById("blitz-word").textContent;
  const marks = doc.querySelectorAll("#blitz-options .right, #blitz-options .wrong, .ans-mark").length;
  console.log("  было слово «" + before + "», нажали «" + label + "», стало «" + after + "»; пометок верно/неверно на экране: " + marks);
  ok(marks > 0, "ученик видит, верным был его ответ или нет");

  console.log("\nошибок JS: " + errors.length);
  errors.forEach(e => console.log("   " + e));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
