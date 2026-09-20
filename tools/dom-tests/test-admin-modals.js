// Модалки админки (продление доступа и удаление репетитора) в настоящем
// DOM (jsdom), без сервера: грузим admin.html как файл, подсовываем
// вошедшего владельца и отвечаем за fetch сами.
//
// Проверяем то, ради чего убирали системные prompt()/alert(): окно
// продления открывается, принимает «45» и шлёт правильный запрос; «Отмена»
// закрывает без запроса; окно удаления не пускает, пока слово УДАЛИТЬ не
// набрано целиком, а ошибку сервера показывает строкой в окне.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
// Корень репозитория: tools/dom-tests → на два уровня вверх.
const ROOT = path.resolve(__dirname, "..", "..");

const html = fs.readFileSync(path.join(ROOT, "admin.html"), "utf8")
  // скрипты подключим сами и по порядку — jsdom не должен лезть в сеть
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost:4210/admin.html" });
const w = dom.window;
const doc = w.document;

let fails = 0;
const ok = (c, what) => { if (!c) { console.log("  ✗ " + what); fails++ } };

// Журнал запросов: модалка обязана позвать ровно ту ручку и с тем телом,
// которое набрали в форме, — иначе окно есть, а действия за ним нет.
const calls = [];
// Ответ, который вернёт следующий вызов ручки; тесты подменяют перед шагом.
let nextAnswer = null;
w.fetch = (p, opts) => {
  const body = JSON.parse((opts && opts.body) || "{}");
  calls.push({ path: p, body });
  const answer = nextAnswer || defaultAnswer(p);
  nextAnswer = null;
  return Promise.resolve({ json: () => Promise.resolve(answer) });
};

const OVERVIEW = {
  tutors: 1, verified: 1, students: 2, activeWeek: 1, homework: 3, photos: 0,
  revenue: 990, baseRevenue: 990, checksRevenue: 0,
  aiCost: 0, chatMessages: 0, checksUsed: 0, profit: 960, errorsWeek: 0,
};
const TUTOR = {
  id: 7, name: "Ирина", email: "irina@example.com", inviteCode: "ABC123",
  createdAt: "2026-09-01", verified: true, access: "paid", paidDaysLeft: 12,
  price: 990, planName: "Старт", plan: "start", limit: 5,
  students: 2, activeWeek: 1, lastSeen: "2026-09-19", kids: [],
};
function defaultAnswer(p) {
  if (p === "/api/admin/data")
    return { ok: true, overview: OVERVIEW, tutors: [TUTOR], plans: [{ id: "start", name: "Старт", price: 990 }], standalone: [], aiOn: false };
  if (p === "/api/admin/errors") return { ok: true, errors: [], summary: { days: 7, count: 0 } };
  if (p === "/api/admin/pay" || p === "/api/admin/delete")
    return { ok: true, tutors: [TUTOR], overview: OVERVIEW };
  return { ok: false, error: "стенд: неожиданная ручка " + p };
}

const load = f => {
  const s = doc.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  doc.head.appendChild(s);
};

// Вошедший владелец: admin.js при DOMContentLoaded сам зовёт load(),
// если токен на месте. Ставим до загрузки скриптов.
w.localStorage.setItem("savelyAdminToken", "test-token");
load("js/util.js");
load("js/admin.js");

const tick = () => new Promise(r => setTimeout(r, 0));
// Запрос и перерисовка — цепочка промисов; одного тика мало.
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

const submit = id => doc.getElementById(id).dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
const hidden = id => doc.getElementById(id).classList.contains("hidden");
const type = (id, value) => {
  const el = doc.getElementById(id);
  el.value = value;
  el.dispatchEvent(new w.Event("input", { bubbles: true }));
};

(async () => {
  await settle();
  ok(!hidden("app"), "панель открылась по токену");
  ok(doc.querySelector('[data-pay="7"]'), "есть кнопка продления у репетитора");
  ok(doc.querySelector('[data-del="7"]'), "есть кнопка удаления у репетитора");

  // --- Продление: принимает 45 и шлёт верный запрос ---
  calls.length = 0;
  doc.querySelector('[data-pay="7"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(!hidden("pay-modal"), "окно продления открылось");
  ok(doc.getElementById("pay-days").value === "30", "дни предзаполнены 30");
  ok(/Ирина/.test(doc.getElementById("pay-who").textContent), "в окне названо имя репетитора");

  type("pay-days", "45");
  submit("pay-form");
  await settle();
  const pay = calls.find(c => c.path === "/api/admin/pay");
  ok(pay, "ушёл запрос /api/admin/pay");
  ok(pay && pay.body.tutorId === 7 && pay.body.days === 45 && pay.body.token === "test-token",
     "запрос продления с tutorId 7 и days 45" + (pay ? "" : " — запроса не было"));
  ok(hidden("pay-modal"), "после ответа окно закрылось");

  // --- Продление: «Отмена» закрывает без запроса ---
  calls.length = 0;
  doc.querySelector('[data-pay="7"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  doc.getElementById("pay-cancel").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(hidden("pay-modal"), "«Отмена» закрыла окно");
  ok(!calls.some(c => c.path === "/api/admin/pay"), "после «Отмены» запроса не было");

  // --- Продление: ноль дней не уходит на сервер ---
  calls.length = 0;
  doc.querySelector('[data-pay="7"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  type("pay-days", "0");
  submit("pay-form");
  await settle();
  ok(!calls.some(c => c.path === "/api/admin/pay"), "0 дней не ушло на сервер");
  ok(doc.getElementById("pay-msg").classList.contains("err"), "показана ошибка про число дней");
  doc.getElementById("pay-cancel").dispatchEvent(new w.MouseEvent("click", { bubbles: true }));

  // --- Удаление: кнопка заперта, пока слово не совпало ---
  calls.length = 0;
  doc.querySelector('[data-del="7"]').dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  ok(!hidden("del-modal"), "окно удаления открылось");
  ok(doc.getElementById("del-go").disabled, "кнопка «Удалить» заперта на пустом поле");
  type("del-word", "УДАЛИ");
  ok(doc.getElementById("del-go").disabled, "кнопка заперта на неполном слове");
  submit("del-form");
  await settle();
  ok(!calls.some(c => c.path === "/api/admin/delete"), "неполное слово не ушло на сервер");

  // --- Удаление: ошибка сервера — строкой в окне, окно остаётся ---
  type("del-word", "УДАЛИТЬ");
  ok(!doc.getElementById("del-go").disabled, "кнопка отперлась на точном слове");
  nextAnswer = { ok: false, error: "слова не совпали" };
  submit("del-form");
  await settle();
  ok(!hidden("del-modal"), "при ошибке окно осталось открытым");
  ok(doc.getElementById("del-msg").classList.contains("err")
     && /слова не совпали/.test(doc.getElementById("del-msg").textContent),
     "ошибка сервера показана строкой в окне");

  // --- Удаление: успех закрывает окно и шлёт confirm ---
  calls.length = 0;
  type("del-word", "УДАЛИТЬ");
  submit("del-form");
  await settle();
  const del = calls.find(c => c.path === "/api/admin/delete");
  ok(del && del.body.tutorId === 7 && del.body.confirm === "УДАЛИТЬ",
     "запрос удаления с confirm=УДАЛИТЬ");
  ok(hidden("del-modal"), "после удаления окно закрылось");

  console.log(fails ? "\nПРОБЛЕМ: " + fails : "модалки админки: продление и удаление работают по соглашению");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log("упало: " + (e.stack || e)); process.exit(1); });
