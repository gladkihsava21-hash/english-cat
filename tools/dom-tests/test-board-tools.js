// Правки владельца по доске (16.09): ластик, палитра маркера, мышь на
// фигурах, масштаб колесом и ползунком, разбор задания.
//
// Проверяем поведением, а не чтением кода: поднимаем board.html в jsdom,
// кладём на доску объекты и работаем инструментами, как репетитор рукой.
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
    get: (_, name) => (name === "measureText" ? () => ({ width: 10 })
                                             : (...a) => undefined),
    set: () => true,
  });
  w.localStorage.setItem("savelyTutorToken", "t-test");
  w.BD_API_TIMEOUT_MS = 400;
  w.fetch = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(
    String(url).includes("/api/student/board")
      ? { ok: true, hasTutor: true, board: { id: 5, title: "Урок" } }
      : { ok: true, rev: 1, objects: [], deleted: [], me: "tutor",
          title: "Урок", shared: 0, invited: null }) });
  w.navigator.serviceWorker = undefined;
  ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/board.js"]
    .forEach(f => {
      const s = w.document.createElement("script");
      s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
      w.document.head.appendChild(s);
    });
  return w;
}

/** Нажатие пальцем/мышью по полотну в экранных координатах. */
function point(w, type, x, y, extra = {}) {
  const canvas = w.document.getElementById("board-canvas");
  const e = new w.Event(type, { bubbles: true });
  Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0,
                     detail: 1, preventDefault() {}, ...extra });
  canvas.dispatchEvent(e);
}

const tool = (w, name) => w.document.querySelector(`.bd-tool[data-tool="${name}"]`).click();
// BD объявлен через const — в window он НЕ попадает (лексическая
// область скрипта). Дотягиваемся через eval в том же окне.
const bd = w => w.eval("BD");
const objects = w => [...bd(w).objects.values()];
const byId = (w, id) => bd(w).objects.get(id);

