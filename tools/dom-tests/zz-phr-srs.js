// Выражения из папки ученика тренируются, но в словаре не двигаются:
// notliteral / buildphrase / collocpair не зовут statUpdate, поэтому
// srsReview и noteLevelAnswer о подходе не узнают. Запись остаётся
// «новой» сколько её ни тренируй.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 20));
const st = () => doc.getElementById("ex-stage");

E("window.readGateMs = () => 0;");
E(`window.__rounds = null; window.__pool = null;
   const _m = runMCQ, _pp = EX_RUNNERS._phrasePool;
   window.runMCQ = function (r, o) { window.__rounds = r; return _m(r, o); };
   EX_RUNNERS._phrasePool = function (k, n, need) {
     const r = _pp.call(EX_RUNNERS, k, n, need); window.__pool = r; return r; };`);

// папка «Фразовые глаголы» из выражений своего уровня — как её собирает
// «+ Фразовые глаголы, идиомы, сочетания» в словаре
E(`state.level = "A2"; state.trainLevel = "A2"; state.levelStats = {};
   state.dictionary = PHRASES.phrasal.filter(x => ["A1","A2","B1"].includes(x.level))
     .slice(0, 20).map(rec => ({ w: rec.w, t: rec.t, ex: rec.ex, exr: rec.exr, def: rec.def,
       cat: rec.cat, level: rec.level, kind: rec.kind, literal: rec.literal, parts: rec.parts,
       status: "new", knew: 0, forgot: 0, folders: ["Фразовые глаголы"] }));
   state.dictionary.forEach(d => { if (typeof srsInit === "function") srsInit(d); });
   state.folders = ["Фразовые глаголы"]; state.trainFolders = ["Фразовые глаголы"]; state.trainWords = [];`);

const snap = () => JSON.parse(E(`JSON.stringify(state.dictionary.map(d =>
  ({ w: d.w, status: d.status, knew: d.knew, forgot: d.forgot, due: d.due || null, reps: d.reps || 0 })))`));

(async () => {
  const before = snap();
  console.log("в папке «Фразовые глаголы»:", before.length, "выражений, все status=new\n");

  for (let run = 1; run <= 3; run++) {
    E(`localStorage.removeItem('savelyExSeen'); openExercise("notliteral");`);
    await tick(20);
    const R = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
    for (let k = 0; k < R.length; k++) {
      click([...st().querySelectorAll(".mcq-option")][R[k].correct]);
      await tick(1200);
    }
    console.log(`подход ${run} «Не буквально»: ${R.length} вопросов, все верно`);
  }
  E(`localStorage.removeItem('savelyExSeen'); openExercise("buildphrase");`);
  await tick(20);
  const pool = JSON.parse(E("JSON.stringify((window.__pool||[]).filter(p=>(p.parts||[]).length>=2))"));
  for (const p of pool) {
    for (const word of p.parts) {
      const b = [...st().querySelectorAll("#tiles .scr-tile")]
        .find(x => !x.disabled && x.textContent.trim() === word);
      if (b) click(b);
    }
    await tick(1200);
  }
  console.log(`подход 4 «Собери выражение»: ${pool.length} выражений, все верно\n`);

  const after = snap();
  const moved = after.filter((d, i) => JSON.stringify(d) !== JSON.stringify(before[i]));
  console.log("записей в словаре изменилось:", moved.length, "из", after.length);
  console.log("пример записи после четырёх подходов:", JSON.stringify(after[0]));
  console.log("state.levelStats (по ним сайт предлагает сменить уровень):",
              E("JSON.stringify(state.levelStats)"));
  console.log("\nДля сравнения — обычное упражнение по тем же словам («Выбор варианта»):");
  E(`state.trainFolders = []; state.trainWords = []; localStorage.removeItem('savelyExSeen');
     openExercise("mcq");`);
  await tick(20);
  const R2 = JSON.parse(E("JSON.stringify(window.__rounds || [])"));
  for (let k = 0; k < R2.length; k++) {
    click([...st().querySelectorAll(".mcq-option")][R2[k].correct]);
    await tick(1200);
  }
  const after2 = snap();
  console.log("записей в словаре изменилось:",
              after2.filter((d, i) => JSON.stringify(d) !== JSON.stringify(after[i])).length,
              "из", after2.length, "| levelStats:", E("JSON.stringify(state.levelStats)"));
  process.exit(0);
})();
