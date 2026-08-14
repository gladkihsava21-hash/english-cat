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
  };
  // миграция старых сохранений
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
  // словам из старых версий добавляем поля интервального повторения
  if (typeof srsInit === "function") st.dictionary.forEach(srsInit);
  return st;
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
    b.classList.toggle("active", b.dataset.nav === screen ||
      (b.dataset.nav === "practice" && (screen === "trainer" || screen === "exercise")));
  });
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (screen !== "chat" && typeof deactivateVoice === "function") deactivateVoice();
  if (screen === "test") resetTestScreen();
  if (screen === "dashboard") renderDashboard();
  if (screen === "dashboard" && typeof renderLessonBox === "function") renderLessonBox();
  if (screen === "dictionary") renderDictionary();
  if (screen === "trainer") startTraining();
  if (screen === "practice") renderPracticeHub();
  if (screen === "achievements") renderAchievements();
  if (screen === "chat") initChat();
  if (screen === "account") renderAccount();
  window.scrollTo(0, 0);
}

function resetTestScreen() {
  document.getElementById("test-intro").classList.remove("hidden");
  document.getElementById("test-run").classList.add("hidden");
  document.getElementById("test-result").classList.add("hidden");
  if (state.user) {
    document.getElementById("test-hello").textContent =
      `${state.user.name}, давай проверим твой словарный запас!`;
  }
}

document.addEventListener("click", e => {
  const nav = e.target.closest("[data-nav]");
  if (nav) show(nav.dataset.nav);
});

// ===== Регистрация / вход =====
let authMode = "register";

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    authMode = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    document.getElementById("email-row").classList.toggle("hidden", authMode === "login");
    document.getElementById("auth-submit").textContent =
      authMode === "register" ? "Создать аккаунт" : "Войти";
  });
});

document.getElementById("auth-form").addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  if (!name) return;
  state.user = { name, email: document.getElementById("reg-email").value.trim() };
  saveState();
  if (typeof joinTutor === "function") joinTutor(name);
  updateChrome();
  if (state.level) {
    show("dashboard");
  } else {
    document.getElementById("test-hello").textContent =
      `${name}, давай проверим твой словарный запас!`;
    show("test");
  }
});

