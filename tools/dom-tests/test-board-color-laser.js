// Две правки доски (22.09):
//
// 1. «Свой цвет» для чернил и маркера: кружок с нативным пикером рядом
//    с токенными. Выбранный hex уходит в BD.color как ДАННЫЕ рисунка
//    (не стиль интерфейса — правило tokens.css про стили), запоминается
//    в кружке-превью и переживает смену ручка↔маркер. Стикерам свой
//    цвет не предлагается: их фон — тематическая бумага.
// 2. Лазерная указка (L): точка за курсором, которую видит только
//    владелец. Не объект доски: не put, не sync, не undo; выход из
//    инструмента (другой инструмент / Escape) её гасит.
//
// Прогон в jsdom по образцу test-board-guard.js.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..", "..");

let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
const tick = ms => new Promise(r => setTimeout(r, ms));

function makeBoard() {
  const html = fs.readFileSync(path.join(ROOT, "board.html"), "utf8")
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true,
    url: "http://localhost:4210/board.html?id=5",
  });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_, name) => (name === "measureText" ? (s) => ({ width: String(s).length * 7 })
                                             : (...a) => undefined),
    set: () => true,
  });
  w.localStorage.setItem("savelyTutorToken", "t-test");
  w.BD_API_TIMEOUT_MS = 400;
  w.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ ok: true, rev: 1, objects: [], deleted: [],
                                  me: "tutor", title: "Урок", shared: 0, invited: null }),
  });
  w.navigator.serviceWorker = undefined;
  ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/board.js"]
    .forEach(f => {
      const s = w.document.createElement("script");
      s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
      w.document.head.appendChild(s);
    });
  return { w };
}

function point(w, type, x, y, extra = {}) {
  const canvas = w.document.getElementById("board-canvas");
  const e = new w.Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0,
                     detail: 1, preventDefault() {}, ...extra });
  canvas.dispatchEvent(e);
}
const tool = (w, name) => w.document.querySelector(`.bd-tool[data-tool="${name}"]`).click();
const bd = w => w.eval("BD");
const key = (w, k) => {
  const e = new w.Event("keydown", { bubbles: true });
  Object.assign(e, { key: k, preventDefault() {} });
  w.document.dispatchEvent(e);
};
const pickCustom = (w, kind, hex) => {
  const inp = w.document.querySelector(`.bd-swatch.bd-custom[data-kind="${kind}"] input[type="color"]`);
  inp.value = hex;
  inp.dispatchEvent(new w.Event("input", { bubbles: true }));
  return inp;
};

