// Связь ученика с сервером: вход по ссылке репетитора, отправка прогресса, домашка.
// Работает поверх localStorage: если сервера нет, сайт продолжает жить локально.

const API_BASE = location.hostname.endsWith("github.io") ? "" : "";
const STUDENT_TOKEN_KEY = "savelyStudentToken";
const TUTOR_NAME_KEY = "savelyTutorName";

let syncTimer = null;
let syncFailed = false;
let syncStopped = false;

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
const PENDING_JOIN_KEY = "savelyPendingJoin";

async function joinTutor(name) {
  const inv = window.pendingInvite;
  if (!inv || studentToken()) return;

  // Сначала пробуем узнать ученика: он мог заниматься на другом устройстве
  // и просто открыть ту же ссылку с телефона. Иначе весь прогресс пропал бы,
  // а у репетитора появился бы дубль.
  try {
    const found = await api("/api/student/restore", { code: inv.code, name });
    if (found.ok && found.found && found.state) {
      localStorage.setItem(STUDENT_TOKEN_KEY, found.token);
      localStorage.setItem(TUTOR_NAME_KEY, found.tutorName || "");
      adoptServerState(found.state);
      window.pendingInvite = null;
      return;
    }
  } catch (e) { /* офлайн — пойдём обычным путём */ }

  // Запоминаем намерение: если сервер сейчас недоступен, ученик иначе
  // навсегда остался бы вне кабинета репетитора и молча учился один.
  localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ code: inv.code, name }));
  await tryPendingJoin();
}

/** Переносит прогресс с сервера в текущий браузер. */
function adoptServerState(srv) {
  state.level = srv.level || state.level;
  state.vocabEstimate = srv.vocabEstimate || state.vocabEstimate;
  state.xp = Math.max(state.xp || 0, srv.xp || 0);
  state.blitzBest = Math.max(state.blitzBest || 0, srv.blitzBest || 0);
  state.goal = srv.goal || state.goal;
  state.achievements = [...new Set([...(state.achievements || []), ...(srv.achievements || [])])];
  state.activity = Object.assign({}, srv.activity || {}, state.activity || {});
  // слова с сервера дополняем локальными, не теряя ни те, ни другие
  const byWord = new Map((srv.dictionary || []).map(d => [d.w.toLowerCase(), d]));
  (state.dictionary || []).forEach(d => byWord.set(d.w.toLowerCase(), d));
  state.dictionary = [...byWord.values()];
  if (typeof srsInit === "function") state.dictionary.forEach(srsInit);
  saveStateQuiet();
  if (typeof updateChrome === "function") updateChrome();
  if (typeof show === "function" && state.user && state.level) show("dashboard");
}

async function tryPendingJoin() {
  if (studentToken()) { localStorage.removeItem(PENDING_JOIN_KEY); return; }
  const raw = localStorage.getItem(PENDING_JOIN_KEY);
  if (!raw) return;
  let pending;
  try { pending = JSON.parse(raw); } catch (e) { localStorage.removeItem(PENDING_JOIN_KEY); return; }
  try {
    const res = await api("/api/student/join", pending);
    if (res.ok) {
      localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
      localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
      localStorage.removeItem(PENDING_JOIN_KEY);
      window.pendingInvite = null;
      pushProgress();
    } else if (res.error && res.error.includes("не существует")) {
      localStorage.removeItem(PENDING_JOIN_KEY);   // ссылка мертва, повторять нечего
    }
  } catch (e) { /* офлайн — попробуем при следующем запуске */ }
}

// ---- отправка прогресса ----

function snapshot() {
  return {
    level: state.level,
    vocabEstimate: state.vocabEstimate,
    xp: state.xp,
    streak: typeof streakDays === "function" ? streakDays() : 0,
    blitzBest: state.blitzBest,
    goal: state.goal,
    achievements: state.achievements || [],
    dictionary: state.dictionary.map(d => ({
      w: d.w, t: d.t, status: d.status, knew: d.knew, forgot: d.forgot,
    })),
    activity: state.activity,
  };
}

