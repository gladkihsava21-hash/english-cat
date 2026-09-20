// «Найди пару» глазами ребёнка с ИДЕАЛЬНОЙ памятью (он помнит всё, что видел,
// но не видит закрытых карточек). Что показывают итоги полностью собранного поля?
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 40));
MQ.matches = true;

w.eval(`
  window.__log = { finish: [], stat: [] };
  const _f = exFinish, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  state.dictionary = [...WORDS.A1].slice(0, 12)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, cat: x.cat, added: Date.now(), seen: 1 }));
`);

const play = async () => {
  w.eval('show("practice"); openExercise("memory")');
  await tick(60);
  w.eval("window.__log = { finish: [], stat: [] };");
  const dict = JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));
  const key = c => { const r = c.en ? dict.find(d=>d.w===c.text) : dict.find(d=>d.t===c.text); return r ? r.w : c.text; };
  const all = JSON.parse(w.eval(`JSON.stringify([...document.querySelectorAll("#mem-grid .mem-card")].map(b=>({i:+b.dataset.i,text:b.querySelector(".mem-front").textContent.trim(),en:b.querySelector(".mem-front").getAttribute("lang")==="en"})))`));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const done = i => byI(i).classList.contains("done");
  const known = new Map();   // i -> key (то, что ребёнок УЖЕ видел)
  let misses = 0, guard = 0;
  const rnd = a => a[Math.floor(Math.random()*a.length)];
  while (all.some(c => !done(c.i)) && guard++ < 60) {
    const free = all.filter(c => !done(c.i));
    // известная пара среди уже виденных
    let pair = null; const byK = new Map();
    for (const c of free) if (known.has(c.i)) {
      const k = known.get(c.i);
      if (byK.has(k)) { pair = [byK.get(k), c.i]; break; }
      byK.set(k, c.i);
    }
    if (pair) { click(byI(pair[0])); click(byI(pair[1])); await tick(40); continue; }
    const unknown = free.filter(c => !known.has(c.i));
    const a = rnd(unknown);
    known.set(a.i, key(a));
    const partner = free.find(c => c.i !== a.i && known.has(c.i) && known.get(c.i) === key(a));
    if (partner) { click(byI(a.i)); click(byI(partner.i)); await tick(40); continue; }
    const rest = free.filter(c => c.i !== a.i && !known.has(c.i));
    if (!rest.length) break;
    const b = rnd(rest);
    known.set(b.i, key(b));
    click(byI(a.i)); click(byI(b.i));
    if (key(a) !== key(b)) { misses++; await tick(1000); } else await tick(40);
  }
  await tick(900);
  const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  return { misses, finish: l.finish, ok: l.stat.filter(s=>s[1]).length,
           screen: doc.getElementById("ex-stage").textContent.replace(/\s+/g," ").trim().slice(0,120) };
};

(async () => {
  for (let n = 0; n < 5; n++) {
    const r = await play();
    console.log(`партия ${n+1}: промахов ${r.misses}, пар в SRS ok ${r.ok}, exFinish ${JSON.stringify(r.finish)}`);
    console.log("   экран: " + r.screen);
  }
  if (errors.length) console.log("errors:", errors.slice(0,3));
  process.exit(0);
})();