(async () => {
  console.log("\n1. Ластик: стирает рисунок, не трогает картинки и карточки");
  {
    const w = makeBoard();
    await tick(120);
    // Кладём по одному объекту каждого рода в одну точку мира (0,0)…(60,60)
    const at = (id, kind, extra = {}) => bd(w).objects.set(id,
      { id, kind, x: 0, y: 0, w: 60, h: 60, color: "ink", size: 3, rev: 1, ...extra });
    at("p1", "pen", { pts: [5, 5, 40, 40] });
    at("m1", "marker", { pts: [6, 6, 42, 42] });
    at("t1", "text", { text: "hello" });
    at("i1", "image", { src: "data:," });
    at("b1", "book", { bookId: 3, page: 2 });
    at("wd", "word", { text: "cat", text2: "кот" });
    at("tk", "task", { text: "Флешкарты", text2: "flash" });

    tool(w, "eraser");
    // Ластиком возим по той же точке: сверху вниз он должен снять
    // ручку, маркер и текст — и остановиться на картинке.
    for (let i = 0; i < 8; i++) point(w, "pointerdown", 20, 20);
    point(w, "pointerup", 20, 20);

    ok(!byId(w, "p1"), "ручка стёрта");
    ok(!byId(w, "m1"), "маркер стёрт");
    ok(!byId(w, "t1"), "текст стёрт");
    ok(!!byId(w, "i1"), "картинка на месте");
    ok(!!byId(w, "b1"), "страница учебника на месте");
    ok(!!byId(w, "wd"), "карточка слова на месте");
    ok(!!byId(w, "tk"), "задание на месте");
    const toastEl = w.document.getElementById("bd-toast");
    ok(/ластик/i.test(toastEl.textContent) || /Delete/.test(toastEl.textContent),
       "объяснено, чем убрать картинку: «" + toastEl.textContent.slice(0, 60) + "»");
    // Выделить и Delete — по-прежнему убирает что угодно
    bd(w).selected = "i1";
    const del = new w.Event("keydown", { bubbles: true });
    Object.assign(del, { key: "Delete", preventDefault() {} });
    w.document.dispatchEvent(del);
    ok(!byId(w, "i1"), "картинку всё же можно убрать намеренно: Delete");
  }

  console.log("\n2. Палитра: у маркера своя, у ручки чернила");
  {
    const w = makeBoard();
    await tick(120);
    const shown = () => [...w.document.querySelectorAll(".bd-swatch")]
      .filter(s => !s.hidden).map(s => s.title);
    tool(w, "pen");
    const ink = shown();
    ok(ink.includes("ink") && !ink.some(n => n.startsWith("mark")),
       "у ручки чернила, маркерных цветов нет: " + ink.join(","));
    tool(w, "marker");
    const mark = shown();
    ok(mark.length >= 5 && mark.every(n => n.startsWith("mark")),
       "у маркера своя палитра: " + mark.join(","));
    ok(String(bd(w).color).startsWith("mark"),
       "выбранный цвет переехал в маркерный: " + bd(w).color);
    // рисуем маркером — штрих обязан сохранить маркерный цвет
    point(w, "pointerdown", 300, 300);
    point(w, "pointermove", 360, 340);
    point(w, "pointermove", 420, 380);
    point(w, "pointerup", 420, 380);
    const stroke = objects(w).find(o => o.kind === "marker");
    ok(stroke && String(stroke.color).startsWith("mark"),
       "штрих маркера лёг своим цветом: " + (stroke && stroke.color));
    tool(w, "pen");
    ok(bd(w).color === "ink", "вернулись к ручке — цвет снова чернильный: " + bd(w).color);
  }

  console.log("\n3. Мышь на фигурах: курсор говорит, что можно сделать");
  {
    const w = makeBoard();
    await tick(120);
    const canvas = w.document.getElementById("board-canvas");
    bd(w).objects.set("r1", { id: "r1", kind: "rect", x: 100, y: 100,
                             w: 120, h: 80, color: "ink", size: 3, rev: 1 });
    tool(w, "select");
    point(w, "pointermove", 700, 700);            // пусто
    const empty = canvas.style.cursor;
    point(w, "pointermove", 150, 130);            // по фигуре
    const onShape = canvas.style.cursor;
    ok(onShape === "move", "над фигурой курсор «двигать»: " + onShape);
    ok(empty !== onShape, "над пустым местом курсор другой: " + empty);
    bd(w).objects.set("tk", { id: "tk", kind: "task", x: 400, y: 100, w: 260, h: 90,
                             color: "blue", size: 3, text: "Флешкарты", rev: 1 });
    point(w, "pointermove", 430, 130);
    ok(canvas.style.cursor === "pointer", "над заданием — палец: " + canvas.style.cursor);
    // фигуру действительно можно утащить мышью
    point(w, "pointerdown", 150, 130);
    point(w, "pointermove", 210, 190);
    point(w, "pointerup", 210, 190);
    const moved = byId(w, "r1");
    ok(moved.x > 100 && moved.y > 100,
       "фигура уехала за мышью: x " + moved.x + ", y " + moved.y);
  }

  console.log("\n4. Масштаб: колесо любой мыши и ползунок");
  {
    const w = makeBoard();
    await tick(120);
    const canvas = w.document.getElementById("board-canvas");
    const wheel = (deltaY, deltaMode) => {
      const e = new w.Event("wheel", { bubbles: true, cancelable: true });
      Object.assign(e, { deltaY, deltaMode, clientX: 400, clientY: 300,
                         ctrlKey: false, preventDefault() {} });
      canvas.dispatchEvent(e);
    };
    // Мышь, которая шлёт СТРОКИ (deltaMode 1): один щелчок = deltaY 3.
    // Раньше это давало пол процента — «колесо не работает».
    const k0 = bd(w).view.k;
    wheel(-3, 1);
    const afterLine = bd(w).view.k;
    ok(afterLine > k0 * 1.03,
       "щелчок колеса «строчной» мыши заметно приближает: " +
       k0.toFixed(2) + " → " + afterLine.toFixed(2));
    // Пиксельная мышь/трекпад — тоже в разумных пределах, не рывком
    const k1 = bd(w).view.k;
    wheel(120, 0);
    ok(bd(w).view.k < k1 && bd(w).view.k > k1 * 0.6,
       "пиксельное колесо отдаляет плавно: " + k1.toFixed(2) + " → " + bd(w).view.k.toFixed(2));
    // Ползунок
    const range = w.document.getElementById("bd-zoom-range");
    range.value = "200";
    range.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(Math.abs(bd(w).view.k - 2) < 0.02, "ползунок выставил 200%: k=" + bd(w).view.k.toFixed(2));
    ok(w.document.getElementById("bd-zoom").textContent === "200%",
       "подпись совпала: " + w.document.getElementById("bd-zoom").textContent);
    // Колесо двигает и сам ползунок — иначе они разъезжаются
    wheel(-3, 1);
    ok(Number(range.value) !== 200, "колесо подвинуло ползунок: " + range.value);
  }

  console.log("\n5. Разбор: карточка кладётся вместе с заданием");
  {
    const w = makeBoard();
    await tick(200);
    w.document.getElementById("bd-words").click();
    await tick(120);
    const chip = w.document.querySelector("#bd-task-list .bd-word");
    ok(!!chip, "список заданий построен");
    chip.click();
    const task = objects(w).find(o => o.kind === "task");
    ok(!!task, "задание легло на доску");
    const review = byId(w, "rev-" + (task || {}).id);
    ok(!!review, "рядом легла карточка разбора с id rev-<задание>");
    ok(review && /Разбор/.test(review.text) && /ещё не проходил/.test(review.text),
       "на ней написано, что ждём ученика: «" + (review ? review.text.replace(/\n/g, " / ") : "") + "»");
    ok(review && review.x > task.x, "разбор стоит правее задания, не накрывает его");
    ok(review && review.id.length <= 40, "id разбора влезает в 40 символов сервера: " + review.id.length);
  }

  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВсё зелено");
  process.exit(fails ? 1 : 0);
})();