async function pushProgress() {
  const token = studentToken();
  if (!token || syncStopped) return;
  // пустое состояние на сервер не отправляем: это почти всегда признак
  // сброса или сбоя, а UPDATE затрёт репетитору реальный прогресс
  if (!state.user || (!state.dictionary.length && !state.xp)) return;
  try {
    const res = await api("/api/student/sync", { token, state: snapshot() });
    syncFailed = false;
    if (res.ok && Array.isArray(res.homework)) applyHomework(res.homework);
    if (res.ok && Array.isArray(res.messages)) {
      const changed = JSON.stringify(state.messages) !== JSON.stringify(res.messages);
      state.messages = res.messages;
      if (changed) { saveStateQuiet(); renderTutorMessages(); }
    }
    if (res.ok && Array.isArray(res.leaderboard)) {
      const changed = JSON.stringify(state.leaderboard) !== JSON.stringify(res.leaderboard);
      state.leaderboard = res.leaderboard;
      if (changed) {
        saveStateQuiet();
        if (typeof renderLeaderboard === "function") renderLeaderboard();
      }
    }
  } catch (e) {
    syncFailed = true;
  }
}

// прогресс копится и уходит пачкой — не дёргаем сервер на каждый клик
function scheduleSync() {
  if (syncStopped || !studentToken()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushProgress, 3000);
}

/** Полная остановка синхронизации — при выходе из аккаунта.
 * Без неё уже запланированный push успел бы отправить пустое состояние. */
function stopSync() {
  syncStopped = true;
  clearTimeout(syncTimer);
}

// ---- домашка ----

let homeworkTasks = [];

function applyHomework(tasks) {
  const wasDone = new Set(state.homeworkDone || []);
  const before = JSON.stringify(state.homework || []);
  homeworkTasks = tasks || [];
  state.homework = homeworkTasks;

  // домашка считается сданной один раз — когда все её слова выучены
  let newlyDone = false;
  homeworkTasks.forEach(task => {
    const { done, total } = homeworkProgress(task);
    const key = String(task.id);
    if (total && done >= total && !wasDone.has(key)) {
      wasDone.add(key);
      newlyDone = true;
    }
  });
  state.homeworkDone = [...wasDone];

  // saveStateQuiet, а не saveState: данные пришли с сервера, и обычное
  // сохранение запустило бы очередную синхронизацию — и так по кругу
  if (before !== JSON.stringify(homeworkTasks) || newlyDone) {
    saveStateQuiet();
    renderHomework();
  }
  // награду выдаём после сохранения — bump сам сохранит состояние
  if (newlyDone && typeof bump === "function") bump("homework");
}

/** Слово засчитано в домашку, если ученик хотя бы раз верно его вспомнил.
 * По статусу "learned" считать нельзя: SRS присваивает его только после
 * четырёх повторов с интервалами 1-3-7-14 дней, то есть почти через месяц —
 * домашку «к четвергу» было бы невозможно сдать в принципе. */
function wordDoneForHomework(d) {
  return !!d && ((d.knew || 0) >= 1 || (d.reps || 0) >= 1 || d.status === "learned");
}

function homeworkProgress(task) {
  const known = new Map(state.dictionary.map(d => [d.w.toLowerCase(), d]));
  let done = 0;
  task.words.forEach(w => {
    if (wordDoneForHomework(known.get(String(w.w).toLowerCase()))) done++;
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
          ${task.dueDate ? `<span class="hw-due">до ${esc(task.dueDate)}</span>` : ""}
        </div>
        <p class="hw-title">${esc(task.title)}</p>
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

/** Сообщения от репетитора — на главной ученика, над домашкой. */
function renderTutorMessages() {
  const box = document.getElementById("tutor-msg-box");
  if (!box) return;
  const msgs = state.messages || [];
  const seen = new Set(state.messagesSeen || []);
  box.classList.toggle("hidden", !msgs.length);
  if (!msgs.length) { box.innerHTML = ""; return; }
  const who = localStorage.getItem(TUTOR_NAME_KEY) || "репетитор";
  box.innerHTML = msgs.map(m => `
    <div class="card tmsg-card${seen.has(String(m.id)) ? "" : " tmsg-new"}">
      <span class="tmsg-icon">✉️</span>
      <div class="tmsg-body">
        <span class="tmsg-from">${esc(who)}${seen.has(String(m.id)) ? "" : " · новое"}</span>
        <p class="tmsg-text">${esc(m.text)}</p>
      </div>
    </div>`).join("");
  // помечаем прочитанными, чтобы «новое» не висело вечно
  state.messagesSeen = msgs.map(m => String(m.id));
  saveStateQuiet();
}

// ---- старт ----

document.addEventListener("DOMContentLoaded", () => {
  initInvite();
  if (studentToken()) pushProgress();
  else tryPendingJoin();          // догоняем привязку, сорванную офлайном
});

// связь вернулась — повторяем то, что не удалось отправить
window.addEventListener("online", () => {
  tryPendingJoin();
  if (studentToken()) pushProgress();
});
