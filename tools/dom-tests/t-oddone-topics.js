// «Найди лишнее»: что игра утверждает в разборе и за что ставит ошибку,
// когда в тройке «своей темы» оказывается слово с чужой пометкой.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], xp: 0 };
  const _f = exFinish, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.award = function (n) { window.__log.xp += Math.round(n); return _a(n); };
  window.readGateMs = () => 0;
  window.__rounds = null;
  const _mcq = runMCQ;
  window.runMCQ = function (rounds, opts) { window.__rounds = rounds; return _mcq(rounds, opts); };
`);

// Слова, у которых пометка темы в банке была заведомо не та (проверено
// руками по js/words-A1.js … words-B1.js). Значение — та самая неверная
// тема. Раунд считаем грязным, только если слово ДО СИХ ПОР в ней: иначе
// после чистки банка тест помечал бы правильные раунды («пещера — это
// природа») просто по имени слова.
const MISFILED = {
  north: "body", western: "body", southern: "body", northern: "body",
  fax: "body", meet: "body", cave: "body",
  head: "animals", body: "animals", face: "animals", skin: "animals",
  cart: "animals", adult: "animals", smell: "animals", shoulder: "animals",
  spirit: "animals", toe: "animals", scratch: "animals", variety: "animals",
  ski: "weather", sailing: "weather", pipe: "weather",
  size: "clothes", piece: "clothes", heel: "clothes", wardrobe: "clothes",
  dark: "family", lily: "family", direction: "family", rise: "family",
  hockey: "family", relative: "family",
};

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("\n1. Как часто игра утверждает про слово заведомо не ту тему");
  let rounds = 0, dirty = 0, oddDirty = 0, threeDirty = 0;
  const samples = [];
  w.eval(`state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 60)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
    state.trainWords = [];`);
  const nowCat = JSON.parse(w.eval(`JSON.stringify(Object.fromEntries(
    ${JSON.stringify(Object.keys(MISFILED))}.map(x => [x, (wordInfo(x) || {}).cat])))`));
  const stillBad = o => MISFILED[o] && nowCat[o] === MISFILED[o];
  for (let i = 0; i < 60; i++) {
    let s = ((i + 1) * 2654435761) >>> 0;
    w.Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    w.eval('openExercise("oddone")');
    const rs = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
    rs.forEach(r => {
      rounds++;
      const right = r.options[r.correct];
      const bad = r.options.filter(stillBad);
      if (!bad.length) return;
      dirty++;
      if (bad.includes(right)) oddDirty++;
      if (bad.some(o => o !== right)) {
        threeDirty++;
        if (samples.length < 5) samples.push({ options: r.options, right, why: r.why });
      }
    });
  }
  console.log("  раундов собрано: " + rounds);
  console.log("  раундов, где хоть одно слово помечено заведомо не той темой: "
    + dirty + " (" + Math.round(dirty / rounds * 100) + "%)");
  console.log("     из них «лишним» назначено такое слово: " + oddDirty);
  console.log("     из них такое слово стоит В ТРОЙКЕ (то есть ученик, ответивший "
    + "по смыслу, получит ошибку): " + threeDirty);
  samples.forEach(s => {
    console.log("     • " + JSON.stringify(s.options) + " → верным считается «" + s.right + "»");
    console.log("       разбор: " + s.why);
  });
  ok(threeDirty === 0, "нет раундов, где верный по смыслу ответ считается ошибкой");

  console.log("\n2. Тот же случай вживую: словарь из «тела» (с пещерой) и «еды»");
  w.eval(`
    const pick = ["cave", "hand", "leg", "nose", "milk", "bread", "tea", "egg"];
    state.dictionary = pick.map(x => { const i = wordInfo(x);
      return { w: i.w, t: i.t, ex: i.ex, added: Date.now(), seen: 1 }; });
    state.trainWords = pick.slice();
    window.__log.finish = []; window.__log.xp = 0;
  `);
  let found = null;
  for (let i = 0; i < 40 && !found; i++) {
    let s = ((i + 7) * 40503) >>> 0;
    w.Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    w.eval('openExercise("oddone")');
    const rs = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
    const idx = rs.findIndex(r => r.options.includes("cave") && r.options[r.correct] !== "cave");
    if (idx === 0) found = rs[0];   // берём только первый раунд — по нему и кликнем
  }
  if (!found) { console.log("  на этих зёрнах такой раунд первым не выпал"); }
  else {
    console.log("  раунд 1: " + JSON.stringify(found.options));
    console.log("  игра считает верным: «" + found.options[found.correct] + "»");
    console.log("  разбор: " + found.why);
    await tick(20);
    const opts = [...doc.querySelectorAll("#mcq-options .mcq-option")];
    const caveBtn = opts.find(b => b.textContent.trim() === "cave");
    click(caveBtn);
    await tick(20);
    const cls = caveBtn.className;
    console.log("  ученик нажал «cave» (пещера) — кнопка стала: " + cls);
    ok(!/wrong/.test(cls), "«cave» (пещера) среди частей тела — не ошибка");
    ok(!/— это тело/.test(found.why), "разбор не утверждает, что пещера — это тело");
  }

  console.log("\nошибок JS: " + errors.length);
  errors.forEach(e => console.log("   " + e));
  console.log(fails ? "ПРОБЛЕМ: " + fails : "всё чисто");
  process.exit(fails ? 1 : 0);
})();
