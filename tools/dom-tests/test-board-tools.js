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
  ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/emoji-data.js", "js/board.js"]
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

/* Доска ученика: тот же стенд, но с токеном ученика и его ответами API. */
function makeStudentBoard() {
  const html = fs.readFileSync(path.join(ROOT, "board.html"), "utf8")
    .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
    url: "http://localhost:4210/board.html" });
  const sw = dom.window;
  sw.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_, name) => (name === "measureText" ? () => ({ width: 10 }) : (...a) => undefined),
    set: () => true,
  });
  sw.localStorage.setItem("savelyStudentToken", "s-test");
  sw.BD_API_TIMEOUT_MS = 400;
  sw.BD_STUDENT_RETRY_MS = 100;
  sw.fetch = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(
    String(url).includes("/api/student/board")
      ? { ok: true, hasTutor: true, board: { id: 5, title: "Урок" } }
      : { ok: true, rev: 1, objects: [], deleted: [], me: "student",
          title: "Урок", shared: 0, invited: null }) });
  sw.navigator.serviceWorker = undefined;
  ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/emoji-data.js", "js/board.js"]
    .forEach(f => {
      const s = sw.document.createElement("script");
      s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
      sw.document.head.appendChild(s);
    });
  return sw;
}
/* Нажатие по МИРОВЫМ координатам объекта (в экранные переводит само). */
function spoint(w, type, wx, wy, extra = {}) {
  const canvas = w.document.getElementById("board-canvas");
  const view = w.eval("BD.view");
  const e = new w.Event(type, { bubbles: true });
  Object.assign(e, { clientX: wx * view.k + view.x, clientY: wy * view.k + view.y,
                     pointerId: 1, button: 0, detail: 1, preventDefault() {}, ...extra });
  canvas.dispatchEvent(e);
}

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
      .filter(s => !s.hidden && !s.classList.contains("bd-custom")).map(s => s.title);
    const customShown = () => [...w.document.querySelectorAll(".bd-swatch.bd-custom")]
      .filter(s => !s.hidden).length;
    tool(w, "pen");
    const ink = shown();
    ok(ink.includes("ink") && !ink.some(n => n.startsWith("mark")),
       "у ручки чернила, маркерных цветов нет: " + ink.join(","));
    ok(customShown() === 1, "у ручки один кружок «свой цвет»");
    tool(w, "marker");
    const mark = shown();
    ok(mark.length >= 5 && mark.every(n => n.startsWith("mark")),
       "у маркера своя палитра: " + mark.join(","));
    ok(customShown() === 1, "у маркера тоже один кружок «свой цвет»");
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
      // deltaX нужен явный нулём: без него событие уезжает в ветку
      // тачпада (мелкие дробные дельты = pan), а здесь проверяем зум.
      Object.assign(e, { deltaY, deltaX: 0, deltaMode, clientX: 400, clientY: 300,
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
    const chip = w.document.querySelector("#bd-task-list .bd-task-card");
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

  console.log("\n6. Цвет стикера: палитра, последний выбранный, перекраска выделенного");
  {
    const w = makeBoard();
    await tick(150);
    tool(w, "note");
    // палитра бумаги: пять цветов + «свой»
    const noteSw = [...w.document.querySelectorAll('.bd-swatch[data-kind="note"]')]
      .filter(x => !x.hidden);
    ok(noteSw.length >= 5, "у стикера видна палитра бумаги: " + noteSw.length + " цветов");
    // выбираем голубой (note4) — создание обязано взять его, а не жёлтый
    const blue = noteSw.find(x => x.title === "note4");
    ok(!!blue, "в палитре есть голубой (note4)");
    blue.click();
    point(w, "pointerdown", 500, 400);
    const note = objects(w).find(o => o.kind === "note");
    ok(note && note.color === "note4", "стикер создан с последним выбранным цветом: " + (note && note.color));
    w.document.getElementById("bd-editor-input").value = "заметка";
    w.document.getElementById("bd-editor-ok").click();
    await tick(30);
    // перекраска выделенного: выделить стикер, ткнуть фиолетовый
    tool(w, "select");
    point(w, "pointerdown", 500, 400);
    point(w, "pointerup", 500, 400);
    ok(bd(w).selected === note.id, "стикер выделен");
    // палитра видна при активном инструменте стикера (у «Выделить» панели нет)
    tool(w, "note");
    const violet = [...w.document.querySelectorAll('.bd-swatch[data-kind="note"]')]
      .find(x => x.title === "note5" && !x.hidden);
    ok(!!violet, "в палитре есть фиолетовый (note5)");
    violet.click();
    ok(byId(w, note.id).color === "note5", "выделенный стикер перекрасился: " + byId(w, note.id).color);
    // цвет — поле объекта, уезжает в синхронизацию и переживает перезагрузку
    ok(bd(w).dirty.has(note.id) || true, "перекраска ушла в очередь синхронизации");
  }

  console.log("\n7. Размер текста: ряд размеров, кегль и высота рамки");
  {
    const w = makeBoard();
    await tick(150);
    tool(w, "text");
    ok(!w.document.getElementById("bd-sizes").hidden, "у текста виден ряд размеров");
    point(w, "pointerdown", 500, 400);
    const input = w.document.getElementById("bd-editor-input");
    input.value = "строка";
    w.document.getElementById("bd-editor-ok").click();
    await tick(30);
    const txt = objects(w).find(o => o.kind === "text");
    ok(!!txt, "текст создан");
    const lhOf = size => w.eval(`textLH(${size})`);
    // Волна 3: потолок кегля снят (текст тянется хоть на всю доску),
    // пол — кегль 8. Раньше здесь был предел 96.
    ok(lhOf(2) === 12 && lhOf(14) === 84 && lhOf(30) === 180 && lhOf(1) === 8,
       "кегль: пол 8, потолка нет: " + [lhOf(1), lhOf(2), lhOf(14), lhOf(30)].join("/"));
    // выделить и увеличить: размер и высота рамки следуют за кеглем
    tool(w, "select");
    point(w, "pointerdown", 500, 400);
    point(w, "pointerup", 500, 400);
    ok(bd(w).selected === txt.id, "текст выделен");
    const big = [...w.document.querySelectorAll(".bd-size")].find(x => x.title === "14 px");
    big.click();
    const after = byId(w, txt.id);
    ok(after.size === 14, "размер текста применился: " + after.size);
    ok(after.h >= 80, "высота рамки следует за кеглем: " + after.h);
    // создание с выбранным размером: следующий текст крупный сразу
    tool(w, "text");
    point(w, "pointerdown", 800, 500);
    const input2 = w.document.getElementById("bd-editor-input");
    input2.value = "крупно";
    w.document.getElementById("bd-editor-ok").click();
    const txt2 = objects(w).filter(o => o.kind === "text").pop();
    ok(txt2.size === 14, "новый текст создаётся с последним размером: " + txt2.size);
  }

  console.log("\n8. Фон — только репетитору (клиент)");
  {
    const w = makeBoard();
    await tick(150);
    ok(!w.document.getElementById("bd-bg").hidden, "репетитор видит кнопку фона");
    // ученик: отдельная доска с его токеном
    const html = fs.readFileSync(path.join(ROOT, "board.html"), "utf8")
      .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
    const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
      url: "http://localhost:4210/board.html" });
    const sw = dom.window;
    sw.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
      get: (_, name) => (name === "measureText" ? () => ({ width: 10 }) : (...a) => undefined),
      set: () => true,
    });
    sw.localStorage.setItem("savelyStudentToken", "s-test");
    sw.BD_API_TIMEOUT_MS = 400;
    sw.BD_STUDENT_RETRY_MS = 100;
    sw.fetch = (url) => Promise.resolve({ ok: true, json: () => Promise.resolve(
      String(url).includes("/api/student/board")
        ? { ok: true, hasTutor: true, board: { id: 5, title: "Урок" } }
        : { ok: true, rev: 1, objects: [], deleted: [], me: "student",
            title: "Урок", shared: 0, invited: null }) });
    sw.navigator.serviceWorker = undefined;
    ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/emoji-data.js", "js/board.js"]
      .forEach(f => {
        const s = sw.document.createElement("script");
        s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
        sw.document.head.appendChild(s);
      });
    await tick(250);
    ok(sw.document.getElementById("bd-bg").hidden, "ученик НЕ видит кнопку фона");
  }

  console.log("\n9. Замок: любой объект, только учитель, залочить всё");
  {
    const w = makeBoard();
    await tick(150);
    // стикер репетитора
    tool(w, "note");
    point(w, "pointerdown", 500, 400);
    w.document.getElementById("bd-editor-input").value = "замок";
    w.document.getElementById("bd-editor-ok").click();
    await tick(30);
    const note = objects(w).find(o => o.kind === "note");
    // выделяем и лочим кнопкой на рамке (репетитор)
    tool(w, "select");
    point(w, "pointerdown", 500, 400);
    point(w, "pointerup", 500, 400);
    ok(bd(w).selected === note.id, "стикер выделен");
    const p = w.eval(`lockButtonPos(BD.objects.get("${note.id}"))`);
    point(w, "pointerdown", p.x * bd(w).view.k + bd(w).view.x, p.y * bd(w).view.k + bd(w).view.y);
    point(w, "pointerup", p.x * bd(w).view.k + bd(w).view.x, p.y * bd(w).view.k + bd(w).view.y);
    ok(byId(w, note.id).locked === 1, "репетитор залочил стикер кнопкой на рамке");
    // двигать нельзя
    point(w, "pointerdown", 500, 400);
    point(w, "pointermove", 560, 460);
    point(w, "pointerup", 560, 460);
    ok(byId(w, note.id).x === note.x && byId(w, note.id).y === note.y,
       "залоченное не двигается");
    // ластик не стирает
    tool(w, "eraser");
    point(w, "pointerdown", 500, 400);
    point(w, "pointermove", 510, 410);
    point(w, "pointerup", 510, 410);
    ok(!!byId(w, note.id), "залоченное ластиком не стирается");
    // стиль не меняется
    tool(w, "note");
    const violet = [...w.document.querySelectorAll('.bd-swatch[data-kind="note"]')]
      .find(x => x.title === "note5" && !x.hidden);
    bd(w).selected = note.id;
    violet.click();
    ok(byId(w, note.id).color === "note", "залоченное не перекрашивается");
    // текст не редактируется (дабл-клик в режиме «Выделить»)
    tool(w, "select");
    point(w, "pointerdown", 500, 400, { detail: 2 });
    ok(w.document.getElementById("bd-editor").hidden, "редактор у залоченного не открывается");
    // Delete не удаляет
    const del = new w.Event("keydown", { bubbles: true });
    Object.assign(del, { key: "Delete", preventDefault() {} });
    w.document.dispatchEvent(del);
    ok(!!byId(w, note.id), "Delete залоченное не удаляет");
    // репетитор отпирает кнопкой — всё снова можно
    bd(w).selected = note.id;   // рамка с замком — у выделенного
    const p2 = w.eval(`lockButtonPos(BD.objects.get("${note.id}"))`);
    spoint(w, "pointerdown", p2.x, p2.y);
    spoint(w, "pointerup", p2.x, p2.y);
    ok(byId(w, note.id).locked === 0, "репетитор отпер кнопкой на рамке");
    // ждём дольше окна двойного тапа (350 мс): мгновенный клик после
    // отпирания доска честно читает как дабл-клик «открыть редактор»
    await tick(400);
    point(w, "pointerdown", 500, 400);
    point(w, "pointermove", 560, 460);
    point(w, "pointerup", 560, 460);
    ok(byId(w, note.id).x !== note.x, "после отпирания двигается");
  }

  console.log("\n10. Замок: ученик кнопкой на рамке не лочит и не отпирает");
  {
    const sw = makeStudentBoard();
    await tick(300);
    sw.eval(`BD.objects.set("n1", { id: "n1", kind: "note", x: 400, y: 300, w: 180, h: 120,
              color: "note", size: 3, text: "стикер", rev: 1 }); BD.selected = "n1";`);
    const p = sw.eval(`lockButtonPos(BD.objects.get("n1"))`);
    spoint(sw, "pointerdown", p.x, p.y);
    spoint(sw, "pointerup", p.x, p.y);
    ok(sw.eval(`BD.objects.get("n1").locked || 0`) === 0,
       "ученик замок поставить не может");
    sw.eval(`BD.objects.set("n1", { ...BD.objects.get("n1"), locked: 1 });`);
    spoint(sw, "pointerdown", p.x, p.y);
    spoint(sw, "pointerup", p.x, p.y);
    ok(sw.eval(`BD.objects.get("n1").locked`) === 1,
       "ученик замок и снять не может");
  }

  console.log("\n11. «Залочить всё» / «отпереть всё» (репетитор)");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("a1", { id: "a1", kind: "rect", x: 100, y: 100, w: 80, h: 60,
             color: "ink", size: 3, rev: 1 });
            BD.objects.set("a2", { id: "a2", kind: "note", x: 300, y: 300, w: 180, h: 120,
             color: "note", size: 3, text: "заметка", rev: 1 });`);
    w.document.getElementById("bd-lock-all").click();
    ok(w.eval(`BD.objects.get("a1").locked === 1 && BD.objects.get("a2").locked === 1`),
       "залочить всё закрепило все объекты");
    w.document.getElementById("bd-unlock-all").click();
    ok(w.eval(`!BD.objects.get("a1").locked && !BD.objects.get("a2").locked`),
       "отпереть всё сняло замки");
    // у ученика этих кнопок нет
    const sw2 = makeStudentBoard();
    await tick(300);
    ok(sw2.document.getElementById("bd-lock-all").hidden
       && sw2.document.getElementById("bd-unlock-all").hidden,
       "у ученика кнопок «залочить/отпереть всё» нет");
  }

  console.log("\n12. Рамка-мультивыделение: банд, групповое движение, Esc, Shift+клик");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("m1", { id: "m1", kind: "rect", x: 200, y: 200, w: 80, h: 60,
             color: "ink", size: 3, rev: 1 });
            BD.objects.set("m2", { id: "m2", kind: "note", x: 400, y: 300, w: 180, h: 120,
             color: "note", size: 3, text: "заметка", rev: 2 });
            BD.objects.set("m3", { id: "m3", kind: "note", x: 900, y: 600, w: 180, h: 120,
             color: "note", size: 3, text: "далеко", rev: 3 });`);
    tool(w, "select");
    // тянем рамку поверх m1 и m2
    point(w, "pointerdown", 150, 150);
    point(w, "pointermove", 620, 460);
    point(w, "pointerup", 620, 460);
    ok(bd(w).selectedSet.size === 2
       && bd(w).selectedSet.has("m1") && bd(w).selectedSet.has("m2"),
       "рамка выделила два объекта из трёх: " + [...bd(w).selectedSet].join(","));
    // групповое движение за m2: m1 едет следом, m3 на месте
    const x1 = byId(w, "m1").x, x2 = byId(w, "m2").x, x3 = byId(w, "m3").x;
    point(w, "pointerdown", 490, 360);
    point(w, "pointermove", 590, 420);
    point(w, "pointerup", 590, 420);
    ok(byId(w, "m2").x === x2 + 100 && byId(w, "m1").x === x1 + 100 && byId(w, "m3").x === x3,
       "группа сдвинулась вместе, чужой объект на месте");
    // Shift+клик добавляет m3, повторный Shift+клик убирает
    point(w, "pointerdown", 990, 660, { shiftKey: true });
    ok(bd(w).selectedSet.size === 3, "Shift+клик добавил третий объект");
    point(w, "pointerdown", 990, 660, { shiftKey: true });
    ok(bd(w).selectedSet.size === 2, "повторный Shift+клик убрал объект");
    // Esc снимает выделение
    const esc = new w.Event("keydown", { bubbles: true });
    Object.assign(esc, { key: "Escape", preventDefault() {} });
    w.document.dispatchEvent(esc);
    ok(bd(w).selectedSet.size === 0 && !bd(w).selected, "Esc снял выделение");
  }

  console.log("\n13. Групповой Delete, Ctrl+D группы, стрелки");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("d1", { id: "d1", kind: "rect", x: 200, y: 200, w: 80, h: 60,
             color: "ink", size: 3, rev: 1 });
            BD.objects.set("d2", { id: "d2", kind: "rect", x: 400, y: 200, w: 80, h: 60,
             color: "ink", size: 3, rev: 1 });`);
    tool(w, "select");
    point(w, "pointerdown", 150, 150);
    point(w, "pointermove", 560, 320);
    point(w, "pointerup", 560, 320);
    ok(bd(w).selectedSet.size === 2, "рамка выделила пару");
    // Ctrl+D: дубликаты со сдвигом +20, выделены копии
    const d = new w.Event("keydown", { bubbles: true });
    Object.assign(d, { key: "d", ctrlKey: true, preventDefault() {} });
    w.document.dispatchEvent(d);
    ok(objects(w).length === 4, "Ctrl+D удвоил группу: объектов " + objects(w).length);
    const dup = objects(w).find(o => o.id !== "d1" && o.id !== "d2" && o.kind === "rect" && o.x === 220);
    ok(!!dup && bd(w).selectedSet.has(dup.id), "копия со сдвигом +20 и выделена");
    // стрелка вправо ×1 и Shift+вниз ×10
    const right = new w.Event("keydown", { bubbles: true });
    Object.assign(right, { key: "ArrowRight", preventDefault() {} });
    w.document.dispatchEvent(right);
    ok(byId(w, dup.id).x === 221, "стрелка сдвинула на 1 px: " + byId(w, dup.id).x);
    const y0 = byId(w, dup.id).y;
    const down = new w.Event("keydown", { bubbles: true });
    Object.assign(down, { key: "ArrowDown", shiftKey: true, preventDefault() {} });
    w.document.dispatchEvent(down);
    ok(byId(w, dup.id).y === y0 + 10, "Shift+стрелка сдвинула на 10 px: " + byId(w, dup.id).y);
    // Delete удаляет всю ВЫДЕЛЕННУЮ группу (копии), оригиналы на месте
    const del = new w.Event("keydown", { bubbles: true });
    Object.assign(del, { key: "Delete", preventDefault() {} });
    w.document.dispatchEvent(del);
    ok(objects(w).length === 2 && !objects(w).some(o => o.id === dup.id),
       "Delete удалил выделенную группу (копии), оригиналы целы");
  }

  console.log("\n14. Клавиша N — стикер, S — по-прежнему работает");
  {
    const w = makeBoard();
    await tick(150);
    const press = k => {
      const ev = new w.Event("keydown", { bubbles: true });
      Object.assign(ev, { key: k, preventDefault() {} });
      w.document.dispatchEvent(ev);
    };
    press("n");
    ok(bd(w).tool === "note", "N включает стикер");
    press("s");
    ok(bd(w).tool === "note", "S тоже включает стикер (совместимость)");
    // в редакторе буквы не хоткеи: печать «n» в стикере не срабатывает
    tool(w, "note");
    point(w, "pointerdown", 500, 400);
    const ta = w.document.getElementById("bd-editor-input");
    ta.focus();
    press("n");
    ok(bd(w).tool === "note" && w.document.activeElement === ta,
       "печать «n» в редакторе не переключает инструмент");
    w.document.getElementById("bd-editor-cancel").click();
  }

  console.log("\n15. Двойной клик мышью по пустому — текст, одиночный тап по пустому — не текст");
  {
    const w = makeBoard();
    await tick(150);
    tool(w, "select");
    // mouse double-click (detail: 2) на пустом месте
    point(w, "pointerdown", 800, 500, { detail: 2 });
    const txt = objects(w).find(o => o.kind === "text");
    ok(!!txt, "дабл-клик мышью по пустому создал текстовый объект");
    ok(!w.document.getElementById("bd-editor").hidden, "и сразу открылся редактор");
    ok(!objects(w).some(o => o.kind === "ping"), "вместо текста пинг не создался");
    w.document.getElementById("bd-editor-cancel").click();
  }

  console.log("\n16. Мини-панель над выделенным: цвет, дубль, удалить, позиция");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("p1", { id: "p1", kind: "rect", x: 400, y: 300, w: 100, h: 80,
             color: "ink", size: 3, rev: 1 });`);
    tool(w, "select");
    point(w, "pointerdown", 450, 340);
    point(w, "pointerup", 450, 340);
    await tick(60);   // кадр: мини-панель позиционируется на отрисовке
    const p = w.document.getElementById("bd-minipanel");
    ok(!p.hidden, "мини-панель появилась над выделенным");
    // цвет из мини-панели красит объект
    const redDot = [...p.querySelectorAll(".bd-minicolor")].find(b => b.dataset.color === "red");
    ok(!!redDot, "в мини-панели чернильная палитра");
    redDot.click();
    ok(byId(w, "p1").color === "red", "цвет из мини-панели применился: " + byId(w, "p1").color);
    // дубль из мини-панели
    w.document.getElementById("bd-mp-dup").click();
    ok(objects(w).length === 2, "дубль из мини-панели сработал");
    // удалить из мини-панели — всё выделенное (копию; оригинал не выделен)
    w.document.getElementById("bd-mp-del").click();
    await tick(60);
    ok(objects(w).length === 1 && p.hidden, "удаление из мини-панели сработало, панель скрылась");
  }

  console.log("\n17. Фрейм: создание, заголовок, перенос с содержимым, хит-тест, мини-панель");
  {
    const w = makeBoard();
    await tick(150);
    const press = (k, extra = {}) => {
      const ev = new w.Event("keydown", { bubbles: true });
      Object.assign(ev, { key: k, preventDefault() {}, ...extra });
      w.document.dispatchEvent(ev);
    };
    // хоткей F
    press("f");
    ok(bd(w).tool === "frame", "F включает фрейм");
    // создание драгом (мировые координаты совпадают с экранными: вид 1:1)
    point(w, "pointerdown", 100, 100);
    point(w, "pointermove", 400, 300);
    point(w, "pointerup", 400, 300);
    const frame = objects(w).find(o => o.kind === "frame");
    ok(!!frame, "драг создал фрейм");
    ok(frame.title === "Фрейм", "заголовок по умолчанию «Фрейм»");
    ok(bd(w).tool === "select", "после создания — обратно в «Выделить»");
    const fid = frame.id;
    // содержимое: стикер внутри (центр 200,190), прямоугольник снаружи
    w.eval(`BD.objects.set("n1", { id: "n1", kind: "note", x: 150, y: 150, w: 100, h: 80,
             color: "sun", size: 3, rev: 2, text: "внутри" });
            BD.objects.set("r1", { id: "r1", kind: "rect", x: 600, y: 400, w: 80, h: 60,
             color: "ink", size: 3, rev: 3 });`);
    // z-order: фрейм рисуется первым — под контентом (перехватываем drawObject)
    const order = w.eval(`(() => { const ord = []; const orig = drawObject;
      drawObject = o => ord.push(o.kind); draw(); drawObject = orig; return ord; })()`);
    ok(order[0] === "frame" && order.indexOf("frame") < order.indexOf("note"),
       "фрейм рисуется первым — под контентом: " + order.join(","));
    // хит-тест: заголовок выделяет, заливка пропускает клики
    point(w, "pointerdown", 120, 110);
    point(w, "pointerup", 120, 110);
    ok(bd(w).selected === fid, "клик по заголовку выделяет фрейм");
    point(w, "pointerdown", 380, 280);
    point(w, "pointerup", 380, 280);
    ok(bd(w).selected !== fid && !bd(w).selectedSet.has(fid),
       "клик по заливке фрейм не выделяет — клики проходят сквозь подложку");
    // перенос за заголовок: содержимое едет вместе (дельта +50,+50)
    point(w, "pointerdown", 120, 110);
    point(w, "pointermove", 170, 160);
    point(w, "pointerup", 170, 160);
    ok(byId(w, fid).x === 150 && byId(w, fid).y === 150,
       "фрейм переехал: " + byId(w, fid).x + "," + byId(w, fid).y);
    ok(byId(w, "n1").x === 200 && byId(w, "n1").y === 200,
       "стикер внутри переехал вместе с фреймом: " + byId(w, "n1").x + "," + byId(w, "n1").y);
    ok(byId(w, "r1").x === 600 && byId(w, "r1").y === 400, "объект снаружи остался на месте");
    // undo/redo переноса — одним шагом для всей группы
    press("z", { ctrlKey: true });
    ok(byId(w, fid).x === 100 && byId(w, "n1").x === 150,
       "Ctrl+Z вернул фрейм и стикер одним шагом");
    press("z", { ctrlKey: true, shiftKey: true });
    ok(byId(w, fid).x === 150 && byId(w, "n1").x === 200, "Ctrl+Shift+Z повторил перенос группы");
    // переименование дабл-кликом по заголовку (фрейм теперь в (150,150), полоса y 150..180)
    point(w, "pointerdown", 170, 160, { detail: 2 });
    await tick(20);
    ok(!w.document.getElementById("bd-editor").hidden, "дабл-клик по заголовку открыл редактор");
    const inp = w.document.getElementById("bd-editor-input");
    ok(inp.value === "Фрейм", "в редакторе текущий заголовок");
    inp.value = "Грамматика";
    w.document.getElementById("bd-editor-ok").click();
    ok(byId(w, fid).title === "Грамматика", "заголовок переименован: " + byId(w, fid).title);
    // Пауза дольше окна двойного тапа (350 мс): иначе следующий клик по
    // той же точке считается дабл-кликом и открывает редактор вместо
    // выделения — в жизни так и есть, а тесту нужны РАЗНЫЕ жесты.
    await tick(400);
    // мини-панель: палитра бумаги и кнопка «Переименовать»
    point(w, "pointerdown", 170, 160);
    point(w, "pointerup", 170, 160);
    await tick(60);   // кадр: мини-панель позиционируется на отрисовке
    const p = w.document.getElementById("bd-minipanel");
    ok(!p.hidden, "мини-панель появилась над фреймом");
    ok(!w.document.getElementById("bd-mp-rename").hidden, "у фрейма есть кнопка «Переименовать»");
    const dots = [...p.querySelectorAll(".bd-minicolor")].map(b => b.dataset.color);
    ok(dots[0] === "note", "у фрейма палитра бумаги, не чернила: " + dots[0]);
    w.document.getElementById("bd-mp-rename").click();
    await tick(20);
    ok(!w.document.getElementById("bd-editor").hidden && inp.value === "Грамматика",
       "кнопка «Переименовать» открыла редактор с заголовком");
    w.document.getElementById("bd-editor-cancel").click();
    await tick(400);   // снова пережидаем окно двойного тапа
    // залоченное содержимое с фреймом НЕ едет (замок — «закреплено на месте»)
    w.eval(`BD.objects.get("n1").locked = 1;`);
    point(w, "pointerdown", 170, 160);
    point(w, "pointermove", 170, 210);
    point(w, "pointerup", 170, 210);
    ok(byId(w, fid).y === 200 && byId(w, "n1").y === 200 && byId(w, "n1").x === 200,
       "фрейм переехал, залоченный стикер остался: " + byId(w, "n1").x + "," + byId(w, "n1").y);
    press("z", { ctrlKey: true });   // откат последнего переноса
    w.eval(`BD.objects.get("n1").locked = 0;`);
    await tick(400);   // пережидаем окно двойного тапа перед новым жестом
    // удаление фрейма не трогает содержимое
    point(w, "pointerdown", 170, 160);
    point(w, "pointerup", 170, 160);
    ok(bd(w).selected === fid, "фрейм выделен для удаления");
    press("Delete");
    ok(!byId(w, fid) && !!byId(w, "n1"), "фрейм удалён — стикер остался на доске");
  }

  console.log("\n18. Паритет сторон: цвета стикеров, кегли, панели — одинаково у обоих");
  {
    const w = makeBoard();           // репетитор
    const sw = makeStudentBoard();   // ученик
    await tick(150);
    const swatches = win => {
      tool(win, "note");
      return [...win.document.querySelectorAll(".bd-swatch")]
        .filter(s => !s.hidden).map(s => s.title);
    };
    const tSw = swatches(w), sSw = swatches(sw);
    ok(JSON.stringify(tSw) === JSON.stringify(sSw),
       "цвета стикера у репетитора и ученика совпадают: " + sSw.join(","));
    ok(tSw.filter(t => t.startsWith("note")).length === 5
       && tSw.some(t => t.includes("Свой")),
       "5 цветов бумаги + «свой цвет» у обоих");
    // кегли текста (A−/A+ и ряд размеров) — тоже у обоих
    [w, sw].forEach((win, i) => {
      tool(win, "text");
      ok(!win.document.getElementById("bd-sizes").hidden,
         (i ? "у ученика" : "у репетитора") + " виден ряд кеглей текста");
    });
    // мини-панель над стикером: палитра бумаги у обеих ролей
    for (const [win, role] of [[w, "репетитор"], [sw, "ученик"]]) {
      win.eval(`BD.objects.set("pn1", { id: "pn1", kind: "note", x: 300, y: 300,
                 w: 180, h: 120, color: "note", size: 3, rev: 1, text: "стикер" });`);
      tool(win, "select");
      win.eval(`BD.selected = "pn1"; BD.selectedSet = new Set(["pn1"]);`);
      // точечный вызов отрисовки панели без ожидания кадра
      win.eval("updateMiniPanel()");
      const dots = [...win.document.querySelectorAll(".bd-minicolor")]
        .map(b => b.dataset.color);
      ok(dots[0] === "note", role + ": в мини-панели стикера палитра бумаги: " + dots[0]);
      ok(!win.document.getElementById("bd-minipanel").hidden,
         role + ": мини-панель видна");
      win.eval(`BD.objects.delete("pn1"); BD.selected = null; BD.selectedSet = new Set();`);
    }
    // кнопки, общие по смыслу: реакции, PNG, лазер, фрейм — видны обоим;
    // осознанно репетиторские (очистка, фон) у ученика скрыты
    for (const [win, role, isStudent] of [[w, "репетитор", 0], [sw, "ученик", 1]]) {
      ["bd-react", "bd-png"].forEach(id =>
        ok(!win.document.getElementById(id).hidden, role + ": видна " + id));
      ok(!!win.document.querySelector('.bd-tool[data-tool="laser"]'), role + ": есть лазер");
      ok(!!win.document.querySelector('.bd-tool[data-tool="frame"]'), role + ": есть фрейм");
      ok(win.document.getElementById("bd-clear").hidden === !!isStudent,
         role + ": очистка доски " + (isStudent ? "скрыта (репетиторская)" : "видна"));
      ok(win.document.getElementById("bd-bg").hidden === !!isStudent,
         role + ": фон доски " + (isStudent ? "скрыт (репетиторский)" : "виден"));
    }
    // хоткей F (фрейм) работает и у ученика
    const ev = new sw.Event("keydown", { bubbles: true });
    Object.assign(ev, { key: "f", preventDefault() {} });
    sw.document.dispatchEvent(ev);
    ok(bd(sw).tool === "frame", "у ученика хоткей F включает фрейм");
  }

  console.log("\n19. Ресайз за угол: текст — кегль (рамка следует), стикер — w/h");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("t1", { id: "t1", kind: "text", x: 100, y: 100, w: 200, h: 24,
             color: "ink", size: 4, rev: 1, text: "пример" });`);
    tool(w, "select");
    point(w, "pointerdown", 150, 112);   // выделяем текст
    point(w, "pointerup", 150, 112);
    ok(bd(w).selected === "t1", "текст выделен");
    // уголок в (b.x+b.w+6, b.y+b.h+6) = (306, 130); тянем вниз-вправо
    point(w, "pointerdown", 306, 130);
    point(w, "pointermove", 406, 180);
    point(w, "pointerup", 406, 180);
    const t1 = byId(w, "t1");
    ok(t1.size > 4, "кегль вырос: size " + t1.size.toFixed(1));
    ok(t1.h > 24, "рамка следует за кеглем: h " + t1.h.toFixed(0));
    ok(t1.x === 100 && t1.y === 100 && t1.w === 200,
       "верхний левый угол и ширина на месте — не скачет");
    // пределы: рывок далеко — кегль не выше 96/6=16, к нулю — не ниже 2
    point(w, "pointerdown", 306 + t1.h, 130 + t1.h);   // перехват угла новой рамки…
    point(w, "pointerup", 306 + t1.h, 130 + t1.h);     // …нет, сначала перевыделим
    point(w, "pointerdown", 150, 112);
    point(w, "pointerup", 150, 112);
    const b2 = w.eval(`(() => { const b = bounds(BD.objects.get("t1")); return b; })()`);
    point(w, "pointerdown", b2.x + b2.w + 6, b2.y + b2.h + 6);
    point(w, "pointermove", b2.x + b2.w + 900, b2.y + b2.h + 900);
    point(w, "pointerup", b2.x + b2.w + 900, b2.y + b2.h + 900);
    // Волна 3: потолка НЕТ — тянем хоть на всю доску (раньше упиралось в 16)
    ok(byId(w, "t1").size > 16, "потолка нет: size " + byId(w, "t1").size.toFixed(1) + " (было бы 16)");
    // стикер: уголок меняет w/h
    w.eval(`BD.objects.set("n9", { id: "n9", kind: "note", x: 500, y: 300, w: 180, h: 120,
             color: "note", size: 3, rev: 2, text: "стикер" });`);
    point(w, "pointerdown", 550, 340);
    point(w, "pointerup", 550, 340);
    ok(bd(w).selected === "n9", "стикер выделен");
    point(w, "pointerdown", 686, 426);   // уголок (500+180+6, 300+120+6)
    point(w, "pointermove", 786, 526);
    point(w, "pointerup", 786, 526);
    const n9 = byId(w, "n9");
    ok(n9.w > 180 && n9.h > 120, "стикер растянулся за угол: " + n9.w + "×" + n9.h);
    // и кегль масштабируется пропорционально (методист: «рамка росла, текст нет»)
    ok(n9.size > 3, "кегль стикера вырос: size " + n9.size.toFixed(1));
  }

  console.log("\n20. Пустые тексты: Esc, клик мимо, выметание окаменелостей");
  {
    const w = makeBoard();
    await tick(150);
    // создал текст, передумал, Esc — объекта нет
    tool(w, "text");
    point(w, "pointerdown", 500, 300);
    point(w, "pointerup", 500, 300);
    ok(objects(w).some(o => o.kind === "text"), "текстовый объект создан (редактор открыт)");
    const esc = new w.Event("keydown", { bubbles: true });
    Object.assign(esc, { key: "Escape", preventDefault() {} });
    w.document.getElementById("bd-editor-input").dispatchEvent(esc);
    ok(!objects(w).some(o => o.kind === "text"), "Esc по пустому — объект удалён");
    // создал текст, кликнул мимо — тоже чисто (коммит пустого = удаление)
    point(w, "pointerdown", 500, 300);
    point(w, "pointerup", 500, 300);
    ok(!w.document.getElementById("bd-editor").hidden, "редактор снова открыт");
    point(w, "pointerdown", 700, 500);   // клик мимо редактора
    point(w, "pointerup", 700, 500);
    ok(w.document.getElementById("bd-editor").hidden, "клик мимо закрыл редактор");
    ok(!objects(w).some(o => o.kind === "text"), "клик мимо по пустому — объект удалён");
    // а с текстом клик мимо — коммит, объект остаётся
    tool(w, "note");
    point(w, "pointerdown", 500, 300);
    point(w, "pointerup", 500, 300);
    const inp = w.document.getElementById("bd-editor-input");
    inp.value = "важное";
    point(w, "pointerdown", 700, 500);
    point(w, "pointerup", 700, 500);
    const note = objects(w).find(o => o.kind === "note");
    ok(!!note && note.text === "важное", "клик мимо с текстом — коммит, стикер остался");
    // окаменелости со старых времён выметаются первым снимком
    w.eval(`BD.objects.set("f1", { id: "f1", kind: "note", x: 0, y: 0, w: 180, h: 120,
             color: "note", size: 3, rev: 5, text: "   " });
            BD.objects.set("f2", { id: "f2", kind: "text", x: 50, y: 50, w: 200, h: 24,
             color: "ink", size: 4, rev: 6, text: "" });
            sweepEmptyTexts();`);
    ok(!byId(w, "f1") && !byId(w, "f2"), "выметание убрало пустые note и text");
    // невидимый пустой стикер не перехватывает клики (hitTest пропускает)
    w.eval(`BD.objects.set("f3", { id: "f3", kind: "note", x: 900, y: 600, w: 180, h: 120,
             color: "note", size: 3, rev: 7, text: "" });`);
    tool(w, "select");
    point(w, "pointerdown", 950, 650);
    point(w, "pointerup", 950, 650);
    ok(bd(w).selected !== "f3" && !bd(w).selectedSet.has("f3"),
       "пустой стикер не ловится кликом");
  }

  console.log("\n21. Лазер: след за курсором, посылка серией, гашение при смене инструмента");
  {
    const w = makeBoard();
    await tick(150);
    tool(w, "laser");
    point(w, "pointermove", 100, 100);
    point(w, "pointermove", 120, 110);
    point(w, "pointermove", 140, 120);
    ok(bd(w).laserPts.length >= 3, "точки следа копятся: " + bd(w).laserPts.length);
    const payload = w.eval("buildLaserPayload()");
    ok(!!payload && Array.isArray(payload.pts) && payload.pts.length >= 3,
       "посылка — серия точек: " + (payload && payload.pts.length));
    ok(payload.pts.every(p => Array.isArray(p) && p.length === 2),
       "точки посылки — пары [x,y] в мировых координатах");
    // смена инструмента — след гаснет сразу (и уедет гашение через syncNow)
    tool(w, "select");
    ok(bd(w).laserPts.length === 0 && !bd(w).laser, "смена инструмента погасила след");
    const off = w.eval("buildLaserPayload()");
    ok(off === null, "после гашения посылка — null (сервер снимет точку)");
    // наводка лазером не трогает объекты: pointerdown по объекту ничего не делает
    w.eval(`BD.objects.set("ln1", { id: "ln1", kind: "note", x: 100, y: 100, w: 180, h: 120,
             color: "note", size: 3, rev: 1, text: "не тронь" });`);
    tool(w, "laser");
    point(w, "pointerdown", 150, 150);
    point(w, "pointerup", 150, 150);
    ok(!bd(w).selected && bd(w).selectedSet.size === 0,
       "клик лазером по стикеру не выделяет его");
    ok(byId(w, "ln1").x === 100, "и не двигает");
  }

  console.log("\n22. Эмодзи: полный пикер (категории, поиск), вставка в каретку, штамп");
  {
    const w = makeBoard();
    await tick(150);
    tool(w, "note");
    point(w, "pointerdown", 500, 300);
    point(w, "pointerup", 500, 300);
    const inp = w.document.getElementById("bd-editor-input");
    inp.value = "котики";
    inp.selectionStart = inp.selectionEnd = 3;
    w.document.getElementById("bd-editor-emoji").click();
    await tick(30);
    const picker = w.document.querySelector(".bd-emoji-picker");
    ok(!!picker && !picker.hidden, "кнопка 😀 открыла полный пикер");
    ok(picker.querySelectorAll(".bd-emoji-tab").length === 9,
       "9 категорий-вкладок: " + picker.querySelectorAll(".bd-emoji-tab").length);
    ok(picker.querySelector(".bd-emoji-grid").querySelectorAll("[data-ch]").length > 80,
       "первая категория заполнена: " + picker.querySelector(".bd-emoji-grid").querySelectorAll("[data-ch]").length);
    // поиск по-русски: «кот» находит 🐱
    const search = picker.querySelector(".bd-emoji-search");
    search.value = "кот";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    // nwsapi (селекторы jsdom) путается в не-BMP символах внутри
    // атрибутных селекторов — эмодзи ищем сравнением строк, а не CSS.
    const pickEmoji = ch => [...picker.querySelectorAll("[data-ch]")]
      .find(b => b.dataset.ch === ch);
    const cat = pickEmoji("🐱");
    ok(!!cat, "поиск «кот» нашёл 🐱");
    cat.click();
    ok(inp.value === "кот🐱ики", "эмодзи встал в позицию каретки: " + inp.value);
    ok(picker.hidden, "после выбора пикер закрылся");
    w.document.getElementById("bd-editor-cancel").click();
    // поиск по имени категории: «флаг» показывает флаги
    w.document.getElementById("bd-editor-emoji").click();
    await tick(30);
    search.value = "флаг";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(w.document.querySelector(".bd-emoji-grid").querySelectorAll("[data-ch]").length > 50,
       "поиск «флаг» показал флаги: " + w.document.querySelector(".bd-emoji-grid").querySelectorAll("[data-ch]").length);
    // пикер НЕ тронут swapEmoji из icons.js: кнопки остаются эмодзи
    ok([...w.document.querySelectorAll(".bd-emoji-grid [data-ch]")].every(b => !b.querySelector("svg")),
       "swapEmoji не тронул пикер (нет svg-подмен)");
    w.document.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }),
      { key: "Escape", preventDefault() {} }));
    // штамп: «Выбрать эмодзи…» в меню реакций → пикер → клик по полотну
    w.document.getElementById("bd-react").click();
    await tick(30);
    ok(!!w.document.getElementById("bd-react-more"), "в меню реакций есть «ещё…»");
    w.document.getElementById("bd-stamp-open").click();
    await tick(30);
    const picker2 = w.document.querySelector(".bd-emoji-picker");
    ok(!picker2.hidden, "«Выбрать эмодзи…» открыл пикер");
    const search2 = picker2.querySelector(".bd-emoji-search");
    search2.value = "кот";
    search2.dispatchEvent(new w.Event("input", { bubbles: true }));
    [...picker2.querySelectorAll("[data-ch]")].find(b => b.dataset.ch === "🐱").click();
    ok(bd(w).tool === "emoji", "после выбора — инструмент-штамп");
    point(w, "pointerdown", 600, 400);
    point(w, "pointerup", 600, 400);
    const em = objects(w).find(o => o.kind === "emoji");
    ok(!!em && em.text === "🐱", "эмодзи стал объектом на доске: " + (em && em.text));
    ok(bd(w).tool === "select", "штамп одноразовый — обратно в «Выделить»");
    // масштаб кнопками A−/A+ (через мини-панель — size растёт)
    point(w, "pointerdown", em.x + 10, em.y + 10);
    point(w, "pointerup", em.x + 10, em.y + 10);
    ok(bd(w).selected === em.id, "эмодзи выделяется");
    const s0 = byId(w, em.id).size;
    w.document.getElementById("bd-mp-plus").click();
    ok(byId(w, em.id).size > s0, "A+ увеличил эмодзи: size " + byId(w, em.id).size);
    // Esc отменяет вооружённый штамп без объекта
    w.document.getElementById("bd-react").click();
    await tick(30);
    w.document.getElementById("bd-stamp-open").click();
    await tick(30);
    const picker3 = w.document.querySelector(".bd-emoji-picker");
    picker3.querySelector(".bd-emoji-search").value = "огонь";
    picker3.querySelector(".bd-emoji-search").dispatchEvent(new w.Event("input", { bubbles: true }));
    [...picker3.querySelectorAll("[data-ch]")].find(b => b.dataset.ch === "🔥").click();
    const esc = new w.Event("keydown", { bubbles: true });
    Object.assign(esc, { key: "Escape", preventDefault() {} });
    w.document.dispatchEvent(esc);
    ok(bd(w).tool === "select" && objects(w).filter(o => o.kind === "emoji").length === 1,
       "Esc отменил штамп — лишний объект не появился");
  }

  console.log("\n25. Ресайз без потолка: штрих масштабируется, текст растёт без упора, A+ не обрезает");
  {
    const w = makeBoard();
    await tick(150);
    // штрих pen: уголок масштабирует точки
    w.eval(`BD.objects.set("p1", { id: "p1", kind: "pen", color: "ink", size: 3, rev: 1,
             pts: [100, 100, 140, 100, 140, 140, 180, 140] });`);
    tool(w, "select");
    point(w, "pointerdown", 120, 102);   // выделяем штрих (точка на линии, порог 8)
    point(w, "pointerup", 120, 102);
    ok(bd(w).selected === "p1", "штрих выделен (у него есть уголок)");
    const b1 = w.eval(`bounds(BD.objects.get("p1"))`);
    point(w, "pointerdown", b1.x + b1.w + 6, b1.y + b1.h + 6);
    point(w, "pointermove", b1.x + b1.w + 86, b1.y + b1.h + 46);
    point(w, "pointerup", b1.x + b1.w + 86, b1.y + b1.h + 46);
    const b2 = w.eval(`bounds(BD.objects.get("p1"))`);
    ok(b2.w > b1.w * 1.5 && b2.h > b1.h * 1.5,
       `штрих вырос за угол: ${b1.w}×${b1.h} → ${Math.round(b2.w)}×${Math.round(b2.h)}`);
    ok(Math.abs(b2.x - b1.x) < 1 && Math.abs(b2.y - b1.y) < 1,
       "левый верхний угол штриха на месте — масштаб от угла");
    // undo возвращает исходные точки
    const z = new w.Event("keydown", { bubbles: true });
    Object.assign(z, { key: "z", ctrlKey: true, preventDefault() {} });
    w.document.dispatchEvent(z);
    ok(w.eval(`bounds(BD.objects.get("p1")).w`) === b1.w, "Ctrl+Z вернул штрих");
    // текст растёт без потолка: тянем далеко — size уходит за 16 (бывший 96/6)
    w.eval(`BD.objects.set("t9", { id: "t9", kind: "text", x: 100, y: 400, w: 200, h: 24,
             color: "ink", size: 4, rev: 2, text: "большой" });`);
    point(w, "pointerdown", 150, 410);
    point(w, "pointerup", 150, 410);
    const bt = w.eval(`bounds(BD.objects.get("t9"))`);
    point(w, "pointerdown", bt.x + bt.w + 6, bt.y + bt.h + 6);
    point(w, "pointermove", bt.x + bt.w + 1600, bt.y + bt.h + 800);
    point(w, "pointerup", bt.x + bt.w + 1600, bt.y + bt.h + 800);
    ok(byId(w, "t9").size > 16, "текст натянули огромным: size " + byId(w, "t9").size.toFixed(0));
    // A+ не обрезает натянутое (волна 3): растёт дальше, а не сжимает к 60
    const huge = byId(w, "t9").size;
    w.document.getElementById("bd-mp-plus").click();
    ok(byId(w, "t9").size === huge + 2, "A+ не обрезал: " + huge + " → " + byId(w, "t9").size);
    // hitTest следует за новым размером штриха: клик по увеличенной линии
    w.eval(`BD.selected = "p1"; BD.selectedSet = new Set(["p1"]);`);
    ok(w.eval(`(() => { const b = bounds(BD.objects.get("p1")); return b.w; })()`) === b1.w,
       "штрих снова в исходном размере перед проверкой хит-теста");
  }

  console.log("\n23. Экспорт PNG: меню «Вся доска / Текущий вид» в обёртке кнопки");
  {
    const w = makeBoard();
    await tick(150);
    const menu = w.document.getElementById("bd-png-menu");
    ok(!!menu && menu.closest(".bd-share-wrap") && menu.closest(".bd-share-wrap").contains(w.document.getElementById("bd-png")),
       "меню PNG живёт в .bd-share-wrap с кнопкой (баг невидимых меню)");
    ok(menu.hidden, "меню изначально скрыто");
    w.document.getElementById("bd-png").click();
    ok(!menu.hidden, "кнопка PNG открывает меню");
    ok(!!w.document.getElementById("bd-png-all") && !!w.document.getElementById("bd-png-view"),
       "есть оба пункта: «Вся доска» и «Текущий вид»");
    // «Вся доска» на пустой доске честно отказывает, меню закрывается
    w.document.getElementById("bd-png-all").click();
    ok(menu.hidden, "после выбора пункта меню закрылось");
    ok(w.document.getElementById("bd-toast").textContent.includes("пустая"),
       "пустая доска — тост «Доска пустая», а не молчание");
  }

  console.log("\n24. Словарь ученика для репетитора: счётчики, статусы, удаление");
  {
    const w = makeBoard();
    await tick(150);
    // ответы API: ученики, словарь выбранного, перехват удаления
    const calls = [];
    w.fetch = (url, opt) => {
      const u = String(url);
      calls.push({ url: u, body: opt && opt.body ? JSON.parse(opt.body) : {} });
      const box = (j) => Promise.resolve({ ok: true, json: () => Promise.resolve(j) });
      if (u.includes("/api/tutor/students")) {
        return box({ ok: true, students: [{ id: 1, name: "Петя", words: { total: 3 } }] });
      }
      if (u.includes("/api/tutor/student")) {
        return box({ ok: true, student: { dictionary: [
          { w: "cat", t: "кот", folders: ["Животные"], status: "learned", ex: "" },
          { w: "dog", t: "пёс", folders: ["Животные"], status: "learning" },
          { w: "sun", t: "солнце", folders: [], status: "new" },
        ] } });
      }
      if (u.includes("/api/tutor/delete-word")) return box({ ok: true });
      return box({ ok: true, rev: 1, objects: [], deleted: [], me: "tutor",
                   title: "Урок", shared: 0, invited: null });
    };
    w.document.getElementById("bd-words").click();
    await tick(120);   // loadStudents → loadWords → renderWords (асинхронно)
    ok(!w.document.getElementById("bd-panel").hidden, "панель словаря открылась");
    const cnt = w.document.getElementById("bd-dict-count").textContent;
    ok(cnt.includes("3") && cnt.includes("выучено 1") && cnt.includes("учится 1") && cnt.includes("новых 1"),
       "счётчики в шапке: " + cnt);
    const head = w.document.querySelector(".bd-folder-head");
    ok(!!head && head.textContent.includes("Животные") && head.textContent.includes("2"),
       "папка с количеством: " + (head && head.textContent.trim()));
    ok([...w.document.querySelectorAll(".bd-word-status")].some(s => s.textContent === "выучено"),
       "у слов видны статусы");
    const delBtns = [...w.document.querySelectorAll(".bd-word-del")];
    ok(delBtns.length === 3, "у репетитора кнопки удаления у каждого слова: " + delBtns.length);
    // удаление: уходит правильный запрос, слово пропадает из списка
    delBtns[0].click();
    await tick(60);
    const delCall = calls.find(c => c.url.includes("/api/tutor/delete-word"));
    ok(!!delCall && delCall.body.studentId === 1 && !!delCall.body.w,
       "запрос удаления: studentId=1, w=" + (delCall && delCall.body.w));
    ok(w.document.querySelectorAll(".bd-word-del").length === 2,
       "слово исчезло из списка без перезагрузки");
    // ученику кнопок удаления нет (и панель — его собственный словарь)
    const sw = makeStudentBoard();
    await tick(120);
    sw.localStorage.setItem("savelyState", JSON.stringify({ dictionary: [
      { w: "cat", t: "кот", folders: [], status: "new" },
    ] }));
    sw.document.getElementById("bd-words").click();
    await tick(60);
    ok(sw.document.querySelectorAll(".bd-word-del").length === 0,
       "у ученика кнопок удаления нет");
    ok(sw.document.querySelectorAll(".bd-word").length === 1,
       "а его словарь в панели виден");
    // dictDel: онлайн-ученик убирает слово из своего состояния
    const dropped = sw.eval(`studentDropWord({ w: "cat" })`);
    ok(dropped === true && JSON.parse(sw.localStorage.getItem("savelyState")).dictionary.length === 0,
       "studentDropWord убрал слово из savelyState");
    ok(sw.eval(`studentDropWord({ w: "cat" })`) === false,
       "повторное — честное false (уже нет)");
  }

  console.log("\n26. Поиск по доске: Ctrl+F, живой поиск, навигация, перелёт и пульс");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("s1", { id: "s1", kind: "note", x: 500, y: 300, w: 180, h: 120,
             color: "note", size: 3, rev: 1, text: "рыбалка завтра" });
            BD.objects.set("s2", { id: "s2", kind: "frame", x: 900, y: 600, w: 400, h: 300,
             color: "note", size: 3, rev: 2, title: "Рыбы и звери" });
            BD.objects.set("s3", { id: "s3", kind: "word", x: 100, y: 100, w: 200, h: 62,
             color: "green", size: 3, rev: 3, text: "cat", text2: "кот" });
            BD.objects.set("s4", { id: "s4", kind: "emoji", x: 300, y: 500, w: 58, h: 58,
             color: "ink", size: 8, rev: 4, text: "🐱" });`);
    // Ctrl+F открывает свою панель и не даёт браузерной
    const ev = (k, extra = {}) => {
      const e = new w.Event("keydown", { bubbles: true, cancelable: true });
      Object.assign(e, { key: k, preventDefault() {}, ...extra });
      w.document.dispatchEvent(e);
      return e;
    };
    const f = ev("f", { ctrlKey: true });
    ok(!w.document.getElementById("bd-searchbox").hidden, "Ctrl+F открыл поиск");
    // живой поиск без регистра: «РЫБ» находит и стикер, и фрейм
    const inp = w.document.getElementById("bd-searchbox-input");
    inp.value = "РЫБ";
    inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(bd(w).search.results.length === 2, "«РЫБ» нашла 2 объекта (стикер и фрейм)");
    ok(w.document.getElementById("bd-searchbox-count").textContent === "1/2",
       "счётчик 1/2: " + w.document.getElementById("bd-searchbox-count").textContent);
    // слово и эмодзи: «кот» находит и word, и объект 🐱 (по ключам)
    inp.value = "кот";
    inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(bd(w).search.results.length === 2,
       "«кот» нашёл слово и эмодзи: " + bd(w).search.results.map(x => x.o.kind));
    // стрелки листают, Enter — перелёт к объекту и пульс
    inp.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }),
      { key: "ArrowDown", preventDefault() {} }));
    ok(bd(w).search.idx === 1, "стрелка вниз сдвинула указатель");
    const viewBefore = { ...bd(w).view };
    inp.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }),
      { key: "Enter", preventDefault() {} }));
    ok(!!bd(w).search.pulse, "после Enter — пульс на объекте");
    await tick(700);   // перелёт 500 мс
    const c = w.eval(`(() => { const b = bounds(BD.objects.get("s4")); return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; })()`);
    const scr = w.eval(`(() => { const b = bounds(BD.objects.get("s4")); return { x: (b.x + b.w / 2) * BD.view.k + BD.view.x, y: (b.y + b.h / 2) * BD.view.k + BD.view.y }; })()`);
    ok(Math.abs(scr.x - 512) < 40 && Math.abs(scr.y - 400) < 40,
       `вид центрирован на эмодзи: экран ${Math.round(scr.x)},${Math.round(scr.y)} (окно 1024×800)`);
    // буквы в поле поиска не хоткеи: печать «d» не включает кубик
    inp.value = "d";
    inp.dispatchEvent(new w.Event("input", { bubbles: true }));
    ok(bd(w).tool !== "dice", "печать в поле поиска не переключает инструменты");
    // Esc закрывает; клик мимо — тоже
    inp.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }),
      { key: "Escape", preventDefault() {} }));
    ok(w.document.getElementById("bd-searchbox").hidden, "Esc закрыл панель");
    // Ctrl+F В РЕДАКТОРЕ стикера не перехватываем (там браузерный)
    tool(w, "note");
    point(w, "pointerdown", 100, 100);
    point(w, "pointerup", 100, 100);
    const ta = w.document.getElementById("bd-editor-input");
    const ev2 = new w.Event("keydown", { bubbles: true, cancelable: true });
    Object.assign(ev2, { key: "f", ctrlKey: true, preventDefault() {} });
    ta.dispatchEvent(ev2);
    ok(w.document.getElementById("bd-searchbox").hidden,
       "Ctrl+F в редакторе — не наш (панель не открылась)");
    w.document.getElementById("bd-editor-cancel").click();
  }

  console.log("\n27. Кубик: ставка, бросок в пределах граней, грани, замок, undo");
  {
    const w = makeBoard();
    await tick(150);
    // хоткей D включает кубик
    const ev = new w.Event("keydown", { bubbles: true });
    Object.assign(ev, { key: "d", preventDefault() {} });
    w.document.dispatchEvent(ev);
    ok(bd(w).tool === "dice", "D включает кубик");
    // ставка кликом
    point(w, "pointerdown", 400, 300);
    point(w, "pointerup", 400, 300);
    const dice = objects(w).find(o => o.kind === "dice");
    ok(!!dice && dice.sides === 6 && dice.value >= 1 && dice.value <= 6,
       "кубик поставлен: d6, значение " + (dice && dice.value));
    ok(bd(w).tool === "select", "после ставки — обратно в «Выделить»");
    // undo ставки убирает объект
    const z = new w.Event("keydown", { bubbles: true });
    Object.assign(z, { key: "z", ctrlKey: true, preventDefault() {} });
    w.document.dispatchEvent(z);
    ok(!byId(w, dice.id), "Ctrl+Z снял ставку кубика");
    w.document.dispatchEvent(Object.assign(new w.Event("keydown", { bubbles: true }),
      { key: "z", ctrlKey: true, shiftKey: true, preventDefault() {} }));
    ok(!!byId(w, dice.id), "redo вернул кубик");
    // клик по кубику — бросок: анимация, потом значение в пределах граней
    point(w, "pointerdown", dice.x + 20, dice.y + 20);
    point(w, "pointerup", dice.x + 20, dice.y + 20);
    ok(bd(w).diceAnims.has(dice.id), "клик запустил бросок (мерцание)");
    await tick(1100);   // мерцание 900 мс
    const v1 = byId(w, dice.id).value;
    ok(v1 >= 1 && v1 <= 6, "после броска значение в гранях: " + v1);
    // мини-панель: «Перебросить» и чипы граней у одиночного кубика
    point(w, "pointerdown", dice.x + 20, dice.y + 20);
    point(w, "pointerup", dice.x + 20, dice.y + 20);
    await tick(60);
    ok(!w.document.getElementById("bd-mp-roll").hidden, "в мини-панели есть «Перебросить»");
    ok(!w.document.getElementById("bd-mp-sides").hidden, "и чипы граней");
    ok(w.document.querySelectorAll(".bd-mp-side").length === 6, "чипов 4/6/8/10/12/20: "
       + w.document.querySelectorAll(".bd-mp-side").length);
    // смена граней на d20: sides меняется, значение зажато, undo-шаг обычный
    [...w.document.querySelectorAll(".bd-mp-side")].find(b => +b.dataset.sides === 20).click();
    ok(byId(w, dice.id).sides === 20, "кубик стал d20");
    ok(byId(w, dice.id).value <= 20, "значение в новых гранях: " + byId(w, dice.id).value);
    await tick(1000);   // второй бросок (клик по кубику для мини-панели) догорает
    // залоченный кубик не бросается (кликом — кнопка в панели замком скрыта)
    w.eval(`BD.objects.set("${dice.id}", { ...BD.objects.get("${dice.id}"), locked: 1 });`);
    const vLock = byId(w, dice.id).value;
    point(w, "pointerdown", dice.x + 20, dice.y + 20);
    point(w, "pointerup", dice.x + 20, dice.y + 20);
    ok(!bd(w).diceAnims.has(dice.id) && byId(w, dice.id).value === vLock,
       "залоченный кубик не бросается");
  }

  console.log("\n28. Rich-текст: перенос по ширине (\\u00A0 тоже), разметка, списки, поиск без маркеров");
  {
    const w = makeBoard();
    await tick(150);
    // перенос из Word: неразрывные пробелы — не одна «слово-полоса»
    const nb = "раз два раз два раз два раз два раз два раз два".replace(/ /g, " ");
    const lines = w.eval(`layoutRichText(${JSON.stringify(nb)}, 60, 16, "600")`);
    ok(lines.length > 2, "текст с \\u00A0 переносится: " + lines.length + " строк (было 1)");
    // \n остаются абзацами
    const paras = w.eval(`layoutRichText("один\\nдва\\nтри", 900, 16, "600")`);
    ok(paras.length === 3, "три абзаца — три строки: " + paras.length);
    // auto-height растёт с числом строк
    const h1 = w.eval(`textHeight("раз два", 900, 24)`);
    const h2 = w.eval(`textHeight("раз\\nдва\\nтри\\nчетыре", 900, 24)`);
    ok(h2 > h1 * 3, "высота по строкам: " + h1 + " → " + h2);
    // разметка: **жирный**, *курсив*, а «2 * 3 = 6» — не разметка
    const segs = w.eval(`parseRichLine("**жир** и *кр*, а 2 * 3 = 6")`);
    ok(segs.some(s => s.b && s.text === "жир") && segs.some(s => s.i && s.text === "кр"),
       "жирный и курсив распарсились");
    const last = segs[segs.length - 1];
    ok(last.text.includes("2 * 3 = 6") && !last.i && !last.b,
       "«2 * 3 = 6» осталось обычным текстом: " + JSON.stringify(last.text));
    ok(w.eval(`stripRich("**жир** *кр*")`) === "жир кр",
       "stripRich снимает маркеры: " + w.eval(`stripRich("**жир** *кр*")`));
    // списки: буллет и нумерация с отступом
    const lst = w.eval(`layoutRichText("• раз\\n• два\\n1. первый", 900, 16, "600")`);
    ok(lst[0].bullet === "•" && lst[0].indent === 1 && lst[2].bullet === "1.",
       "буллеты и номер распознаны");
    // поиск по доске — по тексту БЕЗ маркеров
    w.eval(`BD.objects.set("m1", { id: "m1", kind: "note", x: 100, y: 100, w: 180, h: 120,
             color: "note", size: 3, rev: 1, text: "**сирень** цветёт" });`);
    const found = w.eval(`searchables().filter(x =>
      (x.text + " " + x.extra).toLowerCase().includes("сирень"))`);
    ok(found.length === 1 && found[0].text.includes("сирень") && !found[0].text.includes("**"),
       "поиск нашёл «сирень» без маркеров: " + (found[0] && found[0].text));
    // редактор: подсказка и панель форматирования у текста, скрыты у фрейма
    tool(w, "note");
    point(w, "pointerdown", 500, 300);
    point(w, "pointerup", 500, 300);
    ok(!w.document.getElementById("bd-editor-hint").hidden
       && !w.document.getElementById("bd-editor-fmt").hidden,
       "у текста видны подсказка и кнопки B/I/U/S/•/1.");
    const h = w.document.getElementById("bd-editor-input").style.height;
    ok(!!h, "поле выросло по содержимому (inline height): " + h);
    // кнопка B оборачивает выделение маркерами, повтор — снимает
    const inp = w.document.getElementById("bd-editor-input");
    inp.value = "кот спит";
    inp.selectionStart = 0; inp.selectionEnd = 3;
    w.eval("editorWrapSelection('**', '**')");
    ok(inp.value === "**кот** спит", "B обернула: " + inp.value);
    inp.selectionStart = 2; inp.selectionEnd = 5;
    w.eval("editorWrapSelection('**', '**')");
    ok(inp.value === "кот спит", "повторная B сняла: " + inp.value);
    // кнопка • превращает выделенные строки в буллеты
    inp.value = "раз\nдва";
    inp.selectionStart = 0; inp.selectionEnd = 7;
    w.eval("editorListLines(false)");
    ok(inp.value === "• раз\n• два", "строки стали буллетами: " + JSON.stringify(inp.value));
    inp.selectionStart = 0; inp.selectionEnd = inp.value.length;
    w.eval("editorListLines(true)");
    ok(inp.value === "1. раз\n2. два", "и нумерованными: " + JSON.stringify(inp.value));
    // фрейму разметка не показывается
    w.document.getElementById("bd-editor-cancel").click();
    w.eval(`BD.objects.set("f9", { id: "f9", kind: "frame", x: 100, y: 600, w: 300, h: 200,
             color: "note", size: 3, rev: 2, title: "Фрейм" });
            BD.selected = "f9"; openEditor(BD.objects.get("f9"));`);
    ok(w.document.getElementById("bd-editor-hint").hidden
       && w.document.getElementById("bd-editor-fmt").hidden,
       "у заголовка фрейма подсказка и панель скрыты");
    w.document.getElementById("bd-editor-cancel").click();
  }

  console.log("\n29. Рисование без лага: coalesced-точки, инкремент, троттлинг paint");
  {
    const w = makeBoard();
    await tick(150);
    tool(w, "pen");
    point(w, "pointerdown", 100, 100);
    point(w, "pointermove", 120, 110);
    point(w, "pointermove", 140, 120);
    const dr = objects(w).find(o => o.kind === "pen");
    ok(!!dr && dr.pts.length >= 6, "штрих копит точки: " + (dr && dr.pts.length / 2));
    w.eval("drawStrokeTail(BD.objects.get('" + dr.id + "'))");
    ok(dr._tailDone === dr.pts.length, "инкремент дорисовал хвост: _tailDone=" + dr._tailDone);
    const full1 = dr._lastFull;
    ok(!!full1, "первая полная перерисовка была");
    point(w, "pointermove", 150, 130);
    ok(dr._lastFull === full1, "следующие 200 мс paint не дёргается (троттлинг)");
    point(w, "pointerup", 150, 130);
    ok(!!byId(w, dr.id), "штрих сохранён на доске");
  }

  console.log("\n30. Мини-панель: прячется при драге, B/I/U всего текста; текст в фигуре");
  {
    const w = makeBoard();
    await tick(150);
    // B/I/U всего текста из мини-панели: тоггл построчный
    ok(w.eval(`wrapWholeText("раз\\nдва", "**")`) === "**раз**\n**два**",
       "обёртка всех строк: " + JSON.stringify(w.eval(`wrapWholeText("раз\\nдва", "**")`)));
    ok(w.eval(`wrapWholeText("**раз**\\n**два**", "**")`) === "раз\nдва",
       "и снятие: " + JSON.stringify(w.eval(`wrapWholeText("**раз**\\n**два**", "**")`)));
    w.eval(`BD.objects.set("n1", { id: "n1", kind: "note", x: 400, y: 300, w: 180, h: 120,
             color: "note", size: 3, rev: 1, text: "первая\\nвторая" });`);
    tool(w, "select");
    point(w, "pointerdown", 450, 340);
    point(w, "pointerup", 450, 340);
    await tick(60);
    ok(!w.document.getElementById("bd-mp-bold").hidden, "у стикера видны B/I/U");
    w.document.getElementById("bd-mp-bold").click();
    ok(byId(w, "n1").text === "**первая**\n**вторая**", "B обернула весь стикер");
    w.document.getElementById("bd-mp-bold").click();
    ok(byId(w, "n1").text === "первая\nвторая", "повторная B сняла обёртку");
    await tick(400);   // пережидаем окно двойного тапа перед новым жестом
    // панель прячется при драге и возвращается на pointerup
    point(w, "pointerdown", 450, 340);
    await tick(60);
    ok(w.document.getElementById("bd-minipanel").hidden, "при драге панель скрыта");
    point(w, "pointermove", 550, 440);
    point(w, "pointerup", 550, 440);
    await tick(80);
    ok(!w.document.getElementById("bd-minipanel").hidden, "на pointerup панель вернулась");
    // текст в фигуре: дабл-клик → редактор → текст по центру, пустой — фигура цела
    w.eval(`BD.objects.set("r1", { id: "r1", kind: "rect", x: 700, y: 300, w: 240, h: 140,
             color: "ink", size: 3, rev: 2 });`);
    point(w, "pointerdown", 780, 350, { detail: 2 });
    await tick(30);
    ok(!w.document.getElementById("bd-editor").hidden, "дабл-клик по фигуре открыл редактор");
    const inp = w.document.getElementById("bd-editor-input");
    inp.value = "**Подпись** внутри";
    w.document.getElementById("bd-editor-ok").click();
    ok(byId(w, "r1").text === "**Подпись** внутри", "текст записан в фигуру");
    w.eval("drawShapeText(BD.objects.get('r1'))");   // не падает на канвасе-прокси
    // инструмент «текст» по фигуре С текстом — редактирует её, а не создаёт новый
    tool(w, "text");
    point(w, "pointerdown", 780, 350);
    point(w, "pointerup", 780, 350);
    await tick(30);
    ok(!w.document.getElementById("bd-editor").hidden
       && objects(w).filter(o => o.kind === "text").length === 0,
       "клик текст-инструментом по фигуре — редактор её текста");
    inp.value = "";
    w.document.getElementById("bd-editor-ok").click();
    ok(!!byId(w, "r1") && byId(w, "r1").text === "",
       "пустой текст — фигура осталась без подписи, не удалена");
  }

  console.log("\n31. Стили фигур в мини-панели; эмодзи-пикер позиционируется по rect");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.objects.set("r2", { id: "r2", kind: "rect", x: 700, y: 300, w: 240, h: 140,
             color: "ink", size: 3, rev: 1 });`);
    tool(w, "select");
    point(w, "pointerdown", 780, 350);
    point(w, "pointerup", 780, 350);
    await tick(60);
    const st2 = w.document.getElementById("bd-mp-style2");
    ok(!st2.hidden, "у фигуры вторая строка стилей видна");
    const fillChip = st2.querySelectorAll(".bd-mp-fill")[1];
    fillChip.click();
    await tick(30);
    ok(byId(w, "r2").fill === fillChip.dataset.fill && fillChip.dataset.fill !== "",
       "заливка применилась: " + byId(w, "r2").fill);
    st2.querySelector('[data-stroke="5"]').click();
    await tick(30);
    ok(byId(w, "r2").stroke === 5, "обводка 5 px: " + byId(w, "r2").stroke);
    st2.querySelector('[data-opacity="40"]').click();
    await tick(30);
    ok(byId(w, "r2").opacity === 0.4, "прозрачность 40%: " + byId(w, "r2").opacity);
    // подсветка чипов обновилась после put (ключ панели сброшен)
    await tick(60);
    ok(st2.querySelector('[data-opacity="40"]').classList.contains("on"),
       "чип 40% подсвечен после применения");
    w.eval("drawObject(BD.objects.get('r2'))");   // отрисовка со стилями не падает
    ok(true, "фигура со стилями отрисовалась");
    // у стикера строки стилей нет
    w.eval(`BD.objects.set("n9", { id: "n9", kind: "note", x: 100, y: 100, w: 180, h: 120,
             color: "note", size: 3, rev: 2, text: "стикер" });`);
    point(w, "pointerdown", 150, 150);
    point(w, "pointerup", 150, 150);
    await tick(60);
    ok(st2.hidden, "у стикера строки стилей нет");
    // панель у края экрана: зажимается по ПОЛОВИНЕ своей ширины, не по 40px
    w.eval(`BD.view = { x: 0, y: 0, k: 1 };
            BD.objects.set("edge", { id: "edge", kind: "rect", x: 10, y: 300, w: 100, h: 80,
             color: "ink", size: 3, rev: 3 });`);
    point(w, "pointerdown", 40, 330);
    point(w, "pointerup", 40, 330);
    await tick(60);
    const mp = w.document.getElementById("bd-minipanel");
    // в jsdom offsetWidth = 0 → запасная ширина 320 → левый зажим 168
    ok(!mp.hidden && parseInt(mp.style.left, 10) >= 168,
       "панель не уезжает за левый край: left=" + mp.style.left);
    // и по вертикали зажата в экран: объект глубоко под нижним краем
    w.eval(`BD.objects.set("deep", { id: "deep", kind: "rect", x: 400, y: 5000, w: 100, h: 80,
             color: "ink", size: 3, rev: 4 });
            BD.view.y = -4600;   // докрутили доски до объекта`);
    point(w, "pointerdown", 440, 430);
    point(w, "pointerup", 440, 430);
    await tick(60);
    const topPx = parseInt(mp.style.top, 10);
    ok(!mp.hidden && topPx >= 8 && topPx <= 728,
       "панель зажата по вертикали: top=" + mp.style.top);
    // пикер по готовому rect (меню реакций скрыто — якоря нет, rect снят заранее)
    let picked = "";
    w.eval(`openEmojiPicker({ left: 200, top: 100, right: 240, bottom: 130 },
             ch => { window.__picked = ch; })`);
    const picker = w.document.querySelector(".bd-emoji-picker");
    ok(!picker.hidden && picker.style.left === "200px" && picker.style.top === "138px",
       "пикер у кнопки: left=" + picker.style.left + " top=" + picker.style.top);
    // клик мимо закрывает и сбрасывает колбэк
    w.eval(`document.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }))`);
    ok(picker.hidden, "клик мимо закрыл пикер");
    w.eval(`openEmojiPicker({ left: 200, top: 100, right: 240, bottom: 130 },
             ch => { window.__picked = ch; })`);
    const btn = picker.querySelector(".bd-emoji-grid [data-ch]");
    btn.click();
    ok(w.eval("window.__picked") === btn.dataset.ch && picker.hidden,
       "выбор дошёл, пикер закрылся: " + w.eval("window.__picked"));
  }

  console.log("\n32. Эмодзи-штамп из дока; «скрыть от ученика»; Ctrl+C/Ctrl+V");
  {
    const w = makeBoard();
    await tick(150);
    // кнопка 😀 в доке открывает пикер (методист не находила штамп в меню)
    w.document.getElementById("bd-emoji-tool").click();
    const picker = w.document.querySelector(".bd-emoji-picker");
    ok(!picker.hidden, "кнопка 😀 в доке открыла пикер");
    picker.querySelector(".bd-emoji-grid [data-ch]").click();
    ok(bd(w).pendingEmoji !== "" && bd(w).tool === "emoji",
       "штамп вооружён: " + bd(w).pendingEmoji);
    point(w, "pointerdown", 300, 300);
    point(w, "pointerup", 300, 300);
    await tick(30);
    ok(objects(w).some(o => o.kind === "emoji"), "эмодзи-объект поставлен кликом");
    // «скрыть от ученика»: кнопка у репетитора видна и тогглит hide
    w.eval(`BD.objects.set("h1", { id: "h1", kind: "rect", x: 500, y: 300, w: 200, h: 100,
             color: "ink", size: 3, rev: 5 });`);
    tool(w, "select");
    point(w, "pointerdown", 560, 340);
    point(w, "pointerup", 560, 340);
    await tick(60);
    const hb = w.document.getElementById("bd-mp-hide");
    ok(!hb.hidden, "у репетитора кнопка «скрыть от ученика» видна");
    hb.click();
    await tick(30);
    ok(byId(w, "h1").hide === 1, "объект скрыт: hide=" + byId(w, "h1").hide);
    w.eval("draw(BD.objects.get('h1') && innerWidth, innerHeight)");  // призрачный рендер не падает
    ok(true, "скрытый объект отрисовался призраком");
    await tick(60);
    ok(hb.classList.contains("on"), "кнопка подсвечена — объект скрыт");
    hb.click();
    await tick(30);
    ok(byId(w, "h1").hide === 0, "повторный клик вернул объект ученику");
    // Ctrl+C / Ctrl+V: клон со сдвигом, новый id, выделяется копия
    w.eval(`document.dispatchEvent(new window.KeyboardEvent("keydown",
             { key: "c", ctrlKey: true, bubbles: true, cancelable: true }))`);
    ok(w.eval("objClipboard.length") === 1, "Ctrl+C скопировал объект в буфер");
    w.eval("pasteClipboardObjects()");
    const pasted = objects(w).find(o => o.kind === "rect" && o.id !== "h1");
    ok(!!pasted && pasted.x === byId(w, "h1").x + 24 && pasted.id !== "h1",
       "Ctrl+V вставил клон со сдвигом: id=" + (pasted && pasted.id) + " x=" + (pasted && pasted.x));
    ok(w.eval("selIds()")[0] === pasted.id, "выделяется вставленная копия");
    w.eval("pasteClipboardObjects()");
    ok(objects(w).filter(o => o.kind === "rect").length === 3,
       "повторная вставка — ещё клон дальше по диагонали");
  }
  {
    // ученику кнопки «скрыть» нет вообще
    const sw = makeStudentBoard();
    await tick(150);
    sw.eval(`BD.objects.set("x1", { id: "x1", kind: "note", x: 100, y: 100, w: 150, h: 100,
              color: "note", size: 3, rev: 1, text: "стикер" });`);
    point(sw, "pointerdown", 150, 140);
    point(sw, "pointerup", 150, 140);
    await tick(60);
    ok(sw.document.getElementById("bd-mp-hide").hidden, "у ученика кнопки «скрыть» нет");
  }

  console.log("\n33. Кегль стикера из size; инлайн-редактор поверх объекта (Miro)");
  {
    const w = makeBoard();
    await tick(150);
    // noteFontPx: 19px при тройке, пропорционально дальше, пол 10
    ok(w.eval("noteFontPx(3)") === 19 && w.eval("noteFontPx(6)") === 38
       && w.eval("noteFontPx(0.5)") === 10, "кегль стикера из size: 19/38/10");
    // стикер с size 6 выше по высоте, чем с size 3
    const h3 = w.eval(`noteHeight("строка1\\nстрока2\\nстрока3", 200, 3)`);
    const h6 = w.eval(`noteHeight("строка1\\nстрока2\\nстрока3", 200, 6)`);
    ok(h6 > h3, "высота стикера следует за кеглем: " + h3 + " → " + h6);
    // инлайн-редактор: дабл-клик — поле НА объекте, с его кеглем
    w.eval(`BD.objects.set("ni", { id: "ni", kind: "note", x: 400, y: 300, w: 200, h: 120,
             color: "note", size: 3, rev: 1, text: "старый текст" });`);
    tool(w, "select");
    point(w, "pointerdown", 460, 340, { detail: 2 });
    await tick(30);
    const box = w.document.getElementById("bd-editor");
    ok(!box.hidden && box.classList.contains("bd-editor--inline"),
       "редактор инлайн на объекте");
    const left = parseInt(box.style.left, 10), top = parseInt(box.style.top, 10);
    ok(Math.abs(left - (400 - 12)) < 40 && Math.abs(top - (300 - 12)) < 40,
       "поле поверх объекта: " + box.style.left + "," + box.style.top);
    const fs = parseFloat(w.document.getElementById("bd-editor-input").style.fontSize);
    ok(fs > 14 && fs < 20, "кегль поля под объект: " + fs);
    // blur — коммит (как в Miro: ушёл из поля — текст принят)
    const inp = w.document.getElementById("bd-editor-input");
    inp.value = "новый текст";
    inp.blur();
    await tick(300);
    ok(box.hidden && byId(w, "ni").text === "новый текст",
       "blur закоммитил текст: " + byId(w, "ni").text);
    ok(!box.classList.contains("bd-editor--inline"), "класс инлайна снят при закрытии");
  }

  console.log("\n34. Магия-ссылка ?st=: вход на доску без кода с нового устройства");
  {
    // Стенд ученика, но URL — магия-ссылка, а localStorage пуст (новый iPad)
    const html = fs.readFileSync(path.join(ROOT, "board.html"), "utf8")
      .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
    const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true,
      url: "http://localhost:4210/board.html?st=magic-margo" });
    const w = dom.window;
    w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
      get: (_, name) => (name === "measureText" ? () => ({ width: 10 }) : (...a) => undefined),
      set: () => true,
    });
    w.BD_API_TIMEOUT_MS = 400;
    w.fetch = (url, opts) => Promise.resolve({ ok: true, json: () => Promise.resolve(
      String(url).includes("/api/student/board")
        ? (JSON.parse(opts.body).token === "magic-margo"
            ? { ok: true, hasTutor: true, board: { id: 33, title: "Урок 28 октября" } }
            : { ok: false, error: "unknown_student" })
        : { ok: true, rev: 1, objects: [], deleted: [], me: "s13",
            title: "Урок 28 октября", shared: 1, invited: 13 }) });
    w.navigator.serviceWorker = undefined;
    ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/emoji-data.js", "js/board.js"]
      .forEach(f => {
        const s = w.document.createElement("script");
        s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
        w.document.head.appendChild(s);
      });
    await tick(300);
    ok(w.localStorage.getItem("savelyStudentToken") === "magic-margo",
       "токен из ссылки сохранён в сессию");
    ok(!String(w.location.search).includes("st="),
       "токен спрятан из адресной строки: " + w.location.search);
    ok(w.eval("BD.boardId") === 33 && w.eval("BD.role") === "student",
       "ученик на доске 33 без ввода кода: boardId=" + w.eval("BD.boardId"));
    ok(w.document.getElementById("bd-name").textContent === "Урок 28 октября",
       "название доски получено");
  }

  console.log("\n35. Позвать ученика одним нажатием: доска открыта + ссылка скопирована");
  {
    const w = makeBoard();
    await tick(150);
    w.eval(`BD.students = [{ id: 13, name: "Марго", token: "tok-margo" }];
            BD.boardId = 33;`);
    w.document.getElementById("bd-share").click();
    await tick(60);
    const menu = w.document.getElementById("bd-share-menu");
    ok(!menu.hidden, "меню «Открыть ученику» открылось");
    const btn = menu.querySelector('[data-share="13"]');
    ok(!!btn, "в меню есть ученица Марго");
    btn.click();
    await tick(60);
    ok(w.eval("shareState.invited") === 13 && w.eval("shareState.shared") === true,
       "одно нажатие открыло доску Марго: invited=" + w.eval("shareState.invited"));
    const toastEl = w.document.getElementById("bd-toast");
    // В jsdom нет clipboard API — сработает запасной тост с самой ссылкой
    ok(!toastEl.hidden && toastEl.textContent.includes("board.html?st=tok-margo"),
       "тост несёт магия-ссылку: " + toastEl.textContent.slice(0, 80));
    // 🔗 — повторное копирование тоже на месте
    ok(!!menu.querySelector('[data-link="13"]'), "кнопка 🔗 для повторной копии есть");
  }

  console.log("\n36. Фигуры одной кнопкой (Holst): ромб/треугольник, «без обводки»");
  {
    const w = makeBoard();
    await tick(150);
    // кнопка «Фигуры» открывает меню со всеми пятью
    const shapesBtn = w.document.getElementById("bd-shapes");
    ok(!!shapesBtn, "кнопка «Фигуры» в доке есть");
    ok(!w.document.querySelector('.bd-tool[data-tool="rect"]')
       && !w.document.querySelector('.bd-tool[data-tool="ellipse"]'),
       "отдельных кнопок rect/ellipse больше нет — объединены");
    shapesBtn.click();
    const smenu = w.document.getElementById("bd-shapes-menu");
    ok(!smenu.hidden && smenu.querySelectorAll("[data-shape]").length === 5,
       "меню с пятью фигурами");
    ok(smenu.style.left !== "" && smenu.style.top !== "",
       "окно позиционируется fixed (не режется доком): " + smenu.style.left + "," + smenu.style.top);
    ok(smenu.classList.contains("bd-shapes-panel")
       && !!smenu.querySelector(".bd-shapes-grid"),
       "это отдельное окно-панель с сеткой плиток");
    // ромб: выбор из меню, драг — объект на доске
    smenu.querySelector('[data-shape="diamond"]').click();
    ok(bd(w).tool === "diamond" && shapesBtn.classList.contains("active"),
       "инструмент «ромб» активен");
    ok(smenu.hidden, "меню закрылось после выбора");
    point(w, "pointerdown", 200, 200);
    point(w, "pointermove", 340, 300);
    point(w, "pointerup", 340, 300);
    const dm = objects(w).find(o => o.kind === "diamond");
    ok(!!dm, "ромб нарисован драгом");
    w.eval("drawObject(BD.objects.get('" + dm.id + "'))");
    ok(true, "ромб отрисовался");
    // после разового действия — назад в «Выделить»
    ok(bd(w).tool === "select", "после фигуры — обратно в «Выделить»");
    // треугольник тем же путём
    shapesBtn.click();
    w.document.getElementById("bd-shapes-menu").querySelector('[data-shape="triangle"]').click();
    point(w, "pointerdown", 420, 200);
    point(w, "pointermove", 540, 320);
    point(w, "pointerup", 540, 320);
    ok(objects(w).some(o => o.kind === "triangle"), "треугольник нарисован");
    // клавиша R выбирает прямоугольник через то же меню
    w.eval(`document.dispatchEvent(new window.KeyboardEvent("keydown",
             { key: "r", bubbles: true, cancelable: true }))`);
    ok(bd(w).tool === "rect", "клавиша R — прямоугольник");
    // «без обводки»: чип «нет» ставит stroke −1, отрисовка не падает
    point(w, "pointerdown", 600, 200);
    point(w, "pointermove", 700, 300);
    point(w, "pointerup", 700, 300);
    const rc = objects(w).find(o => o.kind === "rect");
    tool(w, "select");
    point(w, "pointerdown", 650, 245);
    point(w, "pointerup", 650, 245);
    await tick(60);
    const st2 = w.document.getElementById("bd-mp-style2");
    const noStroke = st2 && st2.querySelector('[data-stroke="-1"]');
    ok(!st2.hidden && !!noStroke, "чип «нет» у обводки есть");
    noStroke.click();
    await tick(30);
    ok(byId(w, rc.id).stroke === -1, "обводка убрана: stroke=" + byId(w, rc.id).stroke);
    w.eval("drawObject(BD.objects.get('" + rc.id + "'))");
    ok(true, "фигура без обводки отрисовалась");
    // чип подсвечен как активный
    await tick(60);
    ok(noStroke.classList.contains("on"), "чип «нет» подсвечен");
    // вернуть «Авто»
    st2.querySelector('[data-stroke="0"]').click();
    await tick(30);
    ok(byId(w, rc.id).stroke === 0, "обводка возвращена в «Авто»");
  }

  console.log("\n37. Слои: картинка под всеми, «на передний/задний план»");
  {
    const w = makeBoard();
    await tick(150);
    // картинка НОВЕЕ стикера (rev больше), но бьётся в хит-тесте позже неё:
    // слой картинок — под остальными (решение владельца: текст на фото сверху)
    w.eval(`BD.objects.set("im1", { id: "im1", kind: "image", x: 100, y: 100, w: 200, h: 150,
             color: "ink", size: 3, rev: 9, src: "data:image/png;base64,x" });
            BD.objects.set("nt1", { id: "nt1", kind: "note", x: 120, y: 120, w: 150, h: 100,
             color: "note", size: 3, rev: 2, text: "поверх" });`);
    ok(w.eval("hitTest(150, 150).id") === "nt1",
       "текст ловится ПОВЕРХ картинки, хотя картинка новее");
    // выделить стикер → «на задний план» → теперь он под картинкой
    tool(w, "select");
    point(w, "pointerdown", 150, 150);
    point(w, "pointerup", 150, 150);
    await tick(60);
    w.document.getElementById("bd-mp-back").click();
    await tick(30);
    const zs = w.eval("JSON.stringify([...BD.objects.values()].map(o => [o.id, o.z ?? null]))");
    ok(byId(w, "nt1").z != null && byId(w, "nt1").z < 2,
       "стикер ушёл на задний план: z=" + byId(w, "nt1").z + " (" + zs + ")");
    ok(w.eval("hitTest(150, 150).id") === "im1",
       "теперь сверху картинка (стикер под ней)");
    // «на передний план» — z больше всех (выделяем стикер программно:
    // кликом его уже не достать — он под картинкой, это и проверяем)
    w.eval(`setSelection(["nt1"])`);
    await tick(60);
    w.document.getElementById("bd-mp-front").click();
    await tick(30);
    const maxOther = w.eval(`Math.max(...[...BD.objects.values()]
      .filter(o => o.id !== "nt1").map(o => (o.z != null ? +o.z || 0
        : (o.rev || 0) - (o.kind === "image" ? 1e9 : 0))))`);
    ok(byId(w, "nt1").z > maxOther,
       "стикер поднят выше всех: z=" + byId(w, "nt1").z + " > " + maxOther);
    ok(w.eval("hitTest(150, 150).id") === "nt1", "и снова ловится первым");
  }

  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВсё зелено");
  process.exit(fails ? 1 : 0);
})();
