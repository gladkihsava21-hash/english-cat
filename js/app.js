// ===== Состояние (localStorage) =====
const STORAGE_KEY = "savelyState";

let state = loadState();

function loadState() {
  let st = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) st = JSON.parse(raw);
  } catch (e) { /* повреждённое состояние — начинаем заново */ }
  st = st || {
    user: null,          // { name, email }
    level: null,         // "A1".."C2"
    vocabEstimate: 0,
    dictionary: [],      // { w, t, ex, level, status: new|learning|learned, knew: 0, forgot: 0 }
    recommendSeen: [],   // слова, уже показанные в рекомендациях
    trainLevel: null,    // уровень слов для тренировок, если ученик выбрал сам; null — как по тесту
    trainMixNew: false,  // подмешивать ли новые слова уровня в «По словам» и «Игры»
    trainWords: [],      // слова, отмеченные на тренировку вручную (в нижнем регистре); пусто — не отбирал
    levelStats: {},      // точность по уровням: { A2: { r: 40, w: 6 } } — для подсказки сменить уровень
  };
  // Миграция старых сохранений.
  //
  // Список ниже обязан покрывать ВСЕ поля из объекта по умолчанию, иначе
  // сохранение, сделанное более старой версией, роняет экран целиком.
  // Так и было с dictionary и recommendSeen: их в списке не было, а
  // строчкой ниже вызывается st.dictionary.forEach, и главный экран
  // падал на state.recommendSeen.push с белым экраном вместо дашборда.
  // Проверять «а есть ли такое сохранение у живых учеников» бессмысленно:
  // прогресс приезжает ещё и с сервера, и оттуда может прийти что угодно.
  st.dictionary = st.dictionary || [];
  st.recommendSeen = st.recommendSeen || [];
  // Оценка словарного запаса. Без неё кот в чате говорил «запас
  // ~undefined слов», а в личном кабинете и на сервере оказывался
  // undefined вместо числа. Найдено tools/validate-state.py.
  st.vocabEstimate = st.vocabEstimate || 0;
  st.xp = st.xp || 0;
  st.activity = st.activity || {};   // "2026-08-05" -> очки за день
  st.blitzBest = st.blitzBest || 0;
  st.goal = st.goal || 50;           // дневная цель в очках
  st.achievements = st.achievements || [];
  st.counters = st.counters || {};   // события для наград
  st.modesTried = st.modesTried || [];
  st.leaderboard = st.leaderboard || [];
  st.folders = st.folders || [];     // папки словаря; пустая папка живёт здесь
  // Какие папки идут в тренировку. Пустой массив = весь словарь.
  // Лежит в состоянии, а не в переменной модуля: выбор должен пережить
  // перезагрузку страницы и переезд на другое устройство.
  st.trainFolders = st.trainFolders || [];
  // Результаты заданий-упражнений по домашкам: { "<homeworkId>":
  // { correct, total, at, tries } }. Для домашек без слов (викторина
  // репетитора, грамматика, словообразование) это единственный способ
  // показать репетитору «сдал 8/10» — по словарю там считать нечего.
  st.taskResults = st.taskResults || {};
  // Уровень слов для тренировок, выбранный самим учеником. Пусто — по
  // тесту. Репетитор просила: тест ставит уровень один раз, а ученик
  // должен мочь сказать «давай мне слова попроще / посложнее».
  st.trainLevel = st.trainLevel || null;
  st.trainMixNew = !!st.trainMixNew;
  // Отобранные на тренировку слова. Репетитор спрашивала, как назначить
  // на тренировку конкретные слова, — папки для этого есть, но нужнее
  // прямой способ: отметить галочками и тренировать только их.
  st.trainWords = st.trainWords || [];
  // Точность по уровням — на ней держится подсказка «тебе стало легко,
  // попробуем уровень выше»: сайт должен подстраиваться сам, а не ждать,
  // пока ученик найдёт настройку (просьба совладельца).
  st.levelStats = st.levelStats || {};
  // словам из старых версий добавляем поля интервального повторения
  if (typeof srsInit === "function") st.dictionary.forEach(srsInit);
  return st;
}

/** Уровень, ПО КОТОРОМУ подбираем слова: выбранный учеником в тренировках
 *  или, если не выбирал, — по тесту. state.level (по тесту) остаётся для
 *  показа в профиле и репетитору; подбор везде идёт через эту функцию. */
function studyLevel() {
  return state.trainLevel || state.level || "A1";
}

// ===== Очки и звания =====
const RANKS = [
  { xp: 0, name: "Котёнок" },
  { xp: 100, name: "Юный кот" },
  { xp: 250, name: "Кот-ученик" },
  { xp: 500, name: "Умный кот" },
  { xp: 1000, name: "Кот-знаток" },
  { xp: 2000, name: "Кот-профессор" },
  { xp: 4000, name: "Кот-полиглот" },
];

function rankInfo(xp) {
  let cur = RANKS[0], next = null;
  for (const r of RANKS) {
    if (xp >= r.xp) cur = r;
    else { next = r; break; }
  }
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1;
  return { name: cur.name, next, progress };
}

function dayKey(dt = new Date()) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Снять очки за прокликанный подход (см. exFinish в exercises.js).
 *  Снимаем ровно столько, сколько подход дал: в минус ни день, ни счёт
 *  не уходят. */
function revokeXP(n) {
  n = Math.max(0, Math.round(n));
  if (!n) return;
  state.xp = Math.max(0, (state.xp || 0) - n);
  const key = dayKey();
  state.activity[key] = Math.max(0, (state.activity[key] || 0) - n);
  saveState();
  updateChrome();
}

function addXP(n) {
  n = Math.max(0, Math.round(n));
  if (!n) return;
  const goal = state.goal || 50;
  const before = state.activity[dayKey()] || 0;
  state.xp += n;
  state.activity[dayKey()] = before + n;
  // цель дня засчитывается один раз — в момент, когда её перешагнули
  if (before < goal && before + n >= goal && typeof bump === "function") {
    state.counters = state.counters || {};
    state.counters.goalsHit = (state.counters.goalsHit || 0) + 1;
  }
  saveState();
  updateChrome();
  if (typeof checkAchievements === "function") checkAchievements();
}

function streakDays() {
  const d = new Date();
  let n = 0;
  if (!state.activity[dayKey(d)]) d.setDate(d.getDate() - 1); // сегодня ещё не занимался
  while (state.activity[dayKey(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (typeof scheduleSync === "function") scheduleSync();
}

/** Сохранение без планирования синхронизации.
 * Нужно для данных, ПРИШЕДШИХ с сервера (домашка, рейтинг): обычный
 * saveState там замкнул бы петлю sync → save → sync каждые 3 секунды. */
function saveStateQuiet() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Так сохраняется всё, что пришло с сервера: домашка, прогресс с другого
  // устройства, сообщения репетитора. Если ученик сейчас на главной —
  // обновляем блок «прямо сейчас», иначе он продолжит звать на повторение,
  // когда репетитор уже прислал задание.
  const dash = document.getElementById("screen-dashboard");
  if (dash && !dash.classList.contains("hidden")) renderTodayCard();
}

// ===== Навигация =====
const screens = ["welcome", "test", "dashboard", "dictionary", "trainer", "practice",
                 "exercise", "achievements", "chat", "account"];

function show(screen) {
  screens.forEach(s => {
    document.getElementById("screen-" + s).classList.toggle("hidden", s !== screen);
  });
  document.getElementById("topbar").classList.toggle("hidden", !state.user || !state.level);
  document.querySelectorAll(".nav-btn").forEach(b => {
    const on = b.dataset.nav === screen ||
      (b.dataset.nav === "practice" && (screen === "trainer" || screen === "exercise"));
    b.classList.toggle("active", on);
    // Раздел, в котором находишься, был обозначен только цветом кнопки.
    // aria-current сообщает то же самое вслух.
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  // Уходим из упражнения — снимаем область домашки. Без этого ученик,
  // открывший домашку и вернувшийся к обычной тренировке, навсегда
  // остался бы в её двадцати словах и не понял бы, почему словарь
  // «не работает».
  if (screen !== "exercise" && screen !== "trainer" && typeof homeworkScope !== "undefined") {
    homeworkScope = null;
  }
  // И контекст домашки-упражнения: результат следующего подхода не должен
  // записаться в задание, из которого ученик уже вышел.
  if (screen !== "exercise" && typeof homeworkContext !== "undefined") homeworkContext = null;
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (screen !== "chat" && typeof deactivateVoice === "function") deactivateVoice();
  if (screen === "test") resetTestScreen();
  if (screen === "dashboard") renderDashboard();
  if (screen === "dashboard" && typeof renderLessonBox === "function") renderLessonBox();
  // Пока ученик был в упражнении, репетитор мог позвать его на доску:
  // спрашиваем на входе, а не через круг опроса — иначе главная десять
  // секунд показывает вчерашнюю картину.
  if (screen === "dashboard" && typeof pollBoard === "function") pollBoard();
  if (screen === "dictionary") renderDictionary();
  if (screen === "trainer") startTraining();
  if (screen === "practice") renderPracticeHub();
  if (screen === "achievements") renderAchievements();
  if (screen === "chat") initChat();
  if (screen === "account") renderAccount();
  window.scrollTo(0, 0);
  announceScreen(screen);
}

/** Названия разделов для программы чтения с экрана — те же слова, что
 *  написаны на кнопках внизу, чтобы «нажал Словарь» и «попал в Словарь»
 *  звучали одинаково. */
const SCREEN_NAMES = {
  dashboard: "Главная", practice: "Тренировки", trainer: "Тренировка",
  exercise: "Упражнение", dictionary: "Словарь", achievements: "Награды",
  chat: "Чат с Савелием", account: "Профиль", test: "Тест на уровень",
  welcome: "Начало",
};

/** Сайт — одна страница, адрес при переходах не меняется, перезагрузки
 *  нет. Для зрячего это плюс, а незрячий нажимал «Словарь» и не получал
 *  НИЧЕГО: ни звука, ни смены заголовка, ни перемещения фокуса — только
 *  тишина, по которой не понять, сработало ли вообще.
 *
 *  Поэтому вручную делаем то, что при обычном переходе делает браузер:
 *  переводим фокус на заголовок нового раздела и называем его вслух. */
function announceScreen(screen) {
  const host = document.getElementById("screen-" + screen);
  if (!host) return;
  const name = SCREEN_NAMES[screen] || "";
  if (typeof announce === "function" && name) announce(name);
  const head = host.querySelector("h1, h2");
  if (!head) return;
  // tabindex="-1": фокус ставится программно, но в обход табом заголовок
  // не попадает — иначе он мешал бы всем остальным.
  head.setAttribute("tabindex", "-1");
  head.focus({ preventScroll: true });
}

function resetTestScreen() {
  document.getElementById("test-intro").classList.remove("hidden");
  document.getElementById("test-run").classList.add("hidden");
  document.getElementById("test-result").classList.add("hidden");
  if (state.user) {
    document.getElementById("test-hello").textContent =
      `${state.user.name}, посчитаем, сколько слов ты уже знаешь`;
  }
}

document.addEventListener("click", e => {
  const nav = e.target.closest("[data-nav]");
  if (nav) show(nav.dataset.nav);
});

// ===== Регистрация / вход =====
let authMode = "register";

/** Переключение «Регистрация ↔ Вход».
 *
 * Раньше вкладка меняла только подписи, а отправка формы в любом случае
 * заводила НОВЫЙ аккаунт — человек с готовым аккаунтом вводил имя
 * и попадал на тест уровня с нуля. Теперь режим меняет и поля, и то,
 * какой запрос уйдёт на сервер. */
function setAuthMode(mode) {
  authMode = mode;
  const login = mode === "login";
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("active", t.dataset.tab === mode));

  // Имя спрашиваем только при регистрации: при входе человека опознаёт почта
  const nameRow = document.getElementById("name-row");
  nameRow.classList.toggle("hidden", login);
  document.getElementById("reg-name").required = !login;

  // Почта при входе обязательна — это и есть логин
  document.getElementById("reg-email").required = login;
  document.getElementById("email-hint").textContent = login
    ? "Тот адрес, который указывал при регистрации."
    : "Нужен, чтобы входить с любого устройства.";

  const pass = document.getElementById("reg-password");
  pass.required = login;
  pass.setAttribute("autocomplete", login ? "current-password" : "new-password");
  document.getElementById("password-hint").textContent = login
    ? "Не помнишь пароль — пришлю код на почту."
    : "Можно не задавать — тогда вход будет по личному коду, он покажется после теста.";
  // Ссылка на сброс нужна только там, где вводят пароль для входа:
  // при регистрации пароля ещё нет, и «забыл» звучало бы издевательски.
  const forgot = document.getElementById("show-reset");
  if (forgot) forgot.classList.toggle("hidden", !login);

  // Согласие даётся один раз, при регистрации
  const consent = document.getElementById("reg-consent");
  const crow = consent && consent.closest(".consent-row");
  if (crow) crow.classList.toggle("hidden", login);
  if (consent) consent.required = !login;

  document.getElementById("auth-submit").textContent = login ? "Войти" : "Создать аккаунт";

  // Пришедшему по ссылке репетитора почту И ПАРОЛЬ при регистрации не
  // показываем вовсе: вход у него по личному коду, который видит
  // репетитор (см. initInvite в sync.js — меньше данных о детях).
  // Раньше initInvite прятал только почту и только один раз: поле
  // пароля оставалось и требовало почту, которой негде ввести, — тупик
  // (скрин от Алёны); а вкладка «Вход» наследовала спрятанную почту
  // и тоже становилась тупиком. Теперь правила применяются при каждом
  // переключении вкладок: регистрация — имя и согласие, вход — как у всех.
  if (window.pendingInvite) {
    document.getElementById("email-row").classList.toggle("hidden", !login);
    document.getElementById("password-row").classList.toggle("hidden", !login);
  }

  const err = document.getElementById("auth-error");
  if (err) err.textContent = "";
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.tab));
});

function authError(text) {
  const err = document.getElementById("auth-error");
  if (err) err.textContent = text || "";
}

document.getElementById("auth-form").addEventListener("submit", async e => {
  e.preventDefault();
  authError("");
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;

  // ---- ВХОД по почте и паролю ----
  if (authMode === "login") {
    if (!email || !password) { authError("Нужны почта и пароль."); return; }
    const btn = document.getElementById("auth-submit");
    btn.disabled = true;
    btn.textContent = "Проверяю…";
    const ok = typeof loginByPassword === "function" && await loginByPassword(email, password);
    btn.disabled = false;
    btn.textContent = "Войти";
    if (!ok) return;                 // текст ошибки поставил loginByPassword
    // Пришёл по ссылке репетитора, но аккаунт уже был — привязываем его,
    // а не теряем приглашение молча: раньше pendingInvite после входа
    // никто не потреблял, и ученик оставался без репетитора, не зная
    // об этом (нашлось при прогоне всех путей входа).
    if (window.pendingInvite) {
      try {
        const res = await api("/api/student/adopt",
          { token: localStorage.getItem("savelyStudentToken"), code: window.pendingInvite.code });
        if (res.ok) {
          localStorage.setItem("savelyTutorName", res.tutorName || "");
        } else {
          // Сообщение — на главную, куда человек сейчас попадёт
          const note = document.getElementById("adopt-note");
          if (note) {
            note.classList.remove("hidden");
            note.innerHTML = `<div class="card hw-card"><p class="muted-small">Войти вошёл, `
              + `а привязать к репетитору не вышло: ${esc(res.error || "попробуй по ссылке ещё раз")}</p></div>`;
          }
        }
      } catch (e) { /* сеть мигнула — привязка по ссылке сработает при следующем заходе */ }
      window.pendingInvite = null;
    }
    updateChrome();
    show(state.level ? "dashboard" : "test");
    return;
  }

  // ---- РЕГИСТРАЦИЯ ----
  const name = document.getElementById("reg-name").value.trim();
  // Сервер требует имя от двух букв — говорим это ЗДЕСЬ, пока форма
  // на экране, а не глотаем отказ после ухода на тест.
  if (name.length < 2) {
    authError("Напиши имя — хотя бы две буквы. Можно просто «Ваня».");
    return;
  }
  // Браузер и сам не пропустит required, но форму отправляют и с
  // клавиатуры, и скриптом — проверяем ещё раз здесь. Видимость
  // смотрим у строки согласия: hidden прячет её, а не сам чекбокс.
  const consent = document.getElementById("reg-consent");
  const consentRow = consent && consent.closest(".consent-row");
  if (consent && consentRow && !consentRow.classList.contains("hidden")
      && consent.required && !consent.checked) {
    authError("Отметь согласие на обработку данных — без него никак.");
    consent.focus();
    return;
  }
  // Пришедшему по ссылке поля почты и пароля не показываются — и что бы
  // ни влило в скрытые поля автозаполнение браузера, держать регистрацию
  // они не должны: у такого ученика вход по личному коду.
  const invited = !!window.pendingInvite;
  // Пароль проверяем ДО создания аккаунта: короткий пароль сервер отвергнет,
  // а ученик к этому моменту уже уедет на тест и ошибки не увидит.
  if (!invited && password && password.length < 8) {
    authError("Пароль — хотя бы 8 символов. Или оставь поле пустым.");
    return;
  }
  if (!invited && password && !email) {
    authError("С паролем нужна и почта — по ней будешь входить.");
    return;
  }
  state.user = { name, email };
  saveState();
  // ЖДЁМ ответа сервера, не уезжая с формы. Раньше сабмит уводил на тест
  // сразу, а отказы («мест нет», «почта занята», «такое имя уже есть»)
  // приходили в спрятанный экран и глотались: ученик был уверен, что
  // зарегистрирован у репетитора, хотя на сервере его не было. Офлайн
  // по-прежнему не задерживает: намерение сохранено и догонит фоном.
  const btn = document.getElementById("auth-submit");
  btn.disabled = true;
  btn.textContent = "Создаю…";
  let outcome = { ok: true };
  if (window.pendingInvite) {
    if (typeof joinTutor === "function") outcome = (await joinTutor(name)) || { ok: true };
  } else if (typeof registerStandalone === "function") {
    outcome = (await registerStandalone(name, email, password)) || { ok: true };
  }
  btn.disabled = false;
  btn.textContent = "Создать аккаунт";
  if (!outcome.ok) {
    // Остаёмся на форме: ошибка перед глазами, её можно исправить.
    // При sameName текст не нужен — под формой уже выбор «это я / другой».
    if (!outcome.shown) authError(outcome.error || "Не получилось. Попробуй ещё раз.");
    state.user = null;               // иначе перезагрузка увела бы с формы
    saveState();
    return;
  }
  updateChrome();
  if (state.level) {
    show("dashboard");
  } else {
    document.getElementById("test-hello").textContent =
      `${name}, посчитаем, сколько слов ты уже знаешь`;
    show("test");
  }
});

