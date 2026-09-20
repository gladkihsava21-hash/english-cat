// «Не буквально»: отвлекающие берутся из всего банка и отсеиваются только
// строгим сравнением строк (x.t !== p.t). Синонимичные переводы разных
// выражений строку не совпадают — и попадают в варианты рядом с верным.
// Ученик выбирает свой (правильный по сути) перевод и получает «неверно».
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 25));
const st = () => doc.getElementById("ex-stage");

w.eval("window.readGateMs = () => 0;");
w.eval(`
  window.__rounds = null;
  const _mcq = runMCQ;
  window.runMCQ = function (rounds, opts) { window.__rounds = rounds; return _mcq(rounds, opts); };
`);

// перезасев генератора между подходами: ищем подход, где столкновение видно
let seed = 1;
const reseed = s => { let r = s >>> 0; w.Math.random = () => {
  r ^= r << 13; r >>>= 0; r ^= r >> 17; r ^= r << 5; r >>>= 0; return r / 4294967296; }; };

const vars = t => String(t).split(/[;,]|\s\/\s/).map(s => s.replace(/\(.*?\)/g, "").trim().toLowerCase()).filter(Boolean);
const P = w.eval("PHRASES");
const byT = new Map();
[...P.phrasal, ...P.idioms].forEach(x => { if (!byT.has(x.t)) byT.set(x.t, []); byT.get(x.t).push(x.w); });

(async () => {
  const hits = [];
  for (let s = 1; s <= 400 && hits.length < 6; s++) {
    reseed(s * 7919);
    w.eval("localStorage.removeItem('savelyExSeen');");   // не даём pickFresh сузить пул
    w.eval('openExercise("notliteral")');
    await tick(5);
    const rounds = JSON.parse(w.eval("JSON.stringify(window.__rounds || [])"));
    rounds.forEach((r, ri) => {
      const right = r.options[r.correct];
      const vr = vars(right);
      r.options.forEach((o, oi) => {
        if (oi === r.correct) return;
        const common = vars(o).filter(v => vr.includes(v));
        if (common.length) hits.push({ seed: s, ri, r, o, oi, common });
      });
    });
  }
  console.log("Найдено столкновений:", hits.length);
  hits.slice(0, 6).forEach(h => {
    console.log(`\n— подход seed=${h.seed}, раунд ${h.ri + 1}`);
    console.log(`   на экране: «${h.r.prompt}» — ${h.r.sub}`);
    console.log(`   варианты: ${JSON.stringify(h.r.options)}`);
    console.log(`   засчитывается только: «${h.r.options[h.r.correct]}»`);
    console.log(`   отвлекающий «${h.o}» — это перевод выражения ${JSON.stringify(byT.get(h.o) || [])}`);
    console.log(`   общий смысл: ${h.common.join(", ")}`);
  });

  if (!hits.length) { console.log("не воспроизвелось"); process.exit(1); }

  // Доигрываем один такой раунд по-настоящему: жмём отвлекающий-синоним.
  const h = hits[0];
  console.log(`\n=== играем seed=${h.seed}, доходим до раунда ${h.ri + 1} и жмём «${h.o}» ===`);
  reseed(h.seed * 7919);
  w.eval("localStorage.removeItem('savelyExSeen');");
  w.eval('openExercise("notliteral")');
  await tick(20);
  for (let k = 0; k < h.ri; k++) {          // проходим предыдущие раунды верно
    const R = JSON.parse(w.eval("JSON.stringify(window.__rounds)"));
    const opts = [...st().querySelectorAll(".mcq-option")];
    click(opts[R[k].correct]);
    await tick(1250);
  }
  console.log("на экране:", st().querySelector(".quiz-label").textContent);
  console.log("выражение:", st().querySelector(".quiz-word").textContent);
  console.log("варианты:", [...st().querySelectorAll(".mcq-option")].map(b => b.textContent.trim()));
  const opts = [...st().querySelectorAll(".mcq-option")];
  click(opts[h.oi]);
  await tick(60);
  const chosen = opts[h.oi];
  console.log("ученик выбрал:", JSON.stringify(h.o));
  console.log("класс кнопки:", chosen.className, "| aria-label:", chosen.getAttribute("aria-label"));
  console.log("подсвечено как верное:", [...st().querySelectorAll(".mcq-option.right")].map(b => b.textContent.trim()));
  process.exit(0);
})();
