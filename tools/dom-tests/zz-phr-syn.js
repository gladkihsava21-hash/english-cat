// «Не буквально»: отвлекающие отсеиваются только строгим сравнением строк
// (x.t !== p.t). Синонимичный перевод другого выражения строку не совпадает
// и встаёт рядом с верным ответом. Считаем, как часто, и доигрываем один
// такой вопрос по-настоящему.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");

E("window.readGateMs = () => 0;");
E(`window.__rounds = null; const _m = runMCQ;
   window.runMCQ = function (r, o) { window.__rounds = r; return _m(r, o); };`);
const reseed = s => { let r = s >>> 0; w.Math.random = () => {
  r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; }; };

// варианты перевода: «садиться (в машину), входить» → ["садиться", "входить"]
const vars = t => String(t).split(/[;,]|\s\/\s/)
  .map(s => s.replace(/\(.*?\)/g, "").trim().toLowerCase()).filter(Boolean);
const P = E("PHRASES");
const byT = new Map();
[...P.phrasal, ...P.idioms].forEach(x => { if (!byT.has(x.t)) byT.set(x.t, []); byT.get(x.t).push(x.w); });

(async () => {
  let sessions = 0, rounds = 0, bad = 0;
  const hits = [];
  for (let s = 1; s <= 400; s++) {
    reseed(s * 7919);
    E("localStorage.removeItem('savelyExSeen');");
    E('openExercise("notliteral")');
    await tick(2);
    const R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
    if (!R.length) continue;
    sessions++;
    R.forEach((r, ri) => {
      rounds++;
      const vr = vars(r.options[r.correct]);
      r.options.forEach((o, oi) => {
        if (oi === r.correct) return;
        const common = vars(o).filter(v => vr.includes(v));
        if (common.length) { bad++; if (hits.length < 6) hits.push({ s, ri, r, o, oi, common }); }
      });
    });
  }
  console.log(`подходов: ${sessions}, вопросов: ${rounds}`);
  console.log(`вопросов, где отвлекающий вариант — тот же смысл, что верный: ${bad}`
    + ` (${(bad / rounds * 100).toFixed(2)}% вопросов, ≈ раз в ${Math.round(sessions / Math.max(bad,1))} подходов)`);
  hits.forEach(h => {
    console.log(`\n— seed=${h.s} вопрос ${h.ri + 1}: «${h.r.prompt}» — ${h.r.sub}`);
    console.log(`   варианты: ${JSON.stringify(h.r.options)}`);
    console.log(`   засчитывается только: «${h.r.options[h.r.correct]}»`);
    console.log(`   отвлекающий «${h.o}» — перевод ${JSON.stringify(byT.get(h.o) || [])}, общее: ${h.common.join(", ")}`);
  });
  if (!hits.length) { console.log("не воспроизвелось"); process.exit(1); }

  // берём самый очевидный: где отвлекающий — тоже верный перевод самого prompt
  const h = hits.find(x => /get in/.test(x.r.prompt)) || hits[0];
  console.log(`\n=== играем seed=${h.s}, доходим до вопроса ${h.ri + 1} и жмём «${h.o}» ===`);
  reseed(h.s * 7919);
  E("localStorage.removeItem('savelyExSeen');");
  E('openExercise("notliteral")');
  await tick(20);
  for (let k = 0; k < h.ri; k++) {
    const R = JSON.parse(E("JSON.stringify(window.__rounds)"));
    click([...st().querySelectorAll(".mcq-option")][R[k].correct]);
    await tick(1250);
  }
  console.log("на экране:", st().querySelector(".quiz-label").textContent);
  console.log("выражение:", st().querySelector(".quiz-word").textContent);
  const opts = [...st().querySelectorAll(".mcq-option")];
  console.log("варианты:", opts.map(b => b.textContent.trim()));
  click(opts[h.oi]);
  await tick(50);
  console.log("ученик выбрал:", JSON.stringify(h.o), "→", opts[h.oi].getAttribute("aria-label"));
  console.log("подсвечено верным:", [...st().querySelectorAll(".mcq-option.right")].map(b => b.textContent.trim()));
  process.exit(0);
})();
