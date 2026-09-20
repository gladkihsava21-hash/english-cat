// Идеальная игра. Ученик, который знает ВСЁ, обязан получить «верно N из N».
// Играем шесть упражнений «По словам» по тому, что видно на экране
// (текст кнопок, текст вопроса), а правильный ответ подсматриваем
// только чтобы знать, что нажимать, — как знающий ученик.
const { w } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const S = sel => doc.querySelector("#ex-stage " + sel);
const SA = sel => [...doc.querySelectorAll("#ex-stage " + sel)];
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

w.eval(`
  window.readGateMs = () => 0;
  window.__cap = { mcq: null, pairs: null, type: null };
  window.__fin = []; window.__stat = [];
  const _mcq = runMCQ, _pairs = runPairs, _type = runType, _fin = exFinish, _st = statUpdate;
  window.runMCQ   = function (r, o) { window.__cap.mcq = r;   return _mcq(r, o); };
  window.runPairs = function (p, o) { window.__cap.pairs = p; return _pairs(p, o); };
  window.runType  = function (r, o) { window.__cap.type = r;  return _type(r, o); };
  const _tp = trainPool;
  window.trainPool = function (n, need, fit) { const p = _tp(n, need, fit); window.__cap.pool = p.map(x => x.w); return p; };
  window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _fin(c, t, n); };
  window.statUpdate = function (word, ok, v) { window.__stat.push([String(word), !!ok]); return _st(word, ok, v); };
`);

const BIG = !!process.env.BIGDICT;
const DICT = `state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
  state.dictionary = ${BIG ? "[...WORDS.A1, ...WORDS.A2]" : "[...WORDS.A1.slice(0, 20), ...WORDS.A2.slice(0, 20)]"}
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, def: x.def, cat: x.cat, added: Date.now(), seen: 1 }));`;

const reset = id => w.eval(DICT + `window.__cap = { mcq:null, pairs:null, type:null };
  window.__fin = []; window.__stat = [];
  state.dictionary.forEach(d => { delete d.forgot; delete d.knew; delete d.reps; delete d.due; delete d.lastReview; delete d.checked; });
  openExercise(${JSON.stringify(id)});`);
const cap = k => JSON.parse(w.eval(`JSON.stringify(window.__cap.${k})`));
const fin = () => JSON.parse(w.eval("JSON.stringify(window.__fin)"));
const stat = () => JSON.parse(w.eval("JSON.stringify(window.__stat)"));
const forgot = () => JSON.parse(w.eval(`JSON.stringify(state.dictionary.filter(d=>d.forgot).map(d=>d.w+"×"+d.forgot))`));

let bad = [];
const report = (id, msg) => { bad.push(id + ": " + msg); console.log("  ✗ " + id + ": " + msg); };

async function playMCQ(id) {
  const rounds = cap("mcq");
  if (!rounds) return report(id, "runMCQ не позвался");
  // дубли текста среди вариантов — ученик не отличит верный от ловушки
  rounds.forEach((r, k) => {
    const seen = {};
    r.options.forEach(o => seen[o] = (seen[o] || 0) + 1);
    const dups = Object.entries(seen).filter(([, n]) => n > 1);
    if (dups.length) report(id, `вопрос ${k + 1}: одинаковые варианты ${JSON.stringify(dups)}`);
  });
  for (let n = 0; n < rounds.length + 2; n++) {
    await tick(50);            // пауза на чтение: даже readGateMs=0 снимается таймером
    const btns = SA(".mcq-option");
    if (!btns.length) break;
    const r = rounds[n];
    const want = r.options[r.correct];
    const b = btns.find(x => x.textContent.trim() === want);
    if (!b) { report(id, `на экране нет кнопки «${want}»`); break; }
    click(b);
    await tick(40);
    const nb = S("#mcq-next");
    if (nb) { report(id, `вопрос ${n + 1}: верная кнопка «${want}» помечена ошибкой`); click(nb); }
    await tick(1300);
  }
}

