// Папка при выдаче домашки — сквозной прогон в настоящем DOM (jsdom),
// без сервера: репетиторская форма (tutor.html + js/tutor.js) с ответами
// за fetch, и посадка слов у ученика (index.html через harness.js).
//
// Проверяем всю цепочку, ради которой фича делалась:
//   1. список папок собирается из словаря выбранного ученика;
//   2. папка едет из формы в payload /api/tutor/homework;
//   3. «+ Новая папка» — своё поле, а не prompt();
//   4. после отправки выбор сбрасывается (следующая домашка не унаследует
//      чужую папку молча);
//   5. у ученика слова домашки падают в папку; старая домашка без папки
//      работает как раньше;
//   6. в списке «Домашки» у репетитора папка видна подписью.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
// Корень репозитория: tools/dom-tests → на два уровня вверх.
const ROOT = path.resolve(__dirname, "..", "..");

let fails = 0;
const ok = (c, what) => { if (!c) { console.log("  ✗ " + what); fails++ } };

// ---------- Часть 1: форма репетитора ----------

const tutorHtml = fs.readFileSync(path.join(ROOT, "tutor.html"), "utf8")
  // скрипты подключим сами и по порядку — jsdom не должен лезть в сеть
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

const dom = new JSDOM(tutorHtml, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "http://localhost:4210/tutor.html",
});
const w = dom.window;
const doc = w.document;
w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
w.scrollTo = () => {};

// Журнал запросов: домашка обязана уйти ровно с теми полями, которые
// выбрали в форме, — иначе селект есть, а данных за ним нет.
const calls = [];
const TUTOR = {
  id: 1, name: "Ирина", email: "irina@example.com", inviteCode: "ABC123",
  plan: "start", planName: "Старт", planPrice: 990, monthlyTotal: 990,
  studentLimit: 5, studentCount: 1, extraPrice: 169, emailVerified: true,
  access: "ok", trialHoursLeft: 0, paidDaysLeft: 30, trialDays: 5,
  lessonUrl: "", lessonLive: false, notifyWork: true, notifyRemind: true,
  totpActive: false,
};
const STUDENT = {
  id: 5, name: "Пётр", groupId: null, level: "A2", levelForced: "",
  vocab: 100, xp: 10, xpWeek: 10, xpMonth: 10, streak: 0, blitzBest: 0,
  goal: 50, note: "", achievements: [],
  words: { total: 3, learned: 0, learning: 0, new: 3, overdue: 0, scheduled: 0, neglected: false },
  weak: [], activity: {}, lastSeen: null, createdAt: "", restoreCode: "",
  homework: [],
};
// Словарь ученика с папками — то, что приезжает с detail=True
const STUDENT_DETAIL = {
  ok: true,
  student: Object.assign({}, STUDENT, {
    dictionary: [
      { w: "apple", t: "яблоко", folders: ["Школа"] },
      { w: "pear", t: "груша", folders: ["Школа", "Дом"] },
      { w: "cat", t: "кот" },
    ],
  }),
};
function defaultAnswer(p) {
  if (p === "/api/tutor/students")
    return { ok: true, tutor: TUTOR, students: [STUDENT], groups: [], homework: [], messages: [] };
  if (p === "/api/tutor/student") return STUDENT_DETAIL;
  if (p === "/api/tutor/homework") return { ok: true, id: 42 };
  return { ok: true };
}
w.fetch = (p, opts) => {
  let body = {};
  try { body = JSON.parse((opts && opts.body) || "{}"); } catch (e) {}
  calls.push({ path: p, body });
  return Promise.resolve({ ok: true, json: () => Promise.resolve(defaultAnswer(p)) });
};

const load = f => {
  const s = doc.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  doc.head.appendChild(s);
};
// Тот же порядок, что в tutor.html
["js/theme.js", "js/icons.js", "js/cat.js", "js/motion.js", "js/util.js",
 "js/levels.js", "js/images.js", "js/word-photos.js", "js/qr.js",
 "js/tutor.js", "js/tutor-tasks.js", "js/tutor-photos.js", "js/tutor-auth.js",
 "js/tutor-verify.js", "js/tutor-boards.js", "js/tutor-nav.js"].forEach(load);

const tick = () => new Promise(r => setTimeout(r, 0));
// Запрос и перерисовка — цепочка промисов; одного тика мало.
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

