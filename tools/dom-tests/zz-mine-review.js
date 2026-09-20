// Разбор ответов после «Слово и картинка»: что написано в графе «вопрос».
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));

w.eval(`window.readGateMs = () => 0;
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [...WORDS.A1.slice(0, 20), ...WORDS.A2.slice(0, 20)]
    .map(x => ({ w:x.w, t:x.t, ex:x.ex, cat:x.cat, added:Date.now(), seen:1 }));
  window.__cap = null; const _m = runMCQ;
  window.runMCQ = function (r, o) { window.__cap = r; return _m(r, o); };
  openExercise("picture");`);

(async () => {
  const rounds = JSON.parse(w.eval("JSON.stringify(window.__cap)"));
  console.log("вопрос упражнения:", JSON.stringify({ sub: rounds[0].sub, prompt: rounds[0].prompt, art: rounds[0].art.slice(0, 60) }));
  for (let n = 0; n < rounds.length; n++) {
    await tick(50);
    const btns = [...doc.querySelectorAll("#ex-stage .mcq-option")];
    if (!btns.length) break;
    // первые два вопроса отвечаем НЕВЕРНО, остальные верно
    const want = rounds[n].options[rounds[n].correct];
    const b = n < 2 ? btns.find(x => x.textContent.trim() !== want) : btns.find(x => x.textContent.trim() === want);
    click(b);
    await tick(40);
    const nb = doc.querySelector("#ex-stage #mcq-next");
    if (nb) click(nb); else await tick(1250);
  }
  await tick(300);
  const rev = doc.querySelector("#ex-stage .ex-review");
  console.log("\n--- разбор после подхода ---");
  console.log(rev ? rev.textContent.replace(/\s+/g, " ").trim().slice(0, 700) : "(разбора нет)");
  console.log("\nexLog целиком:", w.eval("JSON.stringify(exLog.slice(0,3), null, 1)"));
})();