// подтверждение без системного confirm() — он блокируется во встроенных браузерах
let logoutArmed = false;
let logoutTimer = null;
// вход по личному коду (перенос прогресса с другого устройства)
/* Три карточки входа: обычная (вкладки), вход по личному коду и новый
 * пароль по письму. Показываем строго одну.
 *
 * Раньше переключение искало «ту, которая не #restore-card», — и стоило
 * появиться третьей карточке, как оно начало прятать не ту. Поэтому
 * теперь карточки перечислены поимённо: добавится четвёртая — правило
 * не сломается молча. */
const AUTH_CARDS = ["auth-main-card", "restore-card", "reset-card"];
function showAuthCard(id) {
  AUTH_CARDS.forEach(x => {
    const el = document.getElementById(x);
    if (el) el.classList.toggle("hidden", x !== id);
  });
}
document.getElementById("show-restore").addEventListener("click", () => showAuthCard("restore-card"));
document.getElementById("hide-restore").addEventListener("click", () => showAuthCard("auth-main-card"));
document.getElementById("reset-back").addEventListener("click", () => showAuthCard("auth-main-card"));
document.getElementById("show-reset").addEventListener("click", () => {
  showAuthCard("reset-card");
  // Почту переносим из формы входа: человек её только что вводил,
  // заставлять набирать второй раз — грубо.
  const typed = document.getElementById("reg-email").value.trim();
  if (typed) document.getElementById("reset-email").value = typed;
  document.getElementById("reset-email").focus();
});

/* Шаг 1: отправить код. Ответ всегда одинаковый, даже если такой почты
 * у нас нет, — так устроена и серверная ручка. Поэтому текст говорит
 * «если аккаунт есть», а не «письмо отправлено». */
document.getElementById("reset-send").addEventListener("click", async () => {
  const email = document.getElementById("reset-email").value.trim();
  const msg = document.getElementById("reset-msg");
  const btn = document.getElementById("reset-send");
  msg.className = "type-feedback";
  if (!email || !email.includes("@")) { msg.textContent = "Проверь адрес почты."; return; }
  btn.disabled = true;
  btn.textContent = "Отправляю…";
  try {
    await api("/api/student/reset/send", { email });
  } catch (e) {
    msg.className = "type-feedback err";
    msg.textContent = "Сервер не отвечает. Попробуй позже.";
    btn.disabled = false;
    btn.textContent = "Прислать код";
    return;
  }
  btn.disabled = false;
  btn.textContent = "Прислать код ещё раз";
  document.getElementById("reset-step2").hidden = false;
  msg.className = "type-feedback ok";
  msg.textContent = "Если аккаунт с такой почтой есть, код уже летит. Загляни в письмо — "
                  + "и проверь папку «Спам», письма от котов туда попадают.";
  document.getElementById("reset-code").focus();
});

/* Шаг 2: код и новый пароль. При успехе человек сразу внутри. */
document.getElementById("reset-apply").addEventListener("click", async () => {
  const email = document.getElementById("reset-email").value.trim();
  const code = document.getElementById("reset-code").value.trim();
  const password = document.getElementById("reset-password").value;
  const msg = document.getElementById("reset-msg");
  const btn = document.getElementById("reset-apply");
  msg.className = "type-feedback";
  if (code.length < 4) { msg.textContent = "Впиши код из письма — шесть цифр."; return; }
  if (password.length < 8) { msg.textContent = "Пароль — хотя бы 8 символов."; return; }
  btn.disabled = true;
  btn.textContent = "Проверяю…";
  const err = typeof resetByEmailCode === "function"
    ? await resetByEmailCode(email, code, password)
    : "Нет связи с сервером.";
  btn.disabled = false;
  btn.textContent = "Задать пароль и войти";
  if (err) {
    msg.className = "type-feedback err";
    msg.textContent = err;
    return;
  }
  updateChrome();
  show(state.level ? "dashboard" : "test");
});
document.getElementById("restore-btn").addEventListener("click", async () => {
  const msg = document.getElementById("restore-msg");
  const code = document.getElementById("restore-code").value.trim();
  if (!code) { msg.className = "type-feedback err"; msg.textContent = "Введи код."; return; }
  msg.className = "type-feedback";
  msg.textContent = "Проверяю…";
  try {
    const res = await restoreByCode(code);
    if (!res.ok) { msg.className = "type-feedback err"; msg.textContent = res.error; return; }
    msg.className = "type-feedback ok";
    msg.textContent = "Готово! Прогресс перенесён.";
    setTimeout(() => location.reload(), 900);
  } catch (e) {
    msg.className = "type-feedback err";
    msg.textContent = "Сервер недоступен. Попробуй позже.";
  }
});

/** Уходит ли прогресс на сервер. Если да — выход безопасен: словарь,
 *  очки и расписание повторений остаются там, и по личному коду человек
 *  вернётся с любого устройства. Если нет (демо-режим без репетитора),
 *  выход — это и правда стирание, и говорить надо именно так. */
function progressIsOnServer() {
  return !!(localStorage.getItem("savelyStudentToken") && state.restoreCode);
}

function doLogout() {
  // Токен стираем вместе с состоянием. Иначе после перезагрузки
  // синхронизация отправит на сервер пустой снимок и затрёт репетитору
  // весь прогресс этого ученика.
  if (typeof stopSync === "function") stopSync();
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("savelyStudentToken");
  localStorage.removeItem("savelyTutorName");
  // Отложенное приглашение по ссылке репетитора. Его тут не стирали, и
  // на общем компьютере — а это школа, продлёнка, домашний ноутбук на
  // двоих — следующий человек после регистрации молча привязывался к
  // ЧУЖОМУ репетитору по ссылке, которую открывал не он.
  localStorage.removeItem("savelyPendingJoin");
  location.reload();
}

/* Выход был устроен как «сбросить всё»: одна кнопка, никакого способа
   просто пересесть. А устройство сплошь и рядом общее — планшет на двоих
   детей, компьютер в классе, — и второму ученику приходилось стирать
   первого. При этом прогресс всё это время лежал на сервере: терялся не он,
   а ВОЗМОЖНОСТЬ ВЕРНУТЬСЯ, потому что личный код никто не записывал.
   Поэтому теперь выход показывает код и требует подтвердить, что он
   записан, а стирание вынесено отдельным действием. */
document.getElementById("logout-btn").addEventListener("click", openLogoutModal);

/* Ролик на экране регистрации.
 *
 * До нажатия на странице только заставка. По нажатию подставляем <video>
 * и запускаем — это единственный момент, когда полтора мегабайта
 * оправданы: человек сам попросил. Никакого автозапуска: звука в ролике
 * нет, но самопроизвольно играющее видео раздражает и съедает трафик. */
document.addEventListener("DOMContentLoaded", () => {
  const play = document.getElementById("intro-play");
  const box = document.getElementById("intro-video");
  if (!play || !box) return;
  play.addEventListener("click", () => {
    const v = document.createElement("video");
    // Версию берём из разметки (data-v на блоке), а её проставляет
    // tools/bump.py вместе со всей статикой. Без этого перевыпущенный
    // ролик не доезжал: сервис-воркер видео не трогает, но HTTP-кэш
    // браузера держит старый файл — методист неделю смотрела прошлую
    // версию и сообщала об уже исправленном тексте.
    const ver = box.dataset.v ? "?v=" + box.dataset.v : "";
    v.src = "video/tour.mp4" + ver;
    v.poster = "video/tour-poster.jpg" + ver;
    v.controls = true;
    v.playsInline = true;                 // иначе iPhone открывает во весь экран
    v.preload = "auto";
    v.setAttribute("aria-label", "Как заниматься на сайте");
    box.innerHTML = "";
    box.appendChild(v);
    v.play().catch(() => { /* не дали автозапуск — остаются кнопки плеера */ });
  });
});

/** Открыть окно выхода. Раньше оно вызывалось только из шапки, а шапка
 *  появляется лишь после теста — и тот, кто ввёл имя и ушёл, оставался
 *  заперт на экране теста. Теперь то же окно доступно и оттуда. */
function openLogoutModal() {
  const box = document.getElementById("logout-modal");
  const safe = progressIsOnServer();
  document.getElementById("logout-code").textContent = state.restoreCode || "—";
  document.getElementById("logout-code-row").classList.toggle("hidden", !safe);
  document.getElementById("logout-safe").classList.toggle("hidden", !safe);
  document.getElementById("logout-unsafe").classList.toggle("hidden", safe);
  // Кнопка ждёт отметки в ЛЮБОМ случае: своя галочка есть и там, и там.
  document.getElementById("logout-ack").checked = false;
  const unsafeAck = document.getElementById("logout-ack-unsafe");
  if (unsafeAck) unsafeAck.checked = false;
  document.getElementById("logout-go").disabled = true;
  openModal(box);
}

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const box = $("logout-modal");
  if (!box) return;

  // Выход с экрана теста: «Это не твой аккаунт? Войти под другим».
  const switchBtn = $("test-switch");
  if (switchBtn) switchBtn.addEventListener("click", () => {
    // Помечаем намерение: после перезагрузки откроем сразу вкладку «Вход»,
    // а не регистрацию — человек шёл входить, а не заводить третий аккаунт.
    try { sessionStorage.setItem("savelyWantLogin", "1"); } catch (e) {}
    openLogoutModal();
  });

  const gate = () => {
    // Смотрим на ту галочку, которая сейчас на экране
    const safe = !$("logout-safe").classList.contains("hidden");
    const box2 = safe ? $("logout-ack") : $("logout-ack-unsafe");
    $("logout-go").disabled = !(box2 && box2.checked);
  };
  $("logout-ack").addEventListener("change", gate);
  const unsafeAck = $("logout-ack-unsafe");
  if (unsafeAck) unsafeAck.addEventListener("change", gate);
  $("logout-cancel").addEventListener("click", () => closeModal(box));
  $("logout-go").addEventListener("click", doLogout);

  $("logout-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.restoreCode || "");
      $("logout-copy").textContent = "Скопировано";
    } catch (e) {
      // Буфер недоступен (нет https или отказали в доступе) — выделяем
      // код, чтобы его можно было скопировать руками.
      const r = document.createRange();
      r.selectNodeContents($("logout-code"));
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      $("logout-copy").textContent = "Выделено — скопируй";
    }
  });

  // Стирание — отдельное действие с отдельным подтверждением: оно
  // необратимо, и путать его с обычным выходом нельзя.
  let wipeArmed = false, wipeTimer = null;
  $("logout-wipe").addEventListener("click", () => {
    const b = $("logout-wipe");
    if (!wipeArmed) {
      wipeArmed = true;
      b.textContent = "точно стереть? нажми ещё раз";
      b.classList.add("danger");
      wipeTimer = setTimeout(() => {
        wipeArmed = false;
        b.textContent = "стереть прогресс с этого устройства";
        b.classList.remove("danger");
      }, 4000);
      return;
    }
    clearTimeout(wipeTimer);
    doLogout();
  });
});

function updateChrome() {
  if (state.user) document.getElementById("user-name-chip").textContent = state.user.name;
  document.getElementById("user-level-chip").textContent = state.level || "—";
  document.getElementById("dict-count").textContent = state.dictionary.length;
  const rank = rankInfo(state.xp);
  const xpChip = document.getElementById("xp-chip");
  xpChip.innerHTML = `${iconInline("star", 15)} ${state.xp}`;
  xpChip.title = rank.name + (rank.next ? ` · до «${rank.next.name}» ${rank.next.xp - state.xp} очков` : "");
  const s = streakDays();
  const streakChip = document.getElementById("streak-chip");
  streakChip.classList.toggle("hidden", s < 2);
  streakChip.innerHTML = `${iconInline("streak", 15)} ${s}`;
}

// ===== Тест словарного запаса =====
// Шесть слов на уровень вместо пяти: банк вырос до 554 слов, и лишний
// вопрос заметно снижает шум — при пяти один случайный промах сдвигал
// оценку на целую ступень. Тест удлиняется с 30 вопросов до 36.
const TEST_PER_LEVEL = 6;

/* ── Слова-обманки ────────────────────────────────────────────────────
 *
 * Тест спрашивает «знаешь это слово?» и верит на слово. Это быстро —
 * тридцать шесть ответов за полторы минуты, — но ученик может отвечать
 * «знаю» из вежливости, из азарта или потому что слово кажется знакомым.
 * Тогда уровень выходит завышенным, а дальше человек получает слова,
 * которые ему не по зубам, и бросает.
 *
 * Приём известный (его используют в LexTALE и других тестах словарного
 * запаса): подмешать несуществующие слова, построенные по правилам
 * английского. Знать их нельзя — значит каждое «знаю» здесь показывает,
 * насколько завышены остальные ответы.
 *
 * Слова придуманы так, чтобы читались по-английски и не были похожи
 * ни на одно настоящее: ни корня, ни узнаваемой приставки.
 */
const FAKE_WORDS = [
  "brindle-plack", "morkish", "plunthy", "sprandle", "gorbex", "trellick",
  "vurnish", "clabbot", "shomble", "grindley", "fandick", "quorbin",
];
const FAKE_IN_TEST = 6;         // из 36 настоящих — шесть подмешанных

/* Сколько «знаю» на обманках во сколько раз режет доверие к ответам.
 * Одна случайная ошибка бывает у всех — она почти ничего не меняет;
 * четыре и больше означают, что человек нажимал «знаю» не глядя. */
function honestyFactor(fakeYes) {
  if (fakeYes <= 1) return 1;
  if (fakeYes === 2) return 0.85;
  if (fakeYes === 3) return 0.7;
  return 0.5;
}
let testWords = [];
let testIndex = 0;
let testAnswers = {}; // level -> known count
let fakeYes = 0;      // сколько раз сказал «знаю» о несуществующем слове

function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

document.getElementById("start-test-btn").addEventListener("click", async () => {
  const btn = document.getElementById("start-test-btn");
  // Первая точка, где словарь действительно нужен. У нового ученика его
  // ещё нет — на медленной сети это несколько секунд, и молчащая кнопка
  // выглядит как поломка. Поэтому говорим, что происходит.
  if (typeof WORDS === "undefined" || typeof LEVEL_TEST_WORDS === "undefined") {
    const was = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Достаю слова…";
    try {
      await Promise.all([ensureWords(), ensureLevelTest()]);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = was;
      const hint = document.getElementById("test-hello");
      if (hint) hint.textContent = "Не получилось загрузить слова. Проверь связь и нажми ещё раз.";
      return;
    }
    btn.disabled = false;
    btn.textContent = was;
  }
  testWords = [];
  LEVELS.forEach(lvl => {
    // Берём из отобранных наборов (js/leveltest.js): самые частотные слова
    // уровня. Раньше брали случайные из всего банка — и в A2 попадались
    // «nowadays» и «illegal», а в B1 «flute». Блок выходил лотереей, и один
    // ученик получал то A2, то C1. Если набор почему-то не подгрузился,
    // откатываемся на прежнее поведение: тест важнее идеальных слов.
    const pool = (typeof LEVEL_TEST_WORDS !== "undefined" && LEVEL_TEST_WORDS[lvl])
      ? LEVEL_TEST_WORDS[lvl].map(w => ({ w }))
      : WORDS[lvl];
    sample(pool, TEST_PER_LEVEL).forEach(w => testWords.push({ ...w, level: lvl }));
  });
  // Обманки раскидываем по всему тесту, а не кучей в конце: иначе они
  // читаются как отдельный «странный блок» и ученик настораживается.
  sample(FAKE_WORDS, FAKE_IN_TEST).forEach(w => {
    const at = 2 + Math.floor(Math.random() * (testWords.length - 2));
    testWords.splice(at, 0, { w, fake: true });
  });
  fakeYes = 0;
  testIndex = 0;
  testAnswers = {};
  LEVELS.forEach(l => testAnswers[l] = 0);
  document.getElementById("test-intro").classList.add("hidden");
  document.getElementById("test-run").classList.remove("hidden");
  renderTestWord();
});

