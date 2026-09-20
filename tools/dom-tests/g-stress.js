// Инварианты всех четырёх игр на одном прогоне. Запускать с разными SEED.
//   for s in 1 2 3 …; do SEED=$s node g-stress.js; done
// Проверяем: итоги подводятся ровно один раз; верных не больше заданий;
// каждое слово подхода записано в статистику ровно один раз; счётчик на
// экране совпадает с числом отвеченного.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
const SEED = process.env.SEED || "default";
let fails = 0;
const ok = (c, what) => { if (!c) { fails++; console.log("  ✗ [SEED=" + SEED + "] " + what); } };
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 25));
MQ.matches = true;

w.eval(`
  window.__log = { finish: [], stat: [] };
  const _f = exFinish, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  state.dictionary = [...WORDS.A1].slice(0, 20)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [], stat: [] };");
const D = () => JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
const check = (name, expected) => {
  const l = log();
  ok(l.finish.length === 1, name + ": итоги подведены " + l.finish.length + " раз(а) " + JSON.stringify(l.finish));
  const [c, t] = l.finish[0] || [0, 0];
  ok(c <= t, name + ": «Верно " + c + " из " + t + "» — верных больше заданий");
  ok(t === expected, name + ": заданий в итоге " + t + ", а сыграно " + expected);
  const words = l.stat.map(x => x[0]);
  const dup = words.filter((x, i) => words.indexOf(x) !== i);
  ok(!dup.length, name + ": слово записано дважды: " + JSON.stringify(dup));
  ok(l.stat.length === expected,
     name + ": записей в статистике " + l.stat.length + ", заданий " + expected);
};

(async () => {
  /* ---- КОЛЕСО ---- */
  reset();
  w.eval('openExercise("wheel")');
  await tick();
  let total = +doc.getElementById("wheel-count").textContent.split("/")[1].trim();
  for (let g = 0; g < 80; g++) {
    const go = doc.getElementById("wheel-go");
    if (go) { click(go); await tick(15); continue; }
    const y = doc.getElementById("wheel-yes");
    if (!y) break;
    click(g % 3 ? y : doc.getElementById("wheel-no"));
    await tick(15);
  }
  await tick(600);
  check("Колесо", total);

  /* ---- НАЙДИ ПАРУ ---- */
  reset();
  w.eval('show("practice"); openExercise("memory")');
  await tick();
  const deck = JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i, text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const dd = D();
  const partner = c => {
    const rec = c.en ? dd.find(d => d.w === c.text) : dd.find(d => d.t === c.text);
    return rec && deck.find(x => x.i !== c.i && x.text === (c.en ? rec.t : rec.w));
  };
  const ens = deck.filter(c => c.en);
  for (const a of ens) {
    const b = partner(a);
    if (!b) continue;
    click(byI(a.i)); click(byI(b.i));
    await tick(40);
  }
  await tick(900);
  check("Найди пару", ens.length);

  /* ---- ЛОПНИ ШАР ---- */
  reset();
  w.eval('show("practice"); openExercise("balloons")');
  await tick();
  const rounds = +doc.getElementById("bal-count").textContent.split("/")[1].trim();
  for (let r = 0; r < rounds + 2; r++) {
    const cnt = doc.getElementById("bal-count");
    if (!cnt) break;
    const ru = cnt.parentNode ? doc.getElementById("bal-ru").textContent.trim() : null;
    const rec = D().find(d => d.t.trim() === ru);
    const b = [...doc.querySelectorAll("#bal-stage .bal")]
      .find(x => x.getAttribute("aria-label") === (rec && rec.w));
    if (!b) break;
    click(b);
    await tick(950);
  }
  await tick(200);
  check("Лопни шар", rounds);

  /* ---- ОТКРОЙ КОРОБКУ ---- */
  reset();
  w.eval('show("practice"); openExercise("boxes")');
  await tick();
  let boxTotal = 0;
  for (let n = 0; n < 40; n++) {
    const nx = doc.getElementById("box-next");
    if (nx) { click(nx); await tick(30); continue; }
    const cc = doc.querySelector("#ex-stage .test-counter");
    const m = cc && cc.textContent.match(/Открыто (\d+) из (\d+)/);
    if (!m) break;
    boxTotal = +m[2];
    const tile = doc.querySelector("#box-grid .box-tile:not([disabled])");
    if (!tile) break;
    click(tile); await tick(30);
    const os = [...doc.querySelectorAll("#box-options .mcq-option")];
    if (!os.length) break;
    const we = doc.querySelector(".box-card .quiz-word").textContent.trim();
    const rec = D().find(d => d.w === we);
    const right = os.find(o => o.textContent.trim() === (rec && rec.t));
    click(n % 4 === 3 ? (os.find(o => o !== right) || os[0]) : (right || os[0]));
    await tick(1100);
  }
  await tick(400);
  check("Открой коробку", boxTotal);

  if (errors.length) console.log("  ! ошибки обработчиков [SEED=" + SEED + "]:", errors.slice(0, 2));
  if (!fails) console.log("  ✓ SEED=" + SEED + ": инварианты целы");
  process.exit(fails ? 1 : 0);
})();
