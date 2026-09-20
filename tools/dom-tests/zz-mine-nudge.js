// «Сопоставление»/«Определения»: ошибки НЕ попадают в статистику уровней,
// верные — попадают. Ученик, который половину пар нашёл перебором,
// получает от сайта «ты отвечаешь верно в 100% случаев — попробуем выше?».
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const L = () => [...doc.querySelectorAll("#pairs-l .pair-item")];
const R = () => [...doc.querySelectorAll("#pairs-r .pair-item")];

w.eval(`window.readGateMs = () => 0;
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.level = "A2"; state.trainLevel = "A2"; state.levelStats = {};
  state.dictionary = WORDS.A2.slice(0, 14).map(x => ({ w:x.w, t:x.t, ex:x.ex, cat:x.cat, level:"A2", added:Date.now(), seen:1 }));
`);
console.log("уровень ученика:", w.eval("studyLevel()"), "| словарь: 14 слов A2");

let attempts = 0, firstTry = 0, misses = 0;
for (let round = 1; round <= 10; round++) {
  w.eval('openExercise("matching")');
  const t = new Map(JSON.parse(w.eval(`JSON.stringify(state.dictionary.map(d=>[d.w,d.t]))`)));
  const lefts = L();
  lefts.forEach((lb, k) => {
    click(lb);
    // каждую вторую пару ученик сперва тыкает мимо (перебор), потом верно
    if (k % 2 === 1) {
      const bad = R().find(x => !x.classList.contains("done") && x.textContent !== t.get(lb.textContent));
      if (bad) { click(bad); misses++; }
    } else firstTry++;
    const good = R().find(x => x.textContent === t.get(lb.textContent) && !x.classList.contains("done"));
    if (good) click(good);
    attempts++;
  });
}
console.log(`\nсыграно ${attempts} пар: ${firstTry} с первого раза, ${misses} промахов перед верным ответом`);
console.log("levelStats:", w.eval("JSON.stringify(state.levelStats)"));
console.log("→ по этой копилке сайт считает точность:",
  w.eval(`(() => { const s = state.levelStats.A2; return Math.round(s.r/(s.r+s.w)*100) + "%"; })()`));
w.eval("renderLevelNudge()");
const nudge = doc.getElementById("train-level-nudge");
console.log("подсказка на экране тренировок:", (nudge && nudge.textContent.replace(/\s+/g," ").trim()) || "(нет)");

console.log("\n--- для сравнения, тот же ученик в «Выборе варианта» (mcq) ---");
w.eval(`state.levelStats = {}; openExercise("mcq");`);
setTimeout(() => {
  let n = 0;
  const step = () => {
    const btns = [...doc.querySelectorAll("#ex-stage .mcq-option")];
    if (!btns.length || n > 8) {
      console.log("levelStats после mcq:", w.eval("JSON.stringify(state.levelStats)"), "— ошибки посчитаны");
      return;
    }
    n++;
    click(btns[btns.length - 1]);   // всегда последний вариант — где-то мимо
    const nb = doc.querySelector("#ex-stage #mcq-next");
    if (nb) click(nb);
    setTimeout(step, 1250);
  };
  step();
}, 60);