function renderTestWord() {
  const total = testWords.length;
  document.getElementById("quiz-word").textContent = testWords[testIndex].w;
  document.getElementById("test-counter").textContent = `${testIndex + 1} / ${total}`;
  document.getElementById("test-progress").style.width = `${(testIndex / total) * 100}%`;
  // Полоску прогресса видно глазами; для программы чтения то же самое
  // говорят эти два числа.
  const bar = document.getElementById("test-progress-bar");
  if (bar) {
    bar.setAttribute("aria-valuemax", total);
    bar.setAttribute("aria-valuenow", testIndex);
  }
}

function answerTest(knows) {
  const cur = testWords[testIndex];
  if (cur.fake) {
    if (knows) fakeYes++;
  } else if (knows) {
    testAnswers[cur.level]++;
  }
  testIndex++;
  if (testIndex < testWords.length) {
    renderTestWord();
  } else {
    finishTest();
  }
}

document.getElementById("btn-know").addEventListener("click", () => answerTest(true));
document.getElementById("btn-dont-know").addEventListener("click", () => answerTest(false));

/* Ожидаемая доля знакомых слов: насколько выше или ниже своего уровня
 * стоит слово. Цифры не выдуманы — это то, как ведёт себя ученик:
 * своё знает уверенно, но не всё; на уровень выше знает примерно треть;
 * на два выше — единицы. */
const LEVEL_HIT = [0.97, 0.92, 0.75, 0.35, 0.12, 0.04];
function levelHit(assumed, wordLevel) {
  const d = wordLevel - assumed;
  return d <= -2 ? LEVEL_HIT[0] : d === -1 ? LEVEL_HIT[1] : d === 0 ? LEVEL_HIT[2]
       : d === 1 ? LEVEL_HIT[3] : d === 2 ? LEVEL_HIT[4] : LEVEL_HIT[5];
}

/** Уровень по ВСЕЙ картине ответов, а не по порогам на каждом блоке.
 *
 * Было: «самый высокий уровень, где знает 60% и в среднем держит всё ниже».
 * Такое правило принимает решение по шести ответам одного блока, и один
 * неудачный блок сдвигал результат на уровень. Методист прислала случай:
 * ученица проходила трижды и получила A2, C1 и B1.
 *
 * Стало: перебираем все шесть уровней и спрашиваем, какой из них лучше
 * объясняет ВСЕ 36 ответов разом. Считаем это правдоподобием — насколько
 * вероятно получить именно такие ответы, будь у ученика такой уровень.
 * Один неудачный блок больше не решает: его перевешивают остальные пять.
 *
 * На модели ученика (20 000 прогонов на уровень) точность выросла
 * с 77 до 86 процентов, а промахи сразу на два уровня исчезли совсем. */
function estimateLevelIndex(answers) {
  let best = 0, bestScore = -Infinity;
  LEVELS.forEach((_, assumed) => {
    let score = 0;
    LEVELS.forEach((lvl, i) => {
      const known = answers[lvl] || 0;
      const p = levelHit(assumed, i);
      score += known * Math.log(p) + (TEST_PER_LEVEL - known) * Math.log(1 - p);
    });
    if (score > bestScore) { bestScore = score; best = assumed; }
  });
  return best;
}

/* ── Проверочная лесенка ──────────────────────────────────────────────
 *
 * «Знаю / не знаю» меряет узнавание, а не знание: слово может казаться
 * знакомым по виду. Поэтому после быстрой разведки идут НАСТОЯЩИЕ
 * вопросы — но не тридцать подряд (семь минут, ребёнок бросит),
 * а адаптивной лесенкой, как предложила методист.
 *
 * Как идёт. Начинаем с уровня, который назвала разведка. Блок — четыре
 * вопроса уровня: два «выбери перевод» и два «какое слово подходит
 * в предложении» (перевод проверяет значение, пропуск — умение узнать
 * слово в живой фразе). Взял 3 из 4 — уровень пройден, поднимаемся;
 * меньше — спускаемся. Останавливаемся, когда граница найдена: сверху
 * уровень провален, снизу пройден. Обычно это 4–12 вопросов.
 *
 * Случайное тыканье лесенка режет сама: шанс пройти блок наугад — 5%,
 * и каждый проваленный блок опускает результат.
 *
 * Каждый ответ запоминается пословно (слово, тип вопроса, верно ли):
 * из промахов складывается «первые слова в словарь» на экране итога —
 * тест не только меряет, но и сразу даёт, что учить.
 */
const STAIR_BLOCK = 4;          // вопросов в блоке
const STAIR_PASS = 3;           // сколько верных считается «уровень пройден»
const STAIR_MAX_BLOCKS = 4;     // предохранитель: дальше решаем по тому, что есть

let stair = null;               // состояние лесенки на время теста

function stairPool(lvl) {
  return (WORDS[lvl] || []).filter(w => w.w && w.t).map(w => ({ ...w, level: lvl }));
}

/** Блок вопросов одного уровня: 2 перевода + 2 пропуска в предложении.
 *  Пропуск требует пример с самим словом; не хватило — добираем переводом. */
function buildStairBlock(lvl) {
  const pool = stairPool(lvl);
  const withEx = pool.filter(w => w.ex && w.ex.toLowerCase().includes(w.w.toLowerCase()));
  const qs = [];
  const used = new Set();
  sample(withEx, 2).forEach(w => {
    used.add(w.w);
    const re = new RegExp("\\b" + w.w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i");
    const wrong = sample(pool.filter(x => x.w !== w.w), 3).map(x => x.w);
    const options = shuffleArr([w.w, ...wrong]);
    qs.push({ kind: "gap", word: w, prompt: w.ex.replace(re, "____"),
              options, right: options.indexOf(w.w) });
  });
  sample(pool.filter(w => !used.has(w.w)), STAIR_BLOCK - qs.length).forEach(w => {
    const wrong = sample(pool.filter(x => x.w !== w.w && x.t !== w.t), 3).map(x => x.t);
    const options = shuffleArr([w.t, ...wrong]);
    qs.push({ kind: "tr", word: w, prompt: w.w, options, right: options.indexOf(w.t) });
  });
  return shuffleArr(qs);
}

function shuffleArr(a) { return [...a].sort(() => Math.random() - 0.5); }

function startStaircase(levelIdx) {
  stair = {
    lvl: levelIdx,
    passed: {}, failed: {},     // уровни, где блок взят / провален
    best: -1,                   // высший пройденный
    blocks: 0,
    right: 0, total: 0,         // общий счёт для честного итога
    log: [],                    // пословная диагностика
    qs: [], qi: 0, blockRight: 0,
  };
  document.getElementById("test-run").classList.add("hidden");
  document.getElementById("test-verify").classList.remove("hidden");
  stairNextBlock();
}

function stairNextBlock() {
  stair.qs = buildStairBlock(LEVELS[stair.lvl]);
  if (!stair.qs.length) { stairFinish(); return; }
  stair.blocks++;
  stair.qi = 0;
  stair.blockRight = 0;
  renderStairQ();
}

function renderStairQ() {
  const q = stair.qs[stair.qi];
  document.getElementById("verify-counter").textContent =
    `вопрос ${stair.total + 1} · уровень ${LEVELS[stair.lvl]}`;
  document.getElementById("verify-label").textContent =
    q.kind === "tr" ? "Что это слово значит?" : "Какое слово подходит?";
  const prompt = document.getElementById("verify-prompt");
  prompt.textContent = q.prompt;
  prompt.classList.toggle("verify-sentence", q.kind === "gap");
  prompt.lang = "en";
  const box = document.getElementById("verify-options");
  box.innerHTML = "";
  q.options.forEach((opt, i) => {
    const b = document.createElement("button");
    b.className = "btn btn-ghost verify-option";
    b.textContent = opt;
    if (q.kind === "gap") b.lang = "en";
    b.addEventListener("click", () => {
      const ok = i === q.right;
      if (ok) { stair.blockRight++; stair.right++; }
      stair.total++;
      stair.log.push({ w: q.word.w, t: q.word.t, ex: q.word.ex || "",
                       level: q.word.level, kind: q.kind, ok });
      stair.qi++;
      if (stair.qi < stair.qs.length) renderStairQ();
      else stairDecide();
    }, { once: true });
    box.appendChild(b);
  });
}

function stairDecide() {
  const L = stair.lvl;
  if (stair.blockRight >= STAIR_PASS) {
    stair.passed[L] = true;
    stair.best = Math.max(stair.best, L);
    // Выше некуда или выше уже провалено — граница найдена
    if (L === LEVELS.length - 1 || stair.failed[L + 1]) { stairFinish(); return; }
    stair.lvl = L + 1;
  } else {
    stair.failed[L] = true;
    // Ниже некуда — остаёмся на первом уровне: учить с азов не стыдно
    if (L === 0) { stairFinish(); return; }
    // Ниже уже пройдено — граница найдена
    if (stair.passed[L - 1]) { stairFinish(); return; }
    stair.lvl = L - 1;
  }
  if (stair.blocks >= STAIR_MAX_BLOCKS) {
    // Предохранитель по длине: дальше не спрашиваем, чтобы тест не
    // растянулся. Уровень всё равно считается по всем ответам сразу.
    stairFinish();
    return;
  }
  stairNextBlock();
}

/* Вероятность верного ответа на вопрос уровня q при истинном уровне a.
 * Четыре варианта, поэтому даже незнакомое слово угадывается в четверти
 * случаев — это в модели учтено, иначе один случайный промах весил бы
 * больше, чем он весит на самом деле. */
function stairHit(assumed, qLevel) {
  const d = qLevel - assumed;
  const know = d <= -1 ? 0.95 : d === 0 ? 0.80 : d === 1 ? 0.40 : d === 2 ? 0.15 : 0.05;
  return know + (1 - know) * 0.25;
}

/** Итоговый уровень — по ВСЕМ ответам сразу: и разведке, и лесенке.
 *
 * Было: уровень ставила одна лесенка, а 36 ответов разведки выбрасывались.
 * Блок — четыре вопроса с планкой «три из четырёх», и двух неудачных
 * блоков подряд хватало, чтобы человек, узнавший почти все слова,
 * получил A1. Владелец так и написал: «почти на всё ответил правильно,
 * а он написал A1».
 *
 * Стало: спрашиваем, какой уровень лучше объясняет всё разом — и то,
 * какие слова человек узнал, и как он ответил на настоящие вопросы.
 * Лесенка по-прежнему решает, ЧТО спрашивать дальше; но приговор
 * выносится по всем данным.
 *
 * На модели ученика (20 000 прогонов на уровень) точность выросла
 * с 62 до 91 процента, а промахи на два уровня исчезли совсем. */
function combinedLevelIndex(answers, log) {
  let best = 0, bestScore = -Infinity;
  LEVELS.forEach((_, assumed) => {
    let score = 0;
    // сколько слов каждого уровня человек назвал знакомыми
    LEVELS.forEach((lvl, i) => {
      const known = answers[lvl] || 0;
      const p = levelHit(assumed, i);
      score += known * Math.log(p) + (TEST_PER_LEVEL - known) * Math.log(1 - p);
    });
    // и как он ответил на настоящие вопросы
    (log || []).forEach(a => {
      const qi = LEVELS.indexOf(a.level);
      if (qi < 0) return;
      const p = stairHit(assumed, qi);
      score += a.ok ? Math.log(p) : Math.log(1 - p);
    });
    if (score > bestScore) { bestScore = score; best = assumed; }
  });
  return best;
}

function stairFinish() {
  document.getElementById("test-verify").classList.add("hidden");
  applyLevel(combinedLevelIndex(testAnswers, stair.log), stair.right, stair.total);
}

function finishTest() {
  // Сначала — быстрая разведка по «знаю / не знаю», потом адаптивная
  // лесенка настоящих вопросов. Уровень ставит лесенка.
  startStaircase(estimateLevelIndex(testAnswers));
}

function applyLevel(levelIdx, right, total) {
  const level = LEVELS[levelIdx];
  // Оценка словарного запаса: доля знакомых слов уровня × его объём.
  // Никаких множителей «достигнут / не достигнут» — они делали оценку
  // немонотонной: ученик, ответивший верно БОЛЬШЕ раз, мог получить
  // запас меньше, чем тот, кто знал меньше.
  let vocab = 0;
  LEVELS.forEach(lvl => {
    vocab += (testAnswers[lvl] / TEST_PER_LEVEL) * LEVEL_VOCAB_SIZE[lvl];
  });
  // Поправка на честность: «знаю» на выдуманных словах означает, что
  // и остальные «знаю» надо делить. Без неё запас раздувается вдвое.
  vocab *= honestyFactor(fakeYes);
  // Потолок по уровню: ученик, не знающий базовых слов, но угадавший
  // несколько редких, иначе получал бы «уровень A1, запас 14800 слов».
  let cap = 0;
  LEVELS.forEach((lvl, i) => {
    if (i <= LEVELS.indexOf(level)) cap += LEVEL_VOCAB_SIZE[lvl];
    else if (i === LEVELS.indexOf(level) + 1) cap += LEVEL_VOCAB_SIZE[lvl] * 0.5;
  });
  vocab = Math.round(Math.min(vocab, cap) / 50) * 50;

  state.level = level;
  state.vocabEstimate = vocab;
  saveState();
  addXP(25);
  updateChrome();
  currentRecs = []; // после нового теста подберём слова заново

  document.getElementById("test-run").classList.add("hidden");
  document.getElementById("test-result").classList.remove("hidden");
  document.getElementById("result-level").textContent = level;
  document.getElementById("result-level-name").textContent = LEVEL_NAMES[level];
  document.getElementById("result-vocab").textContent = "~" + vocab;

  // Реплика кота — по структуре методиста: что понял, что НЕ буду
  // заставлять учить, что буду подбирать и что запомню. Обещание
  // «запомню, какие слова тебе даются труднее» — не фигура речи:
  // промахи теста прямо под этой репликой предлагаются в словарь.
  const next = LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)];
  const opening = {
    A1: "Начнём с самых нужных слов — их всего ничего, а разговор уже держится на них.",
    A2: "База у тебя есть — простейшее пропускаем, идём наращивать словарь.",
    B1: "Простые слова тебе уже неинтересны — не буду заставлять учить то, что ты и так знаешь.",
    B2: "Ходовые слова ты знаешь — за них не сядем ни разу.",
    C1: "Ты понимаешь почти всё — остались редкие и точные слова.",
    C2: "Мяу?! Может, это ТЫ будешь меня учить? Но пару красивых слов я всё же найду.",
  };
  document.getElementById("result-comment").textContent =
    `Я тебя понял! ${opening[level]} Буду подбирать тебе слова ${level}` +
    (next !== level ? `–${next}` : "") +
    ", постепенно усложняя задания. А ещё я запоминаю, какие слова тебе даются труднее, " +
    "и возвращаю их на повторение именно тогда, когда пора. Поехали!";
  // Итог проверки — по уровням, а не общим счётом. «4 из 8» звучало бы
  // как «еле-еле», хотя половина промахов у лесенки запланирована: она
  // щупает СЛЕДУЮЩИЙ уровень, пока ученик не упрётся. Поэтому говорим,
  // что именно нашли: этот уровень взят, следующий пока рано.
  const note = document.getElementById("result-verify");
  if (note && stair && stair.log.length) {
    const byLvl = {};
    stair.log.forEach(x => {
      byLvl[x.level] = byLvl[x.level] || { ok: 0, n: 0 };
      byLvl[x.level].n++;
      if (x.ok) byLvl[x.level].ok++;
    });
    const parts = [];
    const mine = byLvl[level];
    if (mine) parts.push(`вопросы уровня ${level} — ${mine.ok} из ${mine.n}`);
    const up = LEVELS[LEVELS.indexOf(level) + 1];
    if (up && byLvl[up]) parts.push(`${up} — пока рано (${byLvl[up].ok} из ${byLvl[up].n})`);
    note.hidden = false;
    note.textContent = "Проверка настоящими вопросами: " + parts.join(", ") + ".";
  }
  renderTestMissed();
  showResultCode();
}