// подтверждение без системного confirm() — он блокируется во встроенных браузерах
let logoutArmed = false;
let logoutTimer = null;
// вход по личному коду (перенос прогресса с другого устройства)
document.getElementById("show-restore").addEventListener("click", () => {
  document.getElementById("restore-card").classList.remove("hidden");
  document.querySelector(".auth-card:not(#restore-card)").classList.add("hidden");
});
document.getElementById("hide-restore").addEventListener("click", () => {
  document.getElementById("restore-card").classList.add("hidden");
  document.querySelector(".auth-card:not(#restore-card)").classList.remove("hidden");
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
  location.reload();
}

/* Выход был устроен как «сбросить всё»: одна кнопка, никакого способа
   просто пересесть. А устройство сплошь и рядом общее — планшет на двоих
   детей, компьютер в классе, — и второму ученику приходилось стирать
   первого. При этом прогресс всё это время лежал на сервере: терялся не он,
   а ВОЗМОЖНОСТЬ ВЕРНУТЬСЯ, потому что личный код никто не записывал.
   Поэтому теперь выход показывает код и требует подтвердить, что он
   записан, а стирание вынесено отдельным действием. */
document.getElementById("logout-btn").addEventListener("click", () => {
  const box = document.getElementById("logout-modal");
  const safe = progressIsOnServer();
  document.getElementById("logout-code").textContent = state.restoreCode || "—";
  document.getElementById("logout-code-row").classList.toggle("hidden", !safe);
  document.getElementById("logout-safe").classList.toggle("hidden", !safe);
  document.getElementById("logout-unsafe").classList.toggle("hidden", safe);
  document.getElementById("logout-go").disabled = safe;   // включит галочка
  document.getElementById("logout-ack").checked = false;
  box.classList.remove("hidden");
});

document.addEventListener("DOMContentLoaded", () => {
  const $ = id => document.getElementById(id);
  const box = $("logout-modal");
  if (!box) return;

  $("logout-ack").addEventListener("change", e => {
    $("logout-go").disabled = !e.target.checked;
  });
  $("logout-cancel").addEventListener("click", () => box.classList.add("hidden"));
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
let testWords = [];
let testIndex = 0;
let testAnswers = {}; // level -> known count

function sample(arr, n) {
  const copy = [...arr];
  const out = [];
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
  }
  return out;
}

document.getElementById("start-test-btn").addEventListener("click", () => {
  testWords = [];
  LEVELS.forEach(lvl => {
    sample(WORDS[lvl], TEST_PER_LEVEL).forEach(w => testWords.push({ ...w, level: lvl }));
  });
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
}

function answerTest(knows) {
  if (knows) testAnswers[testWords[testIndex].level]++;
  testIndex++;
  if (testIndex < testWords.length) {
    renderTestWord();
  } else {
    finishTest();
  }
}

document.getElementById("btn-know").addEventListener("click", () => answerTest(true));
document.getElementById("btn-dont-know").addEventListener("click", () => answerTest(false));

function finishTest() {
  // Уровень: самый высокий, где ученик знает хотя бы 60% слов И в среднем
  // уверенно держит всё до него. Прежний вариант обрывался на первом же
  // блоке ниже порога — один неудачный ответ на A1 отбрасывал с C2 на A1,
  // хотя блок это всего несколько случайных слов.
  let level = LEVELS[0];
  LEVELS.forEach((lvl, i) => {
    const share = testAnswers[lvl] / TEST_PER_LEVEL;
    const avgBelow = LEVELS.slice(0, i + 1)
      .reduce((s, l) => s + testAnswers[l] / TEST_PER_LEVEL, 0) / (i + 1);
    if (share >= 0.6 && avgBelow >= 0.65) level = lvl;
  });
  // Оценка словарного запаса: доля знакомых слов уровня × его объём.
  // Никаких множителей «достигнут / не достигнут» — они делали оценку
  // немонотонной: ученик, ответивший верно БОЛЬШЕ раз, мог получить
  // запас меньше, чем тот, кто знал меньше.
  let vocab = 0;
  LEVELS.forEach(lvl => {
    vocab += (testAnswers[lvl] / TEST_PER_LEVEL) * LEVEL_VOCAB_SIZE[lvl];
  });
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

  const comments = {
    A1: "Отличный старт! Начнём с самых нужных слов — скоро заговоришь, мяу!",
    A2: "Хорошая база! Будем наращивать словарь каждый день, мур.",
    B1: "Солидно! Ты понимаешь больше, чем средний кот. Идём к B2!",
    B2: "Мур-мур, впечатляет! Осталось отполировать до продвинутого уровня.",
    C1: "Ого! Ты почти как я. Будем добивать редкие и красивые слова.",
    C2: "Мяу?! Может, это ТЫ будешь меня учить? Но пару слов я всё же найду.",
  };
  document.getElementById("result-comment").textContent = comments[level];
}

document.getElementById("to-dashboard-btn").addEventListener("click", () => show("dashboard"));

// ===== Главная: подбор слов =====
const RECOMMEND_COUNT = 6;

function pickRecommendations() {
  const lvl = state.level || "A1";
  const nextLvl = LEVELS[Math.min(LEVELS.indexOf(lvl) + 1, LEVELS.length - 1)];
  const inDict = new Set(state.dictionary.map(d => d.w));
  const seen = new Set(state.recommendSeen);

  const poolMain = WORDS[lvl].filter(w => !inDict.has(w.w) && !seen.has(w.w)).map(w => ({ ...w, level: lvl }));
  const mainPicks = sample(poolMain, 4);
  // на C2 nextLvl совпадает с текущим — исключаем уже выбранное,
  // иначе одно слово попадает на главную двумя карточками сразу
  const takenNow = new Set(mainPicks.map(w => w.w));
  const poolNext = WORDS[nextLvl]
    .filter(w => !inDict.has(w.w) && !seen.has(w.w) && !takenNow.has(w.w))
    .map(w => ({ ...w, level: nextLvl }));

  let picks = [...mainPicks, ...sample(poolNext, 2)];
  // если свежие слова кончились — показываем уже виденные (но не из словаря)
  if (picks.length < RECOMMEND_COUNT) {
    const fallback = [...WORDS[lvl].map(w => ({ ...w, level: lvl })), ...WORDS[nextLvl].map(w => ({ ...w, level: nextLvl }))]
      .filter(w => !inDict.has(w.w) && !picks.some(p => p.w === w.w));
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
  const pool = WORDS[state.level] || WORDS.A1;
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
  const hw = (state.homework || []).find(t => {
    if (typeof homeworkProgress !== "function" || !t.words) return false;
    const p = homeworkProgress(t);
    return p.total && p.done < p.total;
  });
  if (hw) {
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
      sub: `${RECOMMEND_COUNT} слов уровня ${state.level} — карточки с картинкой и звуком. Завтра напомню их повторить.`,
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
    sub: `Повторять пока нечего — возьмём слова уровня ${state.level}. До цели дня ещё ${goal - got} очков.`,
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
  (task.words || []).forEach(w => addToDictionary({
    w: w.w, t: w.t, ex: w.ex || "", level: w.level || state.level,
  }));
  if (typeof renderHomework === "function") renderHomework();
  // Ведём на упражнение С ПРОВЕРКОЙ, а не на карточки. Карточки — самооценка,
  // и с недавних пор они домашку не закрывают: репетитор должен видеть
  // «сдал» только тогда, когда ответ действительно сверялся. Если оставить
  // здесь тренажёр, домашку стало бы невозможно закрыть в принципе.
  if (typeof openExercise === "function") openExercise("spelling");
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
      <p class="stat-note">подобраны под уровень ${state.level} — с них и начнём</p>`}
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
    + (dictFolder
      ? `<button class="link-btn folder-del" type="button" id="folder-del">удалить «${esc(dictFolder)}»</button>`
      : "");

  box.querySelectorAll("[data-folder]").forEach(b => {
    b.addEventListener("click", () => {
      dictFolder = b.dataset.folder || null;
      renderDictionary();
    });
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

/** Окно «в какую папку положить слово». Работает как переключатели:
 *  слово может лежать сразу в нескольких папках — «неправильные глаголы»
 *  и «к контрольной» не исключают друг друга. */
function openFolderPicker(word) {
  const modal = document.getElementById("folder-modal");
  const pick = document.getElementById("folder-pick");
  document.getElementById("folder-modal-title").textContent = `«${word.w}» — в какую папку?`;

  const draw = () => {
    const names = allFolders();
    const mine = word.folders || [];
    pick.innerHTML = names.length
      ? names.map(n => `
          <label class="ack-row">
            <input type="checkbox" data-f="${esc(n)}"${mine.includes(n) ? " checked" : ""}>
            <span>${esc(n)}</span>
          </label>`).join("")
      : `<p class="muted-small">Папок пока нет — создай первую.</p>`;
    pick.querySelectorAll("input[data-f]").forEach(cb => {
      cb.addEventListener("change", () => {
        word.folders = word.folders || [];
        const name = cb.dataset.f;
        if (cb.checked) {
          if (!word.folders.includes(name)) word.folders.push(name);
        } else {
          word.folders = word.folders.filter(x => x !== name);
        }
        saveState();
        renderFolders();
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
  modal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const close = document.getElementById("folder-close");
  if (close) close.addEventListener("click", () => {
    document.getElementById("folder-modal").classList.add("hidden");
    renderDictionary();
  });
});

document.getElementById("dict-search").addEventListener("input", renderDictionary);

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
  items.forEach(d => {
    const info0 = (typeof wordInfo === "function" && wordInfo(d.w)) || {};
    const row = document.createElement("div");
    row.className = "dict-row";
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
      <span class="word-art word-art-tiny" aria-hidden="true" style="background:${wordTint(info0.cat)}">${wordArtHTML(d.w, info0.cat)}</span>
      <span class="d-en" lang="en">${esc(d.w)} <button class="say-btn" aria-label="Произношение: ${esc(d.w)}">${icon('sound', 18)}</button></span>
      <span class="d-ru">${esc(d.t)}</span>
      <span class="d-status ${d.status}">${statusText[d.status]}</span>
    `;
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

document.getElementById("add-word-form").addEventListener("submit", e => {
  e.preventDefault();
  const en = document.getElementById("add-word-en").value.trim();
  const ru = document.getElementById("add-word-ru").value.trim();
  if (!en || !ru) return;
  addToDictionary({ w: en, t: ru, ex: "", level: state.level });
  document.getElementById("add-word-en").value = "";
  document.getElementById("add-word-ru").value = "";
  renderDictionary();
});

document.getElementById("train-btn").addEventListener("click", () => show("practice"));

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

function flipFlashcard() {
  const card = document.getElementById("flashcard");
  card.classList.add("flipped");
  card.setAttribute("aria-expanded", "true");
  setFlashFaces(true);
  setFlashButtons(true);
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
  }
}

document.getElementById("flash-knew").addEventListener("click", () => answerFlash(true));
document.getElementById("flash-forgot").addEventListener("click", () => answerFlash(false));
document.getElementById("train-again-btn").addEventListener("click", startTraining);

// ===== Чат с Савелием =====
// Основной мозг: Claude через локальный сервер (/api/chat, работает от подписки).
// Запасной мозг: локальные правила (catReply) — если сервер или логин недоступны.
let chatInited = false;
let chatBusy = false;
let aiWarned = false;
let chatHistory = [];
let chatContext = { pendingQuiz: null, lastSuggested: null };

function initChat() {
  if (chatInited) return;
  chatInited = true;
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
        profile: {
          name: state.user.name,
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
      const why = msg.includes("ai_off")
        ? "Мяу! Большой мозг пока не подключён — отвечаю простым кошачьим. Со словарём и тренировками это не мешает."
        : "Мяу, большой мозг сейчас отдыхает — отвечаю простым кошачьим. Это не из-за тебя: карточки, словарь и тренировки работают как обычно.";
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
    const inDict = new Set(state.dictionary.map(d => d.w));
    const lvl = state.level || "A1";
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

  // — фолбэк
  const fallbacks = [
    "Мяу, я пока кот на тестовой версии — понимаю не всё. Скажи «дай слово», «проверь меня» или «как мои успехи?».",
    "Хм, почесал за ухом, но не понял. Попробуй: «дай новое слово» или «проверь меня»!",
    "Мур? Скоро мне подключат большой кошачий мозг (настоящий ИИ), а пока я умею: давать слова, проверять и показывать прогресс.",
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
if (state.user && state.level) {
  show("dashboard");
} else if (state.user) {
  document.getElementById("test-hello").textContent =
    `${state.user.name}, давай проверим твой словарный запас!`;
  show("test");
} else {
  show("welcome");
}

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
  const idx = LEVELS.indexOf(state.level || "A1");
  const near = new Set([LEVELS[Math.max(0, idx - 1)], state.level || "A1",
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
    document.getElementById("phrases-modal").classList.remove("hidden");
    renderPhrasePicker();
  });
  close.addEventListener("click", () => {
    document.getElementById("phrases-modal").classList.add("hidden");
    renderDictionary();
  });
});
