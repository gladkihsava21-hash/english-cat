// Упражнения «На слух» тестируются с речью: без неё их теперь честно
// не пускает заслон на входе (см. openExercise).
process.env.TTS = "1";
// Домашка репетитора: слово bone, упражнение «Диктант».
// Ученик слышит фразу и записывает её ЗНАК В ЗНАК, обычной клавиатурой.
// Смотрим, что он увидит, что уедет репетитору и что станет со словом.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));

w.eval(`
  window.__log = { stat: [], type: null };
  const _s = statUpdate, _t = runType;
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.runType = function (r, o) { window.__log.type = r; return _t(r, o); };
  state.taskResults = {};
  homeworkTasks = [];
  readGateMs = () => 0;
`);

(async () => {
  const banked = JSON.parse(w.eval(`JSON.stringify(WORDS.A1.find(x => x.w === "bone"))`));
  console.log("в банке у слова bone пример:", JSON.stringify(banked.ex));

  w.eval(`
    startHomeworkLesson({ id: "hw-bone", title: "Диктант к среде", game: "dictation",
      words: [{ w: "bone", t: ${JSON.stringify(banked.t)}, ex: ${JSON.stringify(banked.ex)}, level: "A1" }] });
  `);
  await tick(120);

  const rounds = JSON.parse(w.eval("JSON.stringify(window.__log.type)"));
  console.log("раундов в диктанте:", rounds.length, "| диктуют:", JSON.stringify(rounds[0].audioText));

  const inp = doc.getElementById("type-input");
  // Ученик расслышал и записал. Апостроф — тот, что на клавиатуре.
  inp.value = "It's a bone.";
  console.log("ученик пишет:", JSON.stringify(inp.value));
  click(doc.getElementById("type-check"));
  await tick(60);

  console.log("\nчто на экране:");
  console.log("  вердикт   : «" + doc.getElementById("type-feedback").textContent.replace(/\s+/g, " ").trim() + "»");
  const rev = [...doc.querySelectorAll("#ex-stage p.muted-small")]
    .map(p => p.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
  console.log("  объяснение: «" + (rev[0] || "—") + "»");

  // доигрываем подход до конца
  const nb = doc.getElementById("type-next");
  if (nb) click(nb);
  await tick(200);
  const stage = doc.getElementById("ex-stage");
  console.log("  итог      : «" + (stage.querySelector("h2") || {}).textContent + " " +
    ((stage.querySelector(".empty-state p") || {}).textContent || "").trim() + "»");

  console.log("\nчто уехало репетитору:",
    w.eval('JSON.stringify(state.taskResults["hw-bone"] || null)'));
  console.log("statUpdate:", JSON.stringify(JSON.parse(w.eval("JSON.stringify(window.__log.stat)"))));
  console.log("слово в словаре после подхода:",
    w.eval('JSON.stringify(state.dictionary.find(d => d.w === "bone"))'));

  console.log("\n--- контроль: тот же ученик пишет с типографским апострофом ---");
  const d2 = w.eval(`JSON.stringify(dictationDiff("It\\u2019s a bone.", ${JSON.stringify(banked.ex)}))`);
  console.log("  ok =", JSON.parse(d2).ok);
})();