/** Слова, на которых тест подловил, — забрать в словарь одним нажатием.
 *  Это и есть обещанное «запомню, что тебе даётся труднее»: тест не
 *  только ставит уровень, но и сразу даёт первый список на учёбу. */
function renderTestMissed() {
  const box = document.getElementById("result-missed");
  if (!box) return;
  const missed = [];
  ((stair && stair.log) || []).forEach(x => {
    if (x.ok) return;
    if (state.dictionary.some(d => d.w.toLowerCase() === x.w.toLowerCase())) return;
    if (!missed.some(m => m.w === x.w)) missed.push(x);
  });
  if (!missed.length) { box.hidden = true; return; }
  box.hidden = false;
  document.getElementById("result-missed-list").textContent =
    missed.map(m => `${m.w} — ${m.t}`).join(" · ");
  const btn = document.getElementById("result-missed-take");
  btn.disabled = false;
  btn.textContent = `Добавить ${missed.length} ${plural(missed.length, "слово", "слова", "слов")}`;
  btn.onclick = () => {
    missed.forEach(m => {
      addToDictionary({ w: m.w, t: m.t, ex: m.ex, level: m.level });
      // Слово пришло из промаха: помечаем это, чтобы повторения начались
      // с коротких интервалов, а не как у «просто нового» слова
      const rec = state.dictionary.find(d => d.w.toLowerCase() === m.w.toLowerCase());
      if (rec) rec.forgot = 1;
    });
    saveState();
    btn.disabled = true;
    btn.textContent = "В словаре, мяу!";
  };
}

/** Показать личный код на экране результата теста.
 *
 *  Код приходит с сервера при регистрации, а она идёт параллельно тесту
 *  (чтобы ребёнок не ждал сети) — поэтому к моменту показа результата его
 *  может ещё не быть. Тогда ждём и дорисовываем: без кода карточка не
 *  показывается вовсе, пустая рамка «твой код: —» хуже её отсутствия. */
function showResultCode() {
  const card = document.getElementById("result-code-card");
  if (!card) return;
  const draw = () => {
    if (!state.restoreCode) return false;
    document.getElementById("result-code").textContent = state.restoreCode;
    card.classList.remove("hidden");
    return true;
  };
  if (draw()) return;
  let tries = 0;
  const timer = setInterval(() => {
    if (draw() || ++tries > 20) clearInterval(timer);   // ждём до 10 секунд
  }, 500);
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("result-code-copy");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.restoreCode || "");
      btn.textContent = "скопировано";
    } catch (e) {
      btn.textContent = "выдели код и скопируй";
    }
  });
});

document.getElementById("to-dashboard-btn").addEventListener("click", () => show("dashboard"));

// ===== Главная: подбор слов =====
const RECOMMEND_COUNT = 6;

/** Слово, которое не стыдно показать карточкой на главной.
 *
 *  Словарь собран из двух источников. Вычитанное ядро — 2500 слов, у
 *  каждого есть перевод, пример с переводом, определение и категория.
 *  Импорт — ещё девять тысяч, и там сплошь и рядом только слово и
 *  перевод: примера нет, определения нет, категории нет. Доля полных
 *  записей по уровням: A1 и A2 — сто процентов, B1 — половина, B2 —
 *  шестая часть, C1 — шесть слов из ста.
 *
 *  Рекомендация — это большая карточка с картинкой, примером и кнопкой
 *  «добавить». Из неполной записи она собирается в огрызок: слово,
 *  перевод и пустота под ними. Для C1 это было не исключение, а норма.
 *  Поэтому карточки берём из полных записей, а неполные оставляем
 *  тренировкам — там достаточно пары «слово ↔ перевод».  */
function recQuality(w) {
  return !!(w && w.ex && w.cat);
}

function pickRecommendations() {
  // Словарь подгружается отдельно (см. «Старт» внизу файла). Пока он
  // едет, главная рисуется без карточек, а не падает; когда приедет —
  // renderDashboard зовут ещё раз.
  if (typeof WORDS === "undefined") return [];
  const lvl = studyLevel();
  const nextLvl = LEVELS[Math.min(LEVELS.indexOf(lvl) + 1, LEVELS.length - 1)];
  const inDict = new Set(state.dictionary.map(d => d.w));
  const seen = new Set(state.recommendSeen);

  // Отбор в два круга: сначала только полные записи, и лишь если их не
  // хватило — любые. Жёсткий фильтр оставил бы C1 без рекомендаций
  // совсем: там полных всего 369 на 5902, и они кончатся.
  const fit = (w, l) => !inDict.has(w.w) && !seen.has(w.w);
  const good = WORDS[lvl].filter(w => fit(w) && recQuality(w)).map(w => ({ ...w, level: lvl }));
  const poolMain = good.length >= 4
    ? good
    : [...good, ...WORDS[lvl].filter(w => fit(w) && !recQuality(w)).map(w => ({ ...w, level: lvl }))];
  const mainPicks = sample(poolMain, 4);
  // на C2 nextLvl совпадает с текущим — исключаем уже выбранное,
  // иначе одно слово попадает на главную двумя карточками сразу
  const takenNow = new Set(mainPicks.map(w => w.w));
  const fitNext = w => !inDict.has(w.w) && !seen.has(w.w) && !takenNow.has(w.w);
  const goodNext = WORDS[nextLvl].filter(w => fitNext(w) && recQuality(w))
    .map(w => ({ ...w, level: nextLvl }));
  const poolNext = goodNext.length >= 2
    ? goodNext
    : [...goodNext, ...WORDS[nextLvl].filter(w => fitNext(w) && !recQuality(w))
        .map(w => ({ ...w, level: nextLvl }))];

  let picks = [...mainPicks, ...sample(poolNext, 2)];
  // если свежие слова кончились — показываем уже виденные (но не из словаря)
  if (picks.length < RECOMMEND_COUNT) {
    // И в запасном круге сначала полные записи. Сортировать нельзя:
    // sample берёт случайные элементы, порядок ему безразличен —
    // поэтому именно два отдельных списка, как и выше.
    const rest = [...WORDS[lvl].map(w => ({ ...w, level: lvl })),
                  ...WORDS[nextLvl].map(w => ({ ...w, level: nextLvl }))]
      .filter(w => !inDict.has(w.w) && !picks.some(p => p.w === w.w));
    const restGood = rest.filter(recQuality);
    const fallback = restGood.length >= RECOMMEND_COUNT - picks.length
      ? restGood : rest;
    picks = [...picks, ...sample(fallback, RECOMMEND_COUNT - picks.length)];
  }
  picks.forEach(p => { if (!seen.has(p.w)) state.recommendSeen.push(p.w); });
  saveState();
  return picks;
}

let currentRecs = [];

function renderDashboard() {
  updateChrome();
  document.getElementById("dash-greeting").textContent =
    `Привет, ${state.user.name}! Мяу!`;
  // Подзаголовок раньше перечислял три факта, включая «в словаре: 0».
  // Новичку он сообщал ровно одно: у тебя ничего нет. Пока словарь пуст —
  // говорим только про уровень, счёт слов появляется, когда есть что считать.
  document.getElementById("dash-stats").textContent = state.dictionary.length
    ? `Уровень ${state.level} · в словаре ${state.dictionary.length} ${wordsWord(state.dictionary.length)}`
    : `Уровень ${state.level} · ${LEVEL_NAMES[state.level]}`;
  renderTodayCard();
  if (typeof renderTutorMessages === "function") renderTutorMessages();
  if (typeof renderHomework === "function") renderHomework();
  renderDashWidgets();
  renderLeaderboard();
  renderWordOfDay();
  if (!currentRecs.length) currentRecs = pickRecommendations();
  renderRecGrid();
  renderServiceLine();
}

function renderWordOfDay() {
  const box = document.getElementById("word-of-day");
  if (!box) return;
  // Пока словарь едет, блок прячем — но обязательно возвращаем обратно,
  // когда он приехал. Один раз добавленный hidden без парного remove
  // означал бы «слово дня пропало навсегда» для всех, кто зашёл на
  // главную раньше, чем догрузился словарь.
  box.classList.toggle("hidden", typeof WORDS === "undefined");
  if (typeof WORDS === "undefined") return;
  const pool = WORDS[studyLevel()] || WORDS.A1;
  const days = Math.floor(Date.now() / 86400000);
  const wd = pool[days % pool.length];
  const inDict = state.dictionary.some(d => d.w.toLowerCase() === wd.w.toLowerCase());
  box.innerHTML = `
    <div class="card wod-card">
      <div class="word-art word-art-small" aria-hidden="true" style="background:${wordTint(wd.cat)}">${wordArtHTML(wd.w, wd.cat)}</div>
      <span class="wod-label">${iconInline("paw", 16)} Слово дня</span>
      <!-- Слово, перевод и озвучка жили в одном текстовом потоке: строка
           «support 🔊   — поддерживать; поддержка» рвалась посреди фразы,
           а само слово терялось среди служебных знаков. Теперь три уровня:
           слово крупно, перевод под ним, кнопка отдельным контролом. -->
      <div class="wod-main">
        <b class="wod-word" lang="en">${esc(wd.w)}</b>
        <button class="say-btn wod-say-btn" id="wod-say"
                aria-label="Произношение: ${esc(wd.w)}">${icon("sound", 20)}</button>
      </div>
      <span class="wod-tr">${esc(wd.t)}</span>
      <span class="w-ex" lang="en">${esc(wd.ex)}</span>
      ${inDict
        ? `<span class="added">${iconInline("check", 16)} в словаре</span>`
        : `<button class="btn btn-primary btn-small" id="wod-add">+ В словарь</button>`}
    </div>`;
  document.getElementById("wod-say").addEventListener("click", () => speak(wd.w));
  const add = document.getElementById("wod-add");
  if (add) add.addEventListener("click", () => {
    addToDictionary({ ...wd, level: state.level });
    renderWordOfDay();
  });
}

function todayXP() {
  return (state.activity && state.activity[dayKey()]) || 0;
}

// ===== Главный блок «прямо сейчас» =====
// Раньше ученик после входа видел семь одинаковых плиток и нигде — кнопки
// «начать». Теперь на первом экране ровно одно действие, а всё остальное
// уехало ниже и стало мельче.

/** Что предложить ученику прямо сейчас — ровно одно решение на экран.
 *  Приоритет: домашка от репетитора → первый заход → повторение →
 *  закрытая цель → свободная тренировка.
 *  Функция только выбирает, что сказать; рисует renderTodayCard. */
function todayPlan() {
  const dict = state.dictionary;
  const s = dict.length ? srsSummary(dict) : { due: 0, tomorrow: 0 };
  const goal = state.goal || 50;
  const got = todayXP();

  // 1. Домашка. У неё есть срок и её ждёт живой человек — она важнее всего.
  // Словарная — пока не выучены все слова; задание-упражнение (свой набор
  // репетитора, грамматика, словообразование) — пока нет ни одного подхода.
  const hw = (state.homework || []).find(t => {
    if (typeof homeworkKind !== "function") return false;
    const kind = homeworkKind(t);
    if (kind === "words") {
      const p = homeworkProgress(t);
      return p.total && p.done < p.total;
    }
    return kind === "task" && !homeworkIsDone(t);
  });
  if (hw) {
    const kind = homeworkKind(hw);
    if (kind === "task") {
      return {
        state: "homework", cat: "hello", kicker: `${iconInline("personal", 16)} Задание от репетитора`,
        title: hw.title,
        sub: `${typeof taskKindLabel === "function" ? taskKindLabel(hw) : "Задание"}. Результат увидит репетитор.`,
        btn: "Открыть задание",
        act: () => startHomeworkLesson(hw),
        alt: { label: "другое занятие", nav: "practice" },
      };
    }
    const p = homeworkProgress(hw);
    const left = p.total - p.done;
    return {
      state: "homework", cat: "hello", kicker: `${iconInline("personal", 16)} Задание от репетитора`,
      title: hw.title,
      sub: `Осталось ${left} ${wordsWord(left)} из ${p.total}. Добавлю в словарь и открою карточки.`,
      btn: "Взяться за домашку",
      act: () => startHomeworkLesson(hw),
      alt: { label: "другое занятие", nav: "practice" },
    };
  }

  // 2. Первый заход. Словарь пуст, и все цифры на экране — нули. Поэтому
  // говорим не «у тебя 0 слов», а что произойдёт за ближайшие пять минут.
  if (!dict.length) {
    return {
      state: "first", cat: "hello", kicker: `${iconInline("paw", 16)} Начинаем`,
      title: "Первое занятие — 5 минут",
      sub: `${RECOMMEND_COUNT} слов уровня ${studyLevel()} — карточки с картинкой и звуком. Завтра они сами ждут тебя на главной.`,
      btn: "Поехали →",
      act: startFirstLesson,
      alt: { label: "сначала посмотреть слова", scrollTo: "words-head" },
    };
  }

  // 3. Повторение. Слова начали забываться — это и есть занятие дня.
  if (s.due) {
    return {
      state: "due", cat: "happy", kicker: `${iconInline("paw", 16)} Прямо сейчас`,
      title: `Повторить ${s.due} ${wordsWord(s.due)}`,
      sub: "Савелий выбрал те, что начали забываться. Пять минут — и они снова твои.",
      btn: `Повторить ${s.due} ${wordsWord(s.due)}`,
      act: () => show("trainer"),
      alt: { label: "другое занятие", nav: "practice" },
    };
  }

  // 4. Цель закрыта, повторять нечего. Это победа, а не пустой экран.
  if (got >= goal) {
    return {
      state: "done", cat: "love", kicker: `${iconInline("sparkle", 16)} На сегодня всё`,
      title: "Цель дня закрыта",
      sub: s.tomorrow
        ? `${got} очков за сегодня, повторять больше нечего. Завтра вернутся ${s.tomorrow} ${wordsWord(s.tomorrow)} — приходи.`
        : `${got} очков за сегодня. Можно закрывать ноутбук — или устроить блиц на минуту.`,
      btn: "Блиц на минуту",
      act: () => (typeof openExercise === "function" ? openExercise("blitz") : show("practice")),
      alt: { label: "другое занятие", nav: "practice" },
    };
  }

  // 5. Обычный день: повторов нет, но до цели ещё далеко.
  return {
    state: "free", cat: "wink", kicker: `${iconInline("paw", 16)} Прямо сейчас`,
    title: "Позаниматься 5 минут",
    sub: `Повторять пока нечего — возьмём слова уровня ${studyLevel()}. До цели дня ещё ${goal - got} очков.`,
    btn: "Позаниматься 5 минут",
    act: () => show("practice"),
    alt: { label: "добавить новых слов", scrollTo: "words-head" },
  };
}

function renderTodayCard() {
  const box = document.getElementById("today-box");
  if (!box) return;
  const p = todayPlan();
  // Заголовок домашки пишет репетитор — экранируем. Остальные строки наши.
  box.innerHTML = `
    <div class="today" data-state="${p.state}">
      <div class="cat-avatar" data-cat="${p.cat}"></div>
      <div class="today-body">
        <p class="today-kicker">${p.kicker}</p>
        <h2 class="today-title">${esc(p.title)}</h2>
        <p class="today-sub">${esc(p.sub)}</p>
      </div>
      <div class="today-act">
        <button class="btn btn-primary today-go" id="today-go" type="button">${esc(p.btn)}</button>
        ${p.alt ? `<p class="today-alt"><button class="link-btn" id="today-alt" type="button">${esc(p.alt.label)}</button></p>` : ""}
      </div>
    </div>`;

  document.getElementById("today-go").addEventListener("click", p.act);
  const alt = document.getElementById("today-alt");
  if (alt) alt.addEventListener("click", () => {
    if (p.alt.nav) { show(p.alt.nav); return; }
    scrollToBlock(p.alt.scrollTo);
  });
  if (typeof paintCats === "function") paintCats(box);
}

/** Прокрутка к разделу главной. scrollIntoView не годится: шапка липкая и
 *  на телефоне занимает два ряда, поэтому заголовок уезжал бы под неё. */
function scrollToBlock(id) {
  const target = document.getElementById(id);
  if (!target) return;
  const bar = document.getElementById("topbar");
  const barH = bar && !bar.classList.contains("hidden")
    ? bar.getBoundingClientRect().height : 0;
  const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: target.getBoundingClientRect().top + window.scrollY - barH - 12,
    behavior: smooth ? "smooth" : "auto",
  });
}

/** Первое занятие: берём подобранные слова в словарь и сразу открываем
 *  карточки. Без этого новичок упирался в пустой словарь и пустые тренировки
 *  и должен был сам догадаться, что сначала надо что-то добавить. */
function startFirstLesson() {
  if (!currentRecs.length) currentRecs = pickRecommendations();
  currentRecs.forEach(addToDictionary);
  renderRecGrid();
  show("trainer");
}

