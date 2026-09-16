// Разбор упражнения на доске: что именно уезжает репетитору, когда
// ученик закончил задание, открытое с доски.
//
// Просьба владельца (16.09): «добавить разбор упражнений на доске после
// выдачи задания и после его прохождения». Карточку разбора кладёт
// доска (см. test-board-tools.js), а ЗАПОЛНЯЕТ её браузер ученика —
// reportBoardResult в js/sync.js. Здесь проверяем вторую половину:
// прошёл с ошибками — на доске появились сами ошибки, а не только счёт.
const fs = require("fs");
const path = require("path");
const { w } = require("./harness-full.js");
const ROOT = path.resolve(__dirname, "..", "..");
// harness-full грузит сайт ученика, но не js/sync.js — синхронизация в
// тестах упражнений только мешала бы. Здесь она и есть предмет проверки:
// reportBoardResult живёт там. Грузим поверх, сеть уже выключена
// (harness подменил fetch), а api() ниже подменяем своим.
{
  const s = w.document.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, "js/sync.js"), "utf8");
  w.document.head.appendChild(s);
}
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const wait = ms => new Promise(r => setTimeout(r, ms));

let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

/** Подменяем сеть на уровне api(): доска отвечает как настоящая, а
 *  всё, что ученик ей шлёт, кладём в журнал. */
function fakeBoard(withReviewCard) {
  w.eval(`
    window.__sent = [];
    window.__boardObjects = ${JSON.stringify(withReviewCard ? [
      { id: "task-77", kind: "task", x: 100, y: 100, w: 260, h: 90,
        color: "blue", size: 3, text: "Карточки", text2: "flash", rev: 3 },
      { id: "rev-task-77", kind: "note", x: 380, y: 100, w: 250, h: 104,
        color: "note", size: 3, rev: 3,
        text: "Разбор · Карточки\\nЖдём: ученик ещё не проходил." },
    ] : [
      { id: "task-77", kind: "task", x: 100, y: 100, w: 260, h: 90,
        color: "blue", size: 3, text: "Карточки", text2: "flash", rev: 3 },
    ])};
    studentToken = () => "s-test";
    api = function (path, body) {
      if (path === "/api/student/board")
        return Promise.resolve({ ok: true, hasTutor: true, board: { id: 5, title: "Урок" } });
      if (path === "/api/board/sync") {
        if ((body.changes || []).length) {
          window.__sent.push(body.changes);
          return Promise.resolve({ ok: true, rev: 9 });
        }
        return Promise.resolve({ ok: true, rev: 8, objects: window.__boardObjects, deleted: [] });
      }
      return Promise.resolve({ ok: true });
    };
  `);
}

const sent = () => w.eval("JSON.stringify(window.__sent)");

