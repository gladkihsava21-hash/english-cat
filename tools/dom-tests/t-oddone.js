// «Найди лишнее»: корректность самих вопросов и счёта.
// Играем на нескольких зёрнах: один прогон проверяет удачу, а не код.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], xp: 0, stat: [] };
  const _f = exFinish, _a = award, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word)); return _s(word, o, v); };
  // Пауза на чтение защищает от прокликивания живого ученика; тесту она
  // мешает, а проверяет он не её (так же поступает test-invariants.js).
  window.readGateMs = () => 0;
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
  // «Найди лишнее» строит раунды заранее — перехватываем их целиком
  window.__rounds = null;
  const _mcq = runMCQ;
  window.runMCQ = function (rounds, opts) { window.__rounds = rounds; return _mcq(rounds, opts); };
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Сами вопросы: варианты различимы, «лишнее» — то, что названо в разборе");
  w.eval('openExercise("oddone")');
  const rounds = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
  ok(rounds.length > 0, "раундов собрано: " + rounds.length);
  rounds.forEach((r, i) => {
    const uniq = new Set(r.options);
    ok(uniq.size === r.options.length,
       `раунд ${i + 1}: варианты не повторяются — ${JSON.stringify(r.options)}`);
    const right = r.options[r.correct];
    ok(r.why.startsWith(right + " "),
       `раунд ${i + 1}: верный ответ «${right}» — тот же, что в разборе «${r.why.slice(0, 60)}…»`);
    ok(!r.why.split(" — ")[1] || !new RegExp("(^|[ ,])" + right + "( |,|$)")
        .test(r.why.split(",").slice(1).join(",")),
       `раунд ${i + 1}: «лишнее» не названо заодно и среди своей тройки`);
  });

  console.log("\n2. Отвечаем верно на все, каждый раз ждём открытия вариантов");
  const answer = (correct) => w.eval(`(function () {
    const opts = [...document.querySelectorAll("#mcq-options .mcq-option")];
    const r = window.__rounds[window.__i];
    const b = ${correct} ? opts[r.correct] : opts.find((x, i) => i !== r.correct);
    b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return b.textContent.trim();
  })()`);
  w.eval("window.__i = 0; window.__log = { finish: [], xp: 0, stat: [] };");
  for (let n = 0; n < rounds.length; n++) {
    await tick(60);        // readGateMs в стенде = 0, но таймер всё равно через тик
    answer(true);
    w.eval("window.__i++");
    await tick(1300);      // exLater(next, 1100)
  }
  const log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("  exFinish: " + JSON.stringify(log.finish) + ", очки: " + log.xp);
  ok(log.finish.length === 1, "итоги подведены один раз: " + log.finish.length);
  const [c, t] = log.finish[0] || [];
  ok(c === rounds.length && t === rounds.length, `«Верно ${c} из ${t}» при ${rounds.length} вопросах`);

  console.log("\n3. Повторное нажатие на тот же вариант");
  w.eval('openExercise("oddone")');
  const rounds3 = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
  w.eval("window.__i = 0; window.__log = { finish: [], xp: 0, stat: [] };");
  await tick(60);
  const opt = doc.querySelector("#mcq-options .mcq-option");
  click(opt); click(opt); click(opt);
  const l3 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("  очки после трёх нажатий: " + l3.xp);
  ok(l3.xp <= 10, "очки начислены не больше одного раза: " + l3.xp);

  console.log("\n4. Ушли с экрана, не дождавшись авто-перехода после последнего ответа");
  w.eval('openExercise("oddone")');
  const rounds4 = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
  w.eval("window.__i = 0; window.__log = { finish: [], xp: 0, stat: [] };");
  w.eval('homeworkContext = { id: "hw-odd", title: "Лишнее к пятнице" }; state.taskResults = {};');
  for (let n = 0; n < rounds4.length; n++) {
    await tick(60);
    answer(true);
    w.eval("window.__i++");
    if (n === rounds4.length - 1) break;   // последний ответ — уходим сразу
    await tick(1300);
  }
  click(doc.querySelector("#exercise-body [data-nav='practice']"));   // «← Тренировки»
  await tick(1400);
  const l4 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const tr = JSON.parse(w.eval("JSON.stringify(state.taskResults || {})"));
  console.log("  exFinish после ухода: " + JSON.stringify(l4.finish) + ", репетитору: " + JSON.stringify(tr));
  ok(!(l4.finish.length && !tr["hw-odd"]),
     "результат домашки не пропал: подход закрыт " + l4.finish.length + " раз, у репетитора "
     + (tr["hw-odd"] ? JSON.stringify(tr["hw-odd"]) : "пусто"));

  console.log("\nошибок JS: " + errors.length + (errors.length ? " " + errors.join(" | ") : ""));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
