// Достижения: считаются локально по состоянию ученика,
// синхронизируются на сервер, чтобы репетитор видел успехи.

const ACHIEVEMENTS = [
  // первые шаги
  { id: "first-word",     icon: "🐾", tier: "bronze", name: "Первая добыча",      desc: "Добавить первое слово в словарь",        metric: "words_added",     threshold: 1 },
  { id: "first-lesson",   icon: "🎒", tier: "bronze", name: "Первый урок",        desc: "Пройти любую тренировку",                metric: "exercises_done",  threshold: 1 },
  { id: "level-known",    icon: "🧭", tier: "bronze", name: "Знай себя",          desc: "Пройти тест на словарный запас",         metric: "level_reached",   threshold: 1 },

  // словарь
  { id: "words-10",       icon: "📗", tier: "bronze", name: "Десяточка",          desc: "Выучить 10 слов",                        metric: "words_learned",   threshold: 10 },
  { id: "words-50",       icon: "📘", tier: "silver", name: "Полсотни",           desc: "Выучить 50 слов",                        metric: "words_learned",   threshold: 50 },
  { id: "words-150",      icon: "📚", tier: "gold",   name: "Книжный кот",        desc: "Выучить 150 слов",                       metric: "words_learned",   threshold: 150 },
  { id: "words-300",      icon: "🏛️", tier: "gold",   name: "Ходячий словарь",    desc: "Выучить 300 слов",                       metric: "words_learned",   threshold: 300 },
  { id: "collector-50",   icon: "🎒", tier: "bronze", name: "Запасливый",         desc: "Собрать 50 слов в словаре",              metric: "words_added",     threshold: 50 },

  // регулярность
  { id: "streak-3",       icon: "🔥", tier: "bronze", name: "Разогрев",           desc: "Заниматься 3 дня подряд",                metric: "streak",          threshold: 3 },
  { id: "streak-7",       icon: "🔥", tier: "silver", name: "Неделя без пропусков", desc: "Заниматься 7 дней подряд",             metric: "streak",          threshold: 7 },
  { id: "streak-30",      icon: "🌋", tier: "gold",   name: "Железная лапа",      desc: "Заниматься 30 дней подряд",              metric: "streak",          threshold: 30 },
  { id: "days-20",        icon: "📅", tier: "silver", name: "Постоянный клиент",  desc: "Заниматься в 20 разных дней",            metric: "active_days",     threshold: 20 },

  // очки и звания
  { id: "xp-100",         icon: "⭐", tier: "bronze", name: "Первая сотня",       desc: "Набрать 100 очков",                      metric: "xp",              threshold: 100 },
  { id: "xp-1000",        icon: "🌟", tier: "silver", name: "Тысячник",           desc: "Набрать 1000 очков",                     metric: "xp",              threshold: 1000 },
  { id: "xp-5000",        icon: "💫", tier: "gold",   name: "Звёздный кот",       desc: "Набрать 5000 очков",                     metric: "xp",              threshold: 5000 },

  // мастерство в тренировках
  { id: "perfect-1",      icon: "🎯", tier: "bronze", name: "Без единой ошибки",  desc: "Пройти тренировку идеально",             metric: "perfect_rounds",  threshold: 1 },
  { id: "perfect-10",     icon: "🏹", tier: "silver", name: "Меткий глаз",        desc: "10 идеальных тренировок",                metric: "perfect_rounds",  threshold: 10 },
  { id: "perfect-50",     icon: "👑", tier: "gold",   name: "Безупречный",        desc: "50 идеальных тренировок",                metric: "perfect_rounds",  threshold: 50 },
  { id: "exercises-25",   icon: "💪", tier: "bronze", name: "Втянулся",           desc: "Пройти 25 тренировок",                   metric: "exercises_done",  threshold: 25 },
  { id: "exercises-100",  icon: "🥋", tier: "silver", name: "Сотня подходов",     desc: "Пройти 100 тренировок",                  metric: "exercises_done",  threshold: 100 },
  { id: "all-modes",      icon: "🎪", tier: "gold",   name: "Универсал",          desc: "Попробовать 15 видов тренировок",        metric: "modes_tried",     threshold: 15 },

  // блиц
  { id: "blitz-100",      icon: "⚡", tier: "bronze", name: "Разогнался",         desc: "Набрать 100 очков в блице",              metric: "blitz_score",     threshold: 100 },
  { id: "blitz-300",      icon: "🌪️", tier: "silver", name: "Молния",             desc: "Набрать 300 очков в блице",              metric: "blitz_score",     threshold: 300 },
  { id: "blitz-500",      icon: "🚀", tier: "gold",   name: "Сверхзвук",          desc: "Набрать 500 очков в блице",              metric: "blitz_score",     threshold: 500 },

  // домашка и кот
  { id: "hw-1",           icon: "📋", tier: "bronze", name: "Домашку сдал",       desc: "Выполнить домашку полностью",            metric: "homework_done",   threshold: 1 },
  { id: "hw-10",          icon: "🏅", tier: "silver", name: "Отличник",           desc: "Выполнить 10 домашек",                   metric: "homework_done",   threshold: 10 },
  { id: "chat-10",        icon: "💬", tier: "bronze", name: "Разговорился",       desc: "Написать Савелию 10 сообщений",          metric: "chat_messages",   threshold: 10 },
  { id: "chat-100",       icon: "🗣️", tier: "silver", name: "Душа компании",      desc: "Написать Савелию 100 сообщений",         metric: "chat_messages",   threshold: 100 },

  // время суток
  { id: "early-bird",     icon: "🌅", tier: "silver", name: "Ранняя пташка",      desc: "Позаниматься до 8 утра",                 metric: "early_bird",      threshold: 1 },
  { id: "night-owl",      icon: "🌙", tier: "silver", name: "Ночной охотник",     desc: "Позаниматься после 23:00",               metric: "night_owl",       threshold: 1 },

  // цель
  { id: "goal-1",         icon: "✅", tier: "bronze", name: "План выполнен",      desc: "Выполнить дневную цель",                 metric: "goals_hit",       threshold: 1 },
  { id: "goal-10",        icon: "🎖️", tier: "silver", name: "Дисциплина",         desc: "Выполнить дневную цель 10 раз",          metric: "goals_hit",       threshold: 10 },
];