// Пустой словарь: кнопка делает ровно то же, что «Поехали» на главной —
// набирает первые слова и открывает карточки. Раньше экран сообщал
// «словарь пуст» и не давал из этого выхода.
document.addEventListener("click", e => {
  if (e.target.id === "dict-empty-go") startFirstLesson();
});

/** То же самое для домашки: слова задания уезжают в словарь, и ученик
 *  сразу оказывается в карточках, а не в списке из двадцати тренировок. */
function startHomeworkLesson(task) {
  const kind = typeof homeworkKind === "function" ? homeworkKind(task) : "words";
  // Задание-упражнение без слов: свой набор репетитора или встроенные
  // грамматика/словообразование. Словарь тут ни при чём — только контекст
  // домашки, чтобы результат подхода записался и уехал репетитору.
  if (kind === "task") {
    if (task.taskset && typeof openCustomTask === "function") { openCustomTask(task); return; }
    homeworkContext = { id: task.id, title: task.title };
    homeworkScope = null;
    if (typeof openExercise === "function") {
      openExercise(task.game === "wordform" ? "wordform" : "grammar");
    }
    return;
  }
  if (kind === "photo") { show("dashboard"); return; }   // сдаётся фото или чтением, открывать нечего

  (task.words || []).forEach(w => addToDictionary({
    w: w.w, t: w.t, ex: w.ex || "", level: w.level || state.level,
  }));
  if (typeof renderHomework === "function") renderHomework();

  // Слова домашки тренируются ТОЛЬКО ими самими — на время этого подхода
  // подменяем область тренировки. Иначе ученик открывает домашку, а ему
  // подмешиваются слова из его словаря: репетитор задал двадцать слов
  // к четвергу, а в упражнении их треть.
  homeworkScope = (task.words || []).map(w => String(w.w).toLowerCase());

  // Игру выбирает репетитор. Если не выбрал — прежнее поведение:
  // упражнение С ПРОВЕРКОЙ, а не карточки. Карточки — самооценка, и
  // домашку они не закрывают: репетитор должен видеть «сдал» только
  // когда ответ действительно сверялся.
  const game = task.game && typeof EX_RUNNERS === "object" && EX_RUNNERS[task.game]
    ? task.game : "spelling";
  if (typeof openExercise === "function") openExercise(game);
  else show("trainer");
}

// ===== Прогресс и награды =====

function daysWord(n) {
  const t = n % 10, h = n % 100;
  if (t === 1 && h !== 11) return "день";
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return "дня";
  return "дней";
}

/** Сводка на главной: три плитки вместо семи.
 *  Стрик уехал в подпись к цели, награды — в отдельную полосу наклеек,
 *  код входа и пересдача теста — в служебную строку внизу. */
function renderDashWidgets() {
  const box = document.getElementById("dash-widgets");
  if (!box) return;
  const learned = state.dictionary.filter(d => d.status === "learned").length;
  const learning = state.dictionary.filter(d => d.status === "learning").length;
  const rank = rankInfo(state.xp);
  const s = streakDays();
  const goal = state.goal || 50;
  const got = todayXP();
  const goalPct = Math.min(100, Math.round((got / goal) * 100));

  // «Осталось 50 очков» новичку ничего не говорит: он не знает, сколько это.
  // Переводим цель в занятия — в понятную ему единицу.
  const goalNote = goalPct >= 100
    ? "Цель выполнена — мур-р-р!"
    : got ? `осталось ${goal - got} очков`
          : "занятие — это примерно 40 очков";
  // «0 дней подряд» — единственная цифра, которую видел каждый новичок.
  // Стрик показываем, только когда он есть.
  const streakNote = s >= 1
    ? ` · ${iconInline("streak", 14)} ${s} ${daysWord(s)} подряд` : "";

  box.innerHTML = `
    <div class="card stat-card goal-card">
      <p class="stat-label">Цель на сегодня</p>
      <p class="stat-value">${got} <span class="stat-unit">из ${goal} ${iconInline("star", 14)}</span></p>
      <div class="xp-bar"><div class="xp-bar-fill${goalPct >= 100 ? " done" : ""}" style="width:${goalPct}%"></div></div>
      <p class="stat-note">${goalNote}${streakNote}
        <button class="link-btn" id="goal-edit" type="button">изменить цель</button></p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Слова</p>
      ${state.dictionary.length ? `
      <p class="stat-value">${state.dictionary.length} <span class="stat-unit">в словаре</span></p>
      <p class="stat-note">выучено ${learned} · повторяю ${learning}</p>` : `
      <p class="stat-value">${RECOMMEND_COUNT} <span class="stat-unit">ждут тебя</span></p>
      <p class="stat-note">подобраны под уровень ${studyLevel()} — с них и начнём</p>`}
    </div>
    <div class="card stat-card">
      <p class="stat-label">Звание</p>
      <p class="stat-value">${rank.name}</p>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${Math.round(rank.progress * 100)}%"></div></div>
      <p class="stat-note">⭐ ${state.xp}${rank.next
        ? ` · до «${rank.next.name}» ещё ${rank.next.xp - state.xp}`
        : " · выше звания нет"}</p>
    </div>`;

  document.getElementById("goal-edit").addEventListener("click", () => {
    const opts = [30, 50, 80, 120];
    const cur = opts.indexOf(state.goal || 50);
    state.goal = opts[(cur + 1) % opts.length];
    saveState();
    renderDashWidgets();
  });
  renderAchStrip();
}

// Цвета наклеек — из палитры savely.css: бронза глиняная, серебро небесное,
// золото лавандовое (самый редкий цвет на сайте).
const TIER_CLASS = { bronze: "got-clay", silver: "got-sky", gold: "got-lavender" };

/** Полоса наград: сначала полученные, следом — ближайшие достижимые.
 *  У новичка получено ноль, и вместо пустого места он видит, что можно взять
 *  сегодня же: «добавить первое слово», «пройти любую тренировку». */
function renderAchStrip() {
  const box = document.getElementById("dash-ach");
  if (!box || typeof ACHIEVEMENTS === "undefined") return;
  const have = new Set(state.achievements || []);
  const got = (state.achievements || []).slice(-4).reverse()
    .map(id => ACHIEVEMENTS.find(a => a.id === id))
    .filter(Boolean);
  const m = typeof achMetrics === "function" ? achMetrics() : {};
  // Ближайшая награда — та, до которой осталось меньше всего шагов, а при
  // равенстве — та, к которой ученик ближе. Сортировка по одной доле
  // выполнения подсовывала новичку «набрать 100 очков» вместо «добавить
  // первое слово»: 25 из 100 — это доля 0,25, а шагов там на месяц.
  // Домашку не предлагаем тем, у кого нет репетитора: взять её неоткуда.
  // «Ночного охотника» не предлагаем никому — не дело советовать школьнику
  // садиться за уроки после одиннадцати. Заработать его по-прежнему можно.
  const hasTutor = typeof studentToken === "function" && !!studentToken();
  const near = ACHIEVEMENTS
    .filter(a => !have.has(a.id))
    .filter(a => a.id !== "night-owl" && (hasTutor || a.metric !== "homework_done"))
    .map(a => ({
      a,
      left: Math.max(0, a.threshold - (m[a.metric] || 0)),
      done: Math.min(1, (m[a.metric] || 0) / a.threshold),
    }))
    // left === 0 — награда уже заслужена, её вот-вот выдаст checkAchievements.
    // Предлагать её как цель нельзя: она уже в кармане.
    .filter(x => x.left > 0)
    .sort((x, y) => x.left - y.left || y.done - x.done)
    .slice(0, got.length ? 2 : 3)
    .map(x => x.a);

  const sticker = (cls, iconName, text, title) =>
    `<span class="sticker ${cls}" title="${esc(title)}">`
    + `<span class="ach-emoji">${typeof icon === "function" ? icon(iconName, 18) : ""}</span>`
    + `${esc(text)}</span>`;

  box.innerHTML = [
    ...got.map(a => sticker(TIER_CLASS[a.tier] || "", a.icon, a.name, a.desc)),
    state.blitzBest ? sticker("", "blitz", `Блиц: ${state.blitzBest}`, "Личный рекорд в блице") : "",
    near.length ? `<span class="ach-next">${got.length ? "Дальше:" : "Что можно взять сегодня:"}</span>` : "",
    ...near.map(a => sticker("locked", a.icon, a.desc, a.name)),
  ].join("");
}

/** Служебная строка внизу главной: код для входа и пересдача теста.
 *  Код стоял карточкой наравне с прогрессом — он этого не стоит. Но и прятать
 *  нельзя: им реально продолжают занятие с телефона. */
function renderServiceLine() {
  const box = document.getElementById("dash-service");
  if (!box) return;
  box.innerHTML = `
    ${state.restoreCode ? `<span>Занимаешься с телефона? Твой код:
      <b class="code-value">${esc(state.restoreCode)}</b> — введи его при входе на другом устройстве.</span>` : ""}
    <button class="link-btn" id="retake-test-btn" type="button">перепройти тест уровня</button>`;
  document.getElementById("retake-test-btn").addEventListener("click", () => show("test"));
}

function wordsWord(n) {
  const t = n % 10, h = n % 100;
  if (t === 1 && h !== 11) return "слово";
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return "слова";
  return "слов";
}

/** Рейтинг одноклассников — приходит с сервера при синхронизации. */
function renderLeaderboard() {
  const box = document.getElementById("leaderboard-box");
  if (!box) return;
  const rows = state.leaderboard || [];
  if (rows.length < 2) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  // Золото-серебро-бронза сюда не вернутся: три тёплых пятна на шалфейном
  // экране — ровно та палитра, от которой уходили. Призовую тройку метит
  // сам значок, место по-прежнему написано цифрой.
  const place = p => p <= 3
    ? `${icon("medal", 18)}<b>${p}</b>`
    : `${p}.`;
  box.innerHTML = `
    <div class="card lb-card">
      <p class="stat-label">Рейтинг за неделю</p>
      ${rows.map(r => `
        <div class="lb-row${r.me ? " lb-me" : ""}">
          <span class="lb-place${r.place <= 3 ? " lb-top" : ""}">${place(r.place)}</span>
          <span class="lb-name">${r.me ? "Ты" : esc(r.name)}</span>
          <span class="lb-xp">${iconInline("star", 14)} ${r.xpWeek}</span>
        </div>`).join("")}
    </div>`;
}

function renderRecGrid() {
  const grid = document.getElementById("recommend-grid");
  grid.innerHTML = "";
  // Транскрипция приезжает отдельным файлом и может опоздать к первой
  // отрисовке — тогда дозаполняем уже нарисованные карточки на месте.
  // Ждать её было бы хуже: карточки важнее подписи под словом.
  if (typeof ensureIPA === "function" && typeof IPA === "undefined") {
    ensureIPA().then(() => {
      document.querySelectorAll("[data-ipa-for]").forEach(el => {
        const t = ipaOf(el.dataset.ipaFor);
        if (t) el.textContent = "[" + t + "]";
      });
    });
  }
  const inDict = new Set(state.dictionary.map(d => d.w));
  currentRecs.forEach(rec => {
    const card = document.createElement("div");
    card.className = "card word-card";
    card.innerHTML = `
      <div class="w-head">
        <div class="word-art word-art-small" style="background:${wordTint(rec.cat)}">${wordArtHTML(rec.w, rec.cat)}</div>
        <span class="w-level">${rec.level}</span>
      </div>
      <div class="w-en">${esc(rec.w)} <button class="say-btn" title="Произношение"
              aria-label="Произношение: ${esc(rec.w)}">${icon("sound", 18)}</button></div>
      <div class="w-ipa" data-ipa-for="${esc(rec.w)}">${esc(ipaOf(rec.w) ? "[" + ipaOf(rec.w) + "]" : "")}</div>
      <div class="w-ru">${esc(rec.t)}</div>
      <div class="w-ex">${esc(rec.ex)}</div>
    `;
    card.querySelector(".say-btn").addEventListener("click", () => speak(rec.w));
    if (inDict.has(rec.w)) {
      const done = document.createElement("div");
      done.className = "added";
      done.innerHTML = `${iconInline("check", 16)} в словаре`;
      card.appendChild(done);
    } else {
      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = "+ В словарь";
      btn.addEventListener("click", () => {
        addToDictionary(rec);
        renderRecGrid();
      });
      card.appendChild(btn);
    }
    grid.appendChild(card);
  });
}

document.getElementById("refresh-words-btn").addEventListener("click", () => {
  currentRecs = pickRecommendations();
  renderRecGrid();
});

// ===== Словарь =====
function addToDictionary(word) {
  if (state.dictionary.some(d => d.w.toLowerCase() === word.w.toLowerCase())) return;
  const rec = {
    w: word.w, t: word.t, ex: word.ex || "", level: word.level || state.level,
    status: "new", knew: 0, forgot: 0,
    // Дата добавления. По ней очередь повторений пускает свежие слова
    // вперёд: человек добавил слово, чтобы учить его сейчас, а не через
    // неделю, когда до него дойдёт очередь (см. srsQueue).
    addedAt: new Date().toISOString().slice(0, 10),
  };
  if (typeof srsInit === "function") srsInit(rec);
  state.dictionary.push(rec);
  saveState();
  updateChrome();
}

let dictFilter = "all";

document.querySelectorAll(".dict-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    dictFilter = btn.dataset.f;
    document.querySelectorAll(".dict-filter").forEach(b => b.classList.toggle("active", b === btn));
    // Подпись кнопки честно говорит, что уедет в тренировку: молчаливое
    // изменение поведения кнопки — это ловушка, а не удобство.
    const LABEL = { all: "Тренировать →", new: "Тренировать новые →",
                    learning: "Тренировать те, что учу →", learned: "Повторить выученное →" };
    document.getElementById("train-btn").textContent = LABEL[dictFilter] || LABEL.all;
    renderDictionary();
  });
});

/* ---------- Папки словаря ----------
 * Свои темы поверх готовых: «к контрольной», «неправильные глаголы»,
 * «слова из сериала». Категории из базы (cat) для этого не годятся —
 * они про смысл слова и назначены заранее, а папка нужна под задачу,
 * которая у каждого своя.
 *
 * Хранение двойное, и это не дублирование, а страховка:
 *   state.folders   — список имён. Нужен, чтобы папка могла быть ПУСТОЙ:
 *                     человек заводит «К контрольной» и только потом
 *                     складывает туда слова, а не наоборот.
 *   d.folders       — в каком слове какие папки. По нему идёт фильтрация.
 *
 * Ни один из двух не считается главным: показываем ОБЪЕДИНЕНИЕ. Словарь
 * синхронизируется целиком и переезжает между устройствами, и при слиянии
 * список папок может разойтись с самими словами. Объединение делает
 * расхождение безобидным: папка из списка без слов покажется пустой,
 * папка из слов без списка — просто покажется. Взять что-то одно за
 * источник истины значило бы, что второе молча теряется. */
let dictFolder = null;      // null — показывать все слова

function allFolders() {
  const names = new Set(state.folders || []);
  state.dictionary.forEach(d => (d.folders || []).forEach(f => names.add(f)));
  return [...names].sort((a, b) => a.localeCompare(b, "ru"));
}

/** Заводит папку. Возвращает false, если такая уже есть или имя пустое. */
function createFolder(rawName) {
  const name = String(rawName || "").trim().slice(0, 30);
  if (!name) return false;
  state.folders = state.folders || [];
  if (allFolders().includes(name)) return false;
  state.folders.push(name);
  saveState();
  return true;
}

function deleteFolder(name) {
  state.folders = (state.folders || []).filter(f => f !== name);
  // Слова не трогаем — убираем только принадлежность к папке
  state.dictionary.forEach(d => {
    if (d.folders) d.folders = d.folders.filter(f => f !== name);
  });
  if (dictFolder === name) dictFolder = null;
  saveState();
}

function wordsInFolder(name) {
  return state.dictionary.filter(d => (d.folders || []).includes(name)).length;
}

