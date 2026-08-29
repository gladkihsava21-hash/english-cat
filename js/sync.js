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
  if (!code) return;
  // Ссылку открыл ученик, у которого УЖЕ есть аккаунт (одиночка):
  // привязываем его, а не создаём второго. Прогресс и код остаются.
  if (studentToken()) {
    let info;
    try { info = await api("/api/join", { code }); } catch (e) { return; }
    if (!info.ok) return;
    const box = document.getElementById("adopt-note");
    if (!box) return;
    box.classList.remove("hidden");
    box.innerHTML = `<div class="card hw-card"><p class="hw-title">Тебя пригласил репетитор: ${esc(info.tutorName)}</p>
      <p class="muted-small">Привязать твой аккаунт? Словарь, очки и код останутся твоими,
        а репетитор увидит прогресс и сможет давать домашку.</p>
      <div class="quiz-buttons" style="justify-content:flex-start">
        <button class="btn btn-primary btn-small" id="adopt-yes">Да, привязать</button>
        <button class="btn btn-ghost btn-small" id="adopt-no">Не сейчас</button>
      </div></div>`;
    document.getElementById("adopt-yes").addEventListener("click", async () => {
      const res = await api("/api/student/adopt", { token: studentToken(), code });
      if (!res.ok) { box.innerHTML = `<p class="muted-small">${esc(res.error || "Не получилось.")}</p>`; return; }
      localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
      location.href = location.pathname;   // убираем ?join= и перерисовываемся
    });
    document.getElementById("adopt-no").addEventListener("click", () => { box.innerHTML = ""; box.classList.add("hidden"); });
    return;
  }
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

  // Почту и пароль у ребёнка не спрашиваем. Почта нужна ровно для
  // одного — вернуть доступ, если потерян личный код; у пришедшего по
  // ссылке код видит репетитор в своей панели и назовёт на занятии.
  // Меньше персональных данных о детях — меньше того, что можно
  // потерять. Какие поля прятать на какой вкладке, решает setAuthMode
  // (app.js): раньше почта пряталась здесь один раз, поле пароля
  // оставалось и требовало «почту», которой негде ввести, — тупик.
  const emailInput = document.getElementById("reg-email");
  if (emailInput) emailInput.value = "";
  const passInput = document.getElementById("reg-password");
  if (passInput) passInput.value = "";
  if (typeof setAuthMode === "function") setAuthMode("register");
}

/** Регистрация БЕЗ ссылки репетитора — теперь тоже настоящий аккаунт.
 *  Раньше такой ученик жил только в localStorage: на сервере его не было,
 *  личного кода не было, и на другом устройстве сайт встречал его именем
 *  и тестом заново. Возвращает true, если аккаунт создан на сервере. */
async function registerStandalone(name, email, password) {
  if (studentToken()) return { ok: true };   // уже есть аккаунт — не плодим
  try {
    const res = await api("/api/student/register",
      { name, email: email || "", password: password || "" });
    // Явный отказ (почта занята, пароль из одних цифр…) возвращаем
    // наверх: раньше он глотался, ученик уезжал на тест без аккаунта
    // и без личного кода, а введённые почта и пароль пропадали молча.
    if (!res.ok) return { ok: false, error: res.error || "Не получилось создать аккаунт." };
    localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
    localStorage.setItem(TUTOR_NAME_KEY, "");
    if (res.restoreCode) state.restoreCode = res.restoreCode;
    saveStateQuiet();
    pushProgress();
    return { ok: true };
  } catch (e) {
    return { ok: true, offline: true };  // офлайн — прогресс пока локальный
  }
}

// вызывается после регистрации ученика в app.js
const PENDING_JOIN_KEY = "savelyPendingJoin";

async function joinTutor(name) {
  const inv = window.pendingInvite;
  if (!inv || studentToken()) return { ok: true };

  // Запоминаем намерение: если сервер сейчас недоступен, ученик иначе
  // навсегда остался бы вне кабинета репетитора и молча учился один.
  localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ code: inv.code, name }));
  return tryPendingJoin();
}

/** Вход по почте и паролю — обычный вход, которого от сайта и ждут.
 *
 * Возвращает true при успехе. Текст ошибки пишет сам: форма показывает
 * то, что сказал сервер, и не гадает. Прогресс с сервера подхватывается
 * ровно так же, как при входе по коду — обе двери ведут в один аккаунт. */