const TIER_COLOR = { bronze: "#C98A4B", silver: "#9AA3AD", gold: "#E0A32E" };

/** Все счётчики, по которым проверяются достижения. */
function achMetrics() {
  const dict = state.dictionary || [];
  const c = state.counters || {};
  const activeDays = Object.keys(state.activity || {}).length;
  return {
    words_learned: dict.filter(d => d.status === "learned").length,
    words_added: dict.length,
    xp: state.xp || 0,
    streak: typeof streakDays === "function" ? streakDays() : 0,
    active_days: activeDays,
    blitz_score: state.blitzBest || 0,
    exercises_done: c.exercises || 0,
    perfect_rounds: c.perfect || 0,
    homework_done: c.homework || 0,
    chat_messages: c.chat || 0,
    modes_tried: (state.modesTried || []).length,
    early_bird: c.earlyBird || 0,
    night_owl: c.nightOwl || 0,
    goals_hit: c.goalsHit || 0,
    level_reached: state.level ? 1 : 0,
  };
}

/** Проверяет условия и показывает уведомление о новых наградах. */
function checkAchievements() {
  if (!state.user) return [];
  state.achievements = state.achievements || [];
  const have = new Set(state.achievements);
  const m = achMetrics();
  const fresh = ACHIEVEMENTS.filter(a => !have.has(a.id) && (m[a.metric] || 0) >= a.threshold);
  if (!fresh.length) return [];
  fresh.forEach(a => state.achievements.push(a.id));
  saveState();
  fresh.forEach((a, i) => setTimeout(() => achToast(a), i * 2600));
  // счётчик наград на главной должен обновиться сразу
  if (typeof renderDashWidgets === "function" &&
      !document.getElementById("screen-dashboard").classList.contains("hidden")) {
    renderDashWidgets();
  }
  if (!document.getElementById("screen-achievements").classList.contains("hidden")) {
    renderAchievements();
  }
  return fresh;
}

/** Увеличивает счётчик события и сразу проверяет награды. */
function bump(counter, by = 1) {
  state.counters = state.counters || {};
  state.counters[counter] = (state.counters[counter] || 0) + by;
  // время суток отмечаем по факту ЗАНЯТИЯ, а не любого действия:
  // ночное сообщение коту — не тренировка
  if (counter === "exercises") {
    const hour = new Date().getHours();
    if (hour < 8) state.counters.earlyBird = 1;
    if (hour >= 23) state.counters.nightOwl = 1;
  }
  saveState();
  checkAchievements();
}

function markMode(id) {
  state.modesTried = state.modesTried || [];
  if (!state.modesTried.includes(id)) {
    state.modesTried.push(id);
    saveState();
    checkAchievements();   // иначе награда всплывала бы с задержкой
  }
}

function achToast(a) {
  const box = document.createElement("div");
  box.className = "ach-toast";
  box.innerHTML = `
    <span class="ach-toast-icon" style="background:${TIER_COLOR[a.tier]}22">${a.icon}</span>
    <span>
      <b>Награда: ${a.name}</b>
      <i>${a.desc}</i>
    </span>`;
  document.body.appendChild(box);
  requestAnimationFrame(() => box.classList.add("show"));
  if (typeof speak === "function" && false) speak(a.name);
  setTimeout(() => {
    box.classList.remove("show");
    setTimeout(() => box.remove(), 400);
  }, 4200);
}

/** Экран «Награды» */
function renderAchievements() {
  const box = document.getElementById("ach-grid");
  if (!box) return;
  const have = new Set(state.achievements || []);
  const m = achMetrics();
  document.getElementById("ach-count").textContent = `${have.size} из ${ACHIEVEMENTS.length}`;
  box.innerHTML = ACHIEVEMENTS.map(a => {
    const done = have.has(a.id);
    const cur = Math.min(m[a.metric] || 0, a.threshold);
    const pct = Math.round((cur / a.threshold) * 100);
    return `
      <div class="card ach-card${done ? " ach-done" : ""}">
        <span class="ach-icon" style="background:${done ? TIER_COLOR[a.tier] + "22" : "#EFEAE3"}">${done ? a.icon : "🔒"}</span>
        <b class="ach-name">${a.name}</b>
        <span class="ach-desc">${a.desc}</span>
        ${done
          ? `<span class="ach-got" style="color:${TIER_COLOR[a.tier]}">получено</span>`
          : `<div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
             <span class="ach-progress">${cur} / ${a.threshold}</span>`}
      </div>`;
  }).join("");
}
