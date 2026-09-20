// Три правки доски (20.09):
//
// 1. Delete/Backspace больше не сносит закреплённый объект: замок бережёт
//    от движения, ресайза и ластика, а клавиша его игнорировала — одна
//    случайная кнопка убирала приклеенную страницу учебника.
// 2. Панель «слова ученика» при обрыве сети показывает сообщение и кнопку
//    «Повторить», а не пустеет молча (api() бросает по таймауту 20 с,
//    loadStudents/loadWords его не ловили).
// 3. Стикер растёт под многострочный текст сам (потолок 320), но после
//    ручного ресайза за уголок авторост по высоте выключается.
//
// Проверяем поведением в jsdom, как test-board-tools.js: поднимаем
// board.html, сеть подменяем заглушкой с управляемым сбоем.
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
  // Ширина текста — от длины строки: иначе перенос строк не проверить
  // (заглушка из test-board-tools возвращает константу, и любой текст
  // влезает в одну строку).
  w.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, {
    get: (_, name) => (name === "measureText" ? (s) => ({ width: String(s).length * 7 })
                                             : (...a) => undefined),
    set: () => true,
  });
  w.localStorage.setItem("savelyTutorToken", "t-test");
  w.BD_API_TIMEOUT_MS = 400;
  // Сеть с рубильником: net.fail = true — любой запрос падает, как при
  // обрыве; false — отвечает по ручке.
  const net = { fail: false };
  w.fetch = (url) => {
    if (net.fail) return Promise.reject(new Error("сеть оборвалась"));
    const u = String(url);
    const body = u.includes("/api/tutor/students")
      ? { ok: true, students: [{ id: 7, name: "Ира", words: { total: 2 } }] }
      : u.includes("/api/tutor/student")
      ? { ok: true, student: { dictionary: [{ w: "cat", t: "кот", cat: "n" }] } }
      : { ok: true, rev: 1, objects: [], deleted: [], me: "tutor",
          title: "Урок", shared: 0, invited: null };
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  };
  w.navigator.serviceWorker = undefined;
  ["js/icons.js", "js/util.js", "js/images.js", "js/word-photos.js", "js/board.js"]
    .forEach(f => {
      const s = w.document.createElement("script");
      s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
      w.document.head.appendChild(s);
    });
  return { w, net };
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
const byId = (w, id) => bd(w).objects.get(id);
const del = w => {
  const e = new w.Event("keydown", { bubbles: true });
  Object.assign(e, { key: "Delete", preventDefault() {} });
  w.document.dispatchEvent(e);
};

(async () => {
  console.log("\n1. Delete не сносит закреплённое, предупреждает один раз");
  {
    const { w } = makeBoard();
    await tick(120);
    bd(w).objects.set("i1", { id: "i1", kind: "image", x: 0, y: 0, w: 60, h: 60,
                              color: "ink", size: 3, src: "data:,", rev: 1, locked: 1 });
    bd(w).selected = "i1";
    del(w);
    ok(!!byId(w, "i1"), "закреплённая картинка осталась на доске");
    const toastEl = w.document.getElementById("bd-toast");
    ok(!toastEl.hidden && /замок/i.test(toastEl.textContent),
       "показан тост про замок: «" + toastEl.textContent.slice(0, 50) + "»");
    // Второй Delete по тому же объекту — тост не повторяем
    toastEl.hidden = true; toastEl.textContent = "";
    del(w);
    ok(toastEl.hidden && !toastEl.textContent, "повторное нажатие — молча");
    ok(!!byId(w, "i1"), "и картинка по-прежнему на месте");
    // Замок снят — Delete работает как раньше
    bd(w).objects.set("i1", { ...byId(w, "i1"), locked: 0 });
    del(w);
    ok(!byId(w, "i1"), "откреплённую картинку Delete убирает");
  }

  console.log("\n2. Панель слов при обрыве сети: сообщение и «Повторить»");
  {
    const { w, net } = makeBoard();
    net.fail = true;                      // сеть рвём до открытия панели
    await tick(150);
    w.document.getElementById("bd-words").click();
    await tick(150);
    const hint = w.document.getElementById("bd-words-hint");
    ok(/связ|не удалось/i.test(hint.textContent),
       "в панели сказано, что случилось: «" + hint.textContent.slice(0, 50) + "»");
    const retry = [...w.document.querySelectorAll("#bd-panel button")]
      .find(b => b.textContent === "Повторить");
    ok(!!retry && !retry.hidden, "рядом кнопка «Повторить»");
    // «Сеть вернулась» — повтор обязан поднять список без перезагрузки
    net.fail = false;
    retry.click();
    await tick(150);
    const sel = w.document.getElementById("bd-student");
    ok(sel.options.length === 1 && /Ира/.test(sel.options[0].textContent),
       "ученик загрузился: «" + (sel.options[0] || {}).textContent + "»");
    const words = w.document.querySelectorAll("#bd-word-list .bd-word");
    ok(words.length === 1 && /cat/.test(words[0].textContent),
       "и его слова на месте: «" + (words[0] || {}).textContent.trim().slice(0, 30) + "»");
    ok(retry.hidden, "кнопка «Повторить» скрылась после успеха");
  }

  console.log("\n3. Стикер растёт под текст, но ручной ресайз главнее");
  {
    const { w } = makeBoard();
    await tick(120);
    tool(w, "note");
    point(w, "pointerdown", 500, 400);
    const id = [...bd(w).objects.keys()][0];
    ok(byId(w, id).h === 120, "новый стикер стартовой высоты 120: " + byId(w, id).h);
    // Пишем длинный текст: 7px на символ → в строку (156px) влезает ~22
    // символа, 300 символов — это явно больше пяти строк.
    const input = w.document.getElementById("bd-editor-input");
    input.value = ("очень длинная строчка конспекта урока ").repeat(8).trim();
    w.document.getElementById("bd-editor-ok").click();
    const grown = byId(w, id).h;
    ok(grown > 120 && grown <= 320, "стикер вырос под текст: 120 → " + grown);
    // Очень длинный — упирается в потолок 320
    tool(w, "note");
    point(w, "pointerdown", 900, 700);
    const id2 = [...bd(w).objects.keys()][1];
    const input2 = w.document.getElementById("bd-editor-input");
    input2.value = "слово ".repeat(400).trim();
    w.document.getElementById("bd-editor-ok").click();
    ok(byId(w, id2).h === 320, "потолок 320: " + byId(w, id2).h);
    // Тянем первый стикер за уголок — авторост по высоте выключается
    tool(w, "select");
    point(w, "pointerdown", 500, 400);           // выделить
    point(w, "pointerup", 500, 400);
    ok(bd(w).selected === id, "стикер выделен");
    const n = byId(w, id);
    point(w, "pointerdown", n.x + n.w + 6, n.y + n.h + 6);   // за уголок
    point(w, "pointermove", n.x + n.w + 60, n.y + n.h + 6);  // тянем вбок
    point(w, "pointerup", n.x + n.w + 60, n.y + n.h + 6);
    const manualH = byId(w, id).h;
    point(w, "pointerdown", 500, 400);           // дабл-тап — дописать
    point(w, "pointerdown", 500, 400);
    input.value = input.value + " ещё текста, чтобы выросло ".repeat(10);
    w.document.getElementById("bd-editor-ok").click();
    ok(byId(w, id).h === manualH,
       "после ручного ресайза высота не прыгает за текстом: " + manualH);
  }

  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВсё зелено");
  process.exit(fails ? 1 : 0);
})();
