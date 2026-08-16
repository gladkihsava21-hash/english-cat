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

  // Почту у ребёнка не спрашиваем. Она нужна ровно для одного —
  // вернуть доступ, если потерян личный код. У пришедшего по ссылке
  // такой проблемы нет: код видит репетитор в своей панели и назовёт
  // его на занятии. То есть поле не решало ученику никакой задачи,
  // а адрес ребёнка мы собирали и хранили. Меньше персональных данных
  // о детях — меньше того, что можно потерять.
  const mail = document.getElementById("email-row");
  if (mail) mail.classList.add("hidden");
  const emailInput = document.getElementById("reg-email");
  if (emailInput) emailInput.value = "";
}

// вызывается после регистрации ученика в app.js
const PENDING_JOIN_KEY = "savelyPendingJoin";

async function joinTutor(name) {
  const inv = window.pendingInvite;
  if (!inv || studentToken()) return;

  // Запоминаем намерение: если сервер сейчас недоступен, ученик иначе
  // навсегда остался бы вне кабинета репетитора и молча учился один.
  localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ code: inv.code, name }));
  await tryPendingJoin();
}

/** Вход с другого устройства по личному коду ученика. */
async function restoreByCode(code) {
  const res = await api("/api/student/restore", { restoreCode: code });
  if (!res.ok) return res;
  if (typeof res.ai === "boolean") window.SAVELY_AI = res.ai;   // см. pushProgress
  localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
  localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
  localStorage.removeItem(PENDING_JOIN_KEY);
  state.user = state.user || { name: res.state.name || "Ученик", email: "" };
  adoptServerState(res.state);
  return res;
}

/** Переносит прогресс с сервера в текущий браузер. */
function adoptServerState(srv) {
  if (srv.restoreCode) state.restoreCode = srv.restoreCode;
  state.level = srv.level || state.level;
  state.vocabEstimate = srv.vocabEstimate || state.vocabEstimate;
  state.xp = Math.max(state.xp || 0, srv.xp || 0);
  state.blitzBest = Math.max(state.blitzBest || 0, srv.blitzBest || 0);
  state.goal = srv.goal || state.goal;
  state.achievements = [...new Set([...(state.achievements || []), ...(srv.achievements || [])])];
  state.activity = Object.assign({}, srv.activity || {}, state.activity || {});
  // Папки объединяем, как награды: у пришедшего с сервера и у здешнего
  // списка нет старшинства, а потерять папку при переезде — это ровно та
  // беда, ради которой выход и переделывали.
  state.folders = [...new Set([...(state.folders || []), ...(srv.folders || [])])];
  // Выбор папок для тренировки, наоборот, НЕ объединяем: это текущее
  // намерение («сегодня учу только к контрольной»), а не накопленное
  // добро. Объединение двух устройств тут дало бы набор, которого
  // человек не выбирал ни на одном из них. Берём серверный, только
  // если здесь ничего не выбрано.
  if (!(state.trainFolders || []).length && (srv.trainFolders || []).length) {
    state.trainFolders = srv.trainFolders;
  }
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
      if (res.restoreCode) state.restoreCode = res.restoreCode;
      saveStateQuiet();
      localStorage.removeItem(PENDING_JOIN_KEY);
      window.pendingInvite = null;
      pushProgress();
    } else if (res.error && res.error.includes("не существует")) {
      localStorage.removeItem(PENDING_JOIN_KEY);   // ссылка мертва, повторять нечего
    }
  } catch (e) { /* офлайн — попробуем при следующем запуске */ }
}

/** Забираем прогресс с сервера.
 *
 *  Без этого ученик, у которого опустел localStorage (Safari на телефоне
 *  чистит его сам, режим инкогнито, другой браузер, «очистить данные»),
 *  начинал с нуля и заново проходил тест — хотя на сервере всё лежало.
 *  Мержим, а не заменяем: то, что успели наработать локально, тоже ценно. */
async function pullProgress() {
  const token = studentToken();
  if (!token || syncStopped) return false;
  try {
    const res = await api("/api/student/pull", { token });
    if (!res.ok || !res.state) return false;
    const srv = res.state;
    // Имя с сервера подставляем, если локально его нет — иначе сайт
    // покажет форму регистрации человеку, который давно зарегистрирован
    if (!state.user && srv.name) state.user = { name: srv.name, email: "" };
    adoptServerState(srv);
    return true;
  } catch (e) {
    return false;   // офлайн — работаем с тем, что есть локально
  }
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
      due: d.due, interval: d.interval, reps: d.reps, ease: d.ease,
      lastReview: d.lastReview, seen: d.seen,
      // Папки ездят вместе со словом. Без этого выход и возврат по личному
      // коду — тот самый сценарий общего устройства — стирал бы всю
      // раскладку по темам, хотя сами слова возвращались.
      folders: d.folders || [],
    })),
    // Список папок отдельно: иначе пустая папка нигде не хранится и
    // при переезде исчезает, а завести её заранее — половина смысла.
    folders: state.folders || [],
    trainFolders: state.trainFolders || [],
    homeworkDone: state.homeworkDone || [],
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
    // Есть ли нейросеть — чат по этому флагу с первой реплики честно
    // говорит, что умеет, и не ходит на сервер за отказом (см. aiKnownOff
    // в app.js). Не булево — значит сервер старый, чат решит сам.
    if (res.ok && typeof res.ai === "boolean") window.SAVELY_AI = res.ai;
    if (res.ok && Array.isArray(res.homework)) applyHomework(res.homework);
    if (res.ok && res.lesson) applyLesson(res.lesson);
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