async function loginByPassword(email, password) {
  const fail = t => { if (typeof authError === "function") authError(t); return false; };
  let res;
  try {
    res = await api("/api/student/login", { email, password });
  } catch (e) {
    return fail("Сервер не отвечает. Проверь интернет и попробуй ещё раз.");
  }
  if (!res.ok) return fail(res.error || "Не подошло.");
  if (typeof res.ai === "boolean") window.SAVELY_AI = res.ai;
  localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
  localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
  localStorage.removeItem(PENDING_JOIN_KEY);
  state.user = state.user || { name: res.state.name || "Ученик", email };
  if (res.state && res.state.name) state.user.name = res.state.name;
  state.user.email = email;
  adoptServerState(res.state);
  pushProgress();          // домашка и сообщения приходят ответом на sync
  return true;
}

/** Сброс пароля по коду из письма.
 *
 *  Возвращает текст ошибки или null при успехе. При успехе человек уже
 *  внутри: он только что доказал, что почта его, и просить после этого
 *  ввести свежий пароль на форме входа — лишний шаг ровно там, где он
 *  и так намучился. */
async function resetByEmailCode(email, code, password) {
  let res;
  try {
    res = await api("/api/student/reset/check", { email, code, password });
  } catch (e) {
    return "Сервер не отвечает. Попробуй ещё раз.";
  }
  if (!res.ok) return res.error || "Не получилось.";
  if (typeof res.ai === "boolean") window.SAVELY_AI = res.ai;
  localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
  localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
  localStorage.removeItem(PENDING_JOIN_KEY);
  state.user = state.user || { name: res.state.name || "Ученик", email };
  if (res.state && res.state.name) state.user.name = res.state.name;
  state.user.email = email;
  adoptServerState(res.state);
  pushProgress();
  return null;
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
  // Сразу синхронизируемся: домашка, сообщения и урок приходят только
  // ответом на sync, а следующий sync случился бы лишь после первого
  // изменения состояния. Ученик на новом устройстве иначе видел бы
  // главную без домашки, пока что-нибудь не нажмёт.
  pushProgress();
  return res;
}

/** Слить результаты заданий с сервера в местные. Правило одно и то же
 *  здесь и в db.clean_task_results: при том же размере набора — лучший;
 *  при другом — тот, что свежее по времени (набор переделали, и старый
 *  результат от другого устройства не должен побеждать). */
function mergeTaskResults(theirs) {
  if (!theirs || typeof theirs !== "object") return;
  const mine = state.taskResults || {};
  let changed = false;
  Object.entries(theirs).forEach(([id, r]) => {
    if (!r || !r.total) return;
    const cur = mine[id];
    const take = !cur
      || (r.total === cur.total && ((r.correct || 0) > (cur.correct || 0)
          || ((r.correct || 0) === (cur.correct || 0) && cur.rushed && !r.rushed)))
      || (r.total !== cur.total && String(r.at || "") > String(cur.at || ""));
    if (take) { mine[id] = r; changed = true; }
  });
  state.taskResults = mine;
  if (changed) { saveStateQuiet(); if (typeof renderHomework === "function") renderHomework(); }
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
  // Результаты заданий по домашкам — тем же правилом, что при синхронизации
  mergeTaskResults(srv.taskResults);
  // слова с сервера дополняем локальными, не теряя ни те, ни другие
  const byWord = new Map((srv.dictionary || []).map(d => [d.w.toLowerCase(), d]));
  (state.dictionary || []).forEach(d => byWord.set(d.w.toLowerCase(), d));
  state.dictionary = [...byWord.values()];
  if (typeof srsInit === "function") state.dictionary.forEach(srsInit);
  saveStateQuiet();
  if (typeof updateChrome === "function") updateChrome();
  // Главную показываем, только если человек на «нейтральном» экране:
  // приветствие, тест, сама главная. Тогда восстановление аккаунта
  // и правда меняет то, что он видит (вход по коду, по паролю, Safari
  // вычистил localStorage). Но pullProgress бежит и при КАЖДОМ обычном
  // старте страницы — и этот же show("dashboard") выдёргивал ученика
  // из упражнения через ~2 секунды после открытия: он запускал
  // тренировку карточкой с доски, доезжал ответ /api/student/pull —
  // и его выбрасывало на главную (заодно сбрасывая homeworkScope,
  // то есть из домашки выбрасывало тоже). Синхронизация — фон,
  // а не навигация: с чужих экранов она никого не уводит.
  const neutral = ["welcome", "test", "dashboard"].some(n => {
    const el = document.getElementById("screen-" + n);
    return el && !el.classList.contains("hidden");
  });
  if (typeof show === "function" && state.user && state.level && neutral) show("dashboard");
}