(async () => {
  // Вошедший репетитор: панель открывается сама, если токен на месте
  w.localStorage.setItem("savelyTutorToken", "test-token");
  doc.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  await settle();
  await settle();

  console.log("— форма выдачи");
  const selStu = doc.getElementById("hw-student");
  const selFolder = doc.getElementById("hw-folder");
  ok(selFolder, "в форме есть выбор папки");
  ok(selFolder && selFolder.querySelector('option[value=""]'), "есть вариант «Без папки»");
  ok(selFolder && selFolder.querySelector('option[value="__new"]'), "есть вариант «+ Новая папка»");
  ok(doc.getElementById("hw-folder-new-row").classList.contains("hidden"),
     "поле новой папки спрятано, пока не выбрали «новую»");

  // Выбираем ученика — папки подтягиваются из его словаря
  selStu.value = "5";
  selStu.dispatchEvent(new w.Event("change", { bubbles: true }));
  await settle();
  const names = [...selFolder.options].map(o => o.value);
  ok(names.includes("Дом") && names.includes("Школа"),
     "папки ученика в списке (объединение по словарю): " + names.join(","));
  ok(names.indexOf("Дом") < names.indexOf("Школа"), "папки по алфавиту");

  // Отправка с существующей папкой
  w.eval(`picked.push({ w: "apple", t: "яблоко", ex: "", level: "A1" })`);
  selFolder.value = "Школа";
  selFolder.dispatchEvent(new w.Event("change", { bubbles: true }));
  doc.getElementById("hw-send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await settle();
  const hwCalls = calls.filter(c => c.path === "/api/tutor/homework");
  ok(hwCalls.length === 1, "домашка ушла одним запросом");
  ok(hwCalls[0] && hwCalls[0].body.folder === "Школа",
     "папка из списка доехала в payload: " + JSON.stringify(hwCalls[0] && hwCalls[0].body.folder));
  ok(hwCalls[0] && hwCalls[0].body.words.length === 1, "слова на месте");
  ok(selFolder.value === "", "после отправки выбор папки сброшен");

  // «+ Новая папка»: своё поле, не prompt
  selFolder.value = "__new";
  selFolder.dispatchEvent(new w.Event("change", { bubbles: true }));
  ok(!doc.getElementById("hw-folder-new-row").classList.contains("hidden"),
     "у «новой папки» открылось своё поле ввода");
  doc.getElementById("hw-folder-new").value = "К контрольной";
  w.eval(`picked.push({ w: "pear", t: "груша", ex: "", level: "A1" })`);
  doc.getElementById("hw-send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await settle();
  const hwCalls2 = calls.filter(c => c.path === "/api/tutor/homework");
  ok(hwCalls2.length === 2 && hwCalls2[1].body.folder === "К контрольной",
     "новая папка доехала в payload: " + JSON.stringify(hwCalls2[1] && hwCalls2[1].body.folder));

  // Без папки — пустая строка, поведение как раньше
  w.eval(`picked.push({ w: "cat", t: "кот", ex: "", level: "A1" })`);
  doc.getElementById("hw-send").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await settle();
  const hwCalls3 = calls.filter(c => c.path === "/api/tutor/homework");
  ok(hwCalls3.length === 3 && hwCalls3[2].body.folder === "",
     "«без папки» уходит пустой строкой — сервер трактует как раньше");

  // Список выданных домашек: папка видна подписью
  console.log("— вкладка «Домашки»");
  w.eval(`tasks = [{ id: 42, title: "Слова на дом", studentId: 5, groupId: null,
    words: [{ w: "apple", t: "яблоко" }], dueDate: null, createdAt: "",
    kind: "words", game: "", folder: "Школа", tasksetId: null,
    hasText: false, hasReading: false }]`);
  w.eval("renderTasks()");
  const tasksText = doc.getElementById("tasks-list").textContent;
  ok(tasksText.includes("папка «Школа»"), "у выданной домашки видна папка");
  w.eval(`tasks = [{ id: 43, title: "Старая", studentId: 5, groupId: null,
    words: [{ w: "cat", t: "кот" }], dueDate: null, createdAt: "",
    kind: "words", game: "", tasksetId: null, hasText: false, hasReading: false }]`);
  w.eval("renderTasks()");
  ok(!doc.getElementById("tasks-list").textContent.includes("папка"),
     "у домашки без папки подписи нет");

  dom.window.close();

  // ---------- Часть 2: посадка у ученика ----------
  console.log("— ученик: слова домашки падают в папку");
  const { w: sw } = require("./harness.js");
  sw.eval(`
    state.dictionary = [];
    state.folders = [];
    state.homework = [];
    // Тренажёр не открываем: проверяем посадку слов, а не упражнение
    openExercise = function () {};
  `);
  sw.eval(`startHomeworkLesson({ id: 9, title: "Слова на дом", game: "",
    folder: "К контрольной",
    words: [{ w: "apple", t: "яблоко", ex: "", level: "A1" },
            { w: "pear", t: "груша" }] })`);
  const dict = sw.eval("state.dictionary.map(d => ({ w: d.w, folders: d.folders || null }))");
  ok(dict.length === 2 && dict.every(d => d.folders && d.folders[0] === "К контрольной"),
     "оба слова легли в папку из домашки: " + JSON.stringify(dict));
  ok(sw.eval(`state.folders.includes("К контрольной")`), "папка завелась в списке папок");

  // Старая домашка (без поля folder) — поведение как раньше
  sw.eval(`startHomeworkLesson({ id: 10, title: "Старая", game: "",
    words: [{ w: "cat", t: "кот" }] })`);
  ok(sw.eval(`!("folders" in state.dictionary.find(d => d.w === "cat"))`),
     "домашка без папки — слово без папки, как раньше");

  // Слово уже есть в словаре без папки — домашка докладывает папку в него
  sw.eval(`startHomeworkLesson({ id: 11, title: "Ещё раз", game: "",
    folder: "Повторить", words: [{ w: "cat", t: "кот" }] })`);
  ok(sw.eval(`(state.dictionary.find(d => d.w === "cat").folders || []).includes("Повторить")`),
     "существующее слово получило папку домашки");
  ok(sw.eval("state.dictionary.length") === 3, "дублей в словаре нет");

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "папка домашки: форма → payload → словарь ученика — всё сходится"));
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
