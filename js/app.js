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
  state.xp += n;
  state.activity[dayKey()] = (state.activity[dayKey()] || 0) + n;
  saveState();
  updateChrome();
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
}

// ===== Навигация =====
const screens = ["welcome", "test", "dashboard", "dictionary", "trainer", "practice", "exercise", "chat"];

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
  if (screen === "test") resetTestScreen();
  if (screen === "dashboard") renderDashboard();
  if (screen === "dictionary") renderDictionary();
  if (screen === "trainer") startTraining();
  if (screen === "practice") renderPracticeHub();
  if (screen === "chat") initChat();
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
document.getElementById("logout-btn").addEventListener("click", () => {
  const btn = document.getElementById("logout-btn");
  if (!logoutArmed) {
    logoutArmed = true;
    btn.textContent = "точно сбросить всё?";
    btn.classList.add("danger");
    logoutTimer = setTimeout(() => {
      logoutArmed = false;
      btn.textContent = "выйти";
      btn.classList.remove("danger");
    }, 4000);
    return;
  }
  clearTimeout(logoutTimer);
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

function updateChrome() {
  if (state.user) document.getElementById("user-name-chip").textContent = state.user.name;
  document.getElementById("user-level-chip").textContent = state.level || "—";
  document.getElementById("dict-count").textContent = state.dictionary.length;
  const rank = rankInfo(state.xp);
  const xpChip = document.getElementById("xp-chip");
  xpChip.textContent = "⭐ " + state.xp;
  xpChip.title = rank.name + (rank.next ? ` · до «${rank.next.name}» ${rank.next.xp - state.xp} очков` : "");
  const s = streakDays();
  const streakChip = document.getElementById("streak-chip");
  streakChip.classList.toggle("hidden", s < 2);
  streakChip.textContent = "🔥" + s;
}

// ===== Тест словарного запаса =====
const TEST_PER_LEVEL = 5;
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
  // уровень = самый высокий, где известно >= 60% слов (и все уровни ниже тоже пройдены)
  let level = "A1";
  for (const lvl of LEVELS) {
    if (testAnswers[lvl] / TEST_PER_LEVEL >= 0.6) level = lvl;
    else break;
  }
  // оценка словарного запаса: доля знакомых слов уровня * примерный объём уровня
  let vocab = 0;
  LEVELS.forEach(lvl => {
    vocab += (testAnswers[lvl] / TEST_PER_LEVEL) * LEVEL_VOCAB_SIZE[lvl];
  });
  vocab = Math.round(vocab / 50) * 50;

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
  document.getElementById("result-comment").textContent = "🐈 " + comments[level];
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
  const poolNext = WORDS[nextLvl].filter(w => !inDict.has(w.w) && !seen.has(w.w)).map(w => ({ ...w, level: nextLvl }));

  let picks = [...sample(poolMain, 4), ...sample(poolNext, 2)];
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
  document.getElementById("dash-stats").textContent =
    `Уровень ${state.level} (${LEVEL_NAMES[state.level]}) · словарный запас ~${state.vocabEstimate} слов · в словаре: ${state.dictionary.length}`;
  renderDashWidgets();
  if (!currentRecs.length) currentRecs = pickRecommendations();
  renderRecGrid();
}

function renderDashWidgets() {
  const learned = state.dictionary.filter(d => d.status === "learned").length;
  const learning = state.dictionary.filter(d => d.status === "learning").length;
  const fresh = state.dictionary.filter(d => d.status === "new").length;
  const rank = rankInfo(state.xp);
  const s = streakDays();
  document.getElementById("dash-widgets").innerHTML = `
    <div class="card stat-card">
      <p class="stat-label">Звание</p>
      <p class="stat-value">${rank.name}</p>
      <div class="xp-bar"><div class="xp-bar-fill" style="width:${Math.round(rank.progress * 100)}%"></div></div>
      <p class="stat-note">⭐ ${state.xp}${rank.next ? " · до «" + rank.next.name + "» ещё " + (rank.next.xp - state.xp) : ""}</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Слова</p>
      <p class="stat-value">${learned} <span class="stat-unit">выучено</span></p>
      <p class="stat-note">учу: ${learning} · новых: ${fresh}</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Стрик</p>
      <p class="stat-value">🔥 ${s} <span class="stat-unit">${s === 1 ? "день" : s >= 2 && s <= 4 ? "дня" : "дней"}</span></p>
      <p class="stat-note">${s ? "занимайся каждый день!" : "начни сегодня, мяу!"}</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Блиц-рекорд</p>
      <p class="stat-value">⚡ ${state.blitzBest}</p>
      <p class="stat-note"><button class="link-btn" id="retake-test-btn">перепройти тест уровня</button></p>
    </div>`;
  document.getElementById("retake-test-btn").addEventListener("click", () => show("test"));
}

function renderRecGrid() {
  const grid = document.getElementById("recommend-grid");
  grid.innerHTML = "";
  const inDict = new Set(state.dictionary.map(d => d.w));
  currentRecs.forEach(rec => {
    const card = document.createElement("div");
    card.className = "card word-card";
    card.innerHTML = `
      <span class="w-level">${rec.level}</span>
      <div class="w-en">${rec.w} <button class="say-btn" title="Произношение">🔊</button></div>
      <div class="w-ru">${rec.t}</div>
      <div class="w-ex">${rec.ex}</div>
    `;
    card.querySelector(".say-btn").addEventListener("click", () => speak(rec.w));
    if (inDict.has(rec.w)) {
      const done = document.createElement("div");
      done.className = "added";
      done.textContent = "✓ в словаре";
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
  state.dictionary.push({
    w: word.w, t: word.t, ex: word.ex || "", level: word.level || state.level,
    status: "new", knew: 0, forgot: 0,
  });
  saveState();
  updateChrome();
}

function renderDictionary() {
  updateChrome();
  const list = document.getElementById("dict-list");
  const empty = document.getElementById("dict-empty");
  list.innerHTML = "";
  empty.classList.toggle("hidden", state.dictionary.length > 0);

  const statusText = { new: "новое", learning: "учу", learned: "выучено" };
  state.dictionary.forEach((d, i) => {
    const row = document.createElement("div");
    row.className = "dict-row";
    row.innerHTML = `
      <span class="d-en">${d.w} <button class="say-btn" title="Произношение">🔊</button></span>
      <span class="d-ru">${d.t}</span>
      <span class="d-status ${d.status}">${statusText[d.status]}</span>
    `;
    row.querySelector(".say-btn").addEventListener("click", () => speak(d.w));
    const del = document.createElement("button");
    del.className = "d-del";
    del.title = "Удалить";
    del.textContent = "✕";
    del.addEventListener("click", () => {
      state.dictionary.splice(i, 1);
      saveState();
      renderDictionary();
    });
    row.appendChild(del);
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
  const empty = document.getElementById("trainer-empty");
  const run = document.getElementById("trainer-run");
  const done = document.getElementById("trainer-done");
  done.classList.add("hidden");

  if (!state.dictionary.length) {
    empty.classList.remove("hidden");
    run.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  run.classList.remove("hidden");

  // интервальное повторение (упрощённое): сначала невыученные,
  // слова с ошибками — чаще; максимум 10 за подход
  const priority = { new: 0, learning: 1, learned: 2 };
  trainQueue = [...state.dictionary]
    .sort((a, b) =>
      priority[a.status] - priority[b.status] ||
      (b.forgot - b.knew) - (a.forgot - a.knew) ||
      Math.random() - 0.5)
    .slice(0, 10);
  trainIndex = 0;
  trainScore = 0;
  renderFlashcard();
}

function renderFlashcard() {
  const card = document.getElementById("flashcard");
  card.classList.remove("flipped");
  const item = trainQueue[trainIndex];
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

document.getElementById("flashcard").addEventListener("click", () => {
  document.getElementById("flashcard").classList.add("flipped");
  setFlashButtons(true);
});

function answerFlash(knew) {
  const item = trainQueue[trainIndex];
  const real = state.dictionary.find(d => d.w === item.w);
  if (real) {
    if (knew) {
      real.knew++;
      real.status = real.knew >= 3 ? "learned" : "learning";
    } else {
      real.forgot++;
      real.knew = 0;
      real.status = "learning";
    }
  }
  if (knew) { trainScore++; addXP(8); }
  saveState();

  trainIndex++;
  if (trainIndex < trainQueue.length) {
    renderFlashcard();
  } else {
    document.getElementById("trainer-run").classList.add("hidden");
    document.getElementById("trainer-done").classList.remove("hidden");
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
  document.querySelectorAll(".chip").forEach(c => c.disabled = !on);
  if (on) document.getElementById("chat-input").focus();
}

function applyMark(mark) {
  const d = state.dictionary.find(x => x.w.toLowerCase() === String(mark.w || "").toLowerCase());
  if (!d) return;
  if (mark.correct) {
    d.knew++;
    d.status = d.knew >= 3 ? "learned" : "learning";
    addXP(10);
  } else {
    d.forgot++;
    d.knew = 0;
    d.status = "learning";
  }
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
        profile: {
          name: state.user.name,
          level: state.level,
          levelName: LEVEL_NAMES[state.level],
          vocab: state.vocabEstimate,
          xp: state.xp,
          rank: rankInfo(state.xp).name,
          dictionary: state.dictionary.map(d => ({ w: d.w, t: d.t, status: d.status })).slice(0, 40),
        },
        history: chatHistory.slice(-12),
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
      const why = String(e.message || "").includes("not_logged_in")
        ? "Мяу! Мой большой мозг ещё не подключён: открой Терминал, запусти команду claude и выполни /login (вход по подписке). А пока отвечаю простым кошачьим мозгом."
        : "Мяу, большой мозг сейчас недоступен — отвечаю простым кошачьим мозгом.";
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

document.querySelectorAll(".chip").forEach(chip => {
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
    if (ok) {
      if (real) { real.knew++; real.status = real.knew >= 3 ? "learned" : "learning"; saveState(); }
      addXP(10);
      catSay(`Мур-р, верно! «${q.w}» — ${q.t}. 😸 Ещё проверить? Скажи «проверь меня».`);
    } else {
      if (real) { real.forgot++; real.knew = 0; real.status = "learning"; saveState(); }
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
if (state.user && state.level) {
  show("dashboard");
} else if (state.user) {
  document.getElementById("test-hello").textContent =
    `${state.user.name}, давай проверим твой словарный запас!`;
  show("test");
} else {
  show("welcome");
}
