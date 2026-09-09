// Кроссворд и «Колесо»: повторное нажатие после ответа не должно
// начислять заново. OLD_EX=1 прогоняет то же на версии до починки.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word)); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 40)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

console.log("\n1. Кроссворд: «Проверить» на собранном поле");
w.eval('openExercise("crossword")');
// Решаем честно, как ученик: тыкаем в подсказку (она выбирает первую клетку
// слова) и печатаем буквы в скрытое поле ввода. Слово узнаём по переводу
// в подсказке — он же лежит в словаре ученика.
const solve = () => w.eval(`(function () {
  const ctl = document.querySelector("#ex-stage .cw-ctl") || document.querySelector(".cw-ctl");
  const clues = [...document.querySelectorAll(".cw-clue")];
  let done = 0;
  for (const cl of clues) {
    const t = cl.textContent.replace(/^\\s*\\S+\\s*/, "").trim();
    const rec = state.dictionary.find(d => d.t.trim() === t)
             || (typeof WORDS !== "undefined" && Object.values(WORDS).flat().find(d => d.t.trim() === t));
    if (!rec) continue;
    cl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    for (const ch of rec.w.toLowerCase().replace(/[^a-z]/g, "")) {
      const ev = new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" });
      ctl.dispatchEvent(ev);
    }
    done++;
  }
  return { clues: clues.length, solved: done,
           filled: [...document.querySelectorAll(".cw-cell")].length };
})()`);
const info = solve();
ok(info.solved === info.clues, `все ${info.clues} слов вписаны (вписано ${info.solved})`);
w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
const check = doc.getElementById("cw-check");
click(check);
const l1 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
ok(/[Вв]сё верно/.test(doc.getElementById("cw-result").textContent),
   "кроссворд признан собранным: " + doc.getElementById("cw-result").textContent);
ok(l1.xp > 0, "очки за сборку начислены: " + l1.xp);
// а теперь жмём «Проверить» ещё дважды
click(check); click(check);
const l2 = JSON.parse(w.eval("JSON.stringify(window.__log)"));
ok(l2.xp === l1.xp, `повторные нажатия очков не добавили: было ${l1.xp}, стало ${l2.xp}`);
ok(l2.stat.length === l1.stat.length, `слова отмечены один раз: ${l1.stat.length} → ${l2.stat.length}`);
ok(check.disabled, "кнопка «Проверить» после сборки заблокирована");

console.log("\n2. «Колесо»: «Знал» на последнем слове");
// без анимации: тот же путь, которым игра идёт у ученика с
// prefers-reduced-motion — колесо сразу стоит на слове
MQ.matches = true;   // колесо сразу встаёт на слово, как при reduced-motion
w.eval(`state.dictionary = [...WORDS.A1].slice(0, 6)
  .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));`);
w.eval('openExercise("wheel")');
(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms || 60));
  let guard = 0;
  // крутим до последнего слова
  while (guard++ < 40) {
    const go = doc.getElementById("wheel-go");
    if (go) { click(go); await tick(1200); continue; }
    const yes = doc.getElementById("wheel-yes");
    if (!yes) break;
    const counter = doc.getElementById("wheel-count").textContent;
    const [done, total] = counter.split("/").map(x => +x.trim());
    if (done === total - 1) {
      // последнее слово: жмём «Знал» трижды
      w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
      click(yes); click(yes); click(yes);
      await tick(600);
      const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
      ok(l.xp === 6, "очки начислены один раз, а не трижды: " + l.xp);
      ok(l.stat.length === 1, "слово отмечено один раз, а не трижды: " + l.stat.length);
      ok(l.finish.length === 1, "итоги подведены один раз: " + l.finish.length);
      if (l.finish.length) ok(l.finish[0][0] <= l.finish[0][1], "«знал X из Y», X не больше Y: " + JSON.stringify(l.finish[0]));
      break;
    }
    click(yes);
    await tick(120);
  }
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "повторные нажатия ничего не начисляют"));
  process.exit(fails ? 1 : 0);
})();
