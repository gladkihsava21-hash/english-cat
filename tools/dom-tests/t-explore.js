// разведка: как выглядят экраны игр и что в пуле
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

MQ.matches = true;   // reduced-motion: колесо сразу встаёт на слово

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o, v === undefined ? "default" : v]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
`);

const tick = ms => new Promise(r => setTimeout(r, ms || 40));

(async () => {
  for (const id of ["wheel", "memory", "balloons", "boxes"]) {
    w.eval(`openExercise(${JSON.stringify(id)})`);
    await tick(60);
    const st = doc.getElementById("ex-stage");
    console.log("\n===== " + id + " =====");
    console.log(st.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "<svg/>").slice(0, 1400));
  }
  console.log("\nerrors:", errors);
  process.exit(0);
})();
