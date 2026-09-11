// Гипотеза 5. «Открой коробку» — тот же вопрос с вариантами, что и
// «Выбери правильный перевод» (mcq), но мимо всей защиты от прокликивания.
//
// runMCQ (js/exercises.js:1550+) делает три вещи, которых нет в boxes():
//   1) пауза на чтение: варианты не нажимаются, пока не открылись
//      (openedAt === null → клик отбрасывается);
//   2) exRoundAnswer(...) — по нему exRoundRushed() метит подход как
//      прокликанный: очки снимаются, репетитор видит ⚡;
//   3) exLog.push(...) — разбор ответов после подхода.
//
// В boxes() нет ни одного из трёх. Значит очки и «слово проверено»
// (checked → wordDoneForHomework, js/sync.js:713) набиваются пальцем.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));

MQ.matches = true;   // без анимаций: крышка коробки открывается сразу

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  state.dictionary = [...WORDS.A1].slice(0, 20)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, cat: x.cat, added: Date.now(), seen: 1, knew: 0, checked: 0 }));
`);

const closed = () => JSON.parse(w.eval(
  "JSON.stringify(state.dictionary.filter(d => (d.checked || 0) >= 1).map(d => d.w))"));

(async () => {
  /* ---------- как ведёт себя «Выбери перевод» ---------- */
  console.log("\n1. Эталон: «Выбери правильный перевод» — жмём вариант сразу");
  w.eval('openExercise("mcq")');
  await tick(5);
  const mcqOpt = doc.querySelector("#mcq-options .mcq-option");
  click(mcqOpt);
  await tick(5);
  const mcqTook = mcqOpt.classList.contains("right") || mcqOpt.classList.contains("wrong");
  ok(!mcqTook, "мгновенный клик в mcq НЕ принят: варианты ещё закрыты паузой на чтение");

  /* ---------- «Открой коробку»: прокликиваем весь подход ---------- */
  console.log("\n2. «Открой коробку»: девять коробок на скорость пальца");
  w.eval(`window.__log = { finish: [], stat: [], xp: 0 };
    state.dictionary.forEach(d => { d.checked = 0; d.knew = 0; });
    show("practice"); openExercise("boxes")`);
  await tick(5);
  const t0 = Date.now();
  let guard = 0, instant = 0, taken = 0;
  while (guard++ < 200) {
    if (w.eval("window.__log.finish.length")) break;
    const nx = doc.getElementById("box-next");        // «К коробкам →» после ошибки
    if (nx) { click(nx); await tick(1); continue; }
    const list = doc.getElementById("box-options");
    if (list) {
      const done = [...list.children].some(x => x.classList.contains("right") || x.classList.contains("wrong"));
      if (!done) {
        const opt = list.children[0];
        instant++;
        click(opt);                    // ноль паузы: коробка открылась только что
        await tick(1);
        if (opt.classList.contains("right") || opt.classList.contains("wrong")) taken++;
        continue;
      }
      await tick(30);                  // верный ответ — ждём автоперехода
      continue;
    }
    const tile = doc.querySelector("#box-grid .box-tile:not([disabled])");
    if (tile) { click(tile); await tick(1); continue; }
    await tick(20);
  }
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const screen = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
  console.log(`    подход пройден за ${secs} с, ответов ${instant}, принято ${taken}`);
  console.log("    итоги: " + JSON.stringify(l.finish) + ", очков " + l.xp);
  console.log("    экран: «" + screen.slice(0, 120) + "…»");
  console.log("    слов закрыто для домашки (checked ≥ 1): " + JSON.stringify(closed()));
  console.log("    exRound: " + w.eval("JSON.stringify(exRound)")
    + ", exRoundRushed() = " + w.eval("exRoundRushed()"));

  ok(taken === 0 || instant === 0,
     "мгновенные клики в коробках отбрасываются так же, как в mcq (принято " + taken + " из " + instant + ")");
  ok(/Слишком быстро/.test(screen) || l.xp === 0,
     "прокликанный подход помечен «Слишком быстро» либо очки за него не начислены (начислено " + l.xp + ")");
  ok(closed().length === 0,
     "прокликиванием ни одно слово не закрыто для домашки (закрыто " + closed().length + ")");
  ok(w.eval("exLog.length") > 0,
     "разбор ответов после подхода собран (exLog: " + w.eval("exLog.length") + ")");

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "коробки защищены так же, как обычные вопросы"));
  process.exit(fails ? 1 : 0);
})();
