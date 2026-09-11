// «Синонимы и антонимы»: не стоит ли среди неверных вариантов такой,
// который САМ БАНК считает верным ответом на этот же вопрос.
//
// Оракул строим из самих данных упражнения, без языковых догадок:
//   syn-ребро  w — s.syn      (банк: «синоним w это syn»)
//   ant-ребро  w — s.ant      (банк: «антоним w это ant»)
// Синонимом w банк считает всё, до чего можно дойти по одному syn-ребру
// в любую сторону; антонимом — ant-ребро плюс не более одного syn-ребра
// с любого его конца («антоним sad = happy, синоним happy = glad,
// значит glad — тоже антоним sad»).
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

E(`window.readGateMs = () => 0; window.__mcq = null;
   const _m = runMCQ; window.runMCQ = function (r, o) { window.__mcq = r; return _m(r, o); };
   state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;`);

const BANK = JSON.parse(E(`JSON.stringify(SYNONYMS)`));
const synN = new Map(), antN = new Map();
const add = (m, a, b) => { if (!m.has(a)) m.set(a, new Set()); m.get(a).add(b); };
BANK.forEach(s => {
  add(synN, s.w, s.syn); add(synN, s.syn, s.w);
  add(antN, s.w, s.ant); add(antN, s.ant, s.w);
});
const synOf = x => new Set(synN.get(x) || []);
const antOf = x => {
  const out = new Set();
  (antN.get(x) || []).forEach(a => { out.add(a); synOf(a).forEach(y => out.add(y)); });
  return out;
};

(async () => {
  console.log("── неверные варианты, которые банк сам называет верным ответом");
  let rounds = 0, bad = 0;
  const seen = new Map();
  for (let k = 0; k < 60; k++) {
    E(`window.__mcq = null; openExercise("synonyms")`);
    await tick(4);
    const rs = JSON.parse(E(`JSON.stringify(window.__mcq || [])`));
    rs.forEach(r => {
      rounds++;
      const askSyn = /СИНОНИМ/.test(r.sub);
      const good = askSyn ? synOf(r.prompt) : antOf(r.prompt);
      r.options.forEach((o, i) => {
        if (i === r.correct) return;
        if (!good.has(o)) return;
        bad++;
        const key = `${r.sub} «${r.prompt}» · верным считается «${r.options[r.correct]}», ошибкой — «${o}»`;
        seen.set(key, (seen.get(key) || 0) + 1);
      });
    });
  }
  console.log(`   заданий собрано: ${rounds}; среди них с таким вариантом: ${bad}`);
  [...seen.entries()].slice(0, 12).forEach(([k, n]) => console.log(`   · ${k}   (встретилось ${n} раз)`));

  // ── прогон через экран: ученик нажимает именно такой вариант ─────────
  console.log("\n── ученик выбирает его на экране");
  let done = false;
  for (let k = 0; k < 200 && !done; k++) {
    E(`window.__mcq = null; openExercise("synonyms")`);
    await tick(4);
    const rs = JSON.parse(E(`JSON.stringify(window.__mcq || [])`));
    let j = -1, idx = -1;
    rs.forEach((x, n) => {
      if (j >= 0) return;
      const g = /СИНОНИМ/.test(x.sub) ? synOf(x.prompt) : antOf(x.prompt);
      const p = x.options.findIndex((o, i) => i !== x.correct && g.has(o));
      if (p >= 0) { j = n; idx = p; }
    });
    if (j < 0) continue;
    // доходим до нужного вопроса, отвечая верно
    for (let n = 0; n < j; n++) {
      const b = doc.getElementById("mcq-options");
      click(b.children[rs[n].correct]);
      await tick(1300);
    }
    const r = rs[j];
    done = true;
    const box = doc.getElementById("mcq-options");
    console.log(`   вопрос ${j + 1}-й в подходе: ${r.sub} «${r.prompt}»`);
    console.log(`   варианты: ${r.options.join(" | ")}`);
    console.log(`   ученик жмёт «${r.options[idx]}» — банк: `
      + BANK.filter(s => s.w === r.prompt || s.syn === r.prompt || s.ant === r.prompt)
            .map(s => `${s.w}/син ${s.syn}/ант ${s.ant}`).join("; ")
      + " + " + BANK.filter(s => s.syn === r.options[idx] || s.w === r.options[idx])
            .map(s => `${s.w}/син ${s.syn}/ант ${s.ant}`).join("; "));
    click(box.children[idx]);
    await tick(20);
    console.log("   на кнопке:", box.children[idx].getAttribute("aria-label"));
    console.log("   пометка верного варианта ушла на:", box.children[r.correct].textContent.trim());
    console.log("   разбор:", (doc.querySelector(".quiz-why") || {}).textContent || "(нет)");
  }
  if (!done) console.log("   за 80 подходов такой вариант первым вопросом не выпал");

  console.log("\nошибок в окне:", require("./harness-full.js").errors.length);
})();
