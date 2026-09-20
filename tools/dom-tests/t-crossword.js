// Кроссворд: что уезжает репетитору и что попадает в клетки.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + (v === false ? ":неподтв" : ":подтв")); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 40)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

// Решаем честно: жмём подсказку (она выбирает первую клетку слова) и
// печатаем буквы в скрытое поле — как ученик с клавиатуры.
const solve = () => w.eval(`(function () {
  const ctl = document.querySelector(".cw-ctl");
  const clues = [...document.querySelectorAll(".cw-clue")];
  let done = 0;
  for (const cl of clues) {
    const t = cl.textContent.replace(/^\\s*\\S+\\s*/, "").trim();
    const rec = state.dictionary.find(d => d.t.trim() === t)
             || Object.values(WORDS).flat().find(d => d.t.trim() === t);
    if (!rec) continue;
    cl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (const ch of rec.w.toLowerCase().replace(/[^a-z]/g, "")) {
      ctl.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
    }
    done++;
  }
  return { clues: clues.length, solved: done };
})()`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Собрали кроссворд из домашки и сразу ушли на «Тренировки» (окно 700 мс)");
  w.eval('homeworkContext = { id: "hw-cw", title: "Кроссворд к среде" }; state.taskResults = {};');
  w.eval('openExercise("crossword")');
  const info = solve();
  ok(info.solved === info.clues, `вписаны все ${info.clues} слов`);
  w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
  click(doc.getElementById("cw-check"));
  const said = doc.getElementById("cw-result").textContent;
  ok(/[Вв]сё верно/.test(said), "кроссворд признан собранным: " + said);
  // ученик видит «Всё верно, мяу!» и уходит из упражнения
  click(doc.querySelector("#exercise-body [data-nav='practice']"));
  await tick(1200);
  const l1 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const tr = JSON.parse(w.eval("JSON.stringify(state.taskResults || {})"));
  console.log("  exFinish: " + JSON.stringify(l1.finish) + ", репетитору: " + JSON.stringify(tr));
  ok(!!tr["hw-cw"], "решённый кроссворд записан репетитору: "
     + (tr["hw-cw"] ? JSON.stringify(tr["hw-cw"]) : "НЕТ ЗАПИСИ"));

  console.log("\n1б. Контроль: то же самое, но ученик дожидается экрана итогов");
  w.eval('homeworkContext = { id: "hw-cw2", title: "Кроссворд к среде" };');
  w.eval('openExercise("crossword")');
  solve();
  click(doc.getElementById("cw-check"));
  await tick(1200);
  const tr2 = JSON.parse(w.eval("JSON.stringify(state.taskResults || {})"));
  console.log("  репетитору: " + JSON.stringify(tr2["hw-cw2"]));
  ok(!!tr2["hw-cw2"], "дождавшийся ученик записан: " + JSON.stringify(tr2["hw-cw2"] || null));

  console.log("\n2. Подбор буквами: жмём «Проверить» после каждой буквы");
  w.eval('homeworkContext = null;');
  w.eval('openExercise("crossword")');
  const brute = w.eval(`(function () {
    const ctl = document.querySelector(".cw-ctl");
    const clues = [...document.querySelectorAll(".cw-clue")];
    const check = document.getElementById("cw-check");
    let checks = 0;
    for (const cl of clues) {
      const t = cl.textContent.replace(/^\\s*\\S+\\s*/, "").trim();
      const rec = state.dictionary.find(d => d.t.trim() === t)
               || Object.values(WORDS).flat().find(d => d.t.trim() === t);
      if (!rec) continue;
      cl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      for (const ch of rec.w.toLowerCase().replace(/[^a-z]/g, "")) {
        // «а вдруг эта буква верная» — проверка после каждого нажатия
        ctl.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
        check.dispatchEvent(new MouseEvent("click", { bubbles: true })); checks++;
      }
    }
    return { checks, clues: clues.length };
  })()`);
  await tick(900);
  const l2 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const f2 = l2.finish[l2.finish.length - 1] || [];
  console.log(`  нажатий «Проверить»: ${brute.checks}, итог: ${JSON.stringify(f2)}`);
  console.log("  отметки SRS: " + JSON.stringify(l2.stat.slice(-brute.clues)));
  ok(!(f2[0] === f2[1] && brute.checks > brute.clues),
     `подбор по одной букве с ${brute.checks} проверками даёт «${f2[0]} из ${f2[1]}»`);
  ok(!l2.stat.slice(-brute.clues).some(x => x.endsWith(":подтв")),
     "слова, подобранные проверками, не идут в SRS как подтверждённо известные");

  console.log("\n3. Слово пришло одним событием ввода (свайп-набор, автозамена, вставка)");
  // кроссворд иногда «не сцепляется» — открываем, пока не соберётся сетка
  for (let k = 0; k < 8 && !doc.querySelector(".cw-clue"); k++) {
    w.eval('openExercise("crossword")');
    await tick(20);
  }
  const swipe = w.eval(`(function () {
    const ctl = document.querySelector(".cw-ctl");
    const cl = document.querySelector(".cw-clue");
    const t = cl.textContent.replace(/^\\s*\\S+\\s*/, "").trim();
    const rec = state.dictionary.find(d => d.t.trim() === t)
             || Object.values(WORDS).flat().find(d => d.t.trim() === t);
    cl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const word = rec.w.toLowerCase();
    // клавиатура прислала слово целиком одним input
    ctl.dispatchEvent(new InputEvent("input", { bubbles: true, data: word, inputType: "insertText" }));
    const shown = [...document.querySelectorAll(".cw-cell .cw-letter")].map(x => x.textContent).join("");
    return { word, letters: shown.replace(/\\s/g, "") };
  })()`);
  console.log(`  ученик «написал» ${swipe.word}, в сетке появилось: «${swipe.letters}»`);
  ok(swipe.letters.toLowerCase() === swipe.word,
     `слово встало в клетки целиком (в сетке «${swipe.letters}»)`);

  console.log("\nошибок JS: " + errors.length + (errors.length ? " " + errors.join(" | ") : ""));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
