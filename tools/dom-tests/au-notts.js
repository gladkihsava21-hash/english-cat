// A. Ветка без синтеза речи (TTS_OK = false): вход в «На слух» мимо хаба.
// B. Диктант одним словом: прощёная опечатка в том самом слове.
// C. Аудирование: не попадёт ли в варианты омофон услышанного.
// D. Порядок на экране: где оказывается разбор по словам.
const { w } = require("./harness-full.js");
const doc = w.document;
// Кнопок «Прослушать» и вариантов после заслона «нет озвучки» нет — и это
// правильное поведение. Не падаем, а говорим об этом.
const click = el => { if (el) el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  else console.log("   (элемента нет на экране — упражнение закрыто заслоном)"); };
const tick = ms => new Promise(r => setTimeout(r, ms || 20));

w.eval(`
  window.__log = { board: [], finish: [], stat: [], type: null, speak: [] };
  const _f = exFinish, _s = statUpdate, _t = runType, _sp = speak;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.runType = function (r, o) { window.__log.type = r; return _t(r, o); };
  window.speak = function (t, o) { window.__log.speak.push(String(t)); return _sp(t, o); };
  window.reportBoardResult = function (card, i) { window.__log.board.push([card, i]); return Promise.resolve(true); };
  state.taskResults = {}; homeworkTasks = []; readGateMs = () => 0;
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));

(async () => {
  console.log("TTS_OK =", w.eval("TTS_OK"), "— браузер не умеет говорить (Telegram/ВК/старый WebView)");

  console.log("\nA. Репетитор кинула карточку на доску: #train=dictation&card=…");
  w.eval('window.boardTaskCard = "card-9"; openExercise("dictation");');
  await tick(80);
  const rounds = JSON.parse(w.eval("JSON.stringify(window.__log.type)"));
  const bodyText = doc.getElementById("exercise-body").textContent.replace(/\s+/g, " ").trim();
  console.log("   на экране:", JSON.stringify(bodyText.slice(0, 130)));
  console.log("   подсказка «здесь нет озвучки» внутри упражнения:",
    !!doc.querySelector("#exercise-body .audio-help"));
  console.log("   кнопка «Прослушать»:", !!doc.getElementById("type-audio"));
  const before = log().speak.length;
  click(doc.getElementById("type-audio"));
  await tick(30);
  console.log("   нажал её — прозвучало:", log().speak.length - before, "фраз (speak() внутри молчит: TTS_OK=false)");
  console.log("   диктуют:", JSON.stringify(rounds[0].audioText));

  for (let n = 0; n < rounds.length; n++) {
    const inp = doc.getElementById("type-input");
    if (!inp) break;
    inp.value = "?";                       // ученик ничего не услышал
    click(doc.getElementById("type-check"));
    await tick(40);
    const nb = doc.getElementById("type-next");
    if (nb) click(nb);
    await tick(40);
  }
  await tick(120);
  const a = log();
  console.log("   итог подхода:", JSON.stringify(a.finish));
  console.log("   репетитору на доску ушло:", JSON.stringify(a.board.map(x => x[1].text)));
  console.log("   слова помечены в SRS:", JSON.stringify(a.stat));
  w.eval('clearTimeout(window.__exBoardBack); window.boardTaskCard = null;');

  console.log("\nB. Домашка: своё слово репетитора, которого нет в банке —");
  console.log("   примера взять неоткуда, диктуется САМО СЛОВО");
  w.eval(`
    window.__log.finish = []; window.__log.stat = []; state.taskResults = {};
    startHomeworkLesson({ id: "hw-sp", title: "Диктант к пятнице", game: "dictation",
      words: [{ w: "rucksack", t: "рюкзак", ex: "", level: "A1" }] });
  `);
  await tick(120);
  const r2 = JSON.parse(w.eval("JSON.stringify(window.__log.type)"));
  console.log("   диктуют:", JSON.stringify(r2[0].audioText), "| подпись:", JSON.stringify(r2[0].sub));
  const inp2 = doc.getElementById("type-input");
  inp2.value = "rucksak";                // пропущена буква — ровно в том слове, ради которого диктант
  click(doc.getElementById("type-check"));
  await tick(40);
  console.log("   ученик написал: «rucksak»");
  console.log("   вердикт:", JSON.stringify(doc.getElementById("type-feedback").textContent.replace(/\s+/g, " ").trim()));
  console.log("   в статистику слова ушло:", JSON.stringify(log().stat.slice(-1)));
  const nb2 = doc.getElementById("type-next");
  if (nb2) click(nb2);
  await tick(150);
  console.log("   итог:", JSON.stringify(log().finish.slice(-1)),
    "| слово в словаре:", w.eval('JSON.stringify((state.dictionary.find(d => d.w === "rucksack") || {}).status)'));

  console.log("\nC. Аудирование: как часто в вариантах стоит омофон услышанного");
  for (const [word, twin] of [["meet", "meat"], ["piece", "peace"], ["week", "weak"], ["flower", "flour"]]) {
    const hits = w.eval(`(() => {
      const rec = ["A1","A2","B1","B2","C1","C2"].flatMap(l => WORDS[l] || []).find(x => x.w === ${JSON.stringify(word)});
      if (!rec) return "нет в банке";
      let n = 0;
      for (let i = 0; i < 400; i++) if (distractors({ ...rec, level: rec.level || "A1" }, 3, "w").includes(${JSON.stringify(twin)})) n++;
      return n;
    })()`);
    console.log(`   услышал «${word}» → «${twin}» среди вариантов: ${hits} из 400 розыгрышей`);
  }

  console.log("\nD. Диктант, ошибка: что где на экране");
  w.eval('openExercise("dictation");');
  await tick(80);
  doc.getElementById("type-input").value = "nonsense words here";
  click(doc.getElementById("type-check"));
  await tick(40);
  const card = doc.querySelector("#ex-stage .word-quiz-card");
  console.log("   порядок блоков после ответа:");
  [...card.children].forEach(el => {
    const t = el.textContent.replace(/\s+/g, " ").trim();
    console.log(`     <${el.tagName.toLowerCase()} class="${el.className}"> ${t.slice(0, 70)}`);
  });
})();