/** Возвращает исход привязки: { ok } при успехе и офлайне (догоним),
 *  { ok:false, shown:true } когда нарисован выбор «это я / другой»,
 *  { ok:false, error } при явном отказе сервера. Раньше все отказы
 *  глотались молча: сабмит уже увёл ученика на тест, ошибка «мест нет»
 *  или «имя короткое» терялась, и человек был уверен, что подключился
 *  к репетитору, хотя аккаунта на сервере не было вовсе. */
async function tryPendingJoin() {
  if (studentToken()) { localStorage.removeItem(PENDING_JOIN_KEY); return { ok: true }; }
  const raw = localStorage.getItem(PENDING_JOIN_KEY);
  if (!raw) return { ok: true };
  let pending;
  try { pending = JSON.parse(raw); } catch (e) {
    localStorage.removeItem(PENDING_JOIN_KEY);
    return { ok: true };
  }
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
      return { ok: true };
    }
    if (res.sameName) {
      // У репетитора уже есть ученик с этим именем — почти всегда это тот
      // же ребёнок с нового устройства. Даём выбор вместо тихого дубля.
      showSameNamePrompt(pending);
      return { ok: false, shown: true };
    }
    if (res.error && res.error.includes("не существует")) {
      localStorage.removeItem(PENDING_JOIN_KEY);   // ссылка мертва, повторять нечего
      return { ok: false, error: "Ссылка приглашения устарела. Попроси у репетитора новую." };
    }
    return { ok: false, error: res.error || "Не получилось привязаться к репетитору." };
  } catch (e) {
    // офлайн — намерение сохранено в PENDING_JOIN_KEY, догоним при
    // следующем запуске или возврате сети; ученика не задерживаем
    return { ok: true, offline: true };
  }
}

