// Достижения: считаются локально по состоянию ученика,
// синхронизируются на сервер, чтобы репетитор видел успехи.

// Разделы экрана наград. 32 карточки одним потоком читались стеной
// одинаковых плиток; группы дают глазу порядок чтения, а ученику —
// понимание, за что вообще дают награды. Порядок = порядок на экране.
const ACH_GROUPS = [
  { id: "first",    title: "Первые шаги" },
  { id: "words",    title: "Словарь" },
  { id: "xp",       title: "Очки и звания" },
  { id: "habit",    title: "День за днём" },
  { id: "training", title: "Тренировки" },
  { id: "blitz",    title: "Блиц" },
  { id: "together", title: "Домашка и Савелий" },
  { id: "special",  title: "Жаворонки и совы" },
];

const ACHIEVEMENTS = [
  // первые шаги
  { id: "first-word",     icon: "paw",        tier: "bronze", group: "first",    name: "Первая добыча",      desc: "Добавить первое слово в словарь",        metric: "words_added",     threshold: 1 },
  { id: "first-lesson",   icon: "flashcards", tier: "bronze", group: "first",    name: "Первый урок",        desc: "Пройти любую тренировку",                metric: "exercises_done",  threshold: 1 },
  { id: "level-known",    icon: "sparkle",    tier: "bronze", group: "first",    name: "Знай себя",          desc: "Пройти тест на словарный запас",         metric: "level_reached",   threshold: 1 },

  // словарь
  { id: "words-10",       icon: "book",       tier: "bronze", group: "words",    name: "Десяточка",          desc: "Выучить 10 слов",                        metric: "words_learned",   threshold: 10 },
  { id: "words-50",       icon: "books",      tier: "silver", group: "words",    name: "Полсотни",           desc: "Выучить 50 слов",                        metric: "words_learned",   threshold: 50 },
  { id: "words-150",      icon: "library",    tier: "gold",   group: "words",    name: "Книжный кот",        desc: "Выучить 150 слов",                       metric: "words_learned",   threshold: 150 },
  { id: "words-300",      icon: "grad",       tier: "gold",   group: "words",    name: "Ходячий словарь",    desc: "Выучить 300 слов",                       metric: "words_learned",   threshold: 300 },
  { id: "collector-50",   icon: "acorn",      tier: "bronze", group: "words",    name: "Запасливый",         desc: "Собрать 50 слов в словаре",              metric: "words_added",     threshold: 50 },

  // очки и звания
  { id: "xp-100",         icon: "star",       tier: "bronze", group: "xp",       name: "Первая сотня",       desc: "Набрать 100 очков",                      metric: "xp",              threshold: 100 },
  { id: "xp-1000",        icon: "stars",      tier: "silver", group: "xp",       name: "Тысячник",           desc: "Набрать 1000 очков",                     metric: "xp",              threshold: 1000 },
  { id: "xp-5000",        icon: "medal",      tier: "gold",   group: "xp",       name: "Звёздный кот",       desc: "Набрать 5000 очков",                     metric: "xp",              threshold: 5000 },

  // регулярность и цель дня
  { id: "streak-3",       icon: "streak",     tier: "bronze", group: "habit",    name: "Разогрев",           desc: "Заниматься 3 дня подряд",                metric: "streak",          threshold: 3 },
  { id: "streak-7",       icon: "calendar",   tier: "silver", group: "habit",    name: "Неделя без пропусков", desc: "Заниматься 7 дней подряд",             metric: "streak",          threshold: 7 },
  { id: "streak-30",      icon: "trophy",     tier: "gold",   group: "habit",    name: "Железная лапа",      desc: "Заниматься 30 дней подряд",              metric: "streak",          threshold: 30 },
  { id: "days-20",        icon: "refresh",    tier: "silver", group: "habit",    name: "Постоянный клиент",  desc: "Заниматься в 20 разных дней",            metric: "active_days",     threshold: 20 },
  { id: "goal-1",         icon: "flag",       tier: "bronze", group: "habit",    name: "План выполнен",      desc: "Выполнить дневную цель",                 metric: "goals_hit",       threshold: 1 },
  { id: "goal-10",        icon: "check",      tier: "silver", group: "habit",    name: "Дисциплина",         desc: "Выполнить дневную цель 10 раз",          metric: "goals_hit",       threshold: 10 },

  // мастерство в тренировках
  { id: "perfect-1",      icon: "target",     tier: "bronze", group: "training", name: "Без единой ошибки",  desc: "Пройти тренировку идеально",             metric: "perfect_rounds",  threshold: 1 },
  { id: "perfect-10",     icon: "eye",        tier: "silver", group: "training", name: "Меткий глаз",        desc: "10 идеальных тренировок",                metric: "perfect_rounds",  threshold: 10 },
  { id: "perfect-50",     icon: "gem",        tier: "gold",   group: "training", name: "Безупречный",        desc: "50 идеальных тренировок",                metric: "perfect_rounds",  threshold: 50 },
  { id: "exercises-25",   icon: "mcq",        tier: "bronze", group: "training", name: "Втянулся",           desc: "Пройти 25 тренировок",                   metric: "exercises_done",  threshold: 25 },
  { id: "exercises-100",  icon: "clock",      tier: "silver", group: "training", name: "Сотня подходов",     desc: "Пройти 100 тренировок",                  metric: "exercises_done",  threshold: 100 },
  { id: "all-modes",      icon: "categories", tier: "gold",   group: "training", name: "Универсал",          desc: "Попробовать 15 видов тренировок",        metric: "modes_tried",     threshold: 15 },

  // блиц
  { id: "blitz-100",      icon: "rocket",     tier: "bronze", group: "blitz",    name: "Разогнался",         desc: "Набрать 100 очков в блице",              metric: "blitz_score",     threshold: 100 },
  { id: "blitz-300",      icon: "blitz",      tier: "silver", group: "blitz",    name: "Молния",             desc: "Набрать 300 очков в блице",              metric: "blitz_score",     threshold: 300 },
  { id: "blitz-500",      icon: "sound",      tier: "gold",   group: "blitz",    name: "Сверхзвук",          desc: "Набрать 500 очков в блице",              metric: "blitz_score",     threshold: 500 },

  // домашка и кот
  { id: "hw-1",           icon: "note",       tier: "bronze", group: "together", name: "Домашку сдал",       desc: "Выполнить домашку полностью",            metric: "homework_done",   threshold: 1 },
  { id: "hw-10",          icon: "diploma",    tier: "silver", group: "together", name: "Отличник",           desc: "Выполнить 10 домашек",                   metric: "homework_done",   threshold: 10 },
  { id: "chat-10",        icon: "chat",       tier: "bronze", group: "together", name: "Разговорился",       desc: "Написать Савелию 10 сообщений",          metric: "chat_messages",   threshold: 10 },
  { id: "chat-100",       icon: "chats",      tier: "silver", group: "together", name: "Душа компании",      desc: "Написать Савелию 100 сообщений",         metric: "chat_messages",   threshold: 100 },

  // время суток
  { id: "early-bird",     icon: "sunrise",    tier: "silver", group: "special",  name: "Ранняя пташка",      desc: "Позаниматься до 8 утра",                 metric: "early_bird",      threshold: 1 },
  { id: "night-owl",      icon: "moon",       tier: "silver", group: "special",  name: "Ночной охотник",     desc: "Позаниматься после 23:00",               metric: "night_owl",       threshold: 1 },
];

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
  box.setAttribute("role", "status");
  box.innerHTML = `
    <span class="ach-toast-icon" aria-hidden="true"
          style="background:var(--surface-alt)">${icon(a.icon, 22)}</span>
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

/** Экран «Награды»: разделы из ACH_GROUPS, внутри каждого — своя сетка.
 *  Заголовок раздела — h3 (ступень «секция» из лестницы заголовков),
 *  справа счётчик «столько-то получено». */
function renderAchievements() {
  const box = document.getElementById("ach-grid");
  if (!box) return;
  const have = new Set(state.achievements || []);
  const m = achMetrics();
  document.getElementById("ach-count").textContent = `${have.size} из ${ACHIEVEMENTS.length}`;
  // Ступень награды — классом, а не инлайновым цветом: бронза, серебро и
  // золото это три ступени светлоты одного шалфея (см. a11y.css), пастель
  // порядка не образует — у голубого и розового нет «больше» и «меньше».
  box.innerHTML = ACH_GROUPS.map(g => {
    const list = ACHIEVEMENTS.filter(a => a.group === g.id);
    if (!list.length) return "";
    const got = list.filter(a => have.has(a.id)).length;
    return `
      <section class="ach-group">
        <div class="section-head ach-group-head">
          <h3>${g.title}<span class="muted-small">получено ${got} из ${list.length}</span></h3>
        </div>
        <div class="ach-grid">
        ${list.map(a => {
          const done = have.has(a.id);
          const cur = Math.min(m[a.metric] || 0, a.threshold);
          const pct = Math.round((cur / a.threshold) * 100);
          return `
          <div class="card ach-card ach-tier-${a.tier}${done ? " ach-done" : ""}">
            <span class="ach-icon">${icon(a.icon, 28)}${done ? "" : `<span class="ach-lock">${icon("lock", 12)}</span>`}</span>
            <b class="ach-name">${a.name}</b>
            <span class="ach-desc">${a.desc}</span>
            ${done
              ? `<span class="ach-got">получено</span>`
              : `<div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
                 <span class="ach-progress">${cur} / ${a.threshold}</span>`}
          </div>`;
        }).join("")}
        </div>
      </section>`;
  }).join("");
}