async function playPairs(id) {
  const pairs = cap("pairs");
  if (!pairs) return report(id, "runPairs не позвался");
  const lt = {}, rt = {};
  pairs.forEach(p => { lt[p.l] = (lt[p.l] || 0) + 1; rt[p.r] = (rt[p.r] || 0) + 1; });
  const dl = Object.entries(lt).filter(([, n]) => n > 1), dr = Object.entries(rt).filter(([, n]) => n > 1);
  if (dl.length) report(id, "одинаковые надписи слева: " + JSON.stringify(dl));
  if (dr.length) report(id, "одинаковые надписи справа: " + JSON.stringify(dr));
  // играем по тексту: выбрал слово слева — жму первую кнопку с нужным текстом
  for (const p of pairs) {
    const l = SA("#pairs-l .pair-item").find(x => x.textContent === p.l && !x.classList.contains("done"));
    if (!l) { report(id, `слева нет «${p.l}»`); break; }
    click(l);
    const r = SA("#pairs-r .pair-item").find(x => x.textContent === p.r && !x.classList.contains("done"));
    if (!r) { report(id, `справа нет «${p.r}»`); break; }
    click(r);
    if (r.classList.contains("bad")) report(id, `верное соединение «${p.l}» → «${p.r}» объявлено ошибкой`);
    await tick(20);
  }
  await tick(600);
}

async function playType(id) {
  const rounds = cap("type");
  if (!rounds) return report(id, "runType не позвался");
  const qs = {};
  rounds.forEach(r => { const q = r.prompt || ""; qs[q] = (qs[q] || 0) + 1; });
  Object.entries(qs).filter(([, n]) => n > 1)
    .forEach(([q, n]) => report(id, `один и тот же вопрос ${q} задан ${n} раза с разными ответами`));
  for (let n = 0; n < rounds.length + 2; n++) {
    const inp = S("#type-input");
    if (!inp) break;
    const r = rounds[n];
    inp.value = r.answer;
    inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    click(S("#type-check"));
    const fb = S("#type-feedback");
    if (fb && /Не совсем/.test(fb.textContent)) report(id, `верный ответ «${r.answer}» на вопрос ${r.prompt} не принят: ${fb.textContent.trim()}`);
    const nb = S("#type-next");
    if (nb) click(nb);
    await tick(950);
  }
}

async function playScramble(id) {
  for (let n = 0; n < 12; n++) {
    const label = S(".quiz-label");
    const tiles = SA(".scr-tile");
    if (!tiles.length) break;
    // слово берём из самого пула упражнения — по номеру раунда
    const t = (label.textContent.match(/«(.+)»/) || [])[1];
    const pool = JSON.parse(w.eval("JSON.stringify(window.__cap.pool || [])"));
    const word = pool[n];
    if (!word) { report(id, `не нашёл слово раунда ${n + 1} (перевод «${t}»)`); break; }
    for (const ch of word.toLowerCase().replace(/\s+/g, "")) {
      const b = SA(".scr-tile").find(x => !x.disabled && x.textContent === ch);
      if (!b) { report(id, `нет плитки «${ch}» для слова ${word}`); break; }
      click(b);
    }
    const fb = S("#scr-feedback");
    if (fb && /Правильно/.test(fb.textContent)) report(id, `слово ${word} собрано верно, но: ${fb.textContent.trim()}`);
    await tick(1900);
  }
}

(async () => {
  for (const [id, play] of [["picture", playMCQ], ["mcq", playMCQ], ["matching", playPairs],
                            ["defmatch", playPairs], ["spelling", playType], ["scramble", playScramble]]) {
    reset(id);
    console.log("\n=== " + id + " ===");
    await play(id);
    const f = fin(), st = stat(), fg = forgot();
    console.log("  exFinish:", JSON.stringify(f), " statUpdate:", st.length, "шт, ошибок в статистике:", st.filter(x => !x[1]).length, " forgot:", JSON.stringify(fg));
    if (f.length !== 1) report(id, "exFinish позван " + f.length + " раз(а)");
    else if (f[0][0] !== f[0][1]) report(id, `идеальная игра дала «Верно ${f[0][0]} из ${f[0][1]}»`);
    if (fg.length) report(id, "после идеальной игры слова помечены забытыми: " + fg.join(", "));
  }
  console.log("\n" + (bad.length ? "НАЙДЕНО: " + bad.length : "всё чисто"));
  process.exit(bad.length ? 1 : 0);
})();
