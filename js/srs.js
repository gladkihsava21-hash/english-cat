// Интервальное повторение (адаптация SM-2 под школьников).
//
// Классический SM-2 разгоняет интервалы до месяцев — для ребёнка,
// который готовится к уроку в четверг, это бесполезно. Здесь шкала
// короче и мягче: слово возвращается, пока не станет по-настоящему своим.
//
// Поля, которые SRS хранит в каждой записи словаря:
//   due      — ISO-дата следующего показа ("2026-08-14")
//   interval — текущий интервал в днях
//   ease     — «лёгкость» слова (1.3…2.6), растёт при успехах
//   reps     — сколько раз подряд вспомнил

const SRS_STEPS = [1, 3, 7, 14, 30];   // дни до следующего повтора
const SRS_LEARNED_AT = 14;             // с этого интервала слово считается выученным
const EASE_MIN = 1.3, EASE_MAX = 2.6, EASE_START = 2.0;

function srsToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function srsDatePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function srsDaysUntil(iso) {
  if (!iso) return 0;
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

// новое слово начинает жизнь с повтором сегодня
function srsInit(word) {
  if (word.due) return word;
  word.due = srsToday();
  word.interval = 0;
  word.ease = EASE_START;
  word.reps = 0;
  return word;
}

/** Ученик ответил по слову. ok=true — вспомнил. */
function srsReview(word, ok) {
  srsInit(word);
  word.ease = word.ease || EASE_START;
  const today = srsToday();

  if (ok) {
    word.knew = (word.knew || 0) + 1;
    // Интервал двигаем не чаще раза в сутки. Иначе ученик, ткнув одно
    // слово пять раз за минуту, объявлял бы его выученным на месяц —
    // повторение через час ничего не доказывает про память.
    if (word.lastReview === today) {
      word.lastReview = today;
      return word;
    }
    word.lastReview = today;
    word.reps = (word.reps || 0) + 1;
    word.ease = Math.min(EASE_MAX, word.ease + 0.1);
    // первые повторы идут по фиксированной лестнице, дальше — по лёгкости
    if (word.reps <= SRS_STEPS.length) {
      word.interval = SRS_STEPS[word.reps - 1];
    } else {
      word.interval = Math.min(180, Math.round((word.interval || 1) * word.ease));
    }
  } else {
    word.lastReview = today;
    word.forgot = (word.forgot || 0) + 1;
    word.reps = 0;
    word.ease = Math.max(EASE_MIN, word.ease - 0.2);
    word.interval = 0;          // вернётся сегодня же
  }

  word.due = srsDatePlus(word.interval);
  word.seen = true;
  // «новое» — только то, что ученик ещё ни разу не видел. Забытое слово
  // возвращается в «учу», а не притворяется новым.
  word.status = word.interval >= SRS_LEARNED_AT ? "learned" : "learning";
  return word;
}

/** Слова, которые пора повторить сегодня. */
function srsDue(dictionary) {
  const today = srsToday();
  return dictionary.filter(d => !d.due || d.due <= today);
}

/** Очередь на тренировку.
 * Порядок: просроченные (дольше ждёт — раньше) → новые → будущие.
 * Смысл: сначала спасаем то, что вот-вот забудется, и только потом
 * набираем новое — иначе словарь растёт, а знания утекают. */
function srsQueue(dictionary, limit = 10) {
  const today = srsToday();
  const overdue = [], fresh = [], future = [];

  dictionary.forEach(d => {
    const neverSeen = !d.seen && !d.reps && (d.knew || 0) === 0 && (d.forgot || 0) === 0;
    if (neverSeen) { fresh.push(d); return; }
    if (!d.due || d.due <= today) { overdue.push(d); return; }
    future.push(d);
  });

  overdue.sort((a, b) => {
    const byDue = srsDaysUntil(a.due || today) - srsDaysUntil(b.due || today);
    if (byDue !== 0) return byDue;                       // дольше просрочено — вперёд
    const weakA = (a.forgot || 0) - (a.knew || 0);
    const weakB = (b.forgot || 0) - (b.knew || 0);
    return weakB - weakA;                                 // затем самые проблемные
  });
  future.sort((a, b) => a.due.localeCompare(b.due));

  // Новым словам держим квоту: без неё большой словарь с ежедневными
  // повторами никогда не пропускал бы новое слово в тренировку.
  const newQuota = Math.max(1, Math.round(limit * 0.3));
  const takeFresh = fresh.slice(0, Math.min(newQuota, fresh.length));
  const rest = [...overdue, ...fresh.slice(takeFresh.length), ...future];
  const out = [...overdue.slice(0, Math.max(0, limit - takeFresh.length)), ...takeFresh];
  // добираем, если просроченных и новых не хватило на полный подход
  for (const d of rest) {
    if (out.length >= limit) break;
    if (!out.includes(d)) out.push(d);
  }
  return out.slice(0, limit);
}

/** Сводка для главной: сколько слов ждёт повтора. */
function srsSummary(dictionary) {
  const today = srsToday();
  const due = dictionary.filter(d => !d.due || d.due <= today).length;
  const tomorrow = dictionary.filter(d => d.due && srsDaysUntil(d.due) === 1).length;
  const learned = dictionary.filter(d => d.status === "learned").length;
  return { due, tomorrow, learned, total: dictionary.length };
}
