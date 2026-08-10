// Связь ученика с сервером: вход по ссылке репетитора, отправка прогресса, домашка.
// Работает поверх localStorage: если сервера нет, сайт продолжает жить локально.

const API_BASE = location.hostname.endsWith("github.io") ? "" : "";
const STUDENT_TOKEN_KEY = "savelyStudentToken";
const TUTOR_NAME_KEY = "savelyTutorName";

let syncTimer = null;
let syncFailed = false;

function studentToken() {
  return localStorage.getItem(STUDENT_TOKEN_KEY) || "";
}

async function api(path, body) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

// ---- вход по ссылке репетитора ----

function inviteCodeFromUrl() {
  const p = new URLSearchParams(location.search);
  const code = (p.get("join") || "").trim().toUpperCase();
  return /^[A-Z0-9]{4,10}$/.test(code) ? code : "";
}

async function initInvite() {
  const code = inviteCodeFromUrl();
  if (!code || studentToken()) return;
  let info;
  try {
    info = await api("/api/join", { code });
  } catch (e) {
    return; // сервер недоступен — обычная локальная регистрация
  }
  if (!info.ok) return;
  window.pendingInvite = { code, tutorName: info.tutorName };
  const box = document.getElementById("invite-note");
  if (box) {
    box.classList.remove("hidden");
    box.textContent = `Тебя пригласил репетитор: ${info.tutorName}. Зарегистрируйся — и прогресс будет виден на его панели.`;
  }
}

// вызывается после регистрации ученика в app.js
async function joinTutor(name) {
  const inv = window.pendingInvite;
  if (!inv || studentToken()) return;
  try {
    const res = await api("/api/student/join", { code: inv.code, name });
    if (res.ok) {
      localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
      localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
      window.pendingInvite = null;
    }
  } catch (e) { /* офлайн — просто учимся локально */ }
}

// ---- отправка прогресса ----

function snapshot() {
  return {
    level: state.level,
    vocabEstimate: state.vocabEstimate,
    xp: state.xp,
    streak: typeof streakDays === "function" ? streakDays() : 0,
    blitzBest: state.blitzBest,
    dictionary: state.dictionary.map(d => ({
      w: d.w, t: d.t, status: d.status, knew: d.knew, forgot: d.forgot,
    })),
    activity: state.activity,
  };
}

async function pushProgress() {
  const token = studentToken();
  if (!token) return;
  try {
    const res = await api("/api/student/sync", { token, state: snapshot() });
    syncFailed = false;
    if (res.ok && Array.isArray(res.homework)) applyHomework(res.homework);
  } catch (e) {
    syncFailed = true;
  }
}

// прогресс копится и уходит пачкой — не дёргаем сервер на каждый клик
function scheduleSync() {
  if (!studentToken()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushProgress, 3000);
}

// ---- домашка ----

let homeworkTasks = [];

function applyHomework(tasks) {
  homeworkTasks = tasks || [];
  state.homework = homeworkTasks;
  saveState();
  renderHomework();
}

function homeworkProgress(task) {
  const known = new Map(state.dictionary.map(d => [d.w.toLowerCase(), d]));
  let done = 0;
  task.words.forEach(w => {
    const d = known.get(String(w.w).toLowerCase());
    if (d && d.status === "learned") done++;
  });
  return { done, total: task.words.length };
}

function renderHomework() {
  const box = document.getElementById("homework-box");
  if (!box) return;
  if (!homeworkTasks.length) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = homeworkTasks.map(task => {
    const { done, total } = homeworkProgress(task);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const finished = done >= total;
    return `
      <div class="card hw-card${finished ? " hw-done" : ""}">
        <div class="hw-head">
          <span class="hw-label">📋 Домашка от репетитора</span>
          ${task.dueDate ? `<span class="hw-due">до ${task.dueDate}</span>` : ""}
        </div>
        <p class="hw-title">${task.title}</p>
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
        <p class="stat-note">${done} из ${total} слов выучено${finished ? " — готово, мяу! 🎉" : ""}</p>
        <button class="btn btn-primary btn-small" data-hw="${task.id}">Добавить слова и учить</button>
      </div>`;
  }).join("");
  box.querySelectorAll("[data-hw]").forEach(btn => {
    btn.addEventListener("click", () => {
      const task = homeworkTasks.find(t => String(t.id) === btn.dataset.hw);
      if (!task) return;
      task.words.forEach(w => addToDictionary({
        w: w.w, t: w.t, ex: w.ex || "", level: w.level || state.level,
      }));
      renderHomework();
      show("practice");
    });
  });
}

// ---- старт ----

document.addEventListener("DOMContentLoaded", () => {
  initInvite();
  if (studentToken()) pushProgress();
});
