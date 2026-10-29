// P0 (UI): ссылка-приглашение в панели репетитора — пересоздание,
// статус пришедших, «На доску» из карточки ученика. jsdom, без сервера.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..", "..");

let fails = 0;
const ok = (c, what) => { if (!c) { console.log("  ✗ " + what); fails++ } };

const tutorHtml = fs.readFileSync(path.join(ROOT, "tutor.html"), "utf8")
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

const dom = new JSDOM(tutorHtml, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "http://localhost:4210/tutor.html",
});
const w = dom.window;
const doc = w.document;
w.matchMedia = w.matchMedia || (q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
w.scrollTo = () => {};
w.confirm = () => true;

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
  id: 5, name: "Марго", token: "tok-margo-123", groupId: null, level: "A2",
  levelForced: "", vocab: 100, xp: 10, xpWeek: 10, xpMonth: 10, streak: 0,
  blitzBest: 0, goal: 50, note: "", achievements: [],
  words: { total: 3, learned: 0, learning: 0, new: 3, overdue: 0, scheduled: 0, neglected: false },
  weak: [], activity: {}, lastSeen: null, createdAt: "", restoreCode: "",
  homework: [],
};
function defaultAnswer(p) {
  if (p === "/api/tutor/students")
    return { ok: true, tutor: TUTOR, students: [STUDENT], groups: [], homework: [], messages: [] };
  if (p === "/api/tutor/invite/rotate") return { ok: true, inviteCode: "NEW777" };
  if (p === "/api/board/list")
    return { ok: true, boards: [{ id: 33, title: "Урок 28 октября" }, { id: 28, title: "Урок 3 октября" }] };
  if (p === "/api/board/update") return { ok: true, boards: [] };
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
["js/theme.js", "js/icons.js", "js/cat.js", "js/motion.js", "js/util.js",
 "js/levels.js", "js/images.js", "js/word-photos.js", "js/qr.js",
 "js/tutor.js", "js/tutor-tasks.js", "js/tutor-photos.js", "js/tutor-auth.js",
 "js/tutor-verify.js", "js/tutor-boards.js", "js/tutor-nav.js"].forEach(load);

const tick = () => new Promise(r => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

(async () => {
  w.localStorage.setItem("savelyTutorToken", "test-token");
  doc.dispatchEvent(new w.Event("DOMContentLoaded", { bubbles: true }));
  await settle(); await settle();

  console.log("— ссылка-приглашение в панели");
  const urlInput = doc.getElementById("invite-url");
  ok(urlInput && urlInput.value.includes("?join=ABC123"),
     "ссылка собрана с кодом: " + (urlInput && urlInput.value));
  const rotate = doc.getElementById("invite-rotate");
  ok(!!rotate, "кнопка «Пересоздать ссылку» есть");
  const joined = doc.getElementById("invite-joined");
  ok(joined && !joined.classList.contains("hidden")
     && joined.textContent.includes("Марго"),
     "статус приглашения: кто пришёл — " + (joined && joined.textContent.trim().slice(0, 60)));

  console.log("— пересоздание");
  rotate.click();
  await settle();
  ok(calls.some(c => c.path === "/api/tutor/invite/rotate"),
     "ушёл запрос ротации");
  ok(urlInput.value.includes("?join=NEW777"),
     "поле ссылки обновилось: " + urlInput.value);

  console.log("— «На доску» из карточки ученика");
  const shareBtn = doc.querySelector('[data-board-share="5"]');
  ok(!!shareBtn, "кнопка «На доску» у ученика есть");
  shareBtn.click();
  await settle();
  ok(calls.some(c => c.path === "/api/board/list"), "список досок запрошен");
  const menu = doc.getElementById("board-share-menu");
  ok(menu && menu.style.display !== "none" && menu.textContent.includes("Урок 28 октября"),
     "пикер показывает доски репетитора");
  const boardBtn = menu && menu.querySelector('[data-bid="33"]');
  ok(!!boardBtn, "в пикере есть доска 33");
  boardBtn.click();
  await settle();
  const upd = calls.find(c => c.path === "/api/board/update");
  ok(upd && upd.body.action === "share" && upd.body.shared === true && upd.body.studentId === 5,
     "доступ выдан правильным payload: " + (upd && JSON.stringify(upd.body)));
  const toastEl = doc.getElementById("tutor-toast");
  // В jsdom нет clipboard API — запасной тост обязан нести саму ссылку
  ok(toastEl && !toastEl.hidden && toastEl.textContent.includes("board.html?st=tok-margo-123"),
     "тост несёт магия-ссылку: " + (toastEl && toastEl.textContent.slice(0, 90)));

  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : "\nВсё зелено");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("УПАЛО:", e && e.message); process.exit(1) });
