// «Что с чем»: отвлекающие — первые слова ДРУГИХ сочетаний, и ничто не
// проверяет, что отвлекающее слово не даёт с этим же хвостом такое же
// верное сочетание, которое лежит в том же банке.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 25));
const st = () => doc.getElementById("ex-stage");

E("window.readGateMs = () => 0;");
E(`window.__rounds = null; const _m = runMCQ;
   window.runMCQ = function (r, o) { window.__rounds = r; return _m(r, o); };`);

const reseed = s => { let r = s >>> 0; w.Math.random = () => {
  r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; }; };

const P = E("PHRASES");
// оракул: сочетание «голова + хвост» есть в самом банке игры
const inBank = (head, rest) => P.colloc.some(x =>
  x.parts && x.parts[0] === head && x.parts.slice(1).join(" ") === rest);

(async () => {
  let sessions = 0, rounds = 0, bad = 0;
  const hits = [];
  for (let s = 1; s <= 200; s++) {
    reseed(s * 7919);
    E(`localStorage.removeItem('savelyExSeen');`);
    E('openExercise("collocpair")');
    await tick(3);
    const R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
    if (!R.length) continue;
    sessions++;
    R.forEach((r, ri) => {
      rounds++;
      const rest = String(r.prompt).replace(/^…\s*/, "");
      const right = r.options[r.correct];
      r.options.forEach((o, oi) => {
        if (oi === r.correct) return;
        if (inBank(o, rest)) {
          bad++;
          if (hits.length < 8) hits.push({ s, ri, r, o, oi, rest, right,
            alsoT: (P.colloc.find(x => x.parts[0] === o && x.parts.slice(1).join(" ") === rest) || {}).t });
        }
      });
    });
  }
  console.log(`подходов: ${sessions}, вопросов: ${rounds}`);
  console.log(`вопросов, где отвлекающее слово даёт сочетание ИЗ ЭТОГО ЖЕ БАНКА: ${bad}`
            + ` (${(bad / rounds * 100).toFixed(1)}% вопросов)`);
  hits.forEach(h => {
    console.log(`\n— seed=${h.s} раунд ${h.ri + 1}: «${h.r.prompt}»  ${h.r.sub}`);
    console.log(`   варианты: ${JSON.stringify(h.r.options)}`);
    console.log(`   засчитывается: «${h.right} ${h.rest}»`);
    console.log(`   а «${h.o} ${h.rest}» — тоже сочетание из банка, «${h.alsoT}» → будет «неверно»`);
  });

  if (!hits.length) { console.log("не воспроизвелось"); process.exit(1); }

  // Доигрываем один такой вопрос по-настоящему
  const h = hits[0];
  console.log(`\n=== играем seed=${h.s}, доходим до вопроса ${h.ri + 1} и жмём «${h.o}» ===`);
  reseed(h.s * 7919);
  E(`localStorage.removeItem('savelyExSeen');`);
  E('openExercise("collocpair")');
  await tick(20);
  for (let k = 0; k < h.ri; k++) {
    const R = JSON.parse(E("JSON.stringify(window.__rounds)"));
    click([...st().querySelectorAll(".mcq-option")][R[k].correct]);
    await tick(1250);
  }
  console.log("на экране:", st().querySelector(".quiz-label").textContent,
              "|", st().querySelector(".quiz-word").textContent);
  const opts = [...st().querySelectorAll(".mcq-option")];
  console.log("варианты:", opts.map(b => b.textContent.trim()));
  click(opts[h.oi]);
  await tick(60);
  console.log("ученик выбрал:", JSON.stringify(h.o), "→ класс:", opts[h.oi].className,
              "| aria-label:", opts[h.oi].getAttribute("aria-label"));
  console.log("подсвечено верным:", [...st().querySelectorAll(".mcq-option.right")].map(b => b.textContent.trim()));
  process.exit(0);
})();