(async () => {
  w.eval(`
    window.readGateMs = () => 0;
    state.trainFolders = []; state.trainWords = []; state.trainMixNew = false;
    state.dictionary = [
      { w: "cat", t: "кот", added: Date.now(), seen: 1 },
      { w: "dog", t: "собака", added: Date.now(), seen: 1 },
      { w: "sun", t: "солнце", added: Date.now(), seen: 1 },
      { w: "book", t: "книга", added: Date.now(), seen: 1 },
      { w: "milk", t: "молоко", added: Date.now(), seen: 1 },
      { w: "red", t: "красный", added: Date.now(), seen: 1 },
    ];
    window.boardTaskCard = "task-77";
  `);

  console.log("\n1. Ошибки подхода собираются для разбора — все, а не только новые слова");
  {
    // Слова из словаря ученика: раньше они в копилку не попадали вовсе
    // (exMissed — только про слова ВНЕ словаря), и разбирать было нечего.
    w.eval(`exWrong = []; statUpdate("cat", false); statUpdate("dog", false);
            statUpdate("sun", true); statUpdate("cat", false);`);
    const wrong = JSON.parse(w.eval("JSON.stringify(exWrong)"));
    ok(wrong.length === 2, "две разные ошибки, повтор не задвоился: " + wrong.length);
    ok(wrong.some(x => x.w === "cat" && x.t === "кот"),
       "ошибка записана с переводом: " + JSON.stringify(wrong[0]));
    ok(!wrong.some(x => x.w === "sun"), "верный ответ в разбор не попал");
  }

  console.log("\n2. Карточка разбора на доске есть — заполняем её");
  {
    fakeBoard(true);
    w.eval(`exWrong = [{ w: "cat", t: "кот" }, { w: "milk", t: "молоко" }];`);
    await w.eval(`reportBoardResult("task-77", { text: "Верно 4 из 6 · 12:30",
      correct: 4, total: 6, rushed: false, when: "12:30",
      wrong: exWrong, wrongTotal: 2 })`);
    await wait(60);
    const changes = JSON.parse(sent())[0] || [];
    const review = changes.find(o => o.id === "rev-task-77");
    const card = changes.find(o => o.id === "task-77");
    ok(!!card && card.result === "Верно 4 из 6 · 12:30", "в самой карточке задания стоит итог");
    ok(!!review, "карточка разбора обновлена, а не создана заново рядом");
    ok(review && /Верно 4 из 6/.test(review.text), "в разборе есть счёт");
    ok(review && /Ошибки:/.test(review.text), "есть заголовок «Ошибки»");
    ok(review && /cat — кот/.test(review.text) && /milk — молоко/.test(review.text),
       "перечислены сами ошибки с переводом");
    ok(review && review.h > 104, "карточка подросла под содержимое: h=" + (review && review.h));
    ok(review && review.text.length <= 600,
       "текст влезает в ограничение сервера (600): " + (review && review.text.length));
    ok(changes.length === 2, "лишних стикеров не наплодили: объектов в посылке " + changes.length);
  }

  console.log("\n3. Прошёл без ошибок — так и написано");
  {
    fakeBoard(true);
    await w.eval(`reportBoardResult("task-77", { text: "Верно 6 из 6 · 12:40",
      correct: 6, total: 6, rushed: false, when: "12:40", wrong: [], wrongTotal: 0 })`);
    await wait(60);
    const review = (JSON.parse(sent())[0] || []).find(o => o.id === "rev-task-77");
    ok(review && /Ошибок нет/.test(review.text), "написано «Ошибок нет»: «"
       + (review ? review.text.split("\n").pop() : "") + "»");
    ok(review && review.color === "note2", "бумага зелёная — видно издалека");
  }

  console.log("\n4. Ошибок больше дюжины — список не рвёт карточку");
  {
    fakeBoard(true);
    const many = Array.from({ length: 12 }, (_, i) => ({ w: "word" + i, t: "перевод" + i }));
    w.eval(`window.__many = ${JSON.stringify(many)}`);
    await w.eval(`reportBoardResult("task-77", { text: "Верно 2 из 20 · 13:00",
      correct: 2, total: 20, rushed: false, when: "13:00",
      wrong: window.__many, wrongTotal: 20 })`);
    await wait(60);
    const review = (JSON.parse(sent())[0] || []).find(o => o.id === "rev-task-77");
    ok(review && review.text.length <= 600, "текст обрезан по лимиту сервера: " + review.text.length);
    ok(review && /и ещё 8/.test(review.text), "сказано, сколько ошибок не поместилось");
    ok(review && review.h <= 430, "высота карточки не уходит за край экрана: " + review.h);
  }

  console.log("\n5. Старая доска без карточки разбора — прежнее поведение, ничего не сломано");
  {
    fakeBoard(false);
    await w.eval(`reportBoardResult("task-77", { text: "Верно 3 из 5 · 13:10",
      correct: 3, total: 5, rushed: false, when: "13:10", wrong: [], wrongTotal: 0 })`);
    await wait(60);
    const changes = JSON.parse(sent())[0] || [];
    const plashka = changes.find(o => String(o.id).indexOf("res-task-77") === 0);
    ok(!!plashka, "как раньше: рядом легла плашка-стикер с итогом");
    ok(plashka && /Верно 3 из 5/.test(plashka.text), "в ней счёт: «"
       + (plashka ? plashka.text.replace(/\n/g, " / ") : "") + "»");
  }

  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВсё зелено");
  process.exit(fails ? 1 : 0);
})();