(async () => {
  console.log("\n1. Свой цвет из пикера уходит в BD.color и в рисунок");
  {
    const { w } = makeBoard();
    await tick(150);
    tool(w, "pen");
    const swInk = w.document.querySelector('.bd-swatch.bd-custom[data-kind="ink"]');
    const swMark = w.document.querySelector('.bd-swatch.bd-custom[data-kind="mark"]');
    ok(!!swInk && !swInk.hidden, "кружок «свой цвет» есть у чернил и виден");
    ok(!!swMark && swMark.hidden, "кружок маркера пока скрыт — инструмент ручка");
    const inp = pickCustom(w, "ink", "#12ab34");
    ok(bd(w).color === "#12ab34", "BD.color = hex из пикера: " + bd(w).color);
    ok(swInk.classList.contains("picked") && swInk.style.background,
       "кружок запомнил цвет (превью)");
    ok(swInk.classList.contains("active"), "кружок-превью активен");
    ok(![...bd(w).objects.values()].length, "выбор цвета сам по себе ничего не рисует");
    // Рисуем штрих — он уходит цветом из пикера
    point(w, "pointerdown", 300, 300);
    point(w, "pointermove", 340, 330);
    point(w, "pointermove", 390, 310);
    point(w, "pointerup", 390, 310);
    const pen = [...bd(w).objects.values()].find(o => o.kind === "pen");
    ok(!!pen && pen.color === "#12ab34", "штрих нарисован своим цветом: " + (pen || {}).color);
    // Повторный клик по кружку открывает пикер с того же цвета
    swInk.click();
    ok(inp.value.toLowerCase() === "#12ab34", "пикер открывается с запомненного цвета: " + inp.value);
  }

  console.log("\n2. Свой цвет переживает ручка↔маркер, стикерам не предлагается");
  {
    const { w } = makeBoard();
    await tick(150);
    tool(w, "pen");
    pickCustom(w, "ink", "#7b3fd4");
    tool(w, "marker");
    ok(bd(w).color === "#7b3fd4", "маркер взял тот же hex: " + bd(w).color);
    const swMark = w.document.querySelector('.bd-swatch.bd-custom[data-kind="mark"]');
    ok(!swMark.hidden && swMark.classList.contains("active"),
       "кружок маркера виден и активен");
    tool(w, "note");
    ok(bd(w).color === "note", "стикер вернулся на цвет бумаги: " + bd(w).color);
    ok(swMark.hidden, "кружки «свой цвет» у стикера скрыты");
  }

  console.log("\n3. Свой цвет перекрашивает выделенный объект");
  {
    const { w } = makeBoard();
    await tick(150);
    tool(w, "text");
    point(w, "pointerdown", 400, 400);
    point(w, "pointerup", 400, 400);
    const id = [...bd(w).objects.keys()][0];
    w.document.getElementById("bd-editor-input").value = "слово";
    w.document.getElementById("bd-editor-ok").click();
    bd(w).selected = id;
    pickCustom(w, "ink", "#0a5bd7");
    ok(bd(w).objects.get(id).color === "#0a5bd7",
       "выделенный текст перекрасился: " + bd(w).objects.get(id).color);
  }

  console.log("\n4. Лазер: точка за курсором, но не объект доски");
  {
    const { w } = makeBoard();
    await tick(150);
    tool(w, "laser");
    const canvas = w.document.getElementById("board-canvas");
    ok(bd(w).tool === "laser", "инструмент активен");
    ok(canvas.classList.contains("laser"), "у полотна класс laser (курсор: none)");
    point(w, "pointermove", 500, 300);
    ok(bd(w).laser && bd(w).laser.x === 500 && bd(w).laser.y === 300,
       "точка следует за курсором: " + JSON.stringify(bd(w).laser));
    point(w, "pointermove", 640, 220);
    ok(bd(w).laser.x === 640 && bd(w).laser.y === 220, "и дальше: " + JSON.stringify(bd(w).laser));
    // Нажатия лазером ничего не создают
    point(w, "pointerdown", 500, 300);
    point(w, "pointermove", 520, 320);
    point(w, "pointerup", 520, 320);
    ok(bd(w).objects.size === 0, "в BD.objects ничего не попало: " + bd(w).objects.size);
    ok(bd(w).dirty.size === 0, "sync-очередь пуста: " + bd(w).dirty.size);
    ok(bd(w).undo.length === 0, "в отмене пусто: " + bd(w).undo.length);
    // Уход с полотна гасит точку
    point(w, "pointerleave", 0, 0);
    ok(bd(w).laser === null, "pointerleave — точка погашена");
    // Клавиша L включает лазер из любого инструмента
    tool(w, "pen");
    key(w, "l");
    ok(bd(w).tool === "laser", "клавиша L включает лазер");
    point(w, "pointermove", 100, 100);
    ok(!!bd(w).laser, "точка снова жива");
    // Другой инструмент гасит лазер
    tool(w, "pen");
    ok(bd(w).laser === null && !canvas.classList.contains("laser"),
       "переход на ручку погасил точку и вернул курсор");
  }

  console.log("\n5. Escape выводит из лазера");
  {
    const { w } = makeBoard();
    await tick(150);
    tool(w, "laser");
    point(w, "pointermove", 200, 200);
    key(w, "Escape");
    ok(bd(w).tool === "select", "Escape вернул выделение: " + bd(w).tool);
    ok(bd(w).laser === null, "точка погашена");
    ok(!w.document.getElementById("board-canvas").classList.contains("laser"),
       "класс laser снят");
    // Лазер не ушёл в синхронизацию даже после кругов туда-сюда
    await tick(450);
    ok(bd(w).dirty.size === 0, "sync-очередь по-прежнему пуста");
  }

  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВсё зелено");
  process.exit(fails ? 1 : 0);
})();
