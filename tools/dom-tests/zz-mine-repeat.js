// Повторное нажатие по своему же ответу: очки и статистика не должны идти дважды.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];
const S = sel => doc.querySelector("#ex-stage " + sel);

w.eval(`window.readGateMs = () => 0;
  window.__stat = []; window.__xp = 0; window.__cap = {};
  const _s = statUpdate, _a = award, _m = runMCQ, _t = runType, _tp = trainPool;
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _s(word, ok, v); };
  window.award = function (n) { window.__xp += n; return _a(n); };
  window.runMCQ = function (r, o) { window.__cap.mcq = r; return _m(r, o); };
  window.runType = function (r, o) { window.__cap.type = r; return _t(r, o); };
  window.trainPool = function (n, need, fit) { const p = _tp(n, need, fit); window.__cap.pool = p.map(x=>x.w); return p; };
  state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = [...WORDS.A1.slice(0, 16)].map(x => ({ w:x.w, t:x.t, ex:x.ex, def:x.def, cat:x.cat, added:Date.now(), seen:1 }));
`);
const clear = () => w.eval("window.__stat = []; window.__xp = 0;");
const log = () => JSON.parse(w.eval("JSON.stringify({stat: window.__stat, xp: window.__xp})"));

(async () => {
  let bad = 0;
  const check = (name, n) => {
    const l = log();
    const okk = l.xp === n.xp && l.stat.length === n.stat;
    console.log(`${okk ? "  ✓" : "  ✗"} ${name}: очков ${l.xp} (ждём ${n.xp}), statUpdate ${l.stat.length} (ждём ${n.stat}) ${JSON.stringify(l.stat)}`);
    if (!okk) bad++;
  };

  // mcq: пять раз по верному варианту
  w.eval('openExercise("mcq")'); await tick(60);
  const r0 = JSON.parse(w.eval("JSON.stringify(window.__cap.mcq[0])"));
  const good = SA(".mcq-option").find(b => b.textContent.trim() === r0.options[r0.correct]);
  clear(); for (let i = 0; i < 5; i++) click(good);
  check("mcq — 5 нажатий по верному варианту", { xp: 10, stat: 1 });

  // mcq: пять раз по НЕверному, потом пять раз «Дальше»
  w.eval('openExercise("mcq")'); await tick(60);
  const r1 = JSON.parse(w.eval("JSON.stringify(window.__cap.mcq[0])"));
  const wrong = SA(".mcq-option").find(b => b.textContent.trim() !== r1.options[r1.correct]);
  clear(); for (let i = 0; i < 5; i++) click(wrong);
  check("mcq — 5 нажатий по неверному", { xp: 0, stat: 1 });
  const nb = S("#mcq-next"); clear();
  for (let i = 0; i < 5; i++) click(nb);
  await tick(60);
  check("mcq — 5 нажатий «Дальше»", { xp: 0, stat: 0 });
  console.log("     счётчик после «Дальше»:", (S(".test-counter")||{}).textContent);

  // spelling: пять раз «Проверить», потом Enter
  w.eval('openExercise("spelling")'); await tick(40);
  const rt = JSON.parse(w.eval("JSON.stringify(window.__cap.type[0])"));
  const inp = S("#type-input"); inp.value = rt.answer; inp.dispatchEvent(new w.Event("input", { bubbles: true }));
  clear();
  for (let i = 0; i < 5; i++) click(S("#type-check"));
  inp.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  check("spelling — 5 «Проверить» + Enter", { xp: 15, stat: 1 });

  // scramble: последняя плитка пять раз
  w.eval('openExercise("scramble")'); await tick(40);
  const pool = JSON.parse(w.eval("JSON.stringify(window.__cap.pool)"));
  const word = pool[0].toLowerCase().replace(/\s+/g, "");
  clear();
  for (let k = 0; k < word.length; k++) {
    const t = SA(".scr-tile").find(x => !x.disabled && x.textContent === word[k]);
    click(t);
    if (k === word.length - 1) { click(t); click(t); }   // добиваем последнюю
  }
  click(S("#scr-clear")); click(S("#scr-clear"));        // и «Сбросить» после ответа
  check("scramble — повтор последней плитки и «Сбросить» после ответа", { xp: 15, stat: 1 });

  // matching: пять раз по верной кнопке справа
  w.eval('openExercise("matching")'); await tick(40);
  const t2w = new Map(JSON.parse(w.eval(`JSON.stringify(state.dictionary.map(d=>[d.w,d.t]))`)));
  const lb = SA("#pairs-l .pair-item")[0];
  click(lb);
  const rb = SA("#pairs-r .pair-item").find(x => x.textContent === t2w.get(lb.textContent));
  clear(); for (let i = 0; i < 5; i++) click(rb);
  check("matching — 5 нажатий по верной паре", { xp: 8, stat: 1 });

  console.log(bad ? "\nПРОБЛЕМ: " + bad : "\nповторные нажатия по СВОЕМУ ответу лишнего не дают");
})();