function renderFolders() {
  const box = document.getElementById("dict-folders");
  if (!box) return;
  const names = allFolders();
  // Папку могли удалить, пока она была выбрана
  if (dictFolder && !names.includes(dictFolder)) dictFolder = null;

  // Кнопка «+ Папка» стоит здесь ВСЕГДА, даже когда папок ещё нет.
  // В первой версии ряд прятался до появления первой папки, а завести её
  // можно было только через значок в строке слова — значок без подписи,
  // о назначении которого надо догадаться. Способ, который невозможно
  // найти, равносилен отсутствующему.
  box.innerHTML =
    (names.length
      ? `<button class="chip dict-folder${dictFolder === null ? " active" : ""}"
                 type="button" data-folder="">${iconInline("categories", 14)} все слова</button>`
        + names.map(n => `
          <button class="chip dict-folder${dictFolder === n ? " active" : ""}"
                  type="button" data-folder="${esc(n)}">${esc(n)} <b>${wordsInFolder(n)}</b></button>`).join("")
      : `<span class="folders-hint">Папки — свои темы: «к контрольной», «неправильные глаголы».</span>`)
    + `<button class="chip chip-add" type="button" id="folder-add">+ Папка</button>`
    // Второй вход в отметку слов — прямо здесь, где задача и возникает.
    // Человек, который смотрит на папки и думает «надо докинуть сюда слов»,
    // не пойдёт искать кнопку ниже списка: он начнёт открывать окно папок
    // у каждого слова по очереди. Ровно на это и пожаловались.
    + (names.length
      ? `<button class="chip chip-add" type="button" id="folder-fill">+ Слова в папку</button>`
      : "")
    + (dictFolder
      ? `<button class="link-btn folder-del" type="button" id="folder-del">удалить «${esc(dictFolder)}»</button>`
      : "");

  box.querySelectorAll("[data-folder]").forEach(b => {
    b.addEventListener("click", () => {
      dictFolder = b.dataset.folder || null;
      renderDictionary();
    });
  });

  const fill = document.getElementById("folder-fill");
  if (fill) fill.addEventListener("click", () => {
    // Показываем ВЕСЬ словарь: складывать в папку удобнее, видя всё,
    // а не только то, что уже в этой папке лежит.
    dictFolder = null;
    dictPickMode = true;
    renderDictionary();
    const bar = document.getElementById("dict-pick-bar");
    if (bar) bar.scrollIntoView({ block: "nearest" });
  });

  // Поле прямо в ряду, а не системное окно. prompt() рисует диалог
  // операционной системы посреди продукта для школьников — на телефоне
  // это выглядит как ошибка сайта, а не как его часть. Заодно в поле
  // видно, сколько влезает: «Неправильные глаголы» в prompt не проверить.
  document.getElementById("folder-add").addEventListener("click", e => {
    const btn = e.currentTarget;
    if (document.getElementById("folder-new-inline")) return;
    btn.classList.add("hidden");
    const form = document.createElement("form");
    form.className = "folder-new-inline";
    form.id = "folder-new-inline";
    form.innerHTML = `
      <input type="text" id="folder-inline-name" maxlength="30" required
             placeholder="название папки" aria-label="Название новой папки">
      <button type="submit" class="btn btn-primary btn-small">Создать</button>
      <button type="button" class="link-btn" id="folder-inline-cancel">отмена</button>`;
    btn.parentElement.insertBefore(form, btn);
    const input = form.querySelector("input");
    input.focus();

    const close = () => { form.remove(); btn.classList.remove("hidden"); };
    form.querySelector("#folder-inline-cancel").addEventListener("click", close);
    input.addEventListener("keydown", ev => { if (ev.key === "Escape") close(); });
    form.addEventListener("submit", ev => {
      ev.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      if (!createFolder(name)) {
        input.setCustomValidity("Такая папка уже есть");
        input.reportValidity();
        setTimeout(() => input.setCustomValidity(""), 2000);
        return;
      }
      dictFolder = name.slice(0, 30);           // сразу открываем новую
      renderDictionary();
    });
  });

  // Удаление в два нажатия вместо системного confirm(): тот же приём,
  // что у выхода из аккаунта. Системное окно посреди продукта выглядит
  // чужим, а во встроенных браузерах его иногда просто не показывают.
  const del = document.getElementById("folder-del");
  if (del) {
    let armed = false, timer = null;
    del.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        del.textContent = "нажми ещё раз — слова останутся";
        del.classList.add("danger");
        timer = setTimeout(() => {
          armed = false;
          del.textContent = `удалить «${dictFolder}»`;
          del.classList.remove("danger");
        }, 4000);
        return;
      }
      clearTimeout(timer);
      deleteFolder(dictFolder);
      renderDictionary();
    });
  }
}

/** «1 слово / 2 слова / 5 слов». Такие же помощники есть в exercises.js
 *  и account.js — те файлы грузятся отдельно и не могут звать этот. */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  return b === 1 ? one : many;
}

/** Окно «в какую папку положить». Работает как переключатели: слово может
 *  лежать сразу в нескольких папках — «неправильные глаголы» и «к контрольной»
 *  не исключают друг друга.
 *
 *  Принимает и одно слово, и пачку отмеченных. Для пачки галочка стоит,
 *  когда в папке лежат ВСЕ отмеченные; если часть — показываем это третьим
 *  состоянием, а не врём галочкой. */
function openFolderPicker(wordOrList) {
  const words = Array.isArray(wordOrList) ? wordOrList : [wordOrList];
  const modal = document.getElementById("folder-modal");
  const pick = document.getElementById("folder-pick");
  document.getElementById("folder-modal-title").textContent = words.length === 1
    ? `«${words[0].w}» — в какую папку?`
    : `${words.length} ${plural(words.length, "слово", "слова", "слов")} — в какую папку?`;

  const draw = () => {
    const names = allFolders();
    const countIn = n => words.filter(w => (w.folders || []).includes(n)).length;
    pick.innerHTML = names.length
      ? names.map(n => {
          const c = countIn(n);
          const all = c === words.length, some = c > 0 && !all;
          return `
          <label class="ack-row">
            <input type="checkbox" data-f="${esc(n)}"${all ? " checked" : ""}>
            <span>${esc(n)}${some ? ` <span class="muted-small">(в папке ${c} из ${words.length})</span>` : ""}</span>
          </label>`;
        }).join("")
      : `<p class="muted-small">Папок пока нет — создай первую.</p>`;
    pick.querySelectorAll("input[data-f]").forEach(cb => {
      const name = cb.dataset.f;
      // Частичное состояние — «чёрточка» вместо галочки: так устроены
      // все списки с вложенными пунктами, и объяснять это не нужно.
      const c = countIn(name);
      cb.indeterminate = c > 0 && c < words.length;
      cb.addEventListener("change", () => {
        words.forEach(w => {
          w.folders = w.folders || [];
          if (cb.checked) {
            if (!w.folders.includes(name)) w.folders.push(name);
          } else {
            w.folders = w.folders.filter(x => x !== name);
          }
        });
        saveState();
        renderFolders();
        draw();
      });
    });
  };
  draw();

  const form = document.getElementById("folder-new-form");
  form.onsubmit = e => {
    e.preventDefault();
    const input = document.getElementById("folder-new-name");
    const name = input.value.trim().slice(0, 30);
    if (!name) return;
    createFolder(name);                 // заводим папку и сразу кладём слово
    word.folders = word.folders || [];
    if (!word.folders.includes(name)) word.folders.push(name);
    input.value = "";
    saveState();
    draw();
    renderFolders();
  };
  // Фокус сразу в поле новой папки: чаще всего окно открывают именно
  // ради неё, а список галочек всё равно рядом по табу.
  openModal(modal, { focus: "#folder-new-name" });
}

document.addEventListener("DOMContentLoaded", () => {
  const close = document.getElementById("folder-close");
  if (close) close.addEventListener("click", () => {
    closeModal("folder-modal");
    renderDictionary();
  });
});

document.getElementById("dict-search").addEventListener("input", renderDictionary);

/** Отбор слов на тренировку: галочки в словаре → тренируем только их
 *  (см. trainingDictionary в exercises.js). Отдельно от папок: папка — это
 *  надолго и по теме, отбор — «вот эти двенадцать к четвергу». */
let dictPickMode = false;

function renderPickBar() {
  const bar = document.getElementById("dict-pick-bar");
  const btn = document.getElementById("dict-pick-toggle");
  if (!bar || !btn) return;
  const n = (state.trainWords || []).length;
  btn.classList.toggle("active", dictPickMode);
  btn.setAttribute("aria-pressed", String(dictPickMode));
  // Подпись меняем внутри span: рядом лежит иконка, и textContent
  // на всей кнопке стёр бы её вместе с текстом.
  const label = document.getElementById("dict-pick-label");
  if (label) {
    label.textContent = dictPickMode ? "Готово"
      : (n ? `Отмечено: ${n}` : "Отметить несколько");
  }
  bar.classList.toggle("hidden", !dictPickMode && !n);
  // «В папку» стоит ПЕРВОЙ и главной кнопкой: разложить слова по темам —
  // то, ради чего отмечают несколько слов чаще всего. Тренировка
  // отмеченных рядом, вторым действием.
  bar.innerHTML = n
    ? `<span>Отмечено: <b>${n}</b></span>
       <button type="button" class="btn btn-primary btn-small" id="dict-pick-fold">Сложить в папку</button>
       <button type="button" class="btn btn-ghost btn-small" id="dict-pick-go">Тренировать отмеченные</button>
       <button type="button" class="link-btn" id="dict-pick-clear">снять отметки</button>`
    : `<span class="muted-small">Отметь галочками сколько нужно слов — потом сложи их
       в папку или отправь на тренировку разом, а не по одному.</span>`;
  const go = document.getElementById("dict-pick-go");
  if (go) go.addEventListener("click", () => { dictPickMode = false; show("practice"); });
  // Раньше папка назначалась по одному слову: отметить пятнадцать слов
  // «к контрольной» значило пятнадцать раз открыть окно. Отмеченные уже
  // есть — остаётся дать им общее действие.
  const fold = document.getElementById("dict-pick-fold");
  if (fold) fold.addEventListener("click", () => {
    const picked = new Set((state.trainWords || []).map(w => w.toLowerCase()));
    const words = state.dictionary.filter(d => picked.has(d.w.toLowerCase()));
    if (words.length) openFolderPicker(words);
  });
  const clear = document.getElementById("dict-pick-clear");
  if (clear) clear.addEventListener("click", () => {
    state.trainWords = [];
    saveState();
    renderDictionary();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("dict-pick-toggle");
  if (btn) btn.addEventListener("click", () => { dictPickMode = !dictPickMode; renderDictionary(); });
});

function renderDictionary() {
  updateChrome();
  const list = document.getElementById("dict-list");
  const empty = document.getElementById("dict-empty");
  list.innerHTML = "";
  empty.classList.toggle("hidden", state.dictionary.length > 0);
  document.querySelector(".dict-controls").classList.toggle("hidden", !state.dictionary.length);

  renderFolders();
  const q = document.getElementById("dict-search").value.trim().toLowerCase();
  const items = state.dictionary.filter(d =>
    (dictFilter === "all" || d.status === dictFilter) &&
    (!dictFolder || (d.folders || []).includes(dictFolder)) &&
    (!q || d.w.toLowerCase().includes(q) || d.t.toLowerCase().includes(q)));

  if (state.dictionary.length && !items.length) {
    // Пустая папка — не «ничего не нашлось»: человек её только что завёл
    // и ждёт, что ему скажут, как наполнить. Значок в строке слова без
    // подсказки не находят.
    list.innerHTML = dictFolder && !q
      ? `<p class="muted-small" style="text-align:center">Папка «${esc(dictFolder)}» пока пустая.<br>
           Открой «все слова» и нажми ${icon("categories", 16)} у нужного слова.</p>`
      : `<p class="muted-small" style="text-align:center">Ничего не нашлось, мяу.</p>`;
    return;
  }

  const statusText = { new: "новое", learning: "учу", learned: "выучено" };
  const pickSet = new Set((state.trainWords || []).map(w => w.toLowerCase()));
  renderPickBar();
  items.forEach(d => {
    const info0 = (typeof wordInfo === "function" && wordInfo(d.w)) || {};
    const row = document.createElement("div");
    row.className = "dict-row" + (dictPickMode ? " picking" : "");
    // Строка раскрывает определение и пример — то есть основную ценность
    // словаря. Была обычным <div> с обработчиком клика: без мыши подробности
    // достать было нельзя. Тот же приём, что уже применён к карточке слова.
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-expanded", "false");
    row.setAttribute("aria-label", `${d.w} — ${d.t}. Открыть подробности`);
    row.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();          // пробел иначе прокручивает страницу
      row.click();
    });
    row.innerHTML = `
      ${dictPickMode ? `<input type="checkbox" class="d-pick" ${pickSet.has(d.w.toLowerCase()) ? "checked" : ""}
          aria-label="Отметить ${esc(d.w)} на тренировку">` : ""}
      <span class="word-art word-art-tiny" aria-hidden="true" style="background:${wordTint(info0.cat)}">${wordArtHTML(d.w, info0.cat)}</span>
      <span class="d-en" lang="en">${esc(d.w)} <button class="say-btn" aria-label="Произношение: ${esc(d.w)}">${icon('sound', 18)}</button></span>
      <span class="d-ru">${esc(d.t)}</span>
      <span class="d-status ${d.status}">${statusText[d.status]}</span>
    `;
    const pick = row.querySelector(".d-pick");
    if (pick) {
      const toggle = e => {
        e.stopPropagation();
        const key = d.w.toLowerCase();
        const set = new Set((state.trainWords || []).map(w => w.toLowerCase()));
        set.has(key) ? set.delete(key) : set.add(key);
        state.trainWords = [...set];
        pick.checked = set.has(key);
        saveState();
        renderPickBar();
      };
      pick.addEventListener("click", toggle);
      // В режиме отбора клик по строке тоже отмечает — целиться в галочку на телефоне не надо
      row.addEventListener("click", e => { if (dictPickMode && e.target === row) { pick.checked = !pick.checked; toggle(e); } }, true);
    }
    row.querySelector(".say-btn").addEventListener("click", e => {
      e.stopPropagation();
      speak(d.w);
    });
    // Кнопка папки — в самой строке, а не в подробностях: раскладывать
    // слова по папкам человек будет пачкой, подряд, и лишний клик
    // на раскрытие каждой строки эту работу удваивает.
    const fold = document.createElement("button");
    fold.className = "d-fold";
    const inFolders = (d.folders || []).length;
    fold.classList.toggle("has", inFolders > 0);
    fold.setAttribute("aria-label", inFolders
      ? `${d.w}: папки — ${(d.folders || []).join(", ")}. Изменить`
      : `Положить ${d.w} в папку`);
    fold.innerHTML = icon("categories", 18);
    fold.addEventListener("click", e => {
      e.stopPropagation();
      openFolderPicker(d);
    });
    row.appendChild(fold);

    const del = document.createElement("button");
    del.className = "d-del";
    // В списке из сорока слов сорок одинаковых «Удалить» — имя обязано
    // называть, что именно удаляем. title скринридером здесь игнорируется:
    // у кнопки есть содержимое, и оно перебивает подсказку.
    del.setAttribute("aria-label", `Удалить ${d.w} из словаря`);
    del.innerHTML = icon("trash", 18);
    del.addEventListener("click", e => {
      e.stopPropagation();
      const idx = state.dictionary.indexOf(d);
      if (idx >= 0) state.dictionary.splice(idx, 1);
      saveState();
      renderDictionary();
    });
    row.appendChild(del);
    // клик по строке — раскрыть детали (пример, определение)
    row.addEventListener("click", () => {
      const next = row.nextElementSibling;
      if (next && next.classList.contains("dict-detail")) {
        next.remove();
        row.setAttribute("aria-expanded", "false");
        return;
      }
      // закрываем чужие подробности — и снимаем у них признак раскрытия,
      // иначе скринридер будет считать раскрытыми сразу несколько строк
      document.querySelectorAll(".dict-detail").forEach(x => x.remove());
      document.querySelectorAll('.dict-row[aria-expanded="true"]')
        .forEach(r => r.setAttribute("aria-expanded", "false"));
      row.setAttribute("aria-expanded", "true");
      const info = (typeof wordInfo === "function" && wordInfo(d.w)) || {};
      const ex = d.ex || info.ex;
      if (!ex && !info.def) return;
      const det = document.createElement("div");
      det.className = "dict-detail";
      det.innerHTML = `
        ${info.def ? `<p>${iconInline("book", 16)} ${esc(info.def)}</p>` : ""}
        ${ex ? `<p>${iconInline("chat", 16)} <i>${esc(ex)}</i>${info.exr ? " — " + esc(info.exr) : ""}
          <button class="say-btn" title="Озвучить пример"
                  aria-label="Озвучить пример">${icon("sound", 18)}</button></p>` : ""}`;
      const sayEx = det.querySelector(".say-btn");
      if (sayEx) sayEx.addEventListener("click", () => speak(ex));
      row.after(det);
    });
    list.appendChild(row);
  });
}

/* Подсказка перевода при добавлении своего слова.
 *
 * Раньше ученик набирал перевод целиком руками — хотя у 11 тысяч слов
 * он лежит в нашей же базе, вместе с примером и транскрипцией. Методист
 * попросила «как в Quizlet»: система предлагает, а вписать своё
 * по-прежнему можно. Поэтому подсказка НЕ подставляется автоматически:
 * ученик нажимает её сам, и его собственный текст не затирается.
 */
function addWordHint() {
  const box = document.getElementById("add-word-hint");
  const enInput = document.getElementById("add-word-en");
  const ruInput = document.getElementById("add-word-ru");
  if (!box) return;
  const en = enInput.value.trim();
  box.innerHTML = "";
  if (en.length < 2 || typeof WORDS === "undefined") { box.classList.add("hidden"); return; }
  const hit = typeof wordInfo === "function" ? wordInfo(en) : null;
  if (!hit || !hit.t) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  const ipa = typeof ipaOf === "function" ? ipaOf(hit.w) : "";
  const label = document.createElement("span");
  label.className = "muted-small";
  label.textContent = "В базе есть перевод: ";
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.textContent = hit.t;
  chip.addEventListener("click", () => {
    ruInput.value = hit.t;
    ruInput.focus();
  });
  box.append(label, chip);
  if (ipa) {
    const tr = document.createElement("span");
    tr.className = "muted-small";
    tr.textContent = "  [" + ipa + "]";
    box.append(tr);
  }
}

