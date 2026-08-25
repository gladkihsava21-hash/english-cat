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

/** Сколько дней прошло с даты. Ноль — сегодня, отрицательного не бывает:
 *  дату из будущего в словаре взять неоткуда, а если она там окажется
 *  (перевели часы, сбилось время), считаем её сегодняшней. */
function srsDaysSince(iso) {
  if (!iso) return null;
  return Math.max(0, -srsDaysUntil(String(iso).slice(0, 10)));
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
/** selfReported=true — ученик сам сказал «помню», никто не проверял.
 *  По умолчанию считаем ответ ПРОВЕРЕННЫМ: так его вызывают упражнения,
 *  где ответ действительно сверяется. Флажок ставят только карточки.
 *
 *  Различие нужно не для статистики: на нём держится отметка «домашка
 *  сдана», которую видит репетитор. Одно нажатие «Помню» без проверки
 *  закрывало слово — то есть ученик мог не глядя протыкать карточки,
 *  и репетитор увидел бы «сдал». Это подрывает единственное, за что
 *  он платит: доверие к цифрам в панели. */
function srsReview(word, ok, selfReported) {
  srsInit(word);
  word.ease = word.ease || EASE_START;
  const today = srsToday();

  if (ok) {
    word.knew = (word.knew || 0) + 1;
    // Считаем отдельно только то, что реально проверено вводом или выбором
    if (!selfReported) word.checked = (word.checked || 0) + 1;
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

  // Слова, добавленные вручную на днях, — отдельная стопка.
  //
  // Учитель выписала с урока пятнадцать слов и пошла тренироваться,
  // а тренировка выдала повторы старых: в очереди просроченные всегда
  // шли первыми, и новое слово ждало своей очереди сутками. Человек
  // добавляет слово ровно затем, чтобы учить его СЕЙЧАС, — значит
  // первый показ должен быть сразу, а расписание повторов начнётся
  // уже после него.
  //
  // Порог по дате: слова без addedAt (все, кто в словаре до этой
  // правки) ведут себя как раньше — молча менять порядок у тех, кто
  // уже занимается, нельзя.
  const recent = [];
  const RECENT_DAYS = 7;
  dictionary.forEach(d => {
    const neverSeen = !d.seen && !d.reps && (d.knew || 0) === 0 && (d.forgot || 0) === 0;
    if (neverSeen) {
      const days = d.addedAt ? srsDaysSince(d.addedAt) : null;
      if (days !== null && days <= RECENT_DAYS) recent.push(d);
      else fresh.push(d);
      return;
    }
    if (!d.due || d.due <= today) { overdue.push(d); return; }
    future.push(d);
  });
  // самое свежее — первым: последнее добавленное слово помнится хуже всего
  recent.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));

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
  // Только что добавленные идут ПЕРЕД просроченными. Повторы от этого
  // не теряются: они следом, и как только новые слова показаны по разу,
  // очередь возвращается к обычному порядку.
  const out = [...recent,
               ...overdue.slice(0, Math.max(0, limit - recent.length - takeFresh.length)),
               ...takeFresh];
  // добираем, если просроченных и новых не хватило на полный подход
  for (const d of [...rest, ...recent]) {
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
