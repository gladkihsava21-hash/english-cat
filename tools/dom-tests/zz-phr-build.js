// «Собери выражение» против «Не буквально»: одинаково быстрый ученик,
// разный итог. Проверяем защиту от прокликивания, разбор ответов,
// повторные нажатия и возможность исправить промах.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");

E(`window.__log = { finish: [], xp: 0, rec: [] }; window.__rounds = null; window.__pool = null;
   // Пауза на чтение обнулена: у «Собери выражение» она теперь есть, и
   // мгновенные нажатия теста просто отбрасывались бы. Прокликивание при
   // этом всё равно ловится: время меряется от момента открытия.
   readGateMs = () => 0;
   const _f = exFinish, _a = award, _m = runMCQ, _r = recordTaskResult, _pp = EX_RUNNERS._phrasePool;
   window.exFinish = function (c,t,n){ window.__log.finish.push([c,t]); return _f(c,t,n); };
   window.award = function (n){ window.__log.xp += n; return _a(n); };
   window.recordTaskResult = function (c,t,m){ window.__log.rec.push([c,t,m]); return _r(c,t,m); };
   window.runMCQ = function (r,o){ window.__rounds = r; return _m(r,o); };
   EX_RUNNERS._phrasePool = function (k,n,need){ const r=_pp.call(EX_RUNNERS,k,n,need); window.__pool=r; return r; };`);
const log = () => JSON.parse(E("JSON.stringify(window.__log)"));
const start = id => E(`window.__log = { finish: [], xp: 0, rec: [] }; window.__rounds = null; window.__pool = null;
   state.taskResults = {}; state.xp = 0; state.counters = {}; state.activity = {}; localStorage.removeItem('savelyExSeen');
   openExercise(${JSON.stringify(id)});
   homeworkContext = { id: "hw-1", title: "Выражения к четвергу" };`);

