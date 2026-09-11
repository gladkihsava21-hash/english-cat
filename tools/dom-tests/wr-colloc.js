// «Сочетания» (collocations → runPairs). Проверяем три подозрения.
//  1) в подход попадают две пары с ОДНИМ глаголом («give a reason» и
//     «give advice»). Слева тогда две одинаковые кнопки «give» — какая
//     из них чья, ученику неизвестно, а runPairs сверяет ИНДЕКС;
//  2) хвост, к которому в самом банке подходит второй глагол из этого же
//     подхода («an example» — и give, и set), а в COLLOC_ALSO его нет:
//     верное сочетание засчитывается ошибкой;
//  3) pickFresh просят 24 пары, а на экран берут 5 — остальные 19
//     помечаются «уже видел», ни разу не показавшись.
const { w } = require("./harness.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

const fs = require("fs"), path = require("path");
const s = doc.createElement("script");
s.textContent = fs.readFileSync(path.resolve(__dirname, "..", "..", "js/words.js"), "utf8");
doc.head.appendChild(s);

// оракул «верное ли это сочетание»: банк самой игры + список COLLOC_ALSO
const okPair = (h, tl) => E(`(() => {
  const h = ${JSON.stringify(h)}, tl = ${JSON.stringify(tl)};
  if (COLLOCATIONS.some(c => c.h === h && c.tl === tl)) return true;
  return (COLLOC_ALSO[tl] || []).includes(h);
})()`);

E(`window.__pairs = null; const __rp = runPairs;
   runPairs = function (pairs, opts) { window.__pairs = pairs.map(p => ({ l: p.l, r: p.r })); return __rp(pairs, opts); };`);

// сколько хвостов банка имеют больше одного верного глагола ВНУТРИ банка,
// и скольких из них нет в COLLOC_ALSO
console.log(E(`(() => {
  const byTail = {};
  COLLOCATIONS.forEach(c => (byTail[c.tl] = byTail[c.tl] || []).push(c.h));
  const multi = Object.entries(byTail).filter(([, hs]) => new Set(hs).size > 1);
  const uncovered = multi.filter(([tl, hs]) =>
    hs.some(h => !(COLLOC_ALSO[tl] || []).includes(h) &&
                 hs.filter(x => x !== h).some(x => !(COLLOC_ALSO[tl] || []).includes(x))));
  return "Хвостов с двумя глаголами в самом банке: " + multi.length
       + "; из них COLLOC_ALSO не знает: " + uncovered.length
       + "  → " + uncovered.slice(0, 8).map(([tl, hs]) => hs.join("/") + " " + tl).join(", ");
})()`));

let runs = 0, dupHead = 0, tailClash = 0, falseErr = 0;
const examples = [];
for (let n = 0; n < 40; n++) {
  E(`localStorage.removeItem("savelyExSeen")`);
  E(`openExercise("collocations")`);
  const pairs = JSON.parse(E("JSON.stringify(window.__pairs)"));
  if (!pairs || pairs.length < 2) continue;
  runs++;
  const heads = pairs.map(p => p.l);
  const hasDupHead = heads.some((h, i) => heads.indexOf(h) !== i);
  const hasTailClash = pairs.some(p => heads.some(h => h !== p.l && okPair(h, p.r)));
  if (hasDupHead) dupHead++;
  if (hasTailClash) tailClash++;

  // играем как ученик, который знает английский: кнопка слева +
  // первая свободная кнопка справа, дающая ВЕРНОЕ сочетание
  const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
  const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
  const bad = [];
  for (const lb of L()) {
    if (lb.classList.contains("done")) continue;
    const mate = R().find(rb => !rb.classList.contains("done")
                              && okPair(lb.textContent.trim(), rb.textContent.trim()));
    if (!mate) continue;
    click(lb);
    click(mate);
    if (!mate.classList.contains("done")) bad.push(lb.textContent.trim() + " + " + mate.textContent.trim());
  }
  if (bad.length) {
    falseErr++;
    if (examples.length < 3) examples.push({ pairs, bad, dup: hasDupHead, clash: hasTailClash });
  }
}

console.log(`\nПодходов: ${runs}`);
console.log(`  с двумя одинаковыми глаголами слева: ${dupHead}`);
console.log(`  где к чужому хвосту подходит глагол из этого же подхода: ${tailClash}`);
console.log(`  ученик соединил ВЕРНО, а игра сказала «ошибка»: ${falseErr}`);
examples.forEach(e => {
  console.log("   — подход:", e.pairs.map(p => p.l + " + " + p.r).join(" / "));
  console.log("     ошибкой засчитано верное:", e.bad.join("; "),
              `(две одинаковые кнопки слева: ${e.dup}, чужой хвост: ${e.clash})`);
});

// что видит ученик в конце: ищем подход с повтором глагола, играем «на знание»,
// потом добираем перебором — и читаем итоговую строку
for (let n = 0; n < 40; n++) {
  E(`localStorage.removeItem("savelyExSeen")`);
  E(`openExercise("collocations")`);
  const pairs = JSON.parse(E("JSON.stringify(window.__pairs)"));
  const heads = pairs.map(p => p.l);
  if (!heads.some((h, i) => heads.indexOf(h) !== i)) continue;
  const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
  const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];
  let firstErr = null;
  for (const lb of L()) {
    if (lb.classList.contains("done")) continue;
    const mate = R().find(rb => !rb.classList.contains("done")
                              && okPair(lb.textContent.trim(), rb.textContent.trim()));
    if (!mate) continue;
    click(lb); click(mate);
    if (!mate.classList.contains("done") && !firstErr)
      firstErr = lb.textContent.trim() + " + " + mate.textContent.trim();
  }
  if (!firstErr) continue;                      // повезло с порядком — берём следующий подход
  // добираем перебором, чтобы подход закрылся
  for (let guard = 0; guard < 200 && R().some(x => !x.classList.contains("done")); guard++) {
    const lb = L().find(x => !x.classList.contains("done"));
    const rb = R().find(x => !x.classList.contains("done"));
    if (!lb || !rb) break;
    click(lb); click(rb);
  }
  const t = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ");
  const m = t.match(/Верно \d+ из \d+/);
  console.log("\nПодход:", pairs.map(p => p.l + " + " + p.r).join(" / "));
  console.log("Ученик соединил верно по-английски:", firstErr, "→ игра сказала «ошибка»");
  console.log("Итог на экране:", m ? m[0] : "(подход не закрылся)");
  break;
}

// --- 3) pickFresh ---
E(`localStorage.removeItem("savelyExSeen")`);
E(`openExercise("collocations")`);
const shown = JSON.parse(E("JSON.stringify(window.__pairs)")).length;
const marked = Number(E(`(JSON.parse(localStorage.getItem("savelyExSeen"))["colloc:" + studyLevel()] || []).length`));
const bankSize = Number(E(`(() => {
  const lvl = studyLevel(), idx = LEVELS.indexOf(lvl);
  const near = new Set([LEVELS[Math.max(0,idx-1)], lvl, LEVELS[Math.min(LEVELS.length-1,idx+1)]]);
  return COLLOCATIONS.filter(c => near.has(c.lvl)).length;
})()`));
console.log(`\nПоказано пар: ${shown}; помечено «уже видел»: ${marked}; банк уровня: ${bankSize}`);
console.log(`Круг замкнётся за ${Math.ceil(bankSize / marked)} подходов, ученик успеет увидеть `
          + `${Math.ceil(bankSize / marked) * shown} пар из ${bankSize}`);