/** Домашка, которую УЖЕ показывали. Берём из сохранения, а не с нуля.
 *
 *  Было так: переменная стартовала пустой, а заполнял её только ответ
 *  сервера. Ученик открывал домашку, обновлял страницу — и она исчезала
 *  до следующей синхронизации, а без сети не возвращалась вообще.
 *  Хуже того, если задание не менялось (обычное дело — оно висит неделю),
 *  applyHomework ниже считал «изменений нет» и не перерисовывал: пустой
 *  экран оставался пустым, хотя данные лежали в сохранении рядом.
 *
 *  Ребёнок при этом видит не «связь пропала», а «репетитор ничего не
 *  задал» — и не делает домашку. */
let homeworkTasks = (state && Array.isArray(state.homework)) ? state.homework : [];

function applyHomework(tasks) {
  const wasDone = new Set(state.homeworkDone || []);
  const before = JSON.stringify(state.homework || []);
  homeworkTasks = tasks || [];
  state.homework = homeworkTasks;

  // домашка считается сданной один раз — когда все её слова выучены
  let newlyDone = 0;
  homeworkTasks.forEach(task => {
    const { done, total } = homeworkProgress(task);
    const key = String(task.id);
    if (total && done >= total && !wasDone.has(key)) {
      wasDone.add(key);
      newlyDone++;
    }
  });
  state.homeworkDone = [...wasDone];

  // saveStateQuiet, а не saveState: данные пришли с сервера, и обычное
  // сохранение запустило бы очередную синхронизацию — и так по кругу
  // Сохраняем только при изменениях, а рисуем ВСЕГДА. Это разные вопросы:
  // «данные поменялись» и «на экране уже нарисовано». Пока они были одним
  // условием, неизменившееся задание не рисовалось никогда.
  if (before !== JSON.stringify(homeworkTasks) || newlyDone) saveStateQuiet();
  renderHomework();
  // награда за КАЖДУЮ сданную домашку, а не одна на синхронизацию
  if (newlyDone && typeof bump === "function") bump("homework", newlyDone);
}

/** Слово засчитано в домашку, если ученик хотя бы раз верно его вспомнил.
 * По статусу "learned" считать нельзя: SRS присваивает его только после
 * четырёх повторов с интервалами 1-3-7-14 дней, то есть почти через месяц —
 * домашку «к четвергу» было бы невозможно сдать в принципе. */
/** Слово засчитано в домашке ТОЛЬКО если ответ проверялся: ввод с
 *  клавиатуры, выбор варианта, диктант. Раньше хватало одного нажатия
 *  «Помню» на карточке — то есть ученик мог протыкать не читая, а
 *  репетитор видел бы «сдал 10 из 10». Это ровно то, за что он платит,
 *  и ровно то, что ломалось за тридцать секунд.
 *  status === "learned" оставляем: до него слово доходит только через
 *  четыре успешных повтора, накрутить его нажатием нельзя. */