(async () => {
  console.log("=== 1. Ученик прокликивает подход не читая (домашка репетитора)\n");

  // «Не буквально» — как есть, с настоящей паузой на чтение
  start("notliteral");
  await tick(30);
  let R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
  for (let k = 0; k < R.length; k++) {
    const opts = [...st().querySelectorAll(".mcq-option")];
    // ученик колотит по вариантам, пока они закрыты паузой, и попадает,
    // как только откроются
    for (let g = 0; g < 30 && !opts[0].getAttribute("aria-disabled"); g++) {
      click(opts[R[k].correct]); await tick(120);
      if (st().querySelector(".mcq-option.right")) break;
    }
    await tick(1200);
  }
  let L = log();
  console.log("«Не буквально»  →", (st().querySelector("h2") || {}).textContent,
    "| exFinish:", JSON.stringify(L.finish), "| очки на экране:",
    (st().textContent.match(/\+\d+/) || ["нет"])[0]);
  console.log("                   state.xp:", E("state.xp"), "| счётчики наград:", E("JSON.stringify(state.counters)"));
  console.log("                   репетитору:", JSON.stringify(L.rec));

  // «Собери выражение» — тот же ученик, та же скорость
  start("buildphrase");
  await tick(30);
  const pool = JSON.parse(E("JSON.stringify((window.__pool||[]).filter(p=>(p.parts||[]).length>=2))"));
  const t0 = Date.now();
  for (const p of pool) {
    for (const word of p.parts) {
      const b = [...st().querySelectorAll("#tiles .scr-tile")].find(x => !x.disabled && x.textContent.trim() === word);
      if (b) click(b);
    }
    await tick(1150);
  }
  L = log();
  console.log("«Собери выражение» →", (st().querySelector("h2") || {}).textContent,
    "| exFinish:", JSON.stringify(L.finish), "| очки на экране:",
    (st().textContent.match(/\+\d+/) || ["нет"])[0]);
  console.log("                   подход занял, с:", ((Date.now() - t0) / 1000).toFixed(1),
    "| state.xp:", E("state.xp"), "| счётчики наград:", E("JSON.stringify(state.counters)"));
  console.log("                   репетитору:", JSON.stringify(L.rec));
  console.log("                   в state.taskResults:", E("JSON.stringify(state.taskResults)"));
  console.log("                   пауза на чтение перед плитками: ",
    E("String(typeof readGateMs)"), "— вызывается ли в buildphrase:",
    /readGateMs/.test(E(`String(EX_RUNNERS.buildphrase)`)));
  console.log("                   exRound.answered:", E("exRound.answered"),
    "| exRoundRushed():", E("exRoundRushed()"), "| строк в разборе exLog:", E("exLog.length"));
  console.log("                   «Разбор ответов» на экране:", /Разбор ответов/.test(st().textContent));

  console.log("\n=== 2. Промах пальцем: можно ли исправить\n");
  start("buildphrase");
  await tick(30);
  const p0 = JSON.parse(E("JSON.stringify((window.__pool||[]).filter(p=>(p.parts||[]).length>=2)[0])"));
  console.log("выражение:", p0.w, "«" + p0.t + "»", "| плиток:", p0.parts.length);
  const tiles = [...st().querySelectorAll("#tiles .scr-tile")].map(x => x.textContent.trim());
  console.log("плитки на экране:", JSON.stringify(tiles));
  // жмём НЕ ту плитку первой (промах)
  const wrongFirst = [...st().querySelectorAll("#tiles .scr-tile")].find(x => x.textContent.trim() !== p0.parts[0]);
  click(wrongFirst);
  console.log("нажал не ту первой:", JSON.stringify(wrongFirst.textContent.trim()));
  console.log("кнопки «Сбросить»/«Отменить» на экране:",
    [...st().querySelectorAll("button")].map(b => b.textContent.trim()).filter(Boolean));
  console.log("нажатая плитка снова доступна:", !wrongFirst.disabled);
  // дожимаем остальные
  for (const b of [...st().querySelectorAll("#tiles .scr-tile")]) if (!b.disabled) click(b);
  await tick(30);
  console.log("итог раунда:", (doc.getElementById("bp-msg") || {}).textContent);

  console.log("\n=== 3. Повторные нажатия\n");
  start("buildphrase");
  await tick(30);
  const pp = JSON.parse(E("JSON.stringify((window.__pool||[]).filter(p=>(p.parts||[]).length>=2))"));
  E("window.__log.xp = 0;");
  for (const word of pp[0].parts) {
    const b = [...st().querySelectorAll("#tiles .scr-tile")].find(x => !x.disabled && x.textContent.trim() === word);
    if (b) click(b);
  }
  const xp1 = log().xp;
  // колотим по всем плиткам ещё десять раз, пока идёт пауза 1100 мс
  for (let g = 0; g < 10; g++) [...st().querySelectorAll("#tiles .scr-tile")].forEach(click);
  await tick(1200);
  const xp2 = log().xp;
  console.log(`очки за первый раунд: ${xp1}; после 10 повторных проходов по плиткам: ${xp2}`);
  // последний раунд с ошибкой: жмём «Дальше» трижды подряд
  for (let k = 1; k < pp.length; k++) {
    const seq = (k === pp.length - 1) ? [...pp[k].parts].reverse() : pp[k].parts;
    for (const word of seq) {
      const b = [...st().querySelectorAll("#tiles .scr-tile")].find(x => !x.disabled && x.textContent.trim() === word);
      if (b) click(b);
    }
    await tick(30);
    const nb = doc.getElementById("bp-next");
    if (nb) { click(nb); click(nb); click(nb); await tick(30); }
    else await tick(1200);
  }
  await tick(200);
  const F = log();
  console.log("exFinish вызван раз:", F.finish.length, "→", JSON.stringify(F.finish));
  console.log("на экране:", (st().textContent.match(/Верно \d+ из \d+/) || ["(нет)"])[0]);
  process.exit(0);
})();
