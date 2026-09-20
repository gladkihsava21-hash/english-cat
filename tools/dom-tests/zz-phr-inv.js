// Инварианты трёх упражнений на выражения: подход закрывается один раз,
// верных не больше вопросов, очки соответствуют верным ответам,
// одинаковых вариантов на экране нет, одна фраза не спрашивается дважды.
// Шов: пауза на чтение → 0 и пауза между раундами → 20 мс (сама пауза
// здесь не проверяется, она проверяется отдельно в zz-phr-late.js).
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");
let fails = 0;
const ok = (c, what) => { if (!c) { fails++; console.log("  ✗ " + what); } };

E("window.readGateMs = () => 0;");
E(`window.__log = { finish: [], xp: 0, stat: [] };
   window.__rounds = null; window.__pool = null;
   const _f = exFinish, _a = award, _s = statUpdate, _m = runMCQ, _el = exLater;
   const _pp = EX_RUNNERS._phrasePool;
   window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
   window.award = function (n) { window.__log.xp += n; return _a(n); };
   window.statUpdate = function (x, o, v) { window.__log.stat.push(String(x)); return _s(x, o, v); };
   window.runMCQ = function (r, o) { window.__rounds = r; return _m(r, o); };
   window.exLater = function (fn, ms) { return _el(fn, Math.min(ms, 15)); };
   EX_RUNNERS._phrasePool = function (k, n, need) {
     const r = _pp.call(EX_RUNNERS, k, n, need); window.__pool = r; return r; };`);
const reseed = s => { let r = s >>> 0; w.Math.random = () => {
  r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; }; };
const reset = () => E(`window.__log = { finish: [], xp: 0, stat: [] }; window.__rounds = null;
                       window.__pool = null; localStorage.removeItem('savelyExSeen');`);
const log = () => JSON.parse(E("JSON.stringify(window.__log)"));

async function playMCQ(id, seed) {
  reseed(seed); reset();
  E(`openExercise(${JSON.stringify(id)})`);
  await tick(10);
  const R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
  if (!R.length) return null;
  for (let k = 0; k < R.length; k++) {
    const opts = [...st().querySelectorAll(".mcq-option")];
    if (!opts.length) break;
    click(opts[R[k].correct]);
    await tick(40);
  }
  return { R, log: log(), text: st().textContent.replace(/\s+/g, " ") };
}

async function playBuild(seed, wrongAt = -1) {
  reseed(seed); reset();
  E('openExercise("buildphrase")');
  await tick(10);
  const pool = JSON.parse(E("JSON.stringify((window.__pool || []).filter(p => (p.parts||[]).length >= 2))"));
  for (let k = 0; k < pool.length; k++) {
    const order = (k === wrongAt) ? [...pool[k].parts].reverse() : pool[k].parts;
    for (const word of order) {
      const b = [...st().querySelectorAll("#tiles .scr-tile")]
        .find(x => !x.disabled && x.textContent.trim() === word);
      if (b) click(b);
    }
    await tick(40);
    const nb = doc.getElementById("bp-next");
    if (nb) { click(nb); await tick(20); }
  }
  return { pool, log: log(), text: st().textContent.replace(/\s+/g, " ") };
}

(async () => {
  console.log("1. runMCQ-упражнения: подход закрыт один раз, очки = 10 × верных");
  let posHist = [0, 0, 0, 0], posTotal = 0, dupOpt = 0, dupRound = 0, totalRounds = 0;
  for (const id of ["notliteral", "collocpair"]) {
    for (let s = 1; s <= 25; s++) {
      const res = await playMCQ(id, s * 7919);
      if (!res) { console.log("  (пусто) " + id + " seed " + s); continue; }
      const { R, log: L } = res;
      ok(L.finish.length === 1, `${id} seed${s}: exFinish вызван ${L.finish.length} раз(а)`);
      if (L.finish.length) {
        const [c, t] = L.finish[0];
        ok(c <= t, `${id} seed${s}: «Верно ${c} из ${t}»`);
        ok(c === R.length, `${id} seed${s}: все ответы верные, а засчитано ${c} из ${R.length}`);
        ok(L.xp === 10 * c, `${id} seed${s}: очков ${L.xp}, ждали ${10 * c}`);
      }
      const ws = R.map(r => r.prompt + "|" + r.sub);
      if (new Set(ws).size !== ws.length) dupRound++;
      R.forEach(r => {
        totalRounds++;
        if (new Set(r.options).size !== r.options.length) dupOpt++;
        if (r.options.length === 4) { posHist[r.correct]++; posTotal++; }
      });
    }
  }
  console.log(`   вопросов: ${totalRounds}; с одинаковыми вариантами: ${dupOpt}; подходов с повтором вопроса: ${dupRound}`);
  console.log(`   где стоит верный вариант (из ${posTotal} вопросов с 4 вариантами): `
    + posHist.map((n, k) => `${k + 1}-й ${(n / posTotal * 100).toFixed(1)}%`).join(", "));

  console.log("\n2. «Собери выражение»");
  for (let s = 1; s <= 12; s++) {
    const { pool, log: L } = await playBuild(s * 7919);
    ok(L.finish.length === 1, `seed${s}: exFinish вызван ${L.finish.length} раз(а)`);
    if (L.finish.length) {
      const [c, t] = L.finish[0];
      ok(c <= t, `seed${s}: «Верно ${c} из ${t}»`);
      ok(c === t, `seed${s}: собрано всё верно, а засчитано ${c} из ${t}`);
      ok(L.xp === 12 * c, `seed${s}: очков ${L.xp}, ждали ${12 * c}`);
      ok(t === pool.length, `seed${s}: вопросов ${t}, в пуле ${pool.length}`);
    }
  }
  const wrong = await playBuild(3 * 7919, 1);
  console.log("   с одной ошибкой:", (wrong.text.match(/Верно \d+ из \d+/) || ["(нет)"])[0],
              "| очки:", wrong.log.xp, "| exFinish:", wrong.log.finish.length);

  console.log("\n3. Защита от прокликивания, разбор ответов, статистика слов");
  for (const id of ["notliteral", "collocpair", "buildphrase"]) {
    const r = id === "buildphrase" ? await playBuild(4242) : await playMCQ(id, 4242);
    const info = JSON.parse(E(`JSON.stringify({ answered: exRound.answered, log: exLog.length,
                                                rushed: exRoundRushed(), seen: exSeenPhrases.length })`));
    const t = st().textContent.replace(/\s+/g, " ");
    console.log(`   ${id.padEnd(12)} ответов учтено защитой: ${String(info.answered).padStart(2)}`
      + ` | «прокликано»: ${String(info.rushed).padEnd(5)}`
      + ` | строк в разборе: ${String(info.log).padStart(2)}`
      + ` | statUpdate: ${(r && r.log.stat.length) || 0}`
      + ` | предложено в словарь: ${info.seen}`
      + ` | очки: ${(t.match(/\+\d+/) || ["нет"])[0]}`);
  }

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "инварианты держатся"));
  process.exit(0);
})();
