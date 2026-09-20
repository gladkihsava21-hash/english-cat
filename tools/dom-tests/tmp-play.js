// Играем три упражнения на выражения честно и нечестно, следим за счётом.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 25));
let fails = 0;
const ok = (c, what) => { console.log((c ? "  OK  " : "  ✗✗  ") + what); if (!c) fails++; };

w.eval(`
  window.readGateMs = () => 0;
  window.__log = { finish: [], stat: [], xp: 0, awards: [] };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word)); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; window.__log.awards.push(n); return _a(n); };
`);
const reset = () => w.eval("window.__log = { finish: [], stat: [], xp: 0, awards: [] };");
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const st = () => doc.getElementById("ex-stage");

// правильный вариант в MCQ вычисляем не по DOM, а из самого раунда — так же,
// как его знает упражнение: перехватываем runMCQ и запоминаем rounds.
w.eval(`
  window.__rounds = null;
  const _mcq = runMCQ;
  window.runMCQ = function (rounds, opts) { window.__rounds = rounds; return _mcq(rounds, opts); };
`);

async function playMCQ(id, mode) {   // mode: "right" | "wrong"
  reset(); errors.length = 0;
  w.eval("window.__rounds = null;");
  w.eval(`openExercise(${JSON.stringify(id)})`);
  await tick(50);
  const rounds = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
  let guard = 0;
  while (guard++ < 60) {
    const opts = [...st().querySelectorAll(".mcq-option")];
    if (!opts.length) {
      const nb = st().querySelector("#mcq-next");
      if (nb) { click(nb); await tick(30); continue; }
      break;
    }
    const counter = st().querySelector(".test-counter");
    const idx = counter ? (+counter.textContent.split("/")[0].trim() - 1) : 0;
    const r = rounds[idx];
    const want = mode === "right" ? r.correct : (r.correct + 1) % opts.length;
    click(opts[want]);
    await tick(40);
    const nb = st().querySelector("#mcq-next");
    if (nb) { click(nb); await tick(30); }
    else await tick(1200);   // верный ответ — пауза 1,1 с
    if (log().finish.length) break;
  }
  return { rounds, log: log(), errs: [...errors] };
}

async function playBuild(mode) {     // "right" | "wrong"
  reset(); errors.length = 0;
  w.eval('openExercise("buildphrase")');
  await tick(50);
  let guard = 0, rounds = 0;
  while (guard++ < 80) {
    const tiles = [...st().querySelectorAll(".scr-tiles .scr-tile")].filter(b => !b.disabled);
    if (!tiles.length) {
      const nb = st().querySelector("#bp-next");
      if (nb) { click(nb); await tick(30); continue; }
      break;
    }
    // верный порядок узнаём из перевода: ищем запись в банке по переводу
    const t = st().querySelector(".quiz-word").textContent;
    const parts = JSON.parse(w.eval(`JSON.stringify(((PHRASES.phrasal||[]).concat(PHRASES.idioms||[]))
      .find(x => x.t === ${JSON.stringify(t)}).parts)`));
    const order = mode === "right" ? parts : [...parts].reverse();
    for (const word of order) {
      const b = [...st().querySelectorAll(".scr-tiles .scr-tile")].find(x => !x.disabled && x.textContent === word);
      if (b) click(b);
      await tick(10);
    }
    rounds++;
    await tick(60);
    const nb = st().querySelector("#bp-next");
    if (nb) { click(nb); await tick(30); }
    else await tick(1200);
    if (log().finish.length) break;
  }
  return { rounds, log: log(), errs: [...errors] };
}

(async () => {
  for (const id of ["notliteral", "collocpair"]) {
    for (const mode of ["right", "wrong"]) {
      const r = await playMCQ(id, mode);
      const f = r.log.finish;
      console.log(`\n${id} / ${mode}: finish=${JSON.stringify(f)} awards=${JSON.stringify(r.log.awards)} xp=${r.log.xp} errs=${r.errs.length}`);
      ok(f.length === 1, `${id}/${mode}: подход закрыт ровно один раз (${f.length})`);
      if (f.length) {
        ok(f[0][1] === r.rounds.length, `${id}/${mode}: total=${f[0][1]} = раундов ${r.rounds.length}`);
        ok(f[0][0] <= f[0][1], `${id}/${mode}: верных ${f[0][0]} не больше ${f[0][1]}`);
        if (mode === "right") ok(f[0][0] === f[0][1], `${id}/right: все ответы верные → ${f[0][0]}/${f[0][1]}`);
        if (mode === "wrong") ok(f[0][0] === 0, `${id}/wrong: все ответы неверные → ${f[0][0]}/${f[0][1]}`);
      }
      ok(!r.errs.length, `${id}/${mode}: без ошибок обработчика ${JSON.stringify(r.errs)}`);
    }
  }
  for (const mode of ["right", "wrong"]) {
    const r = await playBuild(mode);
    const f = r.log.finish;
    console.log(`\nbuildphrase / ${mode}: finish=${JSON.stringify(f)} awards=${JSON.stringify(r.log.awards)} раундов сыграно ${r.rounds} errs=${r.errs.length}`);
    ok(f.length === 1, `buildphrase/${mode}: подход закрыт один раз (${f.length})`);
    if (f.length) {
      ok(f[0][0] <= f[0][1], `buildphrase/${mode}: верных ${f[0][0]} не больше ${f[0][1]}`);
      if (mode === "right") ok(f[0][0] === f[0][1], `buildphrase/right: ${f[0][0]}/${f[0][1]}`);
      if (mode === "wrong") ok(f[0][0] === 0, `buildphrase/wrong: ${f[0][0]}/${f[0][1]}`);
    }
    ok(!r.errs.length, `buildphrase/${mode}: без ошибок ${JSON.stringify(r.errs)}`);
  }
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "всё чисто"));
  process.exit(0);
})();
