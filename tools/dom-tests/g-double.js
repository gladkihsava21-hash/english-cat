// Гипотеза D. Повторные и поздние нажатия: где подход закрывается дважды,
// где очки идут за второе нажатие, где обработчик переживает свой раунд.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const fly = el => el && el.dispatchEvent(new w.Event("animationend", { bubbles: true }));
const tick = ms => new Promise(r => setTimeout(r, ms || 30));

w.eval(`
  window.__log = { finish: [], stat: [], xp: 0 };
  const _f = exFinish, _s = statUpdate, _a = award;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push([String(word), !!o]); return _s(word, o, v); };
  window.award = function (n) { window.__log.xp += n; return _a(n); };
  state.dictionary = [...WORDS.A1].slice(0, 14)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);
const log = () => JSON.parse(w.eval("JSON.stringify(window.__log)"));
const reset = () => w.eval("window.__log = { finish: [], stat: [], xp: 0 };");
const D = () => JSON.parse(w.eval("JSON.stringify(state.dictionary.map(d=>({w:d.w,t:d.t})))"));

(async () => {
  /* ================= КОЛЕСО ================= */
  MQ.matches = true;
  console.log("\n1. «Колесо»");
  w.eval('openExercise("wheel")');
  await tick();
  click(doc.getElementById("wheel-go"));
  await tick();
  reset();
  const yes = doc.getElementById("wheel-yes"), no = doc.getElementById("wheel-no");
  click(yes); click(yes); click(no);            // тройное нажатие подряд
  await tick(60);
  let l = log();
  ok(l.stat.length === 1, "тройное нажатие «Знал/Знал/Не знал» отмечено один раз: "
    + JSON.stringify(l.stat));
  ok(l.xp === 6, "очки начислены один раз: " + l.xp);
  ok(doc.getElementById("wheel-count").textContent.trim().startsWith("1 /"),
    "счётчик «" + doc.getElementById("wheel-count").textContent.trim() + "»");
  // спам «Крутить ещё»
  reset();
  const go = doc.getElementById("wheel-go");
  click(go); click(go); click(go);
  await tick(60);
  ok(!!doc.getElementById("wheel-yes"), "тройное «Крутить» открыло ровно одно слово");
  // доигрываем до конца и добиваем поздними нажатиями
  for (let g = 0; g < 60; g++) {
    const b = doc.getElementById("wheel-go");
    if (b) { click(b); await tick(20); continue; }
    const y = doc.getElementById("wheel-yes");
    if (!y) break;
    const c = doc.getElementById("wheel-count").textContent;
    const [d, t] = c.split("/").map(x => +x.trim());
    if (d === t - 1) {
      reset();
      click(y);
      // ученик добивает по кнопке, пока панель ещё висит (итоги через 400 мс)
      for (let k = 0; k < 8; k++) { click(y); click(doc.getElementById("wheel-no")); }
      await tick(700);
      l = log();
      ok(l.finish.length === 1, "итоги подведены ровно один раз: " + JSON.stringify(l.finish));
      ok(l.stat.length === 1, "последнее слово записано один раз: " + JSON.stringify(l.stat));
      break;
    }
    click(y); await tick(20);
  }

  /* ================= НАЙДИ ПАРУ ================= */
  console.log("\n2. «Найди пару»");
  w.eval('show("practice"); openExercise("memory")');
  await tick();
  const deck = JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i, text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const dd = D();
  const partner = c => {
    const rec = c.en ? dd.find(d => d.w === c.text) : dd.find(d => d.t === c.text);
    return rec && deck.find(x => x.i !== c.i && x.text === (c.en ? rec.t : rec.w));
  };
  reset();
  const e0 = deck.filter(c => c.en)[0], p0 = partner(e0);
  click(byI(e0.i)); click(byI(p0.i)); click(byI(p0.i)); click(byI(e0.i));  // добиваем по паре
  await tick(60);
  let l2 = log();
  ok(l2.stat.length === 1, "сложившаяся пара записана один раз: " + JSON.stringify(l2.stat));
  ok(l2.xp === 8, "очки за пару начислены один раз: " + l2.xp);
  // промах: третье нажатие в момент, когда карточки ещё «горят красным»
  reset();
  const ens0 = deck.filter(c => c.en);
  const a1 = ens0[1], wrongRu = deck.find(c => !c.en && c.i !== partner(a1).i
    && !byI(c.i).classList.contains("done"));
  click(byI(a1.i)); click(byI(wrongRu.i));
  const spare = deck.find(c => !byI(c.i).classList.contains("done")
    && !byI(c.i).classList.contains("open"));
  click(byI(spare.i));                       // третий клик во время «мимо»
  await tick(60);
  ok(!byI(spare.i).classList.contains("open"),
    "во время показа промаха третья карточка не открывается");
  await tick(1000);
  // доигрываем и добиваем нажатиями на последней паре
  const ens = deck.filter(c => c.en);
  for (let k = 1; k < ens.length; k++) {
    const a = ens[k], b = partner(a);
    if (!b) continue;
    const last = k === ens.length - 1;
    if (last) reset();
    click(byI(a.i)); click(byI(b.i));
    if (last) {
      for (let z = 0; z < 6; z++) { click(byI(a.i)); click(byI(b.i)); }
      await tick(900);
      const l3 = log();
      ok(l3.finish.length === 1, "итоги «Найди пару» подведены один раз: " + JSON.stringify(l3.finish));
      ok(l3.xp === 8, "очки за последнюю пару начислены один раз: " + l3.xp);
    }
    await tick(60);
  }

  /* ================= ЛОПНИ ШАР ================= */
  console.log("\n3. «Лопни шар»");
  MQ.matches = false;                    // шары летят: есть и пауза, и animationend
  w.eval('show("practice"); openExercise("balloons")');
  await tick();
  const balls = () => [...doc.querySelectorAll("#bal-stage .bal")];
  const tgt = () => {
    const ru = doc.getElementById("bal-ru").textContent.trim();
    const rec = D().find(d => d.t.trim() === ru);
    return balls().find(b => b.getAttribute("aria-label") === (rec && rec.w));
  };
  reset();
  const t1 = tgt();
  click(t1); click(t1);                  // двойной тап по мишени
  await tick(50);
  let l4 = log();
  ok(l4.stat.length === 1, "двойной тап по шару засчитан один раз: " + JSON.stringify(l4.stat));
  ok(l4.xp === 10, "очки за раунд начислены один раз: " + l4.xp);
  // поздние события того же раунда: чужой шар кликают и мишень «улетает»
  const other = balls().find(b => b !== t1);
  click(other); fly(t1); fly(other);
  await tick(50);
  l4 = log();
  ok(l4.stat.length === 1, "поздние клики и «улетел» после закрытия раунда не считаются: "
    + JSON.stringify(l4.stat));
  ok(doc.getElementById("bal-count").textContent.trim() === "1 / 8",
    "счётчик всё ещё «" + doc.getElementById("bal-count").textContent.trim() + "» (раунд один)");
  await tick(950);
  ok(doc.getElementById("bal-count").textContent.trim() === "2 / 8",
    "следующий раунд начался один раз: " + doc.getElementById("bal-count").textContent.trim());

  console.log("\n4. «Лопни шар»: пауза");
  const pb = doc.getElementById("bal-pause");
  ok(!!pb, "кнопка «Пауза» есть");
  click(pb);
  await tick(30);
  console.log("    подпись: «" + doc.getElementById("bal-fb").textContent.trim() + "»");
  reset();
  // Ребёнка позвали ужинать, телефон в кармане/у младшего брата: одно
  // случайное касание по ЧУЖОМУ шару. На экране ничего не меняется.
  const t2 = tgt();
  const stray = balls().find(b => b !== t2);
  click(stray);
  await tick(40);
  const l5 = log();
  console.log("    случайно задели «" + stray.getAttribute("aria-label") + "» на паузе → "
    + "статистика " + JSON.stringify(l5.stat) + ", подпись «"
    + doc.getElementById("bal-fb").textContent.trim() + "»");
  // возвращаемся и лопаем мишень — раунд уже испорчен
  click(doc.getElementById("bal-pause"));
  await tick(30);
  reset();
  click(tgt());
  await tick(50);
  const l6 = log();
  console.log("    после паузы лопнули мишень → «"
    + doc.getElementById("bal-fb").textContent.trim() + "», статистика "
    + JSON.stringify(l6.stat) + ", очков " + l6.xp);
  ok(l6.xp === 10 && !l6.stat.some(x => x[1] === false),
    "раунд зачтён: на паузе ученик не отвечал");
  await tick(1600);

  /* ================= ОТКРОЙ КОРОБКУ ================= */
  console.log("\n5. «Открой коробку»");
  MQ.matches = false;                    // крышка открывается 280 мс — есть гонка
  w.eval('show("practice"); openExercise("boxes")');
  await tick();
  const tiles = () => [...doc.querySelectorAll("#box-grid .box-tile:not([disabled])")];
  reset();
  const [ta, tb] = tiles();
  click(ta); click(tb);                  // две коробки в один миг
  await tick(400);
  const counter = doc.querySelector("#ex-stage .test-counter").textContent.trim();
  console.log("    после двойного нажатия на экране: «" + counter + "»");
  const opts = [...doc.querySelectorAll("#box-options .mcq-option")];
  ok(opts.length > 0, "вопрос показан (" + opts.length + " вариантов)");
  // отвечаем и смотрим, не потерялась ли вторая коробка
  const wEn = doc.querySelector(".box-card .quiz-word").textContent.trim();
  const rec = D().find(d => d.w === wEn);
  const right = opts.find(o => o.textContent.trim() === (rec && rec.t));
  click(right || opts[0]); click(right || opts[0]);   // двойной тап по варианту
  await tick(60);
  let lBox = log();
  ok(lBox.stat.length === 1, "двойной тап по варианту засчитан один раз: " + JSON.stringify(lBox.stat));
  await tick(1400);
  const c2 = doc.querySelector("#ex-stage .test-counter");
  console.log("    дальше на экране: «" + (c2 ? c2.textContent.trim() : "?") + "»");
  ok(c2 && /Открыто 1 из/.test(c2.textContent), "открыта ровно одна коробка из двух нажатых");

  // последняя коробка: двойное нажатие «Итоги →»
  console.log("\n6. «Открой коробку»: двойное нажатие «Итоги →» на последней коробке");
  MQ.matches = true;
  for (let n = 0; n < 30; n++) {
    const nx = doc.getElementById("box-next");
    if (nx) {
      const last = nx.textContent.includes("Итоги");
      if (last) { reset(); click(nx); click(nx); click(nx); await tick(200);
        const l7 = log();
        ok(l7.finish.length === 1, "итоги подведены один раз: " + JSON.stringify(l7.finish));
        break; }
      click(nx); await tick(40); continue;
    }
    const cc = doc.querySelector("#ex-stage .test-counter");
    const m = cc && cc.textContent.match(/Открыто (\d+) из (\d+)/);
    if (!m) break;
    const tile = doc.querySelector("#box-grid .box-tile:not([disabled])");
    if (!tile) break;
    click(tile); await tick(40);
    const os = [...doc.querySelectorAll("#box-options .mcq-option")];
    if (!os.length) break;
    const we = doc.querySelector(".box-card .quiz-word").textContent.trim();
    const r2 = D().find(d => d.w === we);
    const rr = os.find(o => o.textContent.trim() === (r2 && r2.t));
    const isLast = +m[1] === +m[2] - 1;
    if (isLast) {
      // на последней коробке отвечаем НЕВЕРНО, чтобы получить кнопку «Итоги →»
      const wrong = os.find(o => o !== rr);
      reset(); click(wrong || os[0]); await tick(60);
      const nx2 = doc.getElementById("box-next");
      console.log("    кнопка: «" + (nx2 ? nx2.textContent.trim() : "нет") + "»");
      reset();
      click(nx2);
      console.log("    после первого клика кнопка ещё на странице: "
        + doc.body.contains(nx2) + " (exFinish вызван " + log().finish.length + " раз)");
      click(nx2); click(nx2);
      await tick(200);
      const l7 = log();
      ok(l7.finish.length === 1, "итоги подведены один раз: " + JSON.stringify(l7.finish)
        + " — в after() нет заслона от повторного входа");
      break;
    }
    click(rr || os[0]); await tick(1100);
  }

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "повторные и поздние нажатия нигде не считаются дважды"));
  process.exit(fails ? 1 : 0);
})();
