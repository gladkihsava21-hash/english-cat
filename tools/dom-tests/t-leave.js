// Гипотеза 1. «Колесо» и «Найди пару» подводят итоги ГОЛЫМ setTimeout,
// без exLater/токена захода. Ученик отвечает на последнее слово и тут же
// уходит в другое упражнение — таймер прошлой игры дорисовывает свой
// экран итогов поверх нового упражнения и начисляет награды за подход,
// из которого уже ушли.
//
// В движке для этого есть exLater() (js/exercises.js:872) — им пользуются
// runPairs, runMCQ, «Собери слово», кроссворд. games.js его не зовёт нигде.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

MQ.matches = true;   // reduced-motion: колесо сразу встаёт на слове

w.eval(`
  window.__log = { finish: [], bump: [], xp: 0 };
  const _f = exFinish, _a = award, _b = (typeof bump === "function" ? bump : null);
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  if (_b) window.bump = function (k, n) { window.__log.bump.push(String(k)); return _b(k, n); };
  state.dictionary = [...WORDS.A1].slice(0, 8)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

(async () => {
  /* ---------- КОЛЕСО ---------- */
  console.log("\n1. «Колесо»: ответ на последнем слове → сразу другое упражнение");
  w.eval('openExercise("wheel")');
  await tick();
  let guard = 0;
  while (guard++ < 60) {
    const go = doc.getElementById("wheel-go");
    if (go) { click(go); await tick(40); continue; }
    const yes = doc.getElementById("wheel-yes");
    if (!yes) break;
    const [done, total] = doc.getElementById("wheel-count").textContent.split("/").map(x => +x.trim());
    if (done === total - 1) {
      w.eval("window.__log = { finish: [], bump: [], xp: 0 };");
      click(yes);                       // последнее слово отмечено
      // Ученик не ждёт 0,4 с — он уже жмёт «← Тренировки» и открывает
      // следующее упражнение. exFinish «Колеса» ещё в очереди.
      w.eval('show("practice"); openExercise("boxes")');
      const boxesDrawn = !!doc.getElementById("box-grid");
      ok(boxesDrawn, "новое упражнение «Открой коробку» нарисовано");
      await tick(700);                  // ждём таймер колеса (400 мс)
      const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
      const stillBoxes = !!doc.getElementById("box-grid");
      const txt = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
      ok(stillBoxes,
        "коробки на экране остались (иначе итоги колеса стёрли новое упражнение). "
        + "Сейчас на экране: «" + txt.slice(0, 90) + "…»");
      ok(l.finish.length === 0,
        "итоги колеса НЕ подводились после ухода: " + JSON.stringify(l.finish));
      ok(!l.bump.includes("exercises"),
        "награда «пройдено упражнение» не начислена за брошенный подход: "
        + JSON.stringify(l.bump));
      break;
    }
    click(yes);
    await tick(40);
  }

  /* ---------- НАЙДИ ПАРУ ---------- */
  console.log("\n2. «Найди пару»: последняя пара → сразу другое упражнение");
  w.eval('show("practice"); openExercise("memory")');
  await tick();
  // Играем честно, но со знанием расклада: собираем пары по data-i.
  const pairsOf = () => JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i,
      text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en",
    })))`));
  const cards = pairsOf();
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d => ({ w: d.w, t: d.t })))"));
  const partner = c => {
    const rec = c.en ? dict.find(d => d.w === c.text) : dict.find(d => d.t === c.text);
    if (!rec) return null;
    return cards.find(x => x.i !== c.i && (c.en ? x.text === rec.t : x.text === rec.w));
  };
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const ens = cards.filter(c => c.en);
  for (let k = 0; k < ens.length; k++) {
    const a = ens[k], b = partner(a);
    if (!b) { console.log("  … не нашёл пару для " + a.text); continue; }
    const last = k === ens.length - 1;
    if (last) w.eval("window.__log = { finish: [], bump: [], xp: 0 };");
    click(byI(a.i));
    click(byI(b.i));
    if (last) {
      w.eval('show("practice"); openExercise("boxes")');
      ok(!!doc.getElementById("box-grid"), "новое упражнение нарисовано");
      await tick(900);                  // таймер «Найди пару» — 600 мс
      const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
      const txt = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
      ok(!!doc.getElementById("box-grid"),
        "коробки на экране остались. Сейчас на экране: «" + txt.slice(0, 90) + "…»");
      ok(l.finish.length === 0,
        "итоги «Найди пару» НЕ подводились после ухода: " + JSON.stringify(l.finish));
      ok(!l.bump.includes("exercises"),
        "награда за брошенный подход не начислена: " + JSON.stringify(l.bump));
    }
    await tick(60);
  }

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "таймеры игр не переживают уход с экрана"));
  process.exit(fails ? 1 : 0);
})();