function wordDoneForHomework(d) {
  return !!d && ((d.checked || 0) >= 1 || d.status === "learned");
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
          <span class="hw-label">${iconInline("book", 15)} Домашка от репетитора</span>
          ${task.dueDate ? `<span class="hw-due">до ${esc(task.dueDate)}</span>` : ""}
        </div>
        <p class="hw-title">${esc(task.title)}</p>
        ${task.taskText ? `<p class="hw-task">${esc(task.taskText)}</p>` : ""}
        ${task.readingText ? `
          <div class="hw-reading">
            <p class="hw-reading-label">${iconInline("mic", 15)} Прочитай вслух:</p>
            <p class="hw-reading-text" id="rd-text-${task.id}">${esc(task.readingText)}</p>
            <button class="btn btn-ghost btn-small" data-read="${task.id}">Начать чтение</button>
            <div class="rd-result" id="rd-res-${task.id}"></div>
          </div>` : ""}
        <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
        <p class="stat-note">${done} из ${total} слов выучено${finished ? " — готово, мяу! 🎉" : ""}</p>
        <button class="btn btn-primary btn-small" data-hw="${task.id}">Сделать домашку</button>
      </div>`;
  }).join("");
  box.querySelectorAll("[data-read]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (typeof startReading !== "function") return;
      const id = btn.dataset.read;
      const task = homeworkTasks.find(t => String(t.id) === id);
      const res = document.getElementById("rd-res-" + id);
      if (btn.dataset.on === "1") { stopReading(); return; }
      btn.dataset.on = "1";
      btn.textContent = "Стоп — я закончил";
      res.innerHTML = `<p class="stat-note">Слушаю… читай спокойно, вслух.</p>`;
      startReading(task.readingText,
        (v, err) => {
          btn.dataset.on = "";
          btn.textContent = "Прочитать ещё раз";
          if (err) { res.innerHTML = `<p class="stat-note">${esc(err)}</p>`; return; }
          res.innerHTML = `
            <p class="rd-score">${v.score}% <span>прочитано верно</span></p>
            <p class="rd-comment">${esc(readingComment(v))}</p>
            <p class="rd-marked">${readingMarkup(v)}</p>
            ${v.problems.length ? `<p class="stat-note">Повтори: ${
              v.problems.map(x => esc(x.word)).join(", ")}</p>` : ""}`;
          if (studentToken()) {
            api("/api/student/reading", {
              token: studentToken(), homeworkId: task.id, score: v.score,
              total: v.total, problems: v.problems,
            });
          }
        },
        partial => { res.innerHTML = `<p class="stat-note">${esc(partial)}</p>`; });
    });
  });

  box.querySelectorAll("[data-hw]").forEach(btn => {
    btn.addEventListener("click", () => {
      const task = homeworkTasks.find(t => String(t.id) === btn.dataset.hw);
      if (!task) return;
      task.words.forEach(w => addToDictionary({
        w: w.w, t: w.t, ex: w.ex || "", level: w.level || state.level,
      }));
      renderHomework();
      // Сразу в упражнение с проверкой, а не в список из двадцати:
      // домашку закрывают только проверенные ответы, и выбирать
      // подходящий режим — не работа ученика.
      if (typeof openExercise === "function") openExercise("spelling");
      else show("practice");
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
      <span class="tmsg-icon">${icon("chat", 18)}</span>
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

document.addEventListener("DOMContentLoaded", async () => {
  // на витрине без сервера не дёргаем API вовсе — иначе каждая
  // синхронизация упиралась бы в 404 хостинга
  if (!(await apiAlive())) {
    syncStopped = true;
    const note = document.getElementById("demo-note");
    if (note) note.classList.remove("hidden");
    return;
  }
  initInvite();
  if (studentToken()) {
    await pullProgress();         // сначала забрать, потом отправлять
    pushProgress();
  } else {
    tryPendingJoin();             // догоняем привязку, сорванную офлайном
  }
});

// связь вернулась — повторяем то, что не удалось отправить
window.addEventListener("online", async () => {
  tryPendingJoin();
  if (studentToken()) {
    await pullProgress();
    pushProgress();
  }
});


/* ===== Видеоурок у ученика =====
 * Комнату держит репетитор — мы только доносим её и говорим, идёт ли
 * занятие прямо сейчас. Причина, почему не своё видео, расписана
 * в db.py у LESSON_OPEN_MINUTES: на старшем тарифе оно стоило бы вдвое
 * дороже подписки.
 */
function applyLesson(lesson) {
  const changed = JSON.stringify(state.lesson) !== JSON.stringify(lesson);
  state.lesson = lesson;
  if (changed) {
    saveStateQuiet();
    renderLessonBox();
  }
}

function renderLessonBox() {
  const box = document.getElementById("lesson-box");
  if (!box) return;
  const l = state.lesson || {};
  // Нет ссылки — блока нет вовсе. Кнопка «на урок», ведущая в никуда,
  // хуже отсутствия кнопки: по ней жмут и упираются в ошибку.
  if (!l.url) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  box.classList.toggle("lesson-live", !!l.live);
  const tutorName = localStorage.getItem("savelyTutorName") || "репетитор";
  box.innerHTML = `
    <div class="card lesson-card">
      <div class="cat-avatar cat-small" data-cat="${l.live ? "happy" : "hello"}"></div>
      <div class="lesson-text">
        <p class="lesson-kicker">${l.live
          ? iconInline("mic", 15) + " Урок идёт сейчас"
          : iconInline("clock", 15) + " Видеоурок"}</p>
        <p class="lesson-note">${l.live
          ? esc(tutorName) + " ждёт тебя в комнате."
          : "Комната открыта постоянно — заходи, когда договорились."}</p>
      </div>
      <a class="btn ${l.live ? "btn-primary" : "btn-ghost"} lesson-go"
         href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">На урок</a>
    </div>`;
  if (typeof paintCats === "function") paintCats(box);
}