document.getElementById("add-word-en").addEventListener("input", () => {
  // Словарь и транскрипция могут быть ещё не загружены — тогда просто
  // подтягиваем их и пробуем снова: подсказка появится через мгновение.
  if (typeof WORDS === "undefined" && typeof ensureWords === "function") {
    ensureWords().then(addWordHint);
    return;
  }
  if (typeof IPA === "undefined" && typeof ensureIPA === "function") ensureIPA().then(addWordHint);
  addWordHint();
});

document.getElementById("add-word-form").addEventListener("submit", e => {
  e.preventDefault();
  const en = document.getElementById("add-word-en").value.trim();
  const ru = document.getElementById("add-word-ru").value.trim();
  if (!en || !ru) return;
  // Если слово нашлось в базе — забираем заодно пример и уровень:
  // карточка без примера учит хуже, а уровень нужен подбору заданий.
  const hit = typeof wordInfo === "function" ? wordInfo(en) : null;
  addToDictionary({
    w: hit ? hit.w : en,
    t: ru,
    ex: hit && hit.ex ? hit.ex : "",
    cat: hit ? hit.cat : undefined,
    level: hit && hit.level ? hit.level : state.level,
  });
  document.getElementById("add-word-en").value = "";
  document.getElementById("add-word-ru").value = "";
  addWordHint();
  renderDictionary();
});

/* «Тренировать →» уважает выбранный фильтр.
 *
 * Учитель отобрала пятнадцать слов с урока, нажала «новые» и пошла
 * тренироваться — а система выдала повторы старых. Кнопка молча
 * тренировала ВЕСЬ словарь, и связи между тем, что человек видит
 * на экране, и тем, что он получит, не было никакой.
 *
 * Теперь показанное на экране и есть то, что будет в тренировке.
 * Фильтр «все» работает как раньше — весь словарь. */
document.getElementById("train-btn").addEventListener("click", () => {
  // Кнопка ВСЕГДА приводит отбор в соответствие с тем, что на экране.
  // Иначе так: отобрал «новые», потренировался, через день вернулся,
  // нажал «Тренировать →» при фильтре «все» — и снова получил те же
  // пятнадцать слов, потому что старый отбор молча пережил сессию.
  const words = dictFilter === "all" ? [] : state.dictionary
    .filter(d => d.status === dictFilter)
    .map(d => d.w.toLowerCase());
  state.trainWords = words;
  saveState();
  show("practice");
});

// ===== Тренажёр-карточки =====
let trainQueue = [];
let trainIndex = 0;
let trainScore = 0;

function startTraining() {
  if (typeof markMode === "function") markMode("flashcards");
  const empty = document.getElementById("trainer-empty");
  const run = document.getElementById("trainer-run");
  const done = document.getElementById("trainer-done");
  done.classList.add("hidden");

  // Пустой словарь — не повод в тупик. Остальные упражнения при том же
  // пустом словаре добирают слова из уровня ученика и прекрасно работают;
  // «Карточки» единственные упирались в «нечего тренировать», хотя список
  // тренировок их предлагал. Делаем то же самое: берём слова уровня.
  let source = state.dictionary;
  if (!source.length && typeof trainPool === "function") {
    source = trainPool(10).map(x => ({ w: x.w, t: x.t, ex: x.ex, level: x.level }));
  }
  if (!source.length) {
    empty.classList.remove("hidden");
    run.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  run.classList.remove("hidden");

  // очередь строит SRS: просроченные повторы вперёд, новые — следом
  trainQueue = state.dictionary.length && typeof srsQueue === "function"
    ? srsQueue(state.dictionary, 10)
    : [...source].slice(0, 10);
  trainIndex = 0;
  trainScore = 0;
  renderFlashcard();
}

function renderFlashcard() {
  const card = document.getElementById("flashcard");
  card.classList.remove("flipped");
  card.setAttribute("aria-expanded", "false");   // новая карточка — снова лицом вверх
  setFlashFaces(false);
  const item = trainQueue[trainIndex];
  const info = (typeof wordInfo === "function" && wordInfo(item.w)) || {};
  const art = document.getElementById("flash-art");
  art.innerHTML = wordArtHTML(item.w, info.cat);
  art.style.background = wordTint(info.cat);
  document.getElementById("flash-word").textContent = item.w;
  document.getElementById("flash-translation").textContent = item.t;
  document.getElementById("flash-example").textContent = item.ex || "";
  document.getElementById("trainer-counter").textContent = `${trainIndex + 1} / ${trainQueue.length}`;
  setFlashButtons(false);
}

function setFlashButtons(enabled) {
  document.getElementById("flash-knew").disabled = !enabled;
  document.getElementById("flash-forgot").disabled = !enabled;
}

function setFlashFaces(flipped) {
  const front = document.querySelector(".flashcard-front");
  const back  = document.querySelector(".flashcard-back");
  // Прячем СЕМАНТИЧЕСКИ, а не только визуально: без этого скринридер
  // читает обе стороны сразу и перевод становится известен заранее.
  if (front) front.setAttribute("aria-hidden", flipped ? "true" : "false");
  if (back)  back.setAttribute("aria-hidden", flipped ? "false" : "true");
}

/* Карточка крутится в ОБЕ стороны, сколько угодно раз.
 *
 * Раньше переворот был односторонним: увидел перевод — и всё, вернуться
 * к английскому слову нельзя до следующей карточки. Методист: «нужно
 * кликать и крутить, столько раз, сколько нужно ученику для запоминания» —
 * и это правильно, повторение и есть работа с карточкой.
 *
 * Кнопки оценки, один раз включившись, остаются доступны: перевод уже
 * увиден, и прятать оценку, когда ученик перевернул карточку обратно,
 * значило бы заставлять его переворачивать её ещё раз ради кнопки. */
function flipFlashcard() {
  const card = document.getElementById("flashcard");
  const flipped = !card.classList.contains("flipped");
  card.classList.toggle("flipped", flipped);
  card.setAttribute("aria-expanded", flipped ? "true" : "false");
  setFlashFaces(flipped);
  if (flipped) setFlashButtons(true);
}

document.getElementById("flashcard").addEventListener("click", flipFlashcard);

// Клавиатура: карточка — центральное упражнение, а перевернуть её без мыши
// было нельзя, то есть перевод оставался недоступен совсем. Пробел и Enter —
// то, чего ждут от role="button".
document.getElementById("flashcard").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();          // пробел иначе прокручивает страницу
  flipFlashcard();
});

// Кнопка озвучки лежит ВНУТРИ карточки: без этого нажатие на неё
// заодно переворачивало карточку и показывало перевод раньше времени.
document.getElementById("flash-audio").addEventListener("click", e => e.stopPropagation());

function answerFlash(knew) {
  const item = trainQueue[trainIndex];
  const real = state.dictionary.find(d => d.w === item.w);
  // true — «оценил сам»: на карточке никто ответ не сверяет
  if (real) srsReview(real, knew, true);
  // За самооценку — втрое меньше, чем за проверенный ответ (10).
  // Раньше давали 8: протыкать карточки не глядя было почти так же
  // выгодно, как честно отвечать, и это прямая мотивация врать.
  if (knew) { trainScore++; addXP(3); }
  saveState();

  trainIndex++;
  if (trainIndex < trainQueue.length) {
    renderFlashcard();
  } else {
    document.getElementById("trainer-run").classList.add("hidden");
    document.getElementById("trainer-done").classList.remove("hidden");
    // карточки — такая же тренировка, как остальные упражнения
    if (typeof bump === "function" && trainQueue.length) {
      bump("exercises");
      if (trainScore === trainQueue.length) bump("perfect");
    }
    const phrases = trainScore === trainQueue.length
      ? "Идеально! Мур-р-р, ты машина!"
      : trainScore >= trainQueue.length * 0.7
        ? "Отлично идём, мяу!"
        : "Ничего, повторение — мать учения. Мяу!";
    document.getElementById("trainer-score").textContent =
      `Помнишь ${trainScore} из ${trainQueue.length}. ${phrases}`;

    // Карточки запустили с доски (card=… в адресе): у остальных
    // упражнений это делает exFinish, но карточки — отдельный тренажёр,
    // и без этого блока репетитор не видел их итог, а ученик оставался
    // в вкладке. Итог — на доску (в карточку задания и плашкой),
    // ученика — назад на доску: сам через пару секунд или кнопкой.
    const bc = window.boardTaskCard;
    if (bc && trainQueue.length) {
      const when = new Date();
      const hhmm = String(when.getHours()).padStart(2, "0") + ":"
                 + String(when.getMinutes()).padStart(2, "0");
      const line = `Помнит ${trainScore} из ${trainQueue.length} · самооценка`;
      if (typeof reportBoardResult === "function") {
        reportBoardResult(bc, {
          text: line + " · " + hhmm,
          correct: trainScore, total: trainQueue.length,
          rushed: false, when: hhmm, scoreLine: line,
        });
      }
      const done = document.getElementById("trainer-done");
      if (done && !document.getElementById("tr-to-board")) {
        const note = document.createElement("p");
        note.className = "muted-small";
        note.textContent = "Результат уже на доске — сейчас вернёшься на неё сам, или жми кнопку.";
        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.id = "tr-to-board";
        btn.textContent = "Вернуться на доску";
        btn.addEventListener("click", () => {
          try { window.close(); } catch (e) { /* открыли напрямую */ }
          setTimeout(() => location.replace("board.html"), 250);
        });
        done.appendChild(note);
        done.appendChild(btn);
      }
      window.__exBoardBack = setTimeout(() => {
        try { window.close(); } catch (e) { /* открыли напрямую */ }
        setTimeout(() => location.replace("board.html"), 400);
      }, 3600);
    }
  }
}

document.getElementById("flash-knew").addEventListener("click", () => answerFlash(true));
document.getElementById("flash-forgot").addEventListener("click", () => answerFlash(false));
document.getElementById("train-again-btn").addEventListener("click", () => {
  // «Ещё раз» отменяет авто-возврат на доску — иначе повторный подход
  // обрывался бы закрытием вкладки на середине карточки.
  clearTimeout(window.__exBoardBack);
  startTraining();
});

// ===== Чат с Савелием =====
// Основной мозг: Claude через локальный сервер (/api/chat, работает от подписки).
// Запасной мозг: локальные правила (catReply) — если сервер или логин недоступны.
let chatInited = false;
let chatBusy = false;
let aiWarned = false;
let chatHistory = [];
let chatContext = { pendingQuiz: null, lastSuggested: null };

/** Нейросети нет — сервер сказал это в синхронизации (window.SAVELY_AI)
 *  или ответил ai_off на первое сообщение. Дальше в чате работает только
 *  правиловый мозг (catReply), и на сервер за ответом больше не ходим:
 *  иначе каждое сообщение — «Савелий думает…», отказ, и только потом
 *  правила. Флаг живёт до перезагрузки: ключ на сервере появляется не
 *  посреди разговора. */
let aiOff = false;
function aiKnownOff() {
  return aiOff || window.SAVELY_AI === false;
}

// Что умеет правиловый мозг — одной строкой, чтобы ученик знал, как со
// мной говорить, а не гадал. Раньше здесь обещали «скоро подключат
// большой кошачий мозг»: обещание, которого продукт не выполняет.
const RULES_HELP = "Я понимаю простые просьбы: «дай слово», «проверь меня», «как мои успехи?» — или жми кнопки под чатом.";

function initChat() {
  if (chatInited) return;
  chatInited = true;
  if (aiKnownOff()) {
    // Честная рамка с первой реплики: без нейросети «просто поболтать»
    // не выйдет, и обещать это нельзя. Зато остальное работает по-честному.
    const sub = document.querySelector(".chat-sub");
    if (sub) sub.textContent = "кот-репетитор · отвечает по правилам";
    catSay(`Мяу, ${state.user.name}! Умный чат ещё в разработке, поэтому пока отвечаю по правилам. `
      + `Могу дать новое слово твоего уровня, проверить тебя по словарю и показать успехи. ${RULES_HELP}`);
    return;
  }
  catSay(`Мяу, ${state.user.name}! Я тут. Могу дать новое слово, проверить тебя по словарю или просто поболтать. Что делаем?`);
}

function addMsg(text, who) {
  const box = document.getElementById("chat-box");
  const div = document.createElement("div");
  div.className = "msg " + (who === "cat" ? "msg-cat" : "msg-user");
  div.textContent = text;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  chatHistory.push({ who, text });
  if (who === "user" && typeof bump === "function") bump("chat");
  if (who === "cat" && typeof window.onCatMessage === "function") window.onCatMessage(text, div);
}

function catSay(text, delay = 0) {
  setTimeout(() => addMsg(text, "cat"), delay);
}

function showTyping() {
  const box = document.getElementById("chat-box");
  const div = document.createElement("div");
  div.className = "msg msg-cat msg-typing";
  div.id = "typing-msg";
  div.textContent = "Савелий думает…";
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function hideTyping() {
  const t = document.getElementById("typing-msg");
  if (t) t.remove();
}

function setChatEnabled(on) {
  document.getElementById("chat-input").disabled = !on;
  document.querySelector("#chat-form .btn").disabled = !on;
  document.querySelectorAll("#chat-chips .chip").forEach(c => c.disabled = !on);
  if (on) document.getElementById("chat-input").focus();
}

function applyMark(mark) {
  const d = state.dictionary.find(x => x.w.toLowerCase() === String(mark.w || "").toLowerCase());
  if (!d) return;
  // статус и интервал считает только SRS — иначе проверка в чате
  // объявляла бы слово выученным вразрез с расписанием повторений
  srsReview(d, !!mark.correct);
  if (mark.correct) addXP(10);
  saveState();
  updateChrome();
}

// на GitHub Pages серверной части нет — сразу отвечает локальный мозг
const AI_AVAILABLE = !location.hostname.endsWith("github.io");

async function sendToSavely(text) {
  if (chatBusy) return;
  if (!AI_AVAILABLE) {
    addMsg(text, "user");
    if (!aiWarned) {
      aiWarned = true;
      catSay("Мяу! Это онлайн-версия — тут я отвечаю простым кошачьим мозгом. Умный Савелий живёт в локальной версии сайта.", 300);
      setTimeout(() => catReply(text), 700);
    } else {
      setTimeout(() => catReply(text), 350);
    }
    return;
  }
  // Нейросети нет — отвечаем правилами сразу, без похода на сервер и без
  // «Савелий думает…» перед каждым отказом.
  if (aiKnownOff()) {
    addMsg(text, "user");
    setTimeout(() => catReply(text), 350);
    return;
  }
  chatBusy = true;
  setChatEnabled(false);
  addMsg(text, "user");
  showTyping();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // sync.js подключается ниже app.js, но сообщение уходит по клику —
        // к этому моменту функция уже определена
        token: typeof studentToken === "function" ? studentToken() : null,
        // Имени здесь нет намеренно: сервер пересылает профиль провайдеру
        // ИИ, а политика обещает, что имя ученика туда не уходит.
        profile: {
          level: state.level,
          levelName: LEVEL_NAMES[state.level],
          vocab: state.vocabEstimate,
          xp: state.xp,
          rank: rankInfo(state.xp).name,
          dictionary: state.dictionary.map(d => ({ w: d.w, t: d.t, status: d.status })).slice(0, 15),
        },
        voice: typeof voiceMode !== "undefined" && voiceMode,
        history: chatHistory.slice(-6),
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "server error");
    hideTyping();
    addMsg(data.reply, "cat");
    if (data.add_word && data.add_word.w) {
      addToDictionary({
        w: data.add_word.w, t: data.add_word.t || "",
        ex: data.add_word.ex || "", level: state.level,
      });
    }
    if (data.mark && data.mark.w) applyMark(data.mark);
  } catch (e) {
    hideTyping();
    if (!aiWarned) {
      aiWarned = true;
      const msg = String(e.message || "");
      // Три разных случая, и путать их нельзя: ученику на сайте бесполезно
      // советовать открыть Терминал, а разработчику — «скоро подключим»
      // not_logged_in — это ошибка НАСТРОЙКИ, и видит её ребёнок. Раньше ему
      // предлагали открыть Терминал и выполнить /login: инструкция для
      // разработчика на экране школьника. Подробности уходят в консоль,
      // ученику — человеческий текст и рабочий обходной путь.
      if (msg.includes("not_logged_in")) {
        console.warn("Савелий: ключ API не принят. Проверь savely-data/api_key.txt " +
                     "или переменную ANTHROPIC_API_KEY.");
      }
      // ai_off — нейросети нет, и это надолго: дальше не пробуем, отвечаем
      // правилами и честно говорим, что умеем. Всё остальное — временный
      // сбой: следующее сообщение снова пойдёт на сервер.
      if (msg.includes("ai_off")) aiOff = true;
      const why = msg.includes("ai_off")
        ? `Мяу! Умный чат ещё в разработке — пока отвечаю по правилам, со словарём и тренировками это не мешает. ${RULES_HELP}`
        : "Мяу, умный режим сейчас отдыхает — отвечаю простым кошачьим. Это не из-за тебя: карточки, словарь и тренировки работают как обычно.";
      catSay(why);
      setTimeout(() => catReply(text), 400);
    } else {
      setTimeout(() => catReply(text), 300);
    }
  } finally {
    chatBusy = false;
    setChatEnabled(true);
  }
}

