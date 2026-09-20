// Все четыре игры: ответил на последний вопрос → сразу открыл ДРУГОЕ упражнение.
// Проверяем, у кого заслон реально есть (openExercise сносит #exercise-body,
// значит document.body.contains(box|list) как раз ЛОЖЕН в этом сценарии).
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
MQ.matches = true;

w.eval(`
  window.__log = { finish: [] };
  const _f = exFinish;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  state.dictionary = [...WORDS.A1].slice(0, 14)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [] };");
const go = () => w.eval('openExercise("mcq")');
const stageTxt = () => (doc.getElementById("ex-stage") || {textContent:""}).textContent.replace(/\s+/g," ").trim().slice(0,90);
const dict = () => JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));

(async () => {
  /* 1 КОЛЕСО */
  console.log("\n1. Колесо");
  w.eval('show("practice"); openExercise("wheel")');
  await tick();
  for (let g = 0; g < 60; g++) {
    const b = doc.getElementById("wheel-go");
    if (b) { click(b); await tick(20); continue; }
    const yes = doc.getElementById("wheel-yes");
    if (!yes) break;
    const [d, t] = doc.getElementById("wheel-count").textContent.split("/").map(x => +x.trim());
    if (d === t - 1) { reset(); click(yes); go(); break; }
    click(yes); await tick(20);
  }
  await tick(700);
  console.log("   чужой exFinish:", JSON.stringify(log().finish), "| экран:", stageTxt());

  /* 2 ПАМЯТЬ */
  console.log("\n2. Найди пару");
  w.eval('show("practice"); openExercise("memory")');
  await tick();
  const D = dict();
  const cards = JSON.parse(w.eval(`JSON.stringify([...document.querySelectorAll("#mem-grid .mem-card")].map(b=>({i:+b.dataset.i,text:b.querySelector(".mem-front").textContent.trim(),en:b.querySelector(".mem-front").getAttribute("lang")==="en"})))`));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const ens = cards.filter(c => c.en);
  for (let k = 0; k < ens.length; k++) {
    const a = ens[k]; const rec = D.find(d => d.w === a.text);
    const b = cards.find(x => !x.en && x.text === (rec && rec.t));
    if (!b) continue;
    const last = k === ens.length - 1;
    if (last) reset();
    click(byI(a.i)); click(byI(b.i));
    if (last) go();
    await tick(60);
  }
  await tick(900);
  console.log("   чужой exFinish:", JSON.stringify(log().finish), "| экран:", stageTxt());

  /* 3 ШАРЫ */
  console.log("\n3. Лопни шар");
  w.eval('show("practice"); openExercise("balloons")');
  await tick();
  const tgt = () => {
    const ru = doc.getElementById("bal-ru").textContent.trim();
    const rec = dict().find(d => d.t.trim() === ru);
    return [...doc.querySelectorAll("#bal-stage .bal")].find(b => b.getAttribute("aria-label") === (rec && rec.w));
  };
  for (let r = 0; r < 12; r++) {
    const [cur, tot] = doc.getElementById("bal-count").textContent.split("/").map(x => +x.trim());
    const b = tgt(); if (!b) break;
    if (cur === tot) { reset(); click(b); go(); break; }
    click(b); await tick(950);
  }
  await tick(1200);
  console.log("   чужой exFinish:", JSON.stringify(log().finish), "| экран:", stageTxt());

  /* 3b ШАРЫ: середина подхода */
  console.log("\n3b. Лопни шар — ушёл в другое упражнение ПОСРЕДИ подхода (после верного шара)");
  w.eval('show("practice"); openExercise("balloons")');
  await tick();
  { const b = tgt(); reset(); click(b); go(); }
  await tick(1200);
  console.log("   чужой exFinish:", JSON.stringify(log().finish), "| экран:", stageTxt());

  /* 4 КОРОБКИ */
  console.log("\n4. Открой коробку");
  w.eval('show("practice"); openExercise("boxes")');
  await tick();
  for (let n = 0; n < 30; n++) {
    const nx = doc.getElementById("box-next");
    if (nx) { click(nx); await tick(30); continue; }
    const c = doc.querySelector("#ex-stage .test-counter");
    const m = c && c.textContent.match(/Открыто (\d+) из (\d+)/);
    if (!m) break;
    const openedNow = +m[1], total = +m[2];
    const tile = doc.querySelector("#box-grid .box-tile:not([disabled])");
    if (!tile) break;
    click(tile); await tick(30);
    const opts = [...doc.querySelectorAll("#box-options .mcq-option")];
    if (!opts.length) break;
    const wordEn = doc.querySelector(".box-card .quiz-word").textContent.trim();
    const rec = dict().find(d => d.w === wordEn);
    const right = opts.find(o => o.textContent.trim() === (rec && rec.t));
    const last = openedNow === total - 1;
    if (last) reset();
    click(right || opts[0]);
    if (last) { go(); break; }
    await tick(1100);
  }
  await tick(1300);
  console.log("   чужой exFinish:", JSON.stringify(log().finish), "| экран:", stageTxt());
  if (errors.length) console.log("   errors:", errors.slice(0,3));
  process.exit(0);
})();
