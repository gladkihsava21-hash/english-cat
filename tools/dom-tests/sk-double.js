// СКЕПТИК к находке №8: можно ли получить двойное закрытие тем, что
// ДОСТУПНО ребёнку — то есть кликом в элемент, который реально есть на
// экране в момент клика.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

w.eval(`
  window.__log = { finish: [], stat: [] };
  const _f = exFinish, _s = statUpdate;
  window.exFinish = function (c, t, n) { window.__log.finish.push([c, t]); return _f(c, t, n); };
  window.statUpdate = function (word, o, v) { window.__log.stat.push(String(word) + (o ? ":+" : ":-")); return _s(word, o, v); };
  window.readGateMs = () => 0;
  state.dictionary = [...WORDS.A1, ...WORDS.A2].slice(0, 40)
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
`);

(async () => {
  const tick = ms => new Promise(r => setTimeout(r, ms));

  console.log("A. wordsearch: два клика ПОДРЯД по кнопке, которую заново находим в DOM");
  console.log("   (так ведёт себя настоящий двойной клик: второй раз хит-тест по НОВОМУ экрану)");
  w.eval("window.__log = { finish: [], stat: [] }");
  w.eval('openExercise("wordsearch")');
  await tick(20);
  const n1 = doc.getElementById("ws-next");
  click(n1);
  await tick(0);
  const n2 = doc.getElementById("ws-next");
  console.log("   после первого клика кнопка на экране: " + (!!n2) + ", это ТА ЖЕ кнопка: " + (n1 === n2));
  console.log("   первая кнопка ещё в документе: " + n1.isConnected);
  click(n2);
  await tick(20);
  let log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("   exFinish: " + JSON.stringify(log.finish));
  console.log("   отметок SRS: " + log.stat.length + " -> " + JSON.stringify(log.stat));
  const dup = log.stat.filter((x, i) => log.stat.indexOf(x) !== i);
  console.log("   ДУБЛИ отметок (одно слово дважды): " + JSON.stringify(dup));

  console.log("\nB. тот же двойной клик, но второе событие шлём в ОТОРВАННУЮ кнопку");
  w.eval("window.__log = { finish: [], stat: [] }");
  w.eval('openExercise("wordsearch")');
  await tick(20);
  const b1 = doc.getElementById("ws-next");
  click(b1); click(b1);
  await tick(20);
  log = JSON.parse(w.eval("JSON.stringify(window.__log)"));
  console.log("   отметок SRS: " + log.stat.length + " -> " + JSON.stringify(log.stat));
  const dup2 = log.stat.filter((x, i) => log.stat.indexOf(x) !== i);
  console.log("   ДУБЛИ отметок: " + JSON.stringify(dup2));
  console.log("   (этот путь возможен только из кода: кнопки b1 на экране уже нет — isConnected=" + b1.isConnected + ")");

  console.log("\nC. runMCQ («Найди лишнее»): двойной клик по «Дальше →», кнопку ищем заново");
  w.eval("window.__log = { finish: [], stat: [] }");
  w.eval('openExercise("oddone")');
  await tick(20);
  // отвечаем НЕВЕРНО, чтобы появилась кнопка «Дальше →»
  let guard = 0;
  while (guard++ < 12) {
    const opts = [...doc.querySelectorAll("#mcq-options .mcq-option")];
    if (!opts.length) break;
    click(opts[0]);
    await tick(20);
    const nb = doc.getElementById("mcq-next");
    if (nb) {
      const before = JSON.parse(w.eval("JSON.stringify(window.__log.finish)")).length;
      click(nb);
      await tick(0);
      const nb2 = doc.getElementById("mcq-next");
      console.log("   после клика #mcq-next на экране есть: " + (!!nb2) + "; старая в документе: " + nb.isConnected);
      if (nb2) click(nb2);
      await tick(20);
      const after = JSON.parse(w.eval("JSON.stringify(window.__log.finish)"));
      console.log("   exFinish после «двойного» клика: " + JSON.stringify(after));
      break;
    }
    await tick(20);
  }
  console.log("\nошибок JS: " + errors.length);
  process.exit(0);
})();