document.getElementById("chat-form").addEventListener("submit", e => {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text || chatBusy) return;
  input.value = "";
  sendToSavely(text);
});

document.querySelectorAll("#chat-chips .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    if (chatBusy) return;
    sendToSavely(chip.dataset.chip);
  });
});

function normalize(s) {
  return s.toLowerCase().replace(/[её]/g, "е").replace(/[^a-zа-я0-9\s-]/g, "").trim();
}

function catReply(raw) {
  const text = normalize(raw);

  // — ожидаем ответ на квиз
  if (chatContext.pendingQuiz) {
    const q = chatContext.pendingQuiz;
    chatContext.pendingQuiz = null;
    const correctParts = normalize(q.t).split(/[,;(]/)[0].trim();
    const ok = text.includes(correctParts) || correctParts.includes(text) && text.length > 2;
    const real = state.dictionary.find(d => d.w === q.w);
    if (real) { srsReview(real, ok); saveState(); }
    if (ok) {
      addXP(10);
      catSay(`Мур-р, верно! «${q.w}» — ${q.t}. 😸 Ещё проверить? Скажи «проверь меня».`);
    } else {
      catSay(`Мяу, не совсем. «${q.w}» — это «${q.t}». Пример: ${q.ex || "—"} Повторим позже!`);
    }
    return;
  }

  // — добавить последнее предложенное слово
  if (/(добавь|давай в словарь|запиши)/.test(text) && chatContext.lastSuggested) {
    addToDictionary(chatContext.lastSuggested);
    catSay(`Записал «${chatContext.lastSuggested.w}» в твой словарь! Потренируй его в карточках, мяу.`);
    chatContext.lastSuggested = null;
    return;
  }

  // — новое слово
  if (/(слово|word|выучить|новое)/.test(text)) {
    if (typeof WORDS === "undefined") {
      // Словарь приехал — отвечаем на ту же просьбу сами, а не просим
      // повторить: «спрашивай ещё раз» после «дай слово» выглядело
      // как будто кот не расслышал.
      catSay("Секунду, достаю словарь…");
      ensureWords().then(() => catReply(raw))
        .catch(() => catSay("Мяу, словарь не дозвонился. Проверь интернет и спроси ещё раз."));
      return;
    }
    const inDict = new Set(state.dictionary.map(d => d.w));
    const lvl = studyLevel();
    const pool = WORDS[lvl].filter(w => !inDict.has(w.w));
    const word = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (!word) {
      catSay("Мяу, слова твоего уровня закончились! Ты всё разобрал. Скоро подвезу новых.");
      return;
    }
    chatContext.lastSuggested = { ...word, level: lvl };
    catSay(`Держи слово уровня ${lvl}:\n\n«${word.w}» — ${word.t}\nПример: ${word.ex}\n\nСказать «добавь» — и я запишу его в твой словарь.`);
    return;
  }

  // — квиз по словарю
  if (/(проверь|проверка|квиз|тест|спроси)/.test(text)) {
    if (!state.dictionary.length) {
      catSay("В твоём словаре пусто, нечего проверять! Скажи «дай слово» — начнём собирать коллекцию, мяу.");
      return;
    }
    const q = state.dictionary[Math.floor(Math.random() * state.dictionary.length)];
    chatContext.pendingQuiz = q;
    catSay(`Так-так… Как переводится «${q.w}»? 🐾`);
    return;
  }

  // — успехи
  if (/(успех|прогресс|статистика|как я|уровень|очки|звание)/.test(text)) {
    const learned = state.dictionary.filter(d => d.status === "learned").length;
    const rank = rankInfo(state.xp);
    const s = streakDays();
    catSay(`Смотри: уровень ${state.level} (${LEVEL_NAMES[state.level]}), запас ~${state.vocabEstimate} слов. В словаре ${state.dictionary.length} слов, выучено ${learned}. Звание: ${rank.name} (⭐ ${state.xp})${s >= 2 ? `, стрик 🔥 ${s} дн.` : ""}. ${learned > 3 ? "Горжусь тобой, мур!" : "Потренируйся в «Тренировках» — и цифры вырастут, мяу!"}`);
    return;
  }

  // — приветствия и болтовня
  if (/(привет|здравствуй|хай|hello|hi|ку)/.test(text)) {
    catSay(`Мяу-привет! Готов учиться? Скажи «дай слово» или «проверь меня».`);
    return;
  }
  if (/(как дела|как ты|что делаешь)/.test(text)) {
    catSay("Дремал на подоконнике и учил словарь Оксфорда. Обычный кошачий день! А ты готов позаниматься? Скажи «дай слово».");
    return;
  }
  if (/(мяу|мур|кот|кис)/.test(text)) {
    catSay("Мя-я-яу! 😸 Ты отлично говоришь по-кошачьи. Теперь давай так же с английским — скажи «дай слово».");
    return;
  }
  if (/(спасибо|благодар)/.test(text)) {
    catSay("Мур-мур, обращайся! Погладить меня можно новым выученным словом.");
    return;
  }
  if (/(пока|до свидания|бай)/.test(text)) {
    catSay("Пока-пока! Возвращайся тренировать карточки, я послежу за твоим прогрессом. Мяу!");
    return;
  }

  // — фолбэк. Без обещаний «скоро подключат»: говорим, что умеем сейчас.
  const fallbacks = [
    `Мяу, это я не разобрал. ${RULES_HELP}`,
    "Хм, почесал за ухом, но не понял. Попробуй: «дай новое слово» или «проверь меня»!",
    "Мур? Я кот простой: даю слова, проверяю и показываю прогресс. Скажи «дай слово» — и начнём.",
  ];
  catSay(fallbacks[Math.floor(Math.random() * fallbacks.length)]);
}

// ===== Старт =====
updateChrome();
// Награды за уже достигнутое (например, после пополнения списка наград).
// Проверку откладываем: achievements.js подключается ниже по странице,
// на момент выполнения этой строки функции ещё нет.
document.addEventListener("DOMContentLoaded", () => {
  // Главная рисуется в конце app.js, а награды и упражнения подключаются
  // ниже по странице — на первой отрисовке их ещё нет, и полоса наград
  // осталась бы пустой. Когда страница собрана целиком, перерисовываем.
  const dash = document.getElementById("screen-dashboard");
  if (state.user && state.level && dash && !dash.classList.contains("hidden")) {
    renderDashboard();
  }
  setTimeout(() => {
    if (typeof checkAchievements === "function") checkAchievements();
  }, 800);
});
// Словарь (326 КБ сжатыми) грузим ровно тогда, когда он нужен.
//
// Вернувшийся ученик открывает главную, а там рекомендации и слово дня —
// значит ждём. Новый видит экран приветствия: ни аккаунта, ни уровня,
// ни единого слова на экране, и качать ему словарь не за что. Он приедет,
// когда ученик нажмёт «Поехали, 36 слов» (обработчик кнопки ниже).
/* Тренировка по ссылке: index.html#train=scramble открывает упражнение
 * сразу. Появилось ради доски: репетитор кладёт на неё карточку-задание,
 * ученик нажимает — и тренировка стартует в новой вкладке, не обрывая
 * видеозвонок на доске. Неизвестный id просто открывает список
 * тренировок: страница не должна падать из-за кривой ссылки. */
function trainFromHash() {
  // Хвост &t=… в адресе — метка времени от доски (см. taskURL): без неё
  // повторное открытие того же задания в именованную вкладку не
  // перезагружало бы страницу. На разбор не влияет.
  const m = (location.hash || "").match(/^#train=([a-z]+)(?:&|$)/);
  if (!m || !state.user || !state.level) return;
  // Пришли с доски: card=… — карточка задания, в которую после финиша
  // уедет результат (см. exFinish в exercises.js).
  const cm = (location.hash || "").match(/[#&]card=([A-Za-z0-9_-]+)/);
  window.boardTaskCard = cm ? cm[1] : null;
  // Сначала экран, потом данные. Словарь качается долго (школьный
  // интернет), и пока он едет, ученик смотрел на ГЛАВНУЮ и решал, что
  // карточка-задание не сработала (видео от ахмата: три клика подряд,
  // три вкладки с дашбордом). Теперь «Тренировки» открываются мгновенно,
  // а упражнение стартует, как только словарь доехал.
  show("practice");
  // Ждём обоих: и словарь (сеть), и exercises.js (парсер). На быстрой
  // сети словарь приезжает РАНЬШЕ, чем распарсится код упражнений, —
  // и без ожидания ссылка молча оставляла список тренировок.
  const tryOpen = attempt => {
    const known = typeof EXERCISES !== "undefined"
      && EXERCISES.some(e => e.id === m[1] && !e.hidden)
      && typeof openExercise === "function";
    if (known) { openExercise(m[1]); return; }
    if (typeof EXERCISES !== "undefined") return;   // код есть, id чужой
    if (attempt < 40) setTimeout(() => tryOpen(attempt + 1), 150);
  };
  ensureWords().then(() => tryOpen(0)).catch(() => {});
}
addEventListener("hashchange", trainFromHash);

if (state.user && state.level) {
  show("dashboard");
  ensureWords().then(() => { renderDashboard(); }).catch(() => {});
  // Ссылка на тренировку главнее главной. Вызов — строго после
  // DOMContentLoaded: этот блок исполняется при разборе app.js, когда
  // exercises.js (там живёт отрисовка «Тренировок») ещё не распарсен,
  // и немедленный show("practice") падал ReferenceError-ом, убивая
  // заодно весь остаток загрузки. Словарь к DCL всё равно не готов,
  // так что мгновенность экрана не страдает.
  document.addEventListener("DOMContentLoaded", trainFromHash);
} else if (state.user) {
  document.getElementById("test-hello").textContent =
    `${state.user.name}, посчитаем, сколько слов ты уже знаешь`;
  show("test");
} else {
  show("welcome");
  // Пришли сюда из «Войти под другим» — сразу открываем вкладку входа.
  try {
    if (sessionStorage.getItem("savelyWantLogin")) {
      sessionStorage.removeItem("savelyWantLogin");
      if (typeof setAuthMode === "function") setAuthMode("login");
    }
  } catch (e) { /* приватный режим — просто останется регистрация */ }
}

/* ПРОГРЕВА СЛОВАРЯ ЗДЕСЬ НЕТ, И ЭТО ИЗМЕРЕНО.
 *
 * Была задача: подтягивать words.js заранее, чтобы ученик не ждал его
 * при нажатии «Поехали, 36 слов». Пробовали два способа, оба хуже:
 *
 *   <link rel="preload">      — ставит файл в очередь СРАЗУ и с высоким
 *                               приоритетом, то есть возвращает 326 КБ
 *                               на критический путь. Ровно то, от чего
 *                               уходили;
 *   load + requestIdleCallback — казалось безопасным. Замер на боевом:
 *                               оценка 93 → 79, главный элемент
 *                               2,6 → 4,7 с, вес первого экрана
 *                               349 → 674 КБ. Словарь всё равно уходил
 *                               в сеть раньше, чем догружались файлы
 *                               первого экрана.
 *
 * Причина простая: на экране приветствия словарь не нужен ВООБЩЕ, и
 * большинство посетителей до теста не доходят. Греть впрок — платить
 * трафиком и секундами за всех ради удобства меньшинства.
 *
 * Как есть сейчас: словарь приезжает по нажатию кнопки, кнопка на это
 * время говорит «Достаю слова…». Пара секунд у того, кто действительно
 * начал тест, против двух секунд у каждого, кто просто открыл сайт.
 */


/* ===== Выражения в словарь =====
 * Фразовые глаголы, идиомы и сочетания попадают в словарь пачкой и сразу
 * в свою папку. По одному их набирать бессмысленно, а свалить в общий
 * список — потерять: фразовый глагол и обычное слово тренируются
 * по-разному, и разделить их потом можно только руками.
 *
 * Имя папки задаётся типом, а не пользователем: это не его тема
 * («к контрольной»), а свойство самого материала. Ученик всё равно может
 * положить фразу и в свою папку сверху — папки складываются.
 */
const PHRASE_KINDS = [
  { id: "phrasal", folder: "Фразовые глаголы", title: "Фразовые глаголы" },
  { id: "idioms",  folder: "Идиомы",           title: "Идиомы" },
  { id: "colloc",  folder: "Сочетания",        title: "Сочетания" },
];

let phraseKind = "phrasal";

function phraseListFor(kind) {
  if (typeof PHRASES === "undefined") return [];
  const all = PHRASES[kind] || [];
  // Показываем уровень ученика и соседний снизу: выражение сложнее своего
  // уровня не учится, а разбивается о непонимание частей.
  const idx = LEVELS.indexOf(studyLevel());
  const near = new Set([LEVELS[Math.max(0, idx - 1)], studyLevel(),
                        LEVELS[Math.min(LEVELS.length - 1, idx + 1)]]);
  const fit = all.filter(x => near.has(x.level));
  return (fit.length >= 10 ? fit : all).slice(0, 120);
}

function renderPhrasePicker() {
  const kindsBox = document.getElementById("phrase-kinds");
  const listBox = document.getElementById("phrase-list");
  if (!kindsBox || !listBox) return;

  kindsBox.innerHTML = PHRASE_KINDS.map(k =>
    `<button class="chip dict-filter${k.id === phraseKind ? " active" : ""}"
             type="button" data-kind="${k.id}">${k.title}</button>`).join("");
  kindsBox.querySelectorAll("[data-kind]").forEach(b => {
    b.addEventListener("click", () => { phraseKind = b.dataset.kind; renderPhrasePicker(); });
  });

  const have = new Set(state.dictionary.map(d => d.w.toLowerCase()));
  const list = phraseListFor(phraseKind);
  listBox.innerHTML = list.length
    ? list.map(p => {
        const added = have.has(p.w.toLowerCase());
        return `<button class="phrase-row${added ? " added" : ""}" type="button"
                        data-w="${esc(p.w)}" ${added ? "aria-pressed=\"true\"" : ""}>
          <span class="phrase-en">${esc(p.w)}</span>
          <span class="phrase-ru">${esc(p.t)}</span>
          <span class="phrase-mark">${added ? icon("check", 18) : "+"}</span>
        </button>`;
      }).join("")
    : `<p class="muted-small">Для твоего уровня выражений пока нет.</p>`;

  listBox.querySelectorAll("[data-w]").forEach(btn => {
    btn.addEventListener("click", () => {
      const rec = (PHRASES[phraseKind] || []).find(x => x.w === btn.dataset.w);
      if (!rec) return;
      const kind = PHRASE_KINDS.find(k => k.id === phraseKind);
      const existing = state.dictionary.find(d => d.w.toLowerCase() === rec.w.toLowerCase());
      if (existing) {
        // Повторное нажатие убирает — иначе случайное касание не отменить
        state.dictionary = state.dictionary.filter(d => d !== existing);
      } else {
        createFolder(kind.folder);
        const entry = { w: rec.w, t: rec.t, ex: rec.ex, exr: rec.exr, def: rec.def,
                        cat: rec.cat, level: rec.level, kind: rec.kind,
                        literal: rec.literal, parts: rec.parts,
                        status: "new", knew: 0, forgot: 0, folders: [kind.folder] };
        if (typeof srsInit === "function") srsInit(entry);
        state.dictionary.push(entry);
      }
      saveState();
      renderPhrasePicker();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const open = document.getElementById("phrases-open");
  const close = document.getElementById("phrases-close");
  if (!open) return;
  open.addEventListener("click", () => {
    openModal("phrases-modal");
    // Выражения лежат в отдельном файле на 150 КБ и подгружаются только
    // здесь — их открывает малая часть учеников, а платили за них все.
    const list = document.getElementById("phrase-list");
    if (typeof PHRASES === "undefined" && list) {
      list.innerHTML = '<p class="muted-small">Достаю выражения…</p>';
    }
    ensurePhrases().then(renderPhrasePicker).catch(() => {
      if (list) list.innerHTML =
        '<p class="muted-small">Не получилось загрузить выражения. Проверь связь и открой ещё раз.</p>';
    });
  });
  close.addEventListener("click", () => {
    closeModal("phrases-modal");
    renderDictionary();
  });
});
