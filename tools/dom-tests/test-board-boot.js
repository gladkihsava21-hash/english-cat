// Доска при плохой связи: полотно должно ожить ДО первого ответа
// сервера, подвисший запрос — оборваться по таймауту, а опрос — поднять
// доску, когда связь вернётся.
//
// Симптом Ирины (11.09): «доска вообще не работает». На подвисшем
// Timeweb первый /api/board/sync не отвечал, цикл отрисовки не
// стартовал, на экране — белый прямоугольник и «сохраняю…». Без предела
// ожидания это навсегда: syncBusy поднят, опрос молчит.
//
// OLD_BOARD=1 прогоняет то же на версии до починки (board-old.js рядом):
// баг обязан воспроизводиться, иначе чинить было нечего.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..", "..");

let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const tick = ms => new Promise(r => setTimeout(r, ms));

/** Поднять board.html с подменённой сетью.
 *  mode: "hang" — сервер молчит вечно; "slow" — отвечает через delayMs;
 *  "ok" — отвечает сразу. */
function makeBoard(mode, delayMs = 0, timeoutMs = 400) {
  const html = fs.readFileSync(path.join(ROOT, "board.html"), "utf8")
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true,
    url: "http://localhost:4210/board.html?id=5",
  });
  const w = dom.window;
  // jsdom без пакета canvas не даёт 2d-контекст; нам нужен не рисунок,
  // а сам факт, что цикл отрисовки крутится. Контекст — заглушка,
  // которая молча принимает любые вызовы и считает, сколько раз
  // полотно очищали (draw() всегда начинает с clearRect).
  const calls = { clearRect: 0 };
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_, name) => (...args) => { if (name === "clearRect") calls.clearRect++; return undefined; },
    set: () => true,
  });
  w.localStorage.setItem("savelyTutorToken", "t-test");
  // Короткий предел ожидания вместо 20 с — сама механика та же.
  // Задаём ДО загрузки board.js: первый запрос уходит прямо при старте.
  w.BD_API_TIMEOUT_MS = timeoutMs;
  // Сеть под нашим контролем
  const net = { calls: 0, aborted: 0 };
  w.fetch = (url, opts) => new Promise((resolve, reject) => {
    net.calls++;
    const body = JSON.stringify({ ok: true, rev: 1, objects: [], deleted: [], me: "tutor",
                                  title: "Урок", shared: 0, invited: null });
    const answer = () => resolve({ ok: true, json: () => Promise.resolve(JSON.parse(body)) });
    if (opts && opts.signal) opts.signal.addEventListener("abort", () => {
      net.aborted++;
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    });
    if (mode === "ok") answer();
    else if (mode === "slow") setTimeout(answer, delayMs);
    /* hang — не отвечаем никогда */
  });
  w.navigator.serviceWorker = undefined;
  const load = f => {
    const src = (f === "js/board.js" && process.env.OLD_BOARD)
      ? path.join(__dirname, "board-old.js") : path.join(ROOT, f);
    const s = w.document.createElement("script");
    s.textContent = fs.readFileSync(src, "utf8");
    w.document.head.appendChild(s);
  };
  ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/board.js"].forEach(load);
  return { w, calls, net, state: () => w.document.getElementById("bd-state").textContent };
}

(async () => {
  console.log("\n1. Сервер молчит: доска обязана ожить сама и сказать, что связи нет");
  {
    const b = makeBoard("hang");
    await tick(150);
    ok(b.calls.clearRect > 0, "полотно рисуется, не дожидаясь ответа сервера (очисток: " + b.calls.clearRect + ")");
    ok(b.state() !== "сохраняю…", "строка состояния не врёт «сохраняю…»: «" + b.state() + "»");
    await tick(700);
    ok(b.net.aborted >= 1, "подвисший запрос оборван по таймауту (оборвано: " + b.net.aborted + ")");
    ok(/нет связи/.test(b.state()), "сказано, что связи нет: «" + b.state() + "»");
    await tick(1500);
    ok(b.net.calls >= 2, "опрос продолжает пробовать (запросов: " + b.net.calls + ")");
  }

  console.log("\n2. Сервер отвечает через 2 секунды: доска поднимается сама");
  {
    // ответ 2 с при пределе 3 с: медленно, но в срок — доска обязана дождаться
    const b = makeBoard("slow", 2000, 3000);
    await tick(150);
    ok(b.calls.clearRect > 0, "полотно нарисовано ещё до ответа");
    await tick(3200);
    ok(/сохранено/.test(b.state()), "после запоздалого ответа состояние «сохранено»: «" + b.state() + "»");
  }

  console.log("\n3. Обычная связь: ничего не сломано");
  {
    const b = makeBoard("ok");
    await tick(300);
    ok(/сохранено/.test(b.state()), "«сохранено»: «" + b.state() + "»");
    ok(b.net.aborted === 0, "ничего не оборвано");
  }

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "доска живёт при плохой связи"));
  process.exit(fails ? 1 : 0);
})();