/** «Такое имя уже есть»: вернись по коду или подтверди, что ты другой. */
function showSameNamePrompt(pending) {
  const box = document.getElementById("invite-note");
  if (!box) return;
  box.classList.remove("hidden");
  box.innerHTML = `<p>У этого репетитора уже есть ученик по имени <b>${esc(pending.name)}</b>.</p>
    <p class="muted-small">Если это ты с нового устройства — войди по личному коду,
      и весь прогресс вернётся. Код показан в профиле на старом устройстве,
      и его знает репетитор.</p>
    <div class="quiz-buttons" style="justify-content:flex-start">
      <button class="btn btn-primary btn-small" id="samename-restore">Это я — ввести код</button>
      <button class="btn btn-ghost btn-small" id="samename-force">Это другой человек — создать</button>
    </div>`;
  document.getElementById("samename-restore").addEventListener("click", () => {
    const show = document.getElementById("show-restore");
    if (show) show.click();
  });
  document.getElementById("samename-force").addEventListener("click", async () => {
    const res = await api("/api/student/join", { ...pending, force: true });
    if (!res.ok) {
      box.insertAdjacentHTML("beforeend",
        `<p class="type-feedback err">${esc(res.error || "Не получилось — попробуй ещё раз.")}</p>`);
      return;
    }
    localStorage.setItem(STUDENT_TOKEN_KEY, res.token);
    localStorage.setItem(TUTOR_NAME_KEY, res.tutorName || "");
    if (res.restoreCode) state.restoreCode = res.restoreCode;
    // Регистрация теперь дожидается ответа сервера и при sameName
    // откатывает state.user — здесь человек подтвердил «я другой»,
    // так что заводим его заново и ведём дальше, а не бросаем на форме.
    state.user = state.user || { name: pending.name, email: "" };
    saveStateQuiet();
    localStorage.removeItem(PENDING_JOIN_KEY);
    window.pendingInvite = null;
    box.innerHTML = ""; box.classList.add("hidden");
    pushProgress();
    if (typeof updateChrome === "function") updateChrome();
    const hello = document.getElementById("test-hello");
    if (hello) hello.textContent = `${pending.name}, посчитаем, сколько слов ты уже знаешь`;
    if (typeof show === "function") show(state.level ? "dashboard" : "test");
  });
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
    // Результаты заданий-упражнений по домашкам — репетитор видит их
    // в панели; без этой строки они жили бы только в браузере ученика.
    taskResults: state.taskResults || {},
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
    // Результаты заданий, слитые сервером: если на другом устройстве
    // результат лучше (или набор уже переделан) — забираем его. Свой
    // худший при том же размере набора не откатываем.
    if (res.ok && res.taskResults && typeof res.taskResults === "object") {
      mergeTaskResults(res.taskResults);
    }
    // Имя репетитора держим свежим на каждой синхронизации: его пишут
    // на устройство при входе, но привязать ученика могут и позже —
    // и тогда метка оставалась пустой, а профиль уверенно сообщал
    // «репетитора нет» тому, у кого репетитор есть.
    if (res.ok && typeof res.tutorName === "string"
        && localStorage.getItem(TUTOR_NAME_KEY) !== res.tutorName) {
      localStorage.setItem(TUTOR_NAME_KEY, res.tutorName);
    }
    // Уровень, назначенный репетитором: применяем один раз по отметке
    // времени. Дальше ученик сам шлёт новый уровень в снапшоте, и поля
    // на сервере сходятся. Свой выбор уровня тренировок сбрасываем:
    // «как по тесту» теперь означает «как назначил репетитор».
    if (res.ok && res.levelForce && res.levelForce.level
        && state.levelForceApplied !== res.levelForce.at) {
      state.levelForceApplied = res.levelForce.at;
      if (state.level !== res.levelForce.level) {
        state.level = res.levelForce.level;
        state.trainLevel = null;
        saveStateQuiet();
        if (typeof updateChrome === "function") updateChrome();
        if (typeof renderDashboard === "function"
            && document.getElementById("screen-dashboard")
            && !document.getElementById("screen-dashboard").classList.contains("hidden")) {
          renderDashboard();
        }
      } else {
        saveStateQuiet();
      }
    }
    if (res.ok && Array.isArray(res.homework)) applyHomework(res.homework);
    if (res.ok && res.lesson) applyLesson(res.lesson);
    pollBoard();
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
  // (словарная) или есть результат подхода (задание-упражнение)
  let newlyDone = 0;
  homeworkTasks.forEach(task => {
    const key = String(task.id);
    if (homeworkIsDone(task) && !wasDone.has(key)) {
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
  (task.words || []).forEach(w => {
    if (wordDoneForHomework(known.get(String(w.w).toLowerCase()))) done++;
  });
  return { done, total: (task.words || []).length };
}

/** Чем домашка сдаётся — то же деление, что у сервера (db.homework_kind):
 *  words — по словарю; task — упражнением (свой набор репетитора,
 *  грамматика, словообразование), результат в state.taskResults;
 *  photo — фото тетради или чтением вслух. */
function homeworkKind(task) {
  if ((task.words || []).length) return "words";
  if (task.taskset || ["grammar", "wordform", "custom"].includes(task.game)) return "task";
  return "photo";
}

function homeworkResult(task) {
  return (state.taskResults || {})[String(task.id)] || null;
}

function homeworkIsDone(task) {
  const kind = homeworkKind(task);
  if (kind === "words") {
    const p = homeworkProgress(task);
    return p.total > 0 && p.done >= p.total;
  }
  if (kind === "task") {
    const r = homeworkResult(task);
    return !!r && !r.rushed;   // прокликанный подход домашку не закрывает
  }
  return false;
}

/** Русские окончания: 1 вопрос, 2 вопроса, 5 вопросов. У ученика своей
 *  такой функции не было (только wordsWord для слов) — заводим общую. */
function pluralRu(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Подпись к заданию-упражнению: что это и сколько. */
function taskKindLabel(task) {
  if (task.taskset) {
    const n = task.taskset.count || (task.taskset.items || []).length;
    const unit = task.taskset.kind === "pairs" ? ["пара", "пары", "пар"] : ["вопрос", "вопроса", "вопросов"];
    return `${task.taskset.kindName || "Задание"} · ${n} ${pluralRu(n, unit[0], unit[1], unit[2])}`;
  }
  if (task.game === "wordform") return "Словообразование · 8 заданий формата ОГЭ";
  if (task.game === "grammar") return "Грамматика · выбери тему, 8 вопросов с разбором";
  return "Задание";
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
    const kind = homeworkKind(task);
    const { done, total } = homeworkProgress(task);
    const result = kind === "task" ? homeworkResult(task) : null;
    // Полоса и подпись под ней — по виду домашки. Раньше «0 из 0 слов
    // выучено» стояло под любой домашкой, даже без слов.
    let pct = 0, finished = false, sub = "", btn = "";
    if (kind === "words") {
      pct = total ? Math.round((done / total) * 100) : 0;
      finished = total > 0 && done >= total;
      sub = `${done} из ${total} слов выучено${finished ? " — готово, мяу! 🎉" : ""}`;
      btn = "Сделать домашку";
    } else if (kind === "task") {
      pct = result && result.total ? Math.round((result.correct / result.total) * 100) : 0;
      finished = !!result && !result.rushed;
      sub = !result
        ? "Ещё не сделано"   // без рода: ученица читает это так же часто, как ученик
        : result.rushed
          ? `Прокликано (${result.correct} из ${result.total}) — не засчитано. Пройди спокойно, читая вопросы: репетитор видит и время, и попытки.`
          : `Сделано: ${result.correct} из ${result.total}${result.tries > 1 ? ` · попыток: ${result.tries}` : ""}${
              result.correct === result.total ? " — всё верно, мяу! 🎉" : " — можно улучшить"}`;
      btn = !result ? "Открыть задание" : result.rushed ? "Пройти по-честному" : "Пройти ещё раз";
    } else {
      sub = task.readingText && !task.taskText
        ? "Прочитай текст вслух — результат уйдёт репетитору."
        : "Сделай задание в тетради и пришли фото — кнопка «Сфоткать домашку» ниже.";
    }
    return `
      <div class="card hw-card${finished ? " hw-done" : ""}">
        <div class="hw-head">
          <span class="hw-label">${iconInline("book", 15)} Домашка от репетитора</span>
          ${task.dueDate ? `<span class="hw-due">до ${esc(task.dueDate)}</span>` : ""}
        </div>
        <p class="hw-title">${esc(task.title)}</p>
        ${kind === "task" ? `<p class="hw-kind">${esc(taskKindLabel(task))}</p>` : ""}
        ${task.taskText ? `<p class="hw-task">${esc(task.taskText)}</p>` : ""}
        ${task.readingText ? `
          <div class="hw-reading">
            <p class="hw-reading-label">${iconInline("mic", 15)} Прочитай вслух:</p>
            <p class="hw-reading-text" id="rd-text-${task.id}">${esc(task.readingText)}</p>
            <button class="btn btn-ghost btn-small" data-read="${task.id}">Начать чтение</button>
            <div class="rd-result" id="rd-res-${task.id}"></div>
          </div>` : ""}
        ${kind !== "photo" ? `<div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>` : ""}
        <p class="stat-note">${esc(sub)}</p>
        ${btn ? `<button class="btn btn-primary btn-small" data-hw="${task.id}">${esc(btn)}</button>` : ""}
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
      // Одна точка входа для всех домашек — startHomeworkLesson в app.js:
      // она уважает игру, которую выбрал репетитор, и вид задания. Раньше
      // здесь стоял свой обработчик, открывавший «Ввод слова» всегда,
      // и плитка «Кроссворд» в панели репетитора отсюда не работала.
      if (typeof startHomeworkLesson === "function") startHomeworkLesson(task);
      else if (typeof openExercise === "function") openExercise("spelling");
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

/* Доска урока: репетитор открыл — у ученика появилась кнопка.
 *
 * Отдельным блоком над видеоуроком: доска и комната для звонка —
 * разные вещи, и на уроке нужны обе. Состояние приходит с сервера,
 * а не хранится у ученика: доску открывают и закрывают во время урока,
 * и локальная копия отставала бы на целый заход. */
function renderBoardBox(board) {
  const box = document.getElementById("board-box");
  if (!box) return;
  if (!board) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="card lesson-card lesson-live">
      <div class="cat-avatar cat-small" data-cat="happy"></div>
      <div class="lesson-text">
        <p class="lesson-kicker">${iconInline("book", 15)} Доска урока</p>
        <p class="lesson-note">${esc(board.title)} — репетитор открыл доску,
          можно писать и рисовать вместе.</p>
      </div>
      <a class="btn btn-primary lesson-go" href="board.html">Открыть доску</a>
    </div>`;
  if (typeof paintCats === "function") paintCats(box);
}

/** Спрашиваем про доску вместе с обычной синхронизацией — отдельного
 *  опроса не заводим, лишний запрос раз в несколько секунд ни к чему. */
async function pollBoard() {
  if (!studentToken()) return;
  try {
    const res = await api("/api/student/board", { token: studentToken() });
    if (res.ok) renderBoardBox(res.board);
  } catch (e) { /* нет связи — блок просто не появится */ }
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
