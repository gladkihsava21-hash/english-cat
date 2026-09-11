// Гипотеза 6. «Найди пару» считает итог как exFinish(6 - errors, 6),
// где errors — число НЕСОШЕДШИХСЯ ходов. Но карточки лежат рубашкой
// вверх: первый ход — всегда угадывание, и промахи здесь не ошибки, а
// сама игра. Комментарий в games.js это признаёт («забыть, в каком углу
// была карточка, — не то же самое, что забыть слово»), но на итоги
// промахи всё равно переносятся один к одному.
//
// Итог: ребёнок собирает ВСЁ поле, все шесть пар, и получает
// «Верно 0 из 6» и кота «Ничего, повторение — мать учения! 😿».
// Если игра открыта из домашки, ровно это и уедет репетитору.
const { w, errors, MQ } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
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

(async () => {
  console.log("\n«Найди пару»: играем как ребёнок — сначала наугад, потом по памяти");
  w.eval('openExercise("memory")');
  await tick();
  const cards = JSON.parse(w.eval(`JSON.stringify(
    [...document.querySelectorAll("#mem-grid .mem-card")].map(b => ({
      i: +b.dataset.i,
      text: b.querySelector(".mem-front").textContent.trim(),
      en: b.querySelector(".mem-front").getAttribute("lang") === "en" })))`));
  // Колода добирает слова уровня сверх словаря ученика (trainPool), поэтому
  // перевод ищем и в банке — иначе партнёра у такой карточки не найти.
  const dict = JSON.parse(w.eval(`JSON.stringify([...state.dictionary, ...WORDS.A1, ...WORDS.A2]
    .map(d => ({ w: d.w, t: d.t })))`));
  const byI = i => doc.querySelector(`#mem-grid .mem-card[data-i="${i}"]`);
  const partner = c => {
    const rec = c.en ? dict.find(d => d.w === c.text) : dict.find(d => d.t === c.text);
    return cards.find(x => x.i !== c.i && (c.en ? x.text === rec.t : x.text === rec.w));
  };

  // Промахи: открываем слово и ЧУЖОЙ перевод — так и играет тот, кто
  // ещё не запомнил, где что лежит. Семь ходов вслепую.
  const ens = cards.filter(c => c.en);
  let misses = 0;
  for (const a of ens) {
    const right = partner(a);
    const wrongCard = cards.find(c => !c.en && c.i !== right.i);
    click(byI(a.i)); click(byI(wrongCard.i));
    misses++;
    await tick(1000);
    if (misses >= 7) break;
  }
  // а вот теперь ребёнок всё запомнил и собирает поле целиком
  w.eval("window.__log = { finish: [], stat: [] };");
  for (const a of ens) {
    const b = partner(a);
    if (byI(a.i).classList.contains("done")) continue;
    click(byI(a.i)); click(byI(b.i));
    await tick(60);
  }
  await tick(900);

  const l = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  const counter = doc.getElementById("mem-count");
  const screen = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
  console.log("    промахов сделано: " + misses);
  console.log("    поле собрано: " + (counter ? counter.textContent : "(поле уже сменилось на итоги)"));
  console.log("    пар засчитано в словарь: " + l.stat.length + " " + JSON.stringify(l.stat.map(x => x[0])));
  console.log("    exFinish: " + JSON.stringify(l.finish));
  console.log("    экран: «" + screen.slice(0, 150) + "…»");

  const [c, t] = l.finish[0] || [];
  ok(c === t, `все ${t} пар собраны — на итогах должно быть «Верно ${t} из ${t}», а стоит «Верно ${c} из ${t}»`);
  ok(!/повторение — мать учения/.test(screen),
     "кот не расстраивается из-за полностью собранного поля");

  if (errors.length) console.log("  ! ошибки обработчиков:", errors.slice(0, 3));
  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "итог «Найди пару» честен"));
  process.exit(fails ? 1 : 0);
})();
