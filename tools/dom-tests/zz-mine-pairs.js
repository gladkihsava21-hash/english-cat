// runPairs сверяет пару ПО ИНДЕКСУ, а не по тексту. Две пары с одинаковой
// правой надписью → одна из двух одинаковых кнопок «неверная».
// Детерминированно: гоняем один и тот же расклад много раз и считаем,
// как часто верное по смыслу соединение объявлено ошибкой.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

w.eval(`window.readGateMs = () => 0;
  window.__stat = [];
  const _s = statUpdate;
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _s(word, ok, v); };
`);

w.eval('openExercise("matching")');   // чтобы появился #ex-stage
let rejected = 0, accepted = 0;
const N = 40;
for (let k = 0; k < N; k++) {
  w.eval(`stage().innerHTML = ""; window.__stat = [];
    runPairs([{l:"run", r:"бежать", statWord:"run"},
              {l:"jog", r:"бежать", statWord:"jog"},
              {l:"walk", r:"идти",  statWord:"walk"}]);`);
  const run = L().find(x => x.textContent === "run");
  const beg = R().filter(x => x.textContent === "бежать");
  if (beg.length !== 2) { console.log("расклад не собрался"); process.exit(2); }
  click(run);
  click(beg[0]);              // ученик жмёт кнопку с надписью «бежать»
  if (beg[0].classList.contains("bad")) rejected++; else accepted++;
  if (rejected === 1 && !w.__shown) {
    w.__shown = 1;
    console.log("пример прогона:");
    console.log("  слева:", L().map(x => x.textContent).join(" | "));
    console.log("  справа:", R().map(x => x.textContent).join(" | "));
    console.log("  ученик: run → «бежать» (первая такая кнопка) → class=\"" + beg[0].className + "\"");
    console.log("  statUpdate:", w.eval("JSON.stringify(window.__stat)"));
  }
}
console.log(`\nиз ${N} одинаковых раскладов «run → бежать» принято ${accepted}, объявлено ошибкой ${rejected}`);

// то же на живом «Сопоставлении» со словарём ученика, где big и large = «большой»
console.log("\n— живое упражнение «Сопоставление»:");
w.eval(`state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [
    { w:"big", t:"большой", added:Date.now(), seen:1 },
    { w:"large", t:"большой", added:Date.now(), seen:1 },
    { w:"cat", t:"кот", added:Date.now(), seen:1 },
    { w:"dog", t:"собака", added:Date.now(), seen:1 },
    { w:"sun", t:"солнце", added:Date.now(), seen:1 }];`);
let bad2 = 0, good2 = 0, sample = null;
for (let k = 0; k < 40; k++) {
  w.eval(`state.dictionary.forEach(d => { delete d.forgot; delete d.knew; delete d.reps; delete d.due; delete d.lastReview; });
          window.__stat = []; openExercise("matching");`);
  const big = L().find(x => x.textContent === "big");
  const same = R().filter(x => x.textContent === "большой");
  if (!big || same.length !== 2) continue;
  click(big); click(same[0]);
  if (same[0].classList.contains("bad")) {
    bad2++;
    if (!sample) sample = {
      right: R().map(x => x.textContent).join(" | "),
      stat: w.eval("JSON.stringify(window.__stat)"),
      rec: w.eval(`JSON.stringify((d=>({forgot:d.forgot,knew:d.knew,reps:d.reps,status:d.status}))(state.dictionary.find(x=>x.w==="big")))`),
    };
  } else good2++;
}
console.log(`  из 40 подходов «big → большой (первая кнопка)» принято ${good2}, объявлено ошибкой ${bad2}`);
if (sample) {
  console.log("  пример: справа [" + sample.right + "]");
  console.log("  statUpdate:", sample.stat, " запись big:", sample.rec);
}
process.exit(rejected > 0 || bad2 > 0 ? 1 : 0);
