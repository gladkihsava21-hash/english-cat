// ===== Тренировки: движок упражнений =====
// Пул слов: словарь ученика + добор словами его уровня.
// Результаты упражнений обновляют статусы слов в словаре (интервальное повторение).

const TTS_OK = "speechSynthesis" in window;

// выбираем нормальный английский голос (грузятся асинхронно)
let TTS_VOICE = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.startsWith("en"));
  TTS_VOICE = vs.find(v => /Samantha|Google US English|Daniel|Karen|Alex/i.test(v.name)) || vs[0] || null;
}
if (TTS_OK) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text) {
  if (!TTS_OK) return;
  // Android Chrome (и WebView) молча глотает utterance в двух случаях:
  // сразу после cancel() и когда синтез завис в paused. Репетитор прислала
  // видео: кнопка звука на карточке слова «не работает» — это ровно оно.
  // Поэтому: cancel только если правда что-то звучит, потом маленькая
  // пауза; resume() перед стартом; и одна повторная попытка, если через
  // секунду звук так и не начался.
  const make = () => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    // Голос ставим только если он есть: с u.voice = null часть прошивок
    // не говорит вовсе, а без поля берётся системный английский.
    if (TTS_VOICE) u.voice = TTS_VOICE;
    u.rate = 0.92;
    return u;
  };
  const go = () => {
    try { speechSynthesis.resume(); } catch (e) { /* старые браузеры */ }
    const u = make();
    let started = false;
    u.onstart = () => { started = true; };
    speechSynthesis.speak(u);
    setTimeout(() => {
      if (started || speechSynthesis.speaking || speechSynthesis.pending) return;
      try {
        speechSynthesis.cancel();
        speechSynthesis.resume();
        speechSynthesis.speak(make());
      } catch (e) { /* совсем нет движка — молчим, кнопка не ломает страницу */ }
    }, 900);
  };
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    setTimeout(go, 80);
  } else {
    go();
  }
}

// очки за подход (для экрана результата); общий счёт ведёт addXP из app.js
let exSessionXP = 0;
function award(n) {
  exSessionXP += Math.round(n);
  addXP(n);
}

/* ===== Защита от прокликивания =====
 *
 * Домашку и очки нельзя «набить», не читая: репетитор платит за цифру
 * в панели, и она должна означать работу, а не скорость пальца.
 *
 * Две вещи. Первая — ПАУЗА НА ЧТЕНИЕ: варианты ответа появляются не
 * сразу, а через время, которого хватает прочитать вопрос (длиннее
 * вопрос — дольше, от 0,6 до 2,2 с; на слух — 1,5 с). Пока пауза идёт,
 * варианты бледные и не нажимаются. Это не наказание, а как в Kahoot:
 * сначала читаешь, потом выбираешь. Вторая — УЧЁТ ВРЕМЕНИ: если весь
 * подход отвечали в среднем меньше чем через 0,4 с после того, как
 * варианты открылись, подход считается прокликанным (rushed): очки за
 * него снимаются, награды не идут, а результат по домашке уходит
 * репетитору с пометкой ⚡ — и не считается сданным.
 *
 * Скорость чтения у детей разная, поэтому порог низкий: 0,4 с сверх
 * паузы — это «нажал, как только стало можно», а не «быстро прочитал». */
const RUSH_EXTRA_MS = 400;
const RUSH_MIN_ANSWERS = 4;
let exRound = { answered: 0, thinkMs: 0, gateMs: 0, startedAt: 0 };
/** Журнал ответов подхода — для разбора в конце: { q, yours, right, ok, why }.
 *  Репетитор просила «вернуться и посмотреть ошибки» — как в Wordwall:
 *  после подхода показываем все вопросы, что ответил ученик и как надо. */
let exLog = [];
/** Выражения, встреченные в подходе (упражнения на фразы), — чтобы в конце
 *  их можно было забрать в словарь одним нажатием. */
let exSeenPhrases = [];

function exRoundReset() {
  exRound = { answered: 0, thinkMs: 0, gateMs: 0, startedAt: Date.now() };
  exLog = [];
  exSeenPhrases = [];
}

/** Добавить выражение в словарь — тем же способом, что список выражений
 *  в словаре (app.js renderPhrasePicker): в свою папку по типу. */
function addPhraseToDictionary(rec) {
  const folderByKind = { phrasal: "Фразовые глаголы", idiom: "Идиомы", colloc: "Сочетания" };
  const folder = folderByKind[rec.kind] || "Выражения";
  if (state.dictionary.some(d => d.w.toLowerCase() === rec.w.toLowerCase())) return false;
  if (typeof createFolder === "function") createFolder(folder);
  const entry = { w: rec.w, t: rec.t, ex: rec.ex, exr: rec.exr, def: rec.def,
                  cat: rec.cat, level: rec.level, kind: rec.kind,
                  literal: rec.literal, parts: rec.parts,
                  status: "new", knew: 0, forgot: 0, folders: [folder] };
  if (typeof srsInit === "function") srsInit(entry);
  state.dictionary.push(entry);
  saveState();
  if (typeof updateChrome === "function") updateChrome();
  return true;
}

function pluralRuEx(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Текст вопроса для журнала: из prompt или из разметки промпта без тегов. */
function exQuestionText(r) {
  if (r.prompt) return String(r.prompt);
  if (r.promptHTML) {
    const div = document.createElement("div");
    div.innerHTML = r.promptHTML;
    const t = div.textContent.replace(/\s+/g, " ").trim();
    if (t) return t;
  }
  return "";
}

/** Сколько ждать перед тем, как открыть варианты, по длине текста. */
function readGateMs(text, audio) {
  if (audio) return 1500;
  const chars = String(text || "").replace(/\s+/g, " ").trim().length;
  return Math.max(600, Math.min(2200, 500 + chars * 25));
}

/** Ответ засчитан в статистику подхода: сколько думали сверх паузы. */
function exRoundAnswer(thinkMs, gateMs) {
  exRound.answered++;
  exRound.thinkMs += Math.max(0, thinkMs);
  exRound.gateMs += gateMs || 0;
}

function exRoundRushed() {
  return exRound.answered >= RUSH_MIN_ANSWERS
      && exRound.thinkMs / exRound.answered < RUSH_EXTRA_MS;
}

document.getElementById("flash-audio").addEventListener("click", e => {
  e.stopPropagation();
  speak(document.getElementById("flash-word").textContent);
});

// полная запись слова из базы (словарные записи хранят только w/t/ex)
function wordInfo(w) {
  const lw = String(w).toLowerCase();
  for (const lvl of LEVELS) {
    const hit = WORDS[lvl].find(x => x.w.toLowerCase() === lw);
    if (hit) return { ...hit, level: lvl };
  }
  return null;
}

function shuffled(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

/* Выборка «сначала невиданное». Грамматика и словообразование берут
 * из банка по 8 заданий случайно — и при банке в дюжину на тему одни
 * и те же предложения выпадали каждый второй подход («задания не
 * меняются»). Помним показанное и выбираем из остатка; когда остаток
 * меньше подхода, добираем из начала круга и начинаем счёт заново.
 *
 * Ключ задания — само предложение: индексы поплывут при любом
 * пополнении банка, а предложения в банке уникальны (это проверяет
 * tools/check-banks.py). Список живёт в localStorage, НЕ в state:
 * это не прогресс, а девайсная память «что уже мелькало», и терять
 * её при смене устройства не жалко. */
const EX_SEEN_KEY = "savelyExSeen";

function pickFresh(bucket, all, n, keyFn) {
  let seen = {};
  try { seen = JSON.parse(localStorage.getItem(EX_SEEN_KEY)) || {}; } catch (e) { /* мусор в хранилище */ }
  const done = new Set(seen[bucket] || []);
  const freshOnes = all.filter(x => !done.has(keyFn(x)));
  let picked = shuffled(freshOnes).slice(0, n);
  if (picked.length < n) {
    // круг пройден: показываем последние невиданные + добор, счёт заново
    const used = new Set(picked.map(keyFn));
    picked = picked.concat(shuffled(all.filter(x => !used.has(keyFn(x)))).slice(0, n - picked.length));
    done.clear();
  }
  picked.forEach(x => done.add(keyFn(x)));
  seen[bucket] = [...done];
  try { localStorage.setItem(EX_SEEN_KEY, JSON.stringify(seen)); } catch (e) { /* переполнено — переживём */ }
  return picked;
}

// пул для тренировки: словарь (приоритет — слова с ошибками) + добор до n из уровня.
// need — обязательные поля (def/cat/exr): слова без них отфильтровываются.
/* Какие папки идут в тренировку. Пустой набор — весь словарь.
 *
 * Живёт в state (а не в переменной модуля), потому что выбор должен
 * пережить перезагрузку: ученик отметил «сегодня только к контрольной»
 * и ушёл заваривать чай — вернувшись, он ждёт того же набора, а не всего
 * словаря. По той же причине уезжает на сервер вместе с остальным. */
function trainingFolders() {
  const all = typeof allFolders === "function" ? allFolders() : [];
  // Папку могли удалить после того, как её выбрали для тренировки
  return (state.trainFolders || []).filter(f => all.includes(f));
}

/** Слова, отмеченные галочками в словаре (state.trainWords) и реально
 *  лежащие в нём — снятые из словаря слова отбор не удерживает. */
function trainingPicked() {
  const set = new Set((state.trainWords || []).map(w => w.toLowerCase()));
  if (!set.size) return [];
  return state.dictionary.filter(d => set.has(d.w.toLowerCase()));
}

function isTrainingWholeDict() {
  return trainingFolders().length === 0 && trainingPicked().length === 0;
}

/** Слова, из которых собирается тренировка: либо весь словарь, либо
 *  только выбранные папки. */
/* Слова текущей домашки. Пока он не пуст, тренировка идёт ТОЛЬКО по ним
 * и папки не учитываются: репетитор задал конкретные двадцать слов
 * к четвергу, и подмешивать к ним словарь ученика — значит выдать ему
 * вместо домашки что-то другое. Сбрасывается при выходе из упражнения. */
let homeworkScope = null;

function trainingDictionary() {
  if (homeworkScope && homeworkScope.length) {
    const set = new Set(homeworkScope);
    const only = state.dictionary.filter(d => set.has(d.w.toLowerCase()));
    if (only.length) return only;
    homeworkScope = null;   // слова не доехали в словарь — не запираем ученика
  }
  // Отобранные галочками слова главнее папок: это самое точное указание,
  // что тренировать, и оно ставится прямо перед подходом.
  const chosen = trainingPicked();
  if (chosen.length) return chosen;
  const picked = trainingFolders();
  if (!picked.length) return state.dictionary;
  return state.dictionary.filter(d => (d.folders || []).some(f => picked.includes(f)));
}

function trainPool(n, need = []) {
  const has = rec => rec && need.every(f => rec[f]);
  const source = trainingDictionary();
  // порядок задаёт SRS: сначала то, что пора повторить
  const ordered = typeof srsQueue === "function"
    ? srsQueue(source, source.length)
    : source;
  const fromDict = ordered
    .map(d => {
      const base = wordInfo(d.w) || {};
      return { ...base, ...d, ex: d.ex || base.ex, t: d.t || base.t, inDict: true };
    })
    .filter(has);
  const picked = fromDict.slice(0, n);
  // Добор словами уровня — ТОЛЬКО когда тренируем весь словарь. Если ученик
  // выбрал «к контрольной», подсунуть ему туда посторонние слова значит
  // молча отменить его выбор: он просил конкретные слова, а не «примерно
  // столько же слов». Пусть лучше тренировка будет короче.
  if (picked.length < n && isTrainingWholeDict() && !homeworkScope) {
    const inPool = new Set(picked.map(p => p.w.toLowerCase()));
    const lvl = studyLevel();
    const nextLvl = LEVELS[Math.min(LEVELS.indexOf(lvl) + 1, LEVELS.length - 1)];
    const extra = shuffled([...WORDS[lvl], ...WORDS[nextLvl]].filter(
      x => has(x) && !inPool.has(x.w.toLowerCase())));
    picked.push(...extra.slice(0, n - picked.length).map(x => ({ ...x, inDict: false })));
  }
  return shuffled(picked);
}

// неверные варианты: переводы/слова/определения других слов близкого уровня
/* Неверные варианты.
 *
 * Раньше брались случайно из соседних уровней, и это обесценивало всю
 * проверку. Живой пример из прогона:
 *     apple → яблоко / гнёт, иго / спесь, высокомерие / микропроцессор
 * Здесь не нужно знать английский — достаточно увидеть, что три варианта
 * «не про еду». А домашка засчитывается по такому ответу, то есть
 * репетитор платит за цифру, которая набивается тыканьем.
 *
 * Теперь сначала берём слова ТОЙ ЖЕ КАТЕГОРИИ: рядом с «яблоком» встанут
 * «банан» и «хлеб», и выбор станет проверкой знания, а не чутья.
 * Случайные — только на добор, если своей категории не хватило.
 */
function distractors(word, n, field) {
  const lvl = word.level || studyLevel();
  const idx = LEVELS.indexOf(lvl);
  const near = [...new Set([LEVELS[Math.max(0, idx - 1)], lvl,
                            LEVELS[Math.min(LEVELS.length - 1, idx + 1)]])];
  const all = near.flatMap(l => WORDS[l]).filter(x => x.w !== word.w && x[field]);

  const sameCat = word.cat
    ? shuffled(all.filter(x => x.cat === word.cat)).map(x => x[field])
    : [];
  // Второй эшелон — вычитанное ядро (у него есть категория), и только
  // потом импорт. У импортированных слов перевод часто узкоспециальный:
  // к слову save в ловушки попадала «оценка налогообложения». Такой
  // вариант не проверяет знание — он просто явно лишний, и вопрос
  // становится легче, чем задумано.
  const vetted = shuffled(all.filter(x => x.cat && (!word.cat || x.cat !== word.cat)))
    .map(x => x[field]);
  const rest = shuffled(all.filter(x => !x.cat)).map(x => x[field]);

  // Порядок важен: сначала своя категория, потом вычитанное, добор — остальным.
  // Set убирает совпадения по ТЕКСТУ: у разных слов перевод иногда
  // одинаковый, и тогда на экране два одинаковых варианта.
  const out = [];
  for (const v of [...sameCat, ...vetted, ...rest]) {
    if (v === word[field]) continue;      // не подсовываем верный ответ дважды
    if (!out.includes(v)) out.push(v);
    if (out.length === n) break;
  }
  return out;
}

/** Слова, на которых ученик ошибся за этот подход и которых НЕТ в его
 *  словаре. Копится здесь, предлагается в конце — см. exFinish.
 *
 *  Зачем. Упражнения добирают слова уровня, когда своего словаря мало
 *  (см. trainPool). Ошибся на таком слове — и оно исчезало: в словарь
 *  не попадало, SRS его не планировал, повторить было негде. То есть
 *  ровно те слова, которые ученик НЕ ЗНАЕТ, теряться и не должны, а
 *  терялись именно они. */
let exMissed = [];

/** verified=false — ответ верный, но не доказывает знания (пару нашли
 *  перебором после промахов): в knew идёт, в checked — нет, то есть
 *  домашку такое слово не закрывает. */
/** Копилка точности по уровням: сколько проверенных ответов верных и
 *  неверных на словах каждого уровня. По ней сайт предлагает сменить
 *  уровень тренировок (см. renderLevelNudge) — это и есть «система
 *  адаптируется под ученика», без магии: много верных подряд на своём
 *  уровне — пора выше, много ошибок — предлагаем проще. */
function noteLevelAnswer(w, d, ok) {
  const lvl = (d && d.level) || ((typeof wordInfo === "function" && (wordInfo(w) || {}).level)) || null;
  if (!lvl || !LEVELS.includes(lvl)) return;
  state.levelStats = state.levelStats || {};
  const st = state.levelStats[lvl] = state.levelStats[lvl] || { r: 0, w: 0 };
  ok ? st.r++ : st.w++;
  // скользящее окно: старые ответы весят вдвое меньше, свежий прогресс виден
  if (st.r + st.w > 200) { st.r = Math.round(st.r / 2); st.w = Math.round(st.w / 2); }
}

function statUpdate(w, ok, verified = true) {
  const d = state.dictionary.find(x => x.w.toLowerCase() === String(w).toLowerCase());
  if (verified) noteLevelAnswer(w, d, ok);
  if (!d) {
    // Слова нет в словаре. Ошибку запоминаем — предложим добавить.
    if (!ok) {
      const key = String(w).toLowerCase();
      const info = typeof wordInfo === "function" ? wordInfo(w) : null;
      if (info && !exMissed.some(x => x.w.toLowerCase() === key)) exMissed.push(info);
    }
    return;
  }
  srsReview(d, ok, !verified);   // интервал следующего показа считает SRS
  saveState();
  updateChrome();
}

/** «3 букв» вместо «3 буквы» — подсказка в «Вводе слова» показывалась
 *  ребёнку при каждом слове, то есть ошибка была самой частой на сайте. */
function lettersWord(n) {
  const t = n % 10, h = n % 100;
  if (t === 1 && h !== 11) return "буква";
  if (t >= 2 && t <= 4 && (h < 12 || h > 14)) return "буквы";
  return "букв";
}

function normEn(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

// ===== Каркас: хаб и общие блоки =====

// Группы тренировок. Двадцать равновесных плиток подряд — стена, в которой
// нечего выбирать: глазу не за что зацепиться, и ученик жмёт первую попавшуюся.
// Деление смысловое, по тому, ЧТО ученик делает: узнаёт слово, слушает,
// пишет фразы или играет. Механическое «по 5 штук в ряд» ничего бы не дало.
const EX_GROUPS = [
  { id: "words",   title: "По словам" },
  { id: "phrases", title: "Выражения",
    note: "Фразовые глаголы (phrasal verbs), идиомы (idioms) и устойчивые сочетания (collocations) — то, что не переводится по словам." },
  { id: "audio",   title: "На слух" },
  { id: "writing", title: "Письмо и речь" },
  { id: "exam",    title: "Подготовка к ОГЭ" },
  { id: "games",   title: "Игры" },
];

// Порядок внутри массива = порядок на экране: от узнавания слова к его
// свободному употреблению, игры в конце.
const EXERCISES = [
  // --- по словам: узнать и вспомнить одно слово ---
  { id: "flashcards", group: "words", icon: "flashcards", name: "Карточки", desc: "Слово ↔ перевод, с озвучкой" },
  { id: "picture", group: "words", icon: "picture", name: "Слово и картинка", desc: "Выбери слово по картинке" },
  { id: "matching", group: "words", icon: "matching", name: "Сопоставление", desc: "Соедини слово и перевод" },
  { id: "mcq", group: "words", icon: "mcq", name: "Выбор варианта", desc: "Выбери правильный перевод" },
  { id: "spelling", group: "words", icon: "spelling", name: "Ввод слова", desc: "Впиши слово по переводу" },
  { id: "scramble", group: "words", icon: "scramble", name: "Собери слово", desc: "Составь слово из букв" },
  { id: "defmatch", group: "words", icon: "defmatch", name: "Определения", desc: "Слово ↔ определение (англ.)" },

  // --- на слух: работает только при синтезе речи ---
  { id: "listening", group: "audio", icon: "listening", name: "Аудирование", desc: "Услышь и выбери слово", audio: true },
  { id: "dictation", group: "audio", icon: "dictation", name: "Диктант", desc: "Услышь и напиши фразу", audio: true },

  // --- письмо и речь: слово внутри фразы ---
  { id: "fillblank", group: "writing", icon: "fillblank", name: "Пропуск в фразе", desc: "Допиши слово в предложении" },
  { id: "translate", group: "writing", icon: "translate", name: "Перевод фразы", desc: "Переведи предложение на англ." },
  { id: "personal", group: "writing", icon: "personal", name: "Свои предложения", desc: "Составь фразы с новыми словами" },
  { id: "context", group: "writing", icon: "context", name: "Слово в контексте", desc: "Где слово использовано верно?" },
  { id: "synonyms", group: "writing", icon: "synonyms", name: "Синонимы", desc: "Синонимы и антонимы" },
  { id: "collocations", group: "writing", icon: "collocations", name: "Сочетания", desc: "Соедини слова, которые ходят парой" },

  // --- игры: тот же словарь, но на скорость и азарт ---
  // --- выражения: фразовые глаголы, идиомы, устойчивые сочетания ---
  { id: "notliteral", group: "phrases", icon: "translate", name: "Не буквально", desc: "Что значит на самом деле" },
  { id: "buildphrase", group: "phrases", icon: "scramble", name: "Собери выражение", desc: "Составь фразу из слов" },
  { id: "collocpair", group: "phrases", icon: "collocations", name: "Что с чем", desc: "Какое слово подходит" },

  { id: "oddone", group: "games", icon: "oddone", name: "Найди лишнее", desc: "Какое слово не из той темы?" },
  { id: "blitz", group: "games", icon: "blitz", name: "Блиц", desc: "Сколько слов успеешь за минуту?" },
  { id: "categories", group: "games", icon: "categories", name: "Категории", desc: "Разложи слова по темам" },
  { id: "wordsearch", group: "games", icon: "wordsearch", name: "Поиск слов", desc: "Найди слова в сетке букв" },
  { id: "crossword", group: "games", icon: "crossword", name: "Кроссворд", desc: "Отгадай слова по переводам" },
  { id: "wordform", group: "exam", icon: "translate", name: "Словообразование",
    desc: "Поставь слово в нужную форму — как в ОГЭ" },
  { id: "grammar", group: "exam", icon: "book", name: "Грамматика",
    desc: "Времена, артикли, предлоги — с разбором" },
  // Задание из конструктора репетитора. В общем списке не показывается
  // (hidden): у него нет содержимого без конкретной домашки — вопросы
  // приезжают вместе с ней (task.taskset) и открываются с её карточки.
  { id: "custom", group: "exam", icon: "personal", name: "Задание репетитора",
    desc: "Вопросы, которые составил ваш репетитор", hidden: true },
];

let currentExId = null;

/** Домашка, из которой открыто упражнение: { id, title }. Пока стоит,
 *  результат подхода (exFinish) записывается в state.taskResults[id]
 *  и уезжает репетитору. Снимается при уходе с экрана упражнения
 *  (см. show() в app.js) — иначе следующий свободный подход записался
 *  бы в чужую домашку. */
let homeworkContext = null;
/** Набор из конструктора, который сейчас проходится (task.taskset). */
let customTaskset = null;

function recordTaskResult(correct, total, meta = {}) {
  if (!homeworkContext || !total) return;
  const id = String(homeworkContext.id);
  state.taskResults = state.taskResults || {};
  const prev = state.taskResults[id];
  const same = prev && prev.total === total;
  // Лучший результат не понижаем — как очки и рекорд блица: второй
  // подход хуже первого не должен стирать «8 из 10» у репетитора.
  // Сменился размер набора — считаем заново: сравнивать 8/10 с 5/6 нечестно.
  // Прокликанный подход лучший не улучшает: пометка ⚡ и время идут
  // с той попыткой, которая дала лучший результат по-честному.
  const beats = !same || correct > (prev.correct || 0)
             || (correct === (prev.correct || 0) && prev.rushed && !meta.rushed);
  const rec = beats
    ? { correct, rushed: !!meta.rushed, secs: Math.round(meta.secs || 0) }
    : { correct: prev.correct, rushed: !!prev.rushed, secs: prev.secs || 0 };
  state.taskResults[id] = {
    correct: rec.correct, total, rushed: rec.rushed, secs: rec.secs,
    at: new Date().toISOString(),
    // Первая попытка — как есть, навсегда: репетитор видит и «с первого
    // раза», и «лучший», и сколько было попыток.
    first: same && prev.first !== undefined ? prev.first : correct,
    tries: (same && prev.tries ? prev.tries : 0) + 1,
  };
  saveState();   // уедет на сервер с ближайшей синхронизацией
  if (typeof renderHomework === "function") renderHomework();
}

/** Открыть задание из конструктора с карточки домашки. */
function openCustomTask(task) {
  if (!task || !task.taskset) return;
  customTaskset = task.taskset;
  homeworkContext = { id: task.id, title: task.title };
  homeworkScope = null;
  openExercise("custom");
}

/** Ряд «что тренируем»: весь словарь или выбранные папки.
 *  Стоит над списком упражнений, потому что отвечает на вопрос, который
 *  задаётся раньше выбора упражнения: не «как тренировать», а «что». */
function renderTrainScope() {
  const box = document.getElementById("train-scope");
  if (!box) return;
  const names = typeof allFolders === "function" ? allFolders() : [];
  const chosen = trainingPicked();
  // Ряд нужен, только когда есть из чего выбирать
  box.classList.toggle("hidden", !names.length && !chosen.length);
  if (!names.length && !chosen.length) return;

  const picked = trainingFolders();
  const count = n => state.dictionary.filter(d => (d.folders || []).includes(n)).length;
  box.innerHTML =
    `<span class="scope-label">Тренируем:</span>`
    + (chosen.length
        ? `<button class="chip scope-chip active" type="button" data-scope-picked="1" aria-pressed="true">
             отмеченные слова <b>${chosen.length}</b></button>
           <button class="link-btn" type="button" data-scope-clear="1">снять отбор</button>`
        : "")
    + `<button class="chip scope-chip${picked.length || chosen.length ? "" : " active"}" type="button"
               data-scope="">весь словарь <b>${state.dictionary.length}</b></button>`
    + names.map(n => `
        <button class="chip scope-chip${picked.includes(n) ? " active" : ""}" type="button"
                data-scope="${esc(n)}" aria-pressed="${picked.includes(n)}">
          ${esc(n)} <b>${count(n)}</b></button>`).join("");

  const clear = box.querySelector("[data-scope-clear]");
  if (clear) clear.addEventListener("click", () => { state.trainWords = []; saveState(); renderPracticeHub(); });
  const pickedChip = box.querySelector("[data-scope-picked]");
  if (pickedChip) pickedChip.addEventListener("click", () => show("dictionary"));
  box.querySelectorAll("[data-scope]").forEach(b => {
    b.addEventListener("click", () => {
      const name = b.dataset.scope;
      if (!name) {
        state.trainFolders = [];            // «весь словарь» снимает всё
        state.trainWords = [];
      } else {
        // Папки складываются: можно тренировать две сразу.
        const cur = new Set(trainingFolders());
        cur.has(name) ? cur.delete(name) : cur.add(name);
        state.trainFolders = [...cur];
      }
      saveState();
      renderPracticeHub();
    });
  });
}

/** Выбор уровня слов для тренировок (state.trainLevel). Пусто — по тесту. */
function renderTrainLevel() {
  const sel = document.getElementById("train-level-select");
  const note = document.getElementById("train-level-note");
  if (!sel) return;
  const tested = state.level || "A1";
  sel.innerHTML = [`<option value="">как по тесту — ${tested}</option>`]
    .concat(LEVELS.map(l => `<option value="${l}">${l} — ${esc(LEVEL_NAMES[l] || "")}</option>`)).join("");
  sel.value = state.trainLevel || "";
  note.textContent = state.trainLevel && state.trainLevel !== tested
    ? `По тесту у тебя ${tested}. Это влияет только на новые слова: словарь и повторения остаются твои.`
    : "Влияет на рекомендации, слова в упражнениях и подсказки кота.";
  if (!sel.dataset.bound) {
    sel.dataset.bound = "1";
    sel.addEventListener("change", () => {
      state.trainLevel = LEVELS.includes(sel.value) ? sel.value : null;
      // Рекомендации на главной подобраны под прежний уровень — пересобрать
      if (typeof currentRecs !== "undefined") currentRecs = [];
      saveState();
      renderPracticeHub();
    });
  }
}

/** Подсказка сменить уровень — когда точность на текущем уровне говорит
 *  сама за себя. Пороги консервативные: от 25 проверенных ответов,
 *  ≥85 % верных — предложить на ступень выше, ≤45 % — на ступень ниже.
 *  «Не сейчас» запоминается на устройстве до следующих 25 ответов. */
function renderLevelNudge() {
  const box = document.getElementById("train-level-nudge");
  if (!box) return;
  box.innerHTML = "";
  const lvl = studyLevel();
  const st = (state.levelStats || {})[lvl];
  const total = st ? st.r + st.w : 0;
  if (!st || total < 25) return;
  const acc = st.r / total;
  const idx = LEVELS.indexOf(lvl);
  let target = null, text = "";
  if (acc >= 0.85 && idx < LEVELS.length - 1) {
    target = LEVELS[idx + 1];
    text = `Ты отвечаешь верно в ${Math.round(acc * 100)}% случаев на ${lvl} — похоже, стало легко. Попробуем ${target}?`;
  } else if (acc <= 0.45 && idx > 0) {
    target = LEVELS[idx - 1];
    text = `На ${lvl} пока получается ${Math.round(acc * 100)}% — это нормально, но проще закрепиться на ${target} и вернуться.`;
  }
  if (!target) return;
  let snoozed = null;
  try { snoozed = JSON.parse(localStorage.getItem("savelyLevelNudge") || "null"); } catch (e) {}
  if (snoozed && snoozed.lvl === lvl && snoozed.target === target && total - snoozed.at < 25) return;
  box.innerHTML = `
    <div class="level-nudge" role="status">
      <span>${esc(text)}</span>
      <span class="level-nudge-btns">
        <button type="button" class="btn btn-primary btn-small" id="nudge-yes">Давай ${esc(target)}</button>
        <button type="button" class="link-btn" id="nudge-no">не сейчас</button>
      </span>
    </div>`;
  document.getElementById("nudge-yes").addEventListener("click", () => {
    state.trainLevel = target;
    if (typeof currentRecs !== "undefined") currentRecs = [];
    saveState();
    renderPracticeHub();
  });
  document.getElementById("nudge-no").addEventListener("click", () => {
    try { localStorage.setItem("savelyLevelNudge", JSON.stringify({ lvl, target, at: total })); } catch (e) {}
    box.innerHTML = "";
  });
}

function renderPracticeHub() {
  const host = document.getElementById("practice-grid");
  renderTrainLevel();
  renderLevelNudge();
  renderTrainScope();
  const picked = trainingFolders();
  const inScope = trainingDictionary().length;
  const chosenN = trainingPicked().length;
  document.getElementById("practice-pool-note").textContent =
    chosenN
      ? `Только отмеченные в словаре слова — ${chosenN} ${wordsWord(chosenN)}`
      : picked.length
      ? (inScope
          ? `Только из ${picked.length === 1 ? "папки" : "папок"} «${picked.join("», «")}» — ${inScope} ${wordsWord(inScope)}`
          : `В ${picked.length === 1 ? "выбранной папке" : "выбранных папках"} пока нет слов — добавь их в словаре`)
      : state.dictionary.length
        ? `Тренируем твой словарь (${state.dictionary.length} слов) + слова уровня ${studyLevel()}`
        : `Словарь пуст — тренируем слова уровня ${studyLevel()}`;
  host.innerHTML = "";
  EX_GROUPS.forEach(g => {
    const list = EXERCISES.filter(ex => ex.group === g.id && !ex.hidden);
    if (!list.length) return;
    // Без синтеза речи раздел «На слух» раньше ИСЧЕЗАЛ целиком — и с
    // телефона, где браузер без озвучки, казалось, что раздела нет
    // вообще (репетитор так и написала). Теперь раздел виден всегда,
    // а без озвучки под заголовком написано почему и что делать.
    const noAudio = g.id === "audio" && !TTS_OK;
    const sec = document.createElement("section");
    sec.className = "ex-group";
    sec.innerHTML = `
      <div class="section-head ex-group-head"><h3>${g.title}</h3></div>
      ${g.note ? `<p class="muted-small ex-group-note">${g.note}</p>` : ""}
      ${noAudio ? `<p class="muted-small ex-group-note">В этом браузере нет английской озвучки —
        открой сайт в Chrome или Safari, и раздел заработает.</p>` : ""}
      <div class="ex-grid"></div>`;
    const grid = sec.querySelector(".ex-grid");
    list.forEach(ex => {
      const card = document.createElement("button");
      card.className = "card ex-card";
      const off = noAudio && ex.audio;
      if (off) { card.classList.add("ex-card-off"); card.disabled = true; }
      card.innerHTML = `<span class="ex-icon">${icon(ex.icon, 32)}</span>
        <span class="ex-name">${ex.name}</span>
        <span class="ex-desc">${off ? "нужна озвучка — см. подсказку выше" : ex.desc}</span>`;
      card.addEventListener("click", () => openExercise(ex.id));
      grid.appendChild(card);
    });
    host.appendChild(sec);
  });
}

function openExercise(id) {
  if (typeof markMode === "function") markMode(id);
  if (id === "flashcards") { show("trainer"); return; }
  currentExId = id;
  exSessionXP = 0;
  if (TTS_OK) speechSynthesis.cancel();
  show("exercise");
  const body = document.getElementById("exercise-body");
  const ex = EXERCISES.find(e => e.id === id);
  // Своё задание репетитора: в заголовке — название набора, назад ведёт
  // на главную (к карточке домашки), а не в список тренировок.
  const isCustom = id === "custom" && customTaskset;
  const title = isCustom ? customTaskset.title : ex.name;
  body.innerHTML = `
    <div class="ex-head">
      <button class="btn btn-ghost btn-small" data-nav="${isCustom ? "dashboard" : "practice"}">${
        isCustom ? "← На главную" : "← Тренировки"}</button>
      <h2><span class="ex-title-icon">${icon(ex.icon, 22)}</span> ${esc(title)}</h2>
    </div>
    <div id="ex-stage"></div>`;

  // Заслон на входе, а не в каждом упражнении по отдельности.
  // Пустой пул возможен ровно в одном случае — выбрана папка, в которой
  // ещё нет слов; раньше «Блиц» на этом падал с чтением поля у undefined,
  // а остальные девятнадцать рисовали пустой экран без объяснения.
  // Чинить это внутри каждого — двадцать одинаковых заплаток и двадцать
  // шансов забыть про новое упражнение.
  // Заданию репетитора словарь не нужен вовсе: ни папки, ни слова.
  if (!isCustom && !isTrainingWholeDict() && !trainingDictionary().length) {
    const names = trainingFolders();
    stage().innerHTML = `
      <div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="sleep"></div>
        <h2>Тренировать нечего</h2>
        <p>В ${names.length === 1 ? "папке" : "папках"} «${esc(names.join("», «"))}»
           пока нет слов. Добавь их в словаре — или вернись ко всему словарю.</p>
        <div class="quiz-buttons">
          <button class="btn btn-ghost" data-nav="dictionary">В словарь</button>
          <button class="btn btn-primary" id="ex-all-words">Тренировать весь словарь</button>
        </div>
      </div>`;
    if (typeof paintCats === "function") paintCats(stage());
    document.getElementById("ex-all-words").addEventListener("click", () => {
      state.trainFolders = [];
      saveState();
      openExercise(id);
    });
    return;
  }

  // То же и со словарём: упражнению без него делать нечего, а на экране
  // приветствия он не грузится вовсе. Ждём и показываем, что ждём.
  if (typeof WORDS === "undefined" && !isCustom) {
    stage().innerHTML = `
      <div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="hello"></div>
        <h2>Достаю слова…</h2>
      </div>`;
    if (typeof paintCats === "function") paintCats(stage());
    ensureWords()
      .then(() => { if (stage()) openExercise(id); })
      .catch(() => {
        if (!stage()) return;
        stage().innerHTML = `
          <div class="empty-state">
            <div class="cat-avatar cat-mid" data-cat="oops"></div>
            <h2>Не дозвонился до словаря</h2>
            <p>Проверь связь и открой упражнение ещё раз.</p>
          </div>`;
        if (typeof paintCats === "function") paintCats(stage());
      });
    return;
  }

  // Грамматика и словообразование лежат в своих файлах и грузятся
  // только тем, кто до них дошёл — как выражения и сам словарь.
  const EXAM_DATA = {
    wordform: { ready: () => typeof WORD_FORMS !== "undefined", load: ensureWordForms },
    grammar:  { ready: () => typeof GRAMMAR !== "undefined",    load: ensureGrammar },
  };
  const need = EXAM_DATA[id];
  if (need && !need.ready()) {
    stage().innerHTML = `
      <div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="hello"></div>
        <h2>Достаю задания…</h2>
      </div>`;
    if (typeof paintCats === "function") paintCats(stage());
    need.load()
      .then(() => { if (stage()) openExercise(id); })
      .catch(() => {
        if (!stage()) return;
        stage().innerHTML = `
          <div class="empty-state">
            <div class="cat-avatar cat-mid" data-cat="oops"></div>
            <h2>Не дозвонился до заданий</h2>
            <p>Проверь связь и открой упражнение ещё раз.</p>
          </div>`;
        if (typeof paintCats === "function") paintCats(stage());
      });
    return;
  }

  // Упражнения на выражения живут в отдельном файле на 150 КБ. Его качают
  // только те, кто до них дошёл: раньше он висел на странице у всех, а
  // нужен трём упражнениям из двадцати семи. Пока едет — показываем кота
  // и надпись, а не пустой экран.
  if (ex && ex.group === "phrases" && typeof PHRASES === "undefined") {
    stage().innerHTML = `
      <div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="hello"></div>
        <h2>Достаю выражения…</h2>
      </div>`;
    if (typeof paintCats === "function") paintCats(stage());
    ensurePhrases()
      .then(() => { if (stage()) EX_RUNNERS[id](); })
      .catch(() => { if (stage()) EX_RUNNERS._noPhrases(); });
    return;
  }

  exMissed = [];   // копилка ошибок — своя на каждый подход
  exRoundReset();  // время и ответы — тоже на подход
  EX_RUNNERS[id]();
}

function stage() { return document.getElementById("ex-stage"); }

function exFinish(correct, total, note = "") {
  const pct = total ? correct / total : 0;
  // Прокликанный подход (см. «Защита от прокликивания»): очки снимаем,
  // наград не даём, результат по домашке уходит с пометкой.
  const rushed = total > 0 && exRoundRushed();
  const secs = (Date.now() - (exRound.startedAt || Date.now())) / 1000;
  if (rushed && exSessionXP && typeof revokeXP === "function") {
    revokeXP(exSessionXP);
  }
  // подход без единого вопроса не тренировка: иначе счётчик наград
  // накручивался бы простым переоткрытием упражнения
  if (total > 0 && !rushed && typeof bump === "function") {
    bump("exercises");
    if (correct === total) bump("perfect");
  }
  const mood = pct === 1 ? "Мур-р-р, идеально! 😻" :
    pct >= 0.7 ? "Отлично идём, мяу! 😸" :
    pct >= 0.4 ? "Неплохо, но повторим ещё. 🐾" :
    "Ничего, повторение — мать учения! 😿";
  // Поза кота под результат: без data-cat сюда падал системный эмодзи —
  // единственная во всём интерфейсе кошка чужого рисунка.
  const pose = pct === 1 ? "love" : pct >= 0.7 ? "happy" : pct >= 0.4 ? "hello" : "wink";
  // Подход из домашки — результат уходит репетитору. Говорим это прямо:
  // ученик должен знать, что его увидят, — и что можно перепройти.
  const fromHomework = !!(homeworkContext && total > 0);
  if (fromHomework) recordTaskResult(correct, total, { rushed, secs });
  const perAnswer = exRound.answered ? (exRound.thinkMs / exRound.answered / 1000) : 0;
  stage().innerHTML = `
    <div class="empty-state">
      <div class="cat-avatar cat-mid" data-cat="${rushed ? "oops" : pose}"></div>
      <h2>${rushed ? "Слишком быстро" : "Готово!"}</h2>
      <p>Верно ${correct} из ${total}. ${rushed ? "" : mood}</p>
      ${rushed ? `<p class="rushed-note">${iconInline("blitz", 16)} Ответы шли ${
          perAnswer < 0.5 ? "почти сразу" : `в среднем через ${perAnswer.toFixed(1)} с`
        } после того, как варианты открылись, — так не читают.
          Очки за этот подход не начисляются${fromHomework
            ? ", а репетитор увидит его как прокликанный. Пройди ещё раз спокойно — засчитается честный результат."
            : ". Пройди ещё раз, читая вопросы."}</p>`
        : exSessionXP ? `<p class="xp-earned">+${exSessionXP} ${iconInline("star", 16)}</p>` : ""}
      ${fromHomework && !rushed ? `<p class="muted-small">${iconInline("personal", 15)} Результат по домашке «${
        esc(homeworkContext.title || "")}» записан — репетитор его увидит. Можно пройти ещё раз, засчитается лучший.</p>` : ""}
      ${exSeenPhrases.length ? `
        <div class="card missed-card phrase-take">
          <p class="missed-head">${iconInline("book", 16)} Выражения из этого подхода — в словарь?</p>
          <div class="phrase-take-list">
            ${exSeenPhrases.map(ph => {
              const have = state.dictionary.some(d => d.w.toLowerCase() === ph.w.toLowerCase());
              return `<button type="button" class="chip phrase-take-chip${have ? " added" : ""}" data-phrase="${esc(ph.w)}"
                        ${have ? 'aria-pressed="true"' : ""}>${have ? icon("check", 14) : "+"} ${esc(ph.w)} <i>${esc(ph.t)}</i></button>`;
            }).join("")}
          </div>
          <p class="muted-small">Лягут в свою папку — «Фразовые глаголы», «Идиомы» или «Сочетания». Полный список — в словаре, кнопка «+ Фразовые глаголы, идиомы, сочетания».</p>
        </div>` : ""}
      ${exLog.length ? `
        <details class="ex-review"${exLog.some(x => !x.ok) ? " open" : ""}>
          <summary>${iconInline("book", 15)} Разбор ответов (${exLog.filter(x => !x.ok).length} ${
            pluralRuEx(exLog.filter(x => !x.ok).length, "ошибка", "ошибки", "ошибок")} из ${exLog.length})</summary>
          <ol class="ex-review-list">
            ${exLog.map(x => `
              <li class="${x.ok ? "ok" : "bad"}">
                <span class="ex-review-mark">${icon(x.ok ? "check" : "cross", 15)}</span>
                <div>
                  <p class="ex-review-q">${x.sub ? `<span class="muted-small">${esc(x.sub)} · </span>` : ""}${esc(x.q)}</p>
                  ${x.ok
                    ? `<p class="ex-review-a">${esc(x.yours)}</p>`
                    : `<p class="ex-review-a"><s>${esc(x.yours || "—")}</s> → <b>${esc(x.right)}</b></p>`}
                  ${!x.ok && x.why ? `<p class="ex-review-why">${esc(x.why)}</p>` : ""}
                </div>
              </li>`).join("")}
          </ol>
        </details>` : ""}
      ${note ? `<p class="muted-small">${note}</p>` : ""}
      ${exMissed.length ? `
        <div class="card missed-card">
          <p class="missed-head">${iconInline("book", 16)} Эти слова ещё не твои — забрать в словарь?</p>
          <p class="missed-list">${exMissed.map(m => esc(m.w) + " — " + esc(m.t)).join(" · ")}</p>
          <button class="btn btn-primary btn-small" id="ex-take">
            Добавить ${exMissed.length} ${wordsWord(exMissed.length)}</button>
          <p class="type-feedback" id="ex-take-msg" role="status" aria-live="polite"></p>
        </div>` : ""}
      <div class="quiz-buttons">
        ${fromHomework
          ? `<button class="btn btn-ghost" data-nav="dashboard">На главную</button>`
          : `<button class="btn btn-ghost" data-nav="practice">К тренировкам</button>`}
        <button class="btn btn-primary" id="ex-again">Ещё раз</button>
      </div>
    </div>`;

  // Слова, на которых ошибся, — в словарь одним нажатием. Раньше их
  // нельзя было забрать вообще: они приходили из добора по уровню и
  // после подхода исчезали.
  const take = document.getElementById("ex-take");
  if (take) take.addEventListener("click", () => {
    const n = exMissed.length;
    exMissed.forEach(m => addToDictionary({ ...m, level: m.level || state.level }));
    exMissed = [];
    take.disabled = true;
    take.textContent = "Готово";
    const msg = document.getElementById("ex-take-msg");
    if (msg) {
      msg.className = "type-feedback ok";
      msg.textContent = `${n} ${wordsWord(n)} в словаре. Савелий напомнит их, когда придёт время.`;
    }
    if (typeof updateChrome === "function") updateChrome();
  });
  stage().querySelectorAll("[data-phrase]").forEach(b => b.addEventListener("click", () => {
    const rec = exSeenPhrases.find(x => x.w === b.dataset.phrase);
    if (!rec || b.classList.contains("added")) return;
    if (addPhraseToDictionary(rec)) {
      b.classList.add("added");
      b.setAttribute("aria-pressed", "true");
      b.innerHTML = `${icon("check", 14)} ${esc(rec.w)} <i>${esc(rec.t)}</i>`;
    }
  }));
  // Экран нарисован после загрузки страницы — cat.js сам сюда не придёт.
  if (typeof paintCats === "function") paintCats(stage());
  document.getElementById("ex-again").addEventListener("click", () => openExercise(currentExId));
}

function exProgress(i, total) {
  return `<p class="test-counter">${i + 1} / ${total}</p>`;
}

// --- общий блок: вопросы с вариантами ---
// rounds: {prompt, sub, audioText, options[], correct, statWord}
function runMCQ(rounds, opts = {}) {
  let i = 0, score = 0;
  const next = () => {
    if (i >= rounds.length) { exFinish(score, rounds.length, opts.note); return; }
    const r = rounds[i];
    stage().innerHTML = `
      ${exProgress(i, rounds.length)}
      <div class="card word-quiz-card">
        <p class="quiz-label">${esc(r.sub || "")}</p>
        ${r.art ? `<div class="word-art word-art-mid" style="background:${wordTint(r.artCat)}">${r.art}</div>` : ""}
        <div class="${opts.smallPrompt ? "quiz-word quiz-word-small" : "quiz-word"}">${
          r.promptHTML || esc(r.prompt || "")}</div>
        ${r.audioText ? `<button class="btn btn-ghost btn-small" id="mcq-audio">${iconInline("sound", 16)} Прослушать</button>` : ""}
        <div class="mcq-options" id="mcq-options"></div>
      </div>`;
    if (r.audioText) {
      const play = () => speak(r.audioText);
      document.getElementById("mcq-audio").addEventListener("click", play);
      setTimeout(play, 350);
    }
    const box = document.getElementById("mcq-options");
    let answered = false;
    // Пауза на чтение (см. «Защита от прокликивания» вверху файла).
    // Момент открытия берём ФАКТИЧЕСКИЙ — когда таймер снял блокировку,
    // а не расчётный: на медленном телефоне или в фоновой вкладке таймер
    // опаздывает, и считать «время на раздумье» от расчётного момента
    // значило бы прощать прокликивание там, где нажать раньше было нельзя.
    const gateMs = readGateMs((r.prompt || r.promptHTML || "") + " " + (r.sub || ""), !!r.audioText);
    let openedAt = null;
    box.classList.add("mcq-wait");
    setTimeout(() => {
      if (!box.isConnected) return;
      box.classList.remove("mcq-wait");
      openedAt = performance.now();
    }, gateMs);
    r.options.forEach((opt, oi) => {
      const b = document.createElement("button");
      b.className = "mcq-option";
      b.textContent = opt;
      b.addEventListener("click", () => {
        if (answered) return;
        if (openedAt === null) return;   // варианты ещё не открылись
        answered = true;
        exRoundAnswer(performance.now() - openedAt, gateMs);
        const ok = oi === r.correct;
        exLog.push({
          q: exQuestionText(r) || `Лишнее среди: ${r.options.join(", ")}`,
          sub: r.sub || "", yours: opt, right: r.options[r.correct], ok, why: r.why || "",
        });
        if (ok) { score++; award(10); }
        if (r.statWord) statUpdate(r.statWord, ok);
        // Знак, а не только цвет. Зелёный «верно» и шалфейный акцент —
        // оба зелёные, по яркости их не различить, а при дальтонизме они
        // становятся одинаковым серо-бурым. Галочка и крестик читаются всегда.
        b.classList.add(ok ? "right" : "wrong");
        // Имя снимаем ДО вставки значка: он рисуется svg и в textContent
        // не попадает, но так порядок не зависит от способа отрисовки.
        const label = b.textContent.trim();
        b.insertAdjacentHTML("beforeend",
          ` <span class="ans-mark">${icon(ok ? "check" : "cross", 17)}</span>`);
        b.setAttribute("aria-label", label + (ok ? " — верно" : " — неверно"));
        // Варианты уже не кликаются (answered), но выглядели живыми: убираем
        // и наведение. Не disabled — тогда скринридер перестал бы читать
        // проставленные «верно/неверно».
        Array.from(box.children).forEach(x => x.setAttribute("aria-disabled", "true"));
        i++;
        // 1100, а не 700. Кот держит радостную позу 1200 мс, а экран
        // менялся через 700 — то есть похвалу физически не успевали
        // увидеть. Получалась обратная полярность: ошибку кот
        // комментирует, верный ответ — нет. Для школьника это ровно
        // наоборот тому, что нужно.
        if (ok) { setTimeout(next, 1100); return; }

        // Ошибка: правильный ответ висит, пока ученик сам не нажмёт «Дальше».
        // Был автопереход через 2800 мс — экран угоняло ровно в тот момент,
        // когда ученик дочитывал, где ошибся. Сколько нужно на разбор,
        // таймер знать не может, а ученик знает.
        const right = box.children[r.correct];
        right.classList.add("right");
        right.insertAdjacentHTML("beforeend",
          ` <span class="ans-mark">${icon("check", 17)}</span>`);
        // Объяснение, если раунд его дал. Показать правильный ответ мало:
        // ученик видит, ЧТО верно, но не понимает ПОЧЕМУ — и в следующий
        // раз ошибается так же.
        if (r.why) {
          const ex = document.createElement("p");
          ex.className = "muted-small quiz-why";
          ex.textContent = r.why;
          box.insertAdjacentElement("afterend", ex);
        }
        const row = document.createElement("div");
        row.className = "quiz-buttons";
        row.innerHTML = '<button type="button" class="btn btn-primary" id="mcq-next">Дальше →</button>';
        (document.querySelector(".quiz-why") || box).insertAdjacentElement("afterend", row);
        const nextBtn = row.querySelector("#mcq-next");
        nextBtn.addEventListener("click", next);
        nextBtn.focus();   // с клавиатуры продолжаем без лишнего Tab
      });
      box.appendChild(b);
    });
  };
  next();
}

// --- общий блок: соединение пар (клик слева, потом справа) ---
function runPairs(pairs, opts = {}) {
  let errors = 0, matched = 0, selL = null;
  const left = shuffled(pairs.map((p, i) => ({ text: p.l, i })));
  const right = shuffled(pairs.map((p, i) => ({ text: p.r, i })));
  stage().innerHTML = `
    <p class="muted-small ex-hint">${opts.hint || "Нажми элемент слева, потом его пару справа"}</p>
    <div class="pairs-wrap">
      <div class="pairs-col" id="pairs-l"></div>
      <div class="pairs-col" id="pairs-r"></div>
    </div>`;
  const colL = document.getElementById("pairs-l");
  const colR = document.getElementById("pairs-r");
  // Промахи по каждому элементу слева: пара, найденная после промахов,
  // засчитывается как «вспомнил», но не как проверенный ответ — иначе
  // домашку из шести пар можно было бы «сдать» перебором за полминуты.
  const misses = new Map();
  left.forEach(item => {
    const b = document.createElement("button");
    b.className = "pair-item";
    b.textContent = item.text;
    b.addEventListener("click", () => {
      if (b.classList.contains("done")) return;
      colL.querySelectorAll(".pair-item").forEach(x => x.classList.remove("sel"));
      b.classList.add("sel");
      selL = { item, el: b };
    });
    colL.appendChild(b);
  });
  right.forEach(item => {
    const b = document.createElement("button");
    b.className = "pair-item";
    b.textContent = item.text;
    b.addEventListener("click", () => {
      if (!selL || b.classList.contains("done")) return;
      const ok = item.i === selL.item.i;
      const word = pairs[selL.item.i].statWord;
      if (!ok) misses.set(selL.item.i, (misses.get(selL.item.i) || 0) + 1);
      if (word) statUpdate(word, ok, !misses.get(selL.item.i));
      if (ok) {
        matched++;
        award(8);
        b.classList.add("done");
        selL.el.classList.add("done");
        selL.el.classList.remove("sel");
        selL = null;
        if (matched === pairs.length) {
          setTimeout(() => exFinish(Math.max(0, pairs.length - errors), pairs.length, opts.note), 500);
        }
      } else {
        errors++;
        b.classList.add("bad");
        selL.el.classList.add("bad");
        const l = selL.el;
        setTimeout(() => { b.classList.remove("bad"); l.classList.remove("bad"); }, 450);
      }
    });
    colR.appendChild(b);
  });
}

// --- общий блок: ввод текста ---
// rounds: {sub, prompt, audioText, answer, check(fn optional), statWord, hint, sample}
function runType(rounds, opts = {}) {
  let i = 0, score = 0;
  const next = () => {
    if (i >= rounds.length) { exFinish(score, rounds.length, opts.note); return; }
    const r = rounds[i];
    stage().innerHTML = `
      ${exProgress(i, rounds.length)}
      <div class="card word-quiz-card">
        <p class="quiz-label">${esc(r.sub || "")}</p>
        ${r.art ? `<div class="word-art word-art-mid" style="background:${wordTint(r.artCat)}">${r.art}</div>` : ""}
        <div class="quiz-word quiz-word-small">${
          r.promptHTML || esc(r.prompt || "")}</div>
        ${r.audioText ? `<button class="btn btn-ghost btn-small" id="type-audio">${iconInline("sound", 16)} Прослушать</button>` : ""}
        ${opts.textarea
          ? `<textarea class="type-input type-area" id="type-input" rows="3" placeholder="${opts.placeholder || "Напиши по-английски…"}"></textarea>`
          : `<input class="type-input" id="type-input" autocomplete="off" placeholder="${opts.placeholder || "Введи слово…"}">`}
        <div class="quiz-buttons">
          ${r.hint ? `<button class="btn btn-ghost" id="type-hint">${esc(opts.hintLabel || "Подсказка")}</button>` : ""}
          <button class="btn btn-primary" id="type-check">Проверить</button>
        </div>
        <p class="type-feedback" id="type-feedback" role="status" aria-live="polite"></p>
      </div>`;
    if (r.audioText) {
      const play = () => speak(r.audioText);
      document.getElementById("type-audio").addEventListener("click", play);
      setTimeout(play, 350);
    }
    const input = document.getElementById("type-input");
    input.focus();
    if (r.hint) {
      document.getElementById("type-hint").addEventListener("click", () => {
        document.getElementById("type-feedback").textContent =
          (opts.hintLabel ? opts.hintLabel[0].toUpperCase() + opts.hintLabel.slice(1) : "Подсказка") + ": " + r.hint;
      });
    }
    let done = false;
    const shownAt = performance.now();
    const check = () => {
      if (done) return;
      const val = input.value.trim();
      if (!val) return;
      done = true;
      exRoundAnswer(performance.now() - shownAt, 0);
      const ok = r.check ? r.check(val) : normEn(val) === normEn(r.answer);
      exLog.push({ q: exQuestionText(r), sub: r.sub || "", yours: val,
                   right: r.sample || r.answer, ok, why: r.why || "" });
      if (ok) { score++; award(15); }
      if (r.statWord) statUpdate(r.statWord, ok);
      const fb = document.getElementById("type-feedback");
      fb.className = "type-feedback " + (ok ? "ok" : "err");
      fb.textContent = ok
        ? "Верно, мяу! " + (r.sample ? "Образец: " + r.sample : "")
        : "Не совсем. Правильно: " + (r.sample || r.answer);
      input.disabled = true;
      i++;
      if (ok) { setTimeout(next, 900); return; }

      // ЛЮБАЯ ошибка: экран НЕ угоняем по таймеру. Сравнить свой ответ
      // с правильным — тоже разбор, и в диктанте, где предложение целиком,
      // на это не хватало никаких 2,2 секунды (жалоба методиста). Свой
      // текст остаётся в поле выше — сверяй сколько нужно, потом «Дальше».
      let anchor = fb;
      if (r.why) {
        const ex = document.createElement("p");
        ex.className = "muted-small quiz-why";
        ex.textContent = r.why;
        fb.insertAdjacentElement("afterend", ex);
        anchor = ex;
      }
      const row = document.createElement("div");
      row.className = "quiz-buttons";
      row.innerHTML = '<button type="button" class="btn btn-primary" id="type-next">Дальше →</button>';
      anchor.insertAdjacentElement("afterend", row);
      const nb = row.querySelector("#type-next");
      nb.addEventListener("click", next);
      nb.focus();
    };
    document.getElementById("type-check").addEventListener("click", check);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !opts.textarea) { e.preventDefault(); check(); }
    });
  };
  next();
}

// ===== Упражнения =====

const EX_RUNNERS = {

  /* ===== ВЫРАЖЕНИЯ =====
   * Фразовые глаголы, идиомы и устойчивые сочетания — отдельный материал,
   * и учить их как обычные слова нельзя. Трудность у них другая: значение
   * НЕ СКЛАДЫВАЕТСЯ из частей. «Give up» — не «дать вверх», «a piece of
   * cake» — не «кусок торта». Ученик, знающий оба слова, всё равно не
   * поймёт фразу, и обычная карточка «слово ↔ перевод» этому не учит:
   * она проверяет память, а мешает здесь ложная догадка.
   *
   * Поэтому три упражнения бьют в три разные стороны трудности:
   *   notliteral  — буквальный смысл против настоящего (в лоб по догадке);
   *   buildphrase — порядок слов внутри фразы (его не выведешь из перевода);
   *   collocpair  — какое слово с каким ходит (make/do, strong/heavy).
   */

  /** Пул выражений по уровню ученика. Своего «словаря выражений» у него
   *  нет, поэтому берём из базы: уровень и соседний снизу — фраза сложнее
   *  своего уровня не учится, а разбивается о непонимание. */
  _phrasePool(kind, n, need) {
    if (typeof PHRASES === "undefined") return [];
    const lvl = studyLevel();
    const idx = LEVELS.indexOf(lvl);
    const near = new Set([LEVELS[Math.max(0, idx - 1)], lvl,
                          LEVELS[Math.min(LEVELS.length - 1, idx + 1)]]);
    const all = kind === "colloc" ? PHRASES.colloc
              : kind === "idiom"  ? PHRASES.idioms
              : [...(PHRASES.phrasal || []), ...(PHRASES.idioms || [])];
    const fit = all.filter(x => near.has(x.level) && (need || []).every(f => x[f]));
    // Если на своём уровне не набралось — расширяем, но не молча падаем
    const pool = fit.length >= n ? fit : all.filter(x => (need || []).every(f => x[f]));
    const picked = shuffled(pool).slice(0, n);
    // Запоминаем: в конце подхода предложим забрать эти выражения в словарь.
    // Раньше их было никак не сохранить из упражнения — только через
    // список в словаре, о котором ученик мог и не знать.
    picked.forEach(x => { if (!exSeenPhrases.some(y => y.w === x.w)) exSeenPhrases.push(x); });
    return picked;
  },

  /** «Не буквально»: показываем фразу и её БУКВАЛЬНЫЙ перевод, спрашиваем
   *  настоящее значение. Буквальный перевод здесь не подсказка, а ловушка —
   *  ровно та, в которую ученик попадает сам. Увидев её рядом с верным
   *  ответом, он запоминает не перевод, а сам факт, что догадка не работает. */
  notliteral() {
    const pool = EX_RUNNERS._phrasePool("any", 8, ["literal", "t"]);
    if (!pool.length) { EX_RUNNERS._noPhrases(); return; }
    const rounds = pool.map(p => {
      // Отвлекающие не должны СОВПАДАТЬ с верным ответом по тексту:
      // у разных выражений перевод иногда одинаковый («сдаваться»),
      // и тогда на экране два одинаковых варианта, один из которых
      // засчитывается неверным. Сверяем по строке, а не по слову.
      const others = [...new Set(
        shuffled((PHRASES.phrasal || []).concat(PHRASES.idioms || [])
          .filter(x => x.w !== p.w && x.t && x.t !== p.t))
          .map(x => x.t))].slice(0, 3);
      const options = shuffled([p.t, ...others]);
      return {
        sub: "Буквально это «" + p.literal + "». А на самом деле?",
        prompt: p.w,
        options,
        correct: options.indexOf(p.t),
      };
    });
    runMCQ(rounds, { note: "У устойчивых выражений значение не складывается из слов." });
  },

  /** «Собери выражение»: порядок слов. Из перевода он не выводится —
   *  «сдаваться» не говорит, что сначала give, потом up. */
  buildphrase() {
    const pool = EX_RUNNERS._phrasePool("any", 6, ["parts", "t"])
      .filter(p => (p.parts || []).length >= 2);
    if (!pool.length) { EX_RUNNERS._noPhrases(); return; }
    let i = 0, correct = 0;

    const next = () => {
      if (i >= pool.length) { exFinish(correct, pool.length,
        "Порядок слов в выражении менять нельзя — он и есть выражение."); return; }
      const p = pool[i];
      const tiles = shuffled(p.parts.map((w, idx) => ({ w, idx })));
      let built = [];
      stage().innerHTML = `
        ${exProgress(i, pool.length)}
        <div class="card word-quiz-card">
          <p class="quiz-label">Собери выражение</p>
          <div class="quiz-word quiz-word-small">${esc(p.t)}</div>
          <div class="built-row" id="built" aria-live="polite"></div>
          <div class="scr-tiles" id="tiles"></div>
          <p class="type-feedback" id="bp-msg"></p>
        </div>`;
      const tilesBox = document.getElementById("tiles");
      const builtBox = document.getElementById("built");
      const draw = () => {
        builtBox.innerHTML = built.length
          ? built.map(b => `<span class="scr-tile built">${esc(b.w)}</span>`).join("")
          : `<span class="muted-small">нажимай слова по порядку</span>`;
      };
      draw();
      tilesBox.innerHTML = tiles.map((t, n) =>
        `<button class="scr-tile" type="button" data-n="${n}">${esc(t.w)}</button>`).join("");
      tilesBox.querySelectorAll("[data-n]").forEach(btn => {
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          btn.disabled = true;
          btn.classList.add("used");
          built.push(tiles[+btn.dataset.n]);
          draw();
          if (built.length < p.parts.length) return;
          const ok = built.every((b, n) => b.w === p.parts[n]);
          const msg = document.getElementById("bp-msg");
          if (ok) {
            correct++; award(12);
            msg.className = "type-feedback ok";
            msg.textContent = "Верно! " + p.w + " — " + p.t;
            if (typeof catReact === "function") catReact("happy");
            i++; setTimeout(next, 1100);
          } else {
            msg.className = "type-feedback err";
            msg.textContent = "Не так. Правильно: " + p.w;
            if (typeof catReact === "function") catReact("oops");
            i++; setTimeout(next, 2000);
          }
        });
      });
    };
    next();
  },

  /** «Что с чем»: коллокации. Проверяем ровно то, чем они и трудны, —
   *  какое слово с каким ходит. В переводе разницы нет («сделать
   *  домашку» / «совершить ошибку»), а по-английски do и make не
   *  взаимозаменяемы. */
  collocpair() {
    const pool = EX_RUNNERS._phrasePool("colloc", 8, ["parts", "t"])
      .filter(p => (p.parts || []).length >= 2);
    if (!pool.length) { EX_RUNNERS._noPhrases(); return; }
    const rounds = pool.map(p => {
      const head = p.parts[0];
      const rest = p.parts.slice(1).join(" ");
      // Отвлекающие — первые слова ДРУГИХ сочетаний: именно между ними
      // ученик и путается, а случайное слово из словаря отсеивается сходу.
      const others = shuffled((PHRASES.colloc || [])
        .filter(x => x.parts && x.parts[0] && x.parts[0] !== head))
        .map(x => x.parts[0]);
      const options = shuffled([head, ...[...new Set(others)].slice(0, 3)]);
      return {
        sub: "Какое слово подходит? (" + p.t + ")",
        prompt: "… " + rest,
        options,
        correct: options.indexOf(head),
      };
    });
    runMCQ(rounds, { note: "Эти пары надо запомнить целиком: логики в них нет." });
  },

  /** Общий экран, когда база выражений не загрузилась. Молчаливый пустой
   *  экран здесь хуже честной надписи: ученик решит, что сломался он. */
  _noPhrases() {
    stage().innerHTML = `
      <div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="sad"></div>
        <h2>Выражения не загрузились</h2>
        <p>Обнови страницу. Если не помогло — напиши нам, починим.</p>
        <div class="quiz-buttons">
          <button class="btn btn-primary" data-nav="practice">К тренировкам</button>
        </div>
      </div>`;
    if (typeof paintCats === "function") paintCats(stage());
  },

  // Показываем картинку — ученик выбирает слово.
  // Берём только слова с НАСТОЯЩЕЙ фотографией. Раньше пул шёл по
  // эмодзи-списку PICTURABLE, и в «какое слово на картинке?» попадал
  // endorse с карандашом вместо фото — совладелец прислал скрин, по
  // которому слово не угадать. Эмодзи остаются подсказкой в карточках,
  // но загадкой работает только фотография.
  picture() {
    const named = (typeof WORD_PHOTOS !== "undefined" && Object.keys(WORD_PHOTOS).length)
      ? new Set(Object.keys(WORD_PHOTOS))
      : PICTURABLE;   // список фото не загрузился — старое поведение
    let pool = trainPool(30).filter(p => named.has(p.w.toLowerCase())).slice(0, 8);
    // Слова с картинками в основном A1–B1: у старших уровней пул пустел,
    // и упражнение МОЛЧА подменялось «Выбором варианта» — репетитор
    // спросила, работает ли оно вообще выше B1. Теперь добираем
    // картинчатые слова с любых уровней: узнавание по картинке полезно
    // и как быстрый повтор простого слова.
    if (pool.length < 8) {
      const have = new Set(pool.map(p => p.w.toLowerCase()));
      const extra = shuffled(LEVELS.flatMap(l => WORDS[l])
        .filter(x => named.has(x.w.toLowerCase()) && !have.has(x.w.toLowerCase())));
      pool = [...pool, ...extra.slice(0, 8 - pool.length)];
    }
    if (pool.length < 4) { EX_RUNNERS.mcq(); return; }
    runMCQ(pool.map(p => {
      // Ловушки — тоже слова с фото, но с другим переводом: пара
      // «shoe/boots» с одинаковым переводом путала бы без вины ученика.
      const wrong = shuffled(LEVELS.flatMap(l => WORDS[l])
        .filter(x => x.w !== p.w && named.has(x.w.toLowerCase())
          && x.t !== p.t
          && wordArt(x.w, x.cat) !== wordArt(p.w, p.cat)))
        .slice(0, 3)
        .map(x => x.w);
      const options = shuffled([p.w, ...wrong]);
      return {
        sub: "Какое слово на картинке?",
        prompt: "",
        art: wordArtHTML(p.w, p.cat),
        artCat: p.cat,
        options,
        correct: options.indexOf(p.w),
        statWord: p.w,
      };
    }));
  },

  matching() {
    const pool = trainPool(5);
    runPairs(pool.map(p => ({ l: p.w, r: p.t, statWord: p.w })));
  },

  mcq() {
    const pool = trainPool(8);
    runMCQ(pool.map(p => {
      const options = shuffled([p.t, ...distractors(p, 3, "t")]);
      return {
        sub: "Выбери правильный перевод",
        prompt: p.w,
        art: wordArtHTML(p.w, p.cat),
        artCat: p.cat,
        options,
        correct: options.indexOf(p.t),
        statWord: p.w,
      };
    }));
  },

  spelling() {
    const pool = trainPool(6);
    runType(pool.map(p => ({
      sub: "Впиши слово по-английски",
      prompt: "«" + p.t + "»",
      art: wordArtHTML(p.w, p.cat),
      artCat: p.cat,
      answer: p.w,
      statWord: p.w,
      hint: p.w[0].toUpperCase() + "… (" + p.w.length + " " + lettersWord(p.w.length) + ")",
    })));
  },

  fillblank() {
    const pool = trainPool(6, ["ex"]).filter(p =>
      new RegExp("\\b" + p.w.slice(0, Math.max(3, p.w.length - 2)), "i").test(p.ex));
    if (pool.length < 3) { EX_RUNNERS.spelling(); return; }
    runType(pool.map(p => {
      // прячем слово (учитывая форму: arrives, invited…)
      const re = new RegExp("\\b" + p.w.slice(0, Math.max(3, p.w.length - 2)) + "[a-z]*", "i");
      const m = p.ex.match(re);
      const form = m ? m[0] : p.w;
      return {
        sub: "Допиши пропущенное слово (перевод: " + p.t + ")",
        prompt: p.ex.replace(re, "_".repeat(form.length)),
        answer: form,
        check: v => normEn(v) === normEn(form) || normEn(v) === normEn(p.w),
        statWord: p.w,
        hint: form[0] + "…",
        sample: form,
      };
    }));
  },

  oddone() {
    // 3 слова одной темы + 1 из другой.
    //
    // Раньше темы брались любые, а слова — со всех уровней. Получалось
    // «senate, senator, guest — дом, а thing — вещи»: категории вроде
    // «вещи», «качества», «люди» слишком размыты, чтобы по ним искать
    // лишнее, а часть категорий у импортированных слов вообще насчитана
    // по ключевым словам определений («upper house» → дом). Репетитор
    // так и написала: «объяснению не хватает логики».
    //
    // Теперь: только конкретные темы (еда, животные, одежда, тело…),
    // темы из разных «миров» (еда против животных — да, дом против
    // города — нет), и слова не выше уровня ученика плюс один.
    const CONCRETE = ["food", "animals", "clothes", "body", "family", "home", "school",
                      "city", "travel", "weather", "nature", "sports", "work", "health",
                      "tech", "art", "time", "money"];
    const WORLD = { food: "food", animals: "life", nature: "life", weather: "life",
                    clothes: "clothes", body: "person", health: "person", family: "family",
                    home: "place", city: "place", travel: "place", school: "study",
                    work: "study", sports: "sports", tech: "tech", art: "art",
                    time: "time", money: "money" };
    const maxLvl = Math.min(LEVELS.length - 1, LEVELS.indexOf(studyLevel()) + 1);
    const byCat = {};
    LEVELS.slice(0, maxLvl + 1).forEach(l => WORDS[l].forEach(x => {
      if (CONCRETE.includes(x.cat) && !x.w.includes(" ")) {
        (byCat[x.cat] = byCat[x.cat] || []).push(x);
      }
    }));
    const cats = Object.keys(byCat).filter(c => byCat[c].length >= 3);
    const rounds = [];
    let guard = 0;
    while (rounds.length < 6 && guard++ < 40 && cats.length >= 2) {
      const [catA, catB] = shuffled(cats).slice(0, 2);
      if (WORLD[catA] === WORLD[catB]) continue;   // соседние темы — не игра, а спор
      const three = shuffled(byCat[catA]).slice(0, 3);
      const odd = shuffled(byCat[catB])[0];
      const options = shuffled([...three.map(x => x.w), odd.w]);
      const nameA = (CATEGORY_NAMES[catA] || catA).toLowerCase();
      const nameB = (CATEGORY_NAMES[catB] || catB).toLowerCase();
      rounds.push({
        sub: "Какое слово лишнее?",
        promptHTML: icon("paw", 44),
        options,
        correct: options.indexOf(odd.w),
        // «banana (банан) — это еда, а bed, sofa, lamp — дом.»
        why: `${odd.w} (${odd.t}) — это ${nameB}, `
           + `а ${three.map(x => `${x.w} (${x.t})`).join(", ")} — ${nameA}.`,
      });
    }
    if (!rounds.length) { exFinish(0, 0, "Для этого уровня пока мало слов по темам."); return; }
    runMCQ(rounds, { note: "Лишнее — слово из другой темы." });
  },

  scramble() {
    const pool = trainPool(6).filter(p => p.w.length >= 4 && p.w.length <= 10 && !p.w.includes(" "));
    let i = 0, score = 0;
    const next = () => {
      if (i >= pool.length) { exFinish(score, pool.length); return; }
      const p = pool[i];
      const letters = shuffled(p.w.toLowerCase().split(""));
      let picked = [];
      stage().innerHTML = `
        ${exProgress(i, pool.length)}
        <div class="card word-quiz-card">
          <p class="quiz-label">Собери слово: «${esc(p.t)}»</p>
          <div class="scramble-answer" id="scr-answer"></div>
          <div class="scramble-tiles" id="scr-tiles"></div>
          <div class="quiz-buttons">
            <button class="btn btn-ghost" id="scr-clear">Сбросить</button>
          </div>
          <p class="type-feedback" id="scr-feedback" role="status" aria-live="polite"></p>
        </div>`;
      const tilesBox = document.getElementById("scr-tiles");
      const answerBox = document.getElementById("scr-answer");
      const renderAnswer = () => {
        answerBox.textContent = picked.map(x => x.ch).join("") || "…";
      };
      const finishRound = () => {
        const word = picked.map(x => x.ch).join("");
        const ok = word === p.w.toLowerCase();
        if (ok) { score++; award(15); }
        statUpdate(p.w, ok);
        const fb = document.getElementById("scr-feedback");
        fb.className = "type-feedback " + (ok ? "ok" : "err");
        fb.textContent = ok ? "Верно, мяу!" : "Правильно: " + p.w;
        i++;
        setTimeout(next, ok ? 800 : 1800);
      };
      letters.forEach((ch, idx) => {
        const b = document.createElement("button");
        b.className = "scr-tile";
        b.textContent = ch;
        b.addEventListener("click", () => {
          if (b.disabled) return;
          b.disabled = true;
          picked.push({ ch, idx, el: b });
          renderAnswer();
          if (picked.length === letters.length) finishRound();
        });
        tilesBox.appendChild(b);
      });
      document.getElementById("scr-clear").addEventListener("click", () => {
        picked.forEach(x => x.el.disabled = false);
        picked = [];
        renderAnswer();
      });
      renderAnswer();
    };
    next();
  },

  defmatch() {
    const pool = trainPool(4, ["def"]);
    runPairs(pool.map(p => ({ l: p.w, r: p.def, statWord: p.w })),
      { hint: "Соедини слово с его определением (по-английски)" });
  },

  listening() {
    const pool = trainPool(6);
    runMCQ(pool.map(p => {
      const options = shuffled([p.w, ...distractors(p, 3, "w")]);
      return {
        sub: "Послушай и выбери, что услышал",
        promptHTML: icon("sound", 44),
        audioText: p.w,
        options,
        correct: options.indexOf(p.w),
        statWord: p.w,
      };
    }));
  },

  dictation() {
    const pool = trainPool(3, ["ex"]);
    runType(pool.map(p => ({
      sub: "Послушай и напиши предложение",
      promptHTML: icon("listening", 44),
      audioText: p.ex,
      answer: p.ex,
      check: v => {
        const a = normEn(v).split(" ");
        const b = normEn(p.ex).split(" ");
        const hits = b.filter(w => a.includes(w)).length;
        return hits / b.length >= 0.8;
      },
      statWord: p.w,
      sample: p.ex,
    })), { textarea: true, placeholder: "Напиши, что услышал…", note: "Засчитывается от 80% правильных слов." });
  },

  context() {
    const pool = trainPool(5, ["ex"]);
    const rounds = [];
    pool.forEach(p => {
      // неправильные варианты: чужие примеры с подставленным словом
      const donors = shuffled(LEVELS.flatMap(l => WORDS[l])
        .filter(x => x.w !== p.w && x.ex))
        .map(x => {
          const re = new RegExp("\\b" + x.w.slice(0, Math.max(3, x.w.length - 2)) + "[a-z]*", "i");
          return re.test(x.ex) ? x.ex.replace(re, p.w) : null;
        })
        .filter(Boolean)
        .slice(0, 2);
      if (donors.length < 2) return;
      const options = shuffled([p.ex, ...donors]);
      rounds.push({
        sub: `Где слово «${p.w}» (${p.t}) использовано правильно?`,
        promptHTML: icon("context", 44),
        options,
        correct: options.indexOf(p.ex),
        statWord: p.w,
      });
    });
    runMCQ(rounds, { smallPrompt: true });
  },

  synonyms() {
    // Через pickFresh: банк из 60 пар, но раньше шесть случайных из
    // двадцати повторялись каждый второй подход — «одни и те же слова».
    const rounds = pickFresh("syn", SYNONYMS, 6, s => s.w).map(s => {
      const askSyn = Math.random() < 0.6;
      const right = askSyn ? s.syn : s.ant;
      const trap = askSyn ? s.ant : s.syn;
      // В большом банке одно слово бывает и ответом здесь, и чужим
      // синонимом (noisy: антоним quiet и синоним loud). Дубль варианта —
      // это кнопка, за которую не засчитают, поэтому отсеиваем.
      const others = shuffled([...new Set(SYNONYMS.filter(x => x.w !== s.w).map(x => x.syn))]
        .filter(o => o !== right && o !== trap && o !== s.w)).slice(0, 2);
      const options = shuffled([right, trap, ...others]);
      return {
        sub: askSyn ? "Выбери СИНОНИМ" : "Выбери АНТОНИМ",
        prompt: s.w,
        options,
        correct: options.indexOf(right),
        statWord: s.w,
      };
    });
    runMCQ(rounds);
  },

  translate() {
    const pool = trainPool(4, ["exr"]);
    runType(pool.map(p => ({
      sub: "Переведи предложение на английский",
      prompt: "«" + p.exr + "»",
      answer: p.ex,
      check: v => {
        const val = normEn(v);
        const stem = p.w.slice(0, Math.max(3, p.w.length - 2)).toLowerCase();
        if (!val.includes(stem)) return false;
        const b = normEn(p.ex).split(" ").filter(w => w.length > 2);
        const hits = b.filter(w => val.includes(w)).length;
        return hits / b.length >= 0.5;
      },
      statWord: p.w,
      hint: "используй слово «" + p.w + "»",
      sample: p.ex,
    })), {
      textarea: true,
      placeholder: "Твой перевод…",
      note: "Проверка по ключевым словам — вариантов перевода много, образец не единственный правильный.",
    });
  },

  personal() {
    const pool = trainPool(3);
    const words = pool.map(p => p.w);
    stage().innerHTML = `
      <div class="card word-quiz-card">
        <p class="quiz-label">Напиши 1–3 предложения о себе, используя все три слова:</p>
        <div class="quiz-word quiz-word-small">${words.map(esc).join(" · ")}</div>
        <p class="muted-small">${pool.map(p => `${esc(p.w)} — ${esc(p.t)}`).join(" · ")}</p>
        <textarea class="type-input type-area" id="pers-input" rows="4" placeholder="My day was..."></textarea>
        <div class="quiz-buttons">
          <button class="btn btn-primary" id="pers-check">Проверить</button>
        </div>
        <p class="type-feedback" id="pers-feedback" role="status" aria-live="polite"></p>
      </div>`;
    document.getElementById("pers-check").addEventListener("click", () => {
      const raw = document.getElementById("pers-input").value.trim();
      const val = normEn(raw);
      if (!val) return;
      const used = pool.filter(p => val.includes(p.w.slice(0, Math.max(3, p.w.length - 2)).toLowerCase()));
      used.forEach(p => statUpdate(p.w, true));
      const missing = pool.filter(p => !used.includes(p));
      const fb = document.getElementById("pers-feedback");
      if (missing.length) {
        fb.className = "type-feedback err";
        fb.textContent = "Не хватает: " + missing.map(p => p.w).join(", ");
        return;
      }
      award(30);
      fb.className = "type-feedback ok";
      // Честно о границе проверки: сами мы видим только, что слова
      // на месте. Грамматику и естественность разберёт Савелий-ИИ —
      // кнопкой, а не автоматически: разбор тратит дневной лимит чата,
      // и решать должен ученик. Без нейросети кнопку не обещаем.
      const aiOn = typeof aiKnownOff === "function" && !aiKnownOff()
                && typeof sendToSavely === "function";
      fb.textContent = "Все три слова на месте — мур-р!"
        + (aiOn ? "" : " Я проверил только слова; грамматику покажи репетитору.");
      const row = document.createElement("div");
      row.className = "quiz-buttons";
      row.innerHTML = (aiOn
        ? '<button type="button" class="btn btn-ghost" id="pers-ai">Разбор от Савелия</button>' : "")
        + '<button type="button" class="btn btn-primary" id="pers-next">Дальше →</button>';
      fb.insertAdjacentElement("afterend", row);
      document.getElementById("pers-check").disabled = true;
      const finish = () => exFinish(used.length, pool.length);
      row.querySelector("#pers-next").addEventListener("click", finish);
      const aiBtn = row.querySelector("#pers-ai");
      if (aiBtn) aiBtn.addEventListener("click", () => {
        // Уходим в чат с готовым вопросом: там свои лимиты и своя честная
        // рамка «нейросеть отдыхает», ничего дублировать не нужно.
        show("chat");
        if (typeof initChat === "function") initChat();
        sendToSavely("Проверь мои предложения: есть ли ошибки и звучат ли они естественно? Вот они:\n" + raw);
        finish();
      });
    });
  },

  blitz() {
    const DURATION = 60;
    let score = 0, streak = 0, timeLeft = DURATION, timer = null;
    const asked = new Set();
    const nextWord = () => {
      const pool = trainPool(30).filter(p => !asked.has(p.w));
      if (!pool.length) asked.clear();
      const p = (pool.length ? pool : trainPool(30))[0];
      asked.add(p.w);
      const options = shuffled([p.t, ...distractors(p, 3, "t")]);
      const optsHtml = options.map((o, i) =>
        `<button class="mcq-option" data-i="${i}">${o}</button>`).join("");
      document.getElementById("blitz-word").textContent = p.w;
      const box = document.getElementById("blitz-options");
      box.innerHTML = optsHtml;
      box.querySelectorAll(".mcq-option").forEach(b => {
        b.addEventListener("click", () => {
          const ok = options[+b.dataset.i] === p.t;
          statUpdate(p.w, ok);
          if (ok) { streak++; score += streak >= 3 ? 20 : 10; }
          else streak = 0;
          document.getElementById("blitz-score").textContent = score;
          nextWord();
        });
      });
    };
    stage().innerHTML = `
      <div class="card word-quiz-card">
        <div class="blitz-bar">
          <span>⏱ <b id="blitz-time">${DURATION}</b> сек</span>
          <span>⭐ <b id="blitz-score">0</b></span>
        </div>
        <div class="quiz-word" id="blitz-word"></div>
        <div class="mcq-options" id="blitz-options"></div>
        <p class="muted-small">3 верных подряд — очки ×2!</p>
      </div>`;
    nextWord();
    timer = setInterval(() => {
      timeLeft--;
      const el = document.getElementById("blitz-time");
      if (!el) { clearInterval(timer); return; }
      el.textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timer);
        const best = Math.max(score, state.blitzBest || 0);
        const isRecord = score > 0 && score >= best && score > (state.blitzBest || 0);
        state.blitzBest = best;
        saveState();
        award(Math.round(score / 2));
        if (typeof bump === "function") bump("exercises");
        stage().innerHTML = `
          <div class="empty-state">
            <div class="cat-avatar cat-mid" data-cat="${isRecord ? "love" : "happy"}"></div>
            <h2>Время, мяу!</h2>
            <p>Ты набрал <b>${score}</b> очков.${isRecord
              ? ` ${iconInline("medal", 16)} Новый рекорд!` : ""}</p>
            ${exSessionXP ? `<p class="xp-earned">+${exSessionXP} ${iconInline("star", 16)}</p>` : ""}
            <p class="muted-small">Лучший результат: ${best}</p>
            <div class="quiz-buttons">
              <button class="btn btn-ghost" data-nav="practice">К тренировкам</button>
              <button class="btn btn-primary" id="ex-again">Ещё раз</button>
            </div>
          </div>`;
        if (typeof paintCats === "function") paintCats(stage());
        document.getElementById("ex-again").addEventListener("click", () => openExercise("blitz"));
      }
    }, 1000);
  },

  collocations() {
    const picks = shuffled(COLLOCATIONS).slice(0, 5);
    runPairs(picks.map(c => ({ l: c.h, r: c.tl })),
      { hint: "Соедини части устойчивых сочетаний", note: "Примеры: make a decision, do homework, take a photo…" });
  },

  categories() {
    // 2 категории × 4 слова, клик по слову → клик по категории
    const byCat = {};
    LEVELS.forEach(l => WORDS[l].forEach(x => {
      (byCat[x.cat] = byCat[x.cat] || []).push(x);
    }));
    const cats = shuffled(Object.keys(byCat).filter(c => byCat[c].length >= 4)).slice(0, 2);
    const words = shuffled(cats.flatMap(c => shuffled(byCat[c]).slice(0, 4)
      .map(x => ({ ...x, catKey: c }))));
    let selWord = null, placed = 0, errors = 0;
    stage().innerHTML = `
      <p class="muted-small ex-hint">Нажми слово, потом его категорию</p>
      <div class="cat-words" id="cat-words"></div>
      <div class="cat-boxes">
        ${cats.map(c => `
          <button type="button" class="cat-box" data-cat="${c}">
            <span class="cat-box-title">${esc(CATEGORY_NAMES[c] || c)}</span>
            <span class="cat-box-items"></span>
          </button>`).join("")}
      </div>`;
    const wordsBox = document.getElementById("cat-words");
    words.forEach(wd => {
      const b = document.createElement("button");
      b.className = "scr-tile cat-word";
      b.textContent = wd.w;
      b.title = wd.t;
      b.addEventListener("click", () => {
        if (b.disabled) return;
        wordsBox.querySelectorAll(".cat-word").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        selWord = { wd, el: b };
      });
      wordsBox.appendChild(b);
    });
    document.querySelectorAll(".cat-box").forEach(box => {
      box.addEventListener("click", () => {
        if (!selWord) return;
        const ok = box.dataset.cat === selWord.wd.catKey;
        if (ok) {
          placed++;
          award(8);
          const chip = document.createElement("span");
          chip.className = "cat-chip";
          chip.textContent = selWord.wd.w;
          box.querySelector(".cat-box-items").appendChild(chip);
          selWord.el.disabled = true;
          selWord.el.classList.remove("sel");
          selWord = null;
          if (placed === words.length) {
            setTimeout(() => exFinish(Math.max(0, words.length - errors), words.length), 500);
          }
        } else {
          errors++;
          box.classList.add("bad");
          setTimeout(() => box.classList.remove("bad"), 450);
        }
      });
    });
  },

  wordsearch() {
    // Шесть сеток подряд, в каждой несколько слов, «Дальше» и подсказка.
    //
    // Что было не так (репетитор прислала видео): пул брался из
    // SRS-очереди БЕЗ перемешивания, а очередь детерминированная — каждая
    // игра прятала одни и те же слова. Плюс сетка была одна: нашёл всё
    // (или застрял) — и упражнение кончилось, «дальше» не было.
    const SIZE = 9, ROUNDS = 6, PER_ROUND = 4;
    const eligible = shuffled(trainPool(80)
      .filter(p => p.w.length >= 3 && p.w.length <= SIZE && !p.w.includes(" ")));
    if (eligible.length < 2) {
      stage().innerHTML = `<div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="sleep"></div>
        <p>Для поиска слов нужно хотя бы два коротких слова без пробелов.
           Добавь слов в словарь — и возвращайся, мяу.</p></div>`;
      if (typeof paintCats === "function") paintCats(stage());
      return;
    }
    let queue = [...eligible];
    let round = 0, totalPlaced = 0, totalFound = 0;

    const nextRound = () => {
      if (round >= ROUNDS) { exFinish(totalFound, totalPlaced); return; }
      round++;
      // Слова раунда — из очереди без повторов; кончилась — тасуем заново
      if (queue.length < 2) queue = shuffled([...eligible]);
      const roundWords = queue.splice(0, Math.min(PER_ROUND, queue.length));

      const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
      const placedWords = [];
      roundWords.forEach(p => {
        const w = p.w.toLowerCase();
        for (let attempt = 0; attempt < 60; attempt++) {
          const horiz = Math.random() < 0.5;
          const r = Math.floor(Math.random() * (horiz ? SIZE : SIZE - w.length + 1));
          const c = Math.floor(Math.random() * (horiz ? SIZE - w.length + 1 : SIZE));
          let fits = true;
          for (let k = 0; k < w.length; k++) {
            const cell = horiz ? grid[r][c + k] : grid[r + k][c];
            if (cell && cell !== w[k]) { fits = false; break; }
          }
          if (!fits) continue;
          for (let k = 0; k < w.length; k++) {
            if (horiz) grid[r][c + k] = w[k];
            else grid[r + k][c] = w[k];
          }
          placedWords.push({ ...p, w, r, c, horiz });
          break;
        }
      });
      if (!placedWords.length) { nextRound(); return; }
      totalPlaced += placedWords.length;
      const abc = "abcdefghijklmnopqrstuvwxyz";
      for (let r = 0; r < SIZE; r++)
        for (let c = 0; c < SIZE; c++)
          if (!grid[r][c]) grid[r][c] = abc[Math.floor(Math.random() * 26)];

      const found = new Set();
      let selStart = null;
      let hintIdx = 0;
      stage().innerHTML = `
        ${exProgress(round - 1, ROUNDS)}
        <p class="muted-small ex-hint">Нажми первую и последнюю букву слова. Найди:
          <span id="ws-targets">${placedWords.map(p => `<b class="ws-target" id="ws-t-${encodeURIComponent(p.w)}">${esc(p.w)}</b>`).join(", ")}</span></p>
        <div class="ws-grid" style="grid-template-columns: repeat(${SIZE}, 1fr)" id="ws-grid"></div>
        <div class="quiz-buttons">
          <button class="btn btn-ghost hidden" id="ws-hint">${iconInline("sparkle", 16)} Подсказка</button>
          <button class="btn btn-primary" id="ws-next">${round < ROUNDS ? "Дальше →" : "Закончить"}</button>
        </div>`;
      const gridEl = document.getElementById("ws-grid");
      const cells = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          const b = document.createElement("button");
          b.className = "ws-cell";
          b.textContent = grid[r][c];
          b.dataset.r = r;
          b.dataset.c = c;
          b.addEventListener("click", () => {
            if (!selStart) {
              selStart = b;
              b.classList.add("sel");
              return;
            }
            const r1 = +selStart.dataset.r, c1 = +selStart.dataset.c;
            const r2 = r, c2 = c;
            selStart.classList.remove("sel");
            selStart = null;
            if (r1 !== r2 && c1 !== c2) return;
            const line = [];
            if (r1 === r2) {
              for (let k = Math.min(c1, c2); k <= Math.max(c1, c2); k++) line.push(cells[r1 * SIZE + k]);
            } else {
              for (let k = Math.min(r1, r2); k <= Math.max(r1, r2); k++) line.push(cells[k * SIZE + c2]);
            }
            const str = line.map(x => x.textContent).join("");
            const rev = [...str].reverse().join("");
            const hit = placedWords.find(p => !found.has(p.w) && (p.w === str || p.w === rev));
            if (hit) {
              found.add(hit.w);
              totalFound++;
              statUpdate(hit.w, true);
              award(12);
              line.forEach(x => { x.classList.add("found"); x.classList.remove("hinted"); });
              // id собирается через encodeURIComponent при отрисовке — ищем так же,
              // иначе слово с кавычкой просто не найдётся
              const tgt = document.getElementById("ws-t-" + encodeURIComponent(hit.w));
              if (tgt) tgt.classList.add("ws-done");
              if (found.size === placedWords.length) {
                setTimeout(() => { if (gridEl.isConnected) finishRound(); }, 600);
              }
            }
          });
          gridEl.appendChild(b);
          cells.push(b);
        }
      }

      const finishRound = () => {
        // Ненайденное — как «не вспомнил»: слово было перед глазами
        placedWords.forEach(p => { if (!found.has(p.w)) statUpdate(p.w, false); });
        nextRound();
      };
      document.getElementById("ws-next").addEventListener("click", finishRound);

      // Подсказка появляется через полминуты — не сразу, чтобы сначала
      // поискать честно. Клик подсвечивает первую букву ненайденного слова.
      const hintBtn = document.getElementById("ws-hint");
      setTimeout(() => {
        if (gridEl.isConnected && found.size < placedWords.length) hintBtn.classList.remove("hidden");
      }, 30000);
      hintBtn.addEventListener("click", () => {
        const left = placedWords.filter(p => !found.has(p.w));
        if (!left.length) return;
        const p = left[hintIdx % left.length];
        hintIdx++;
        const cell = cells[p.r * SIZE + p.c];
        cell.classList.add("hinted");
        cell.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      });
    };
    nextRound();
  },

  /* =========================================================
   * СЛОВООБРАЗОВАНИЕ — формат ОГЭ и ЕГЭ
   *
   * Предложение с пропуском, справа ЗАГЛАВНЫМИ исходное слово.
   * Ученик пишет форму сам: выбор из вариантов тут не годится —
   * на экзамене вариантов не дают, и половина смысла задания в том,
   * чтобы вспомнить суффикс, а не узнать его среди четырёх.
   *
   * Подбор по уровню ученика и соседнему снизу: задание уровнем выше
   * своего решается угадыванием, а не пониманием.
   * ========================================================= */
  wordform() {
    const lvl = studyLevel();
    const idx = LEVELS.indexOf(lvl);
    const near = new Set([LEVELS[Math.max(0, idx - 1)], lvl, LEVELS[Math.min(LEVELS.length - 1, idx + 1)]]);
    const fit = WORD_FORMS.filter(x => near.has(x.lvl));
    const pool = pickFresh("wf:" + lvl, fit.length >= 8 ? fit : WORD_FORMS, 8, r => r.s);
    if (!pool.length) { exFinish(0, 0, "Заданий пока нет."); return; }

    runType(pool.map(r => ({
      sub: r.base,
      promptHTML: `<span class="wf-sentence">${esc(r.s).replace("___",
        '<span class="wf-gap">…</span>')}</span>`,
      hint: r.ru,
      answer: r.a,
      // Принимаем и запасные варианты (realise / realize), регистр не важен —
      // это проверяется в runType через check.
      check: v => {
        const got = String(v || "").trim().toLowerCase();
        return got === r.a.toLowerCase()
            || (r.alt || []).some(x => x.toLowerCase() === got);
      },
      why: r.why,
      placeholder: "форма слова",
    })), {
      note: "Как в экзамене: слева предложение, справа исходное слово заглавными.",
      hintLabel: "перевод",
    });
  },

  /* =========================================================
   * ГРАММАТИКА — по темам, с разбором каждой ошибки
   *
   * Тему ученик выбирает сам: «десять тем вперемешку» это не
   * тренировка, а проверка, и от неё ничего не запоминается.
   * ========================================================= */
  grammar() {
    const lvl = studyLevel();
    const idx = LEVELS.indexOf(lvl);
    const near = new Set([LEVELS[Math.max(0, idx - 1)], lvl, LEVELS[Math.min(LEVELS.length - 1, idx + 1)]]);

    const start = topicId => {
      const all = GRAMMAR[topicId] || [];
      const fit = all.filter(x => near.has(x.lvl));
      // 15 за подход — просьба методиста: 8 не хватало на отработку темы.
      // Порог "fit достаточно велик" держим в полтора подхода, иначе
      // на краях (A1) фильтр по уровню оставит одни и те же задания.
      const pool = pickFresh("gr:" + topicId + ":" + lvl, fit.length >= 20 ? fit : all, 15, r => r.s);
      const topic = GRAMMAR_TOPICS.find(t => t.id === topicId);
      runMCQ(pool.map(r => {
        const options = shuffled(r.o.slice());
        return {
          sub: topic ? topic.name : "",
          promptHTML: `<span class="wf-sentence">${esc(r.s).replace("___",
            '<span class="wf-gap">…</span>')}</span>`,
          options,
          correct: options.indexOf(r.a),
          why: r.why + "  " + r.ru,
        };
      }), { smallPrompt: true, note: "Ошибся — прочитай разбор целиком, он короткий." });
    };

    // Экран выбора темы
    stage().innerHTML = `
      <p class="muted-small ex-hint">Выбери тему — по ней и будут задания.</p>
      <div class="gr-topics" id="gr-topics"></div>`;
    const box = document.getElementById("gr-topics");
    GRAMMAR_TOPICS.forEach(t => {
      const all = GRAMMAR[t.id] || [];
      if (!all.length) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gr-topic";
      // Голая цифра «12» читалась как что угодно (репетитор спросила,
      // что это) — подписываем: это сколько заданий в теме.
      b.innerHTML = `<span class="gr-topic-name">${esc(t.name)}</span>`
                  + `<span class="gr-topic-count">${all.length} ${pluralRuEx(all.length, "задание", "задания", "заданий")}</span>`;
      b.addEventListener("click", () => start(t.id));
      box.appendChild(b);
    });
  },

  /* =========================================================
   * ЗАДАНИЕ РЕПЕТИТОРА — набор из конструктора (customTaskset).
   *
   * Три вида, и все они — общие блоки, которыми уже ходят
   * встроенные упражнения: quiz → runMCQ, gap → runType, pairs →
   * runPairs. Набор ничего не добавляет к механике, только кормит
   * блоки своими данными.
   *
   * ВСЁ, что пришло из набора, — текст репетитора, и в разметку оно
   * попадает только через esc() или textContent. Здесь уже был
   * хранимый XSS через перевод слова, и репетитор точно так же может
   * набрать <img onerror> в вопросе — по незнанию или нет.
   * ========================================================= */
  custom() {
    const set = customTaskset;
    if (!set || !Array.isArray(set.items) || !set.items.length) {
      exFinish(0, 0, "В этом задании пока нет вопросов.");
      return;
    }
    // Пропуск ___ показываем той же «ямкой», что в словообразовании
    const gapHTML = q => `<span class="wf-sentence">${esc(q).replace(/_{3,}/,
      '<span class="wf-gap">…</span>')}</span>`;

    if (set.kind === "quiz") {
      runMCQ(set.items.map(it => {
        // Варианты перемешиваем при каждом показе: иначе ответ выучивается
        // по месту, а не по смыслу. Правильный ищем по тексту.
        const options = shuffled(it.options.slice());
        return {
          sub: set.title,
          promptHTML: /_{3,}/.test(it.q) ? gapHTML(it.q) : `<span class="wf-sentence">${esc(it.q)}</span>`,
          options,
          correct: options.indexOf(it.options[it.correct]),
          why: it.why || "",
        };
      }), { smallPrompt: true,
            note: "Задание от репетитора. Ошибся — прочитай разбор, если он есть." });
      return;
    }

    if (set.kind === "gap") {
      runType(set.items.map(it => ({
        sub: it.hint || set.title,
        promptHTML: gapHTML(it.q),
        answer: it.answer,
        check: v => {
          const got = String(v || "").trim().toLowerCase();
          return got === it.answer.toLowerCase()
              || (it.alt || []).some(x => x.toLowerCase() === got);
        },
        why: it.why || "",
        placeholder: "ответ",
      })), { note: "Задание от репетитора: впиши, что пропущено." });
      return;
    }

    if (set.kind === "pairs") {
      // Больше восьми пар на одном экране не разложить — берём восемь
      // случайных, при повторе выпадут другие.
      const items = shuffled(set.items.slice()).slice(0, 8);
      runPairs(items.map(it => ({ l: it.l, r: it.r })), {
        hint: "Нажми элемент слева, потом его пару справа",
        note: set.items.length > 8
          ? `В наборе ${set.items.length} пар — за подход показывается восемь, при повторе будут другие.`
          : "",
      });
      return;
    }
    exFinish(0, 0, "Неизвестный вид задания.");
  },

  crossword() {
    // простой генератор: первое слово горизонтально, остальные цепляем за общие буквы
    const pool = trainPool(10).filter(p => p.w.length >= 4 && p.w.length <= 10 && !p.w.includes(" "));
    const cellsMap = {}; // "r,c" -> {ch}
    const placed = [];
    const key = (r, c) => r + "," + c;
    const tryPlace = (w, r, c, horiz) => {
      for (let k = 0; k < w.length; k++) {
        const kk = horiz ? key(r, c + k) : key(r + k, c);
        if (cellsMap[kk] && cellsMap[kk] !== w[k]) return false;
      }
      for (let k = 0; k < w.length; k++) {
        const kk = horiz ? key(r, c + k) : key(r + k, c);
        cellsMap[kk] = w[k];
      }
      return true;
    };
    pool.forEach(p => {
      const w = p.w.toLowerCase();
      if (!placed.length) {
        tryPlace(w, 0, 0, true);
        placed.push({ ...p, w, r: 0, c: 0, horiz: true });
        return;
      }
      if (placed.length >= 6) return;
      outer:
      for (const pw of shuffled(placed)) {
        for (let i = 0; i < pw.w.length; i++) {
          for (let j = 0; j < w.length; j++) {
            if (pw.w[i] !== w[j]) continue;
            const horiz = !pw.horiz;
            const r = pw.horiz ? pw.r - j : pw.r + i;
            const c = pw.horiz ? pw.c + i : pw.c - j;
            const snapshot = { ...cellsMap };
            if (tryPlace(w, r, c, horiz)) {
              placed.push({ ...p, w, r, c, horiz });
              break outer;
            }
            Object.keys(cellsMap).forEach(k2 => delete cellsMap[k2]);
            Object.assign(cellsMap, snapshot);
          }
        }
      }
    });
    if (placed.length < 3) {
      stage().innerHTML = `<div class="empty-state"><p>Мяу, слова не сцепились в кроссворд. Попробуй ещё раз!</p>
        <button class="btn btn-primary" id="ex-again">Ещё раз</button></div>`;
      document.getElementById("ex-again").addEventListener("click", () => openExercise("crossword"));
      return;
    }
    // нормализация координат
    const minR = Math.min(...placed.map(p => p.r));
    const minC = Math.min(...placed.map(p => p.c));
    placed.forEach(p => { p.r -= minR; p.c -= minC; });
    const maxR = Math.max(...placed.map(p => p.horiz ? p.r : p.r + p.w.length - 1));
    const maxC = Math.max(...placed.map(p => p.horiz ? p.c + p.w.length - 1 : p.c));
    const owns = {};
    placed.forEach((p, num) => {
      p.num = num + 1;
      for (let k = 0; k < p.w.length; k++) {
        const r = p.horiz ? p.r : p.r + k;
        const c = p.horiz ? p.c + k : p.c;
        (owns[key(r, c)] = owns[key(r, c)] || { ch: p.w[k], starts: [] });
        if (k === 0) owns[key(r, c)].starts.push(p.num);
      }
    });
    stage().innerHTML = `
      <!-- Строка текущего слова. На телефоне список подсказок под сеткой
           не виден одновременно с клеткой, в которую печатаешь, — с видео
           репетитора это главное «плохо отображается». Теперь подсказка
           выбранного слова всегда над сеткой. -->
      <div class="cw-current" id="cw-current" role="status" aria-live="polite"></div>
      <div class="cw-scroll"><div class="cw-grid"
           style="grid-template-columns: repeat(${maxC + 1}, 1fr)" id="cw-grid"></div></div>
      <div class="cw-clues">
        ${placed.map(p => `<button type="button" class="cw-clue" data-clue="${p.num}">
           <b>${p.num}${p.horiz ? "→" : "↓"}</b> ${esc(p.t)}</button>`).join("")}
      </div>
      <div class="quiz-buttons"><button class="btn btn-primary" id="cw-check">Проверить</button></div>
      <p class="type-feedback" id="cw-result" role="status" aria-live="polite"></p>`;
    const gridEl = document.getElementById("cw-grid");
    // Клетки — обычные div, а печатает всё ОДНО скрытое поле («пульт»).
    //
    // Раньше в каждой клетке было своё <input maxlength=1>, и переход
    // фокуса из клетки в клетку внутри события ввода ломал набор на
    // Android: экранная клавиатура набирает слово с автозаменой,
    // фокус уезжает посреди композиции — и буквы «не появляются».
    // Репетитор написала об этом дважды. Так устроены все мобильные
    // кроссворды: тап по клетке выбирает её и поднимает клавиатуру у
    // скрытого поля, а буква ставится в выбранную клетку. Фокус никуда
    // не прыгает — прыгает только подсветка.
    const cells = {};        // "r,c" -> { el, ch, r, c }
    const through = {};      // какие слова проходят через клетку
    placed.forEach(p => {
      for (let k = 0; k < p.w.length; k++) {
        const kk = key(p.horiz ? p.r : p.r + k, p.horiz ? p.c + k : p.c);
        (through[kk] = through[kk] || []).push({ p, idx: k });
      }
    });
    const labelFor = kk => (through[kk] || []).map(({ p, idx }) =>
      `Слово ${p.num} ${p.horiz ? "по горизонтали" : "по вертикали"}, `
      + `«${p.t}», буква ${idx + 1} из ${p.w.length}`).join("; ") || "Клетка кроссворда";
    for (let r = 0; r <= maxR; r++) {
      for (let c = 0; c <= maxC; c++) {
        const cell = owns[key(r, c)];
        if (!cell) {
          const sp = document.createElement("div");
          sp.className = "cw-empty";
          sp.setAttribute("aria-hidden", "true");
          gridEl.appendChild(sp);
          continue;
        }
        const el = document.createElement("div");
        el.className = "cw-cell";
        el.setAttribute("role", "button");
        el.tabIndex = -1;
        if (cell.starts.length) el.dataset.num = cell.starts[0];
        el.setAttribute("aria-label", labelFor(key(r, c)));
        const letter = document.createElement("span");
        letter.className = "cw-letter";
        el.appendChild(letter);
        gridEl.appendChild(el);
        cells[key(r, c)] = { el, letter, ch: cell.ch, r, c, val: "" };
      }
    }
    // Пульт: одно поле, невидимое, но живое (не display:none — иначе
    // клавиатура не откроется). Значение держим " " (пробел): тогда
    // Backspace на телефоне даёт событие deleteContentBackward, а на
    // пустом поле он бы молчал.
    const ctl = document.createElement("input");
    ctl.type = "text";
    ctl.className = "cw-ctl";
    ctl.autocomplete = "off";
    ctl.setAttribute("autocorrect", "off");
    ctl.setAttribute("autocapitalize", "off");
    ctl.setAttribute("spellcheck", "false");
    ctl.setAttribute("enterkeyhint", "done");
    ctl.setAttribute("aria-label", "Ввод буквы в выбранную клетку");
    ctl.value = " ";
    gridEl.parentElement.appendChild(ctl);

    let active = null;      // ключ клетки
    let dir = "h";          // направление хода: h — по строке, v — по столбцу
    const wordCells = (kk, horiz) => {
        const hit = (through[kk] || []).find(x => x.p.horiz === horiz);
        if (!hit) return null;
        const p = hit.p;
        return { p, keys: Array.from({ length: p.w.length }, (_, k) =>
          key(p.horiz ? p.r : p.r + k, p.horiz ? p.c + k : p.c)) };
    };
    const select = (kk, keepDir) => {
      if (!cells[kk]) return;
      if (active === kk && !keepDir) {
        // повторный тап по той же клетке переключает направление —
        // как в любом кроссворде: слово идёт и вправо, и вниз
        if (wordCells(kk, dir !== "h")) dir = dir === "h" ? "v" : "h";
      } else if (!keepDir) {
        // выбираем направление по слову, которое тут есть
        if (!wordCells(kk, dir === "h")) dir = dir === "h" ? "v" : "h";
      }
      active = kk;
      const word = wordCells(kk, dir === "h") || wordCells(kk, dir !== "h");
      Object.values(cells).forEach(x => {
        x.el.classList.toggle("active", false);
        x.el.classList.toggle("in-word", !!(word && word.keys.includes(key(x.r, x.c))));
      });
      cells[kk].el.classList.add("active");
      // Подсказка текущего слова — над сеткой, и та же строка подсвечена в списке
      const cur = document.getElementById("cw-current");
      if (cur && word) {
        const p = word.p;
        cur.innerHTML = `<b>${p.num}${p.horiz ? "→" : "↓"}</b> ${esc(p.t)}
          <span class="muted-small">· ${p.w.length} ${pluralRuEx(p.w.length, "буква", "буквы", "букв")}</span>`;
        document.querySelectorAll(".cw-clue").forEach(cl =>
          cl.classList.toggle("active", word && cl.dataset.clue === String(p.num)));
      }
      // Клетка должна быть видна: на телефоне сетка шире экрана и едет вбок
      cells[kk].el.scrollIntoView({ block: "nearest", inline: "nearest" });
      ctl.setAttribute("aria-label", labelFor(kk));
      ctl.focus({ preventScroll: true });
    };
    const put = (kk, ch) => {
      const x = cells[kk];
      x.val = ch;
      x.letter.textContent = ch.toUpperCase();
      x.el.classList.remove("ok", "err");
      x.el.removeAttribute("aria-invalid");
    };
    const step = (kk, delta) => {
      // следующая/предыдущая клетка ТЕКУЩЕГО слова
      const word = wordCells(kk, dir === "h");
      if (!word) return null;
      const i = word.keys.indexOf(kk);
      return word.keys[i + delta] || null;
    };
    Object.entries(cells).forEach(([kk, x]) => {
      // pointerdown, а не click: успеваем поднять клавиатуру в том же
      // жесте — иначе iOS не откроет её для скрытого поля
      x.el.addEventListener("pointerdown", e => { e.preventDefault(); select(kk); });
      x.el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(kk); } });
    });
    ctl.addEventListener("input", e => {
      if (!active) return;
      const type = e.inputType || "";
      if (type.startsWith("deleteContent")) {
        // стираем: сначала текущую, если пустая — предыдущую
        if (cells[active].val) put(active, "");
        else { const prev = step(active, -1); if (prev) { put(prev, ""); select(prev, true); } }
      } else {
        // берём последний введённый символ: телефон умеет прислать сразу
        // несколько (автозамена, вставка), а нам нужна одна буква
        const raw = (e.data != null ? String(e.data) : ctl.value).replace(/\s/g, "");
        const ch = raw.slice(-1).toLowerCase();
        if (ch) {
          put(active, ch);
          const nxt = step(active, 1);
          if (nxt) select(nxt, true);
        }
      }
      ctl.value = " ";
      ctl.setSelectionRange(1, 1);
    });
    ctl.addEventListener("keydown", e => {
      if (!active) return;
      const map = { ArrowRight: ["h", 1], ArrowLeft: ["h", -1], ArrowDown: ["v", 1], ArrowUp: ["v", -1] };
      if (map[e.key]) {
        e.preventDefault();
        const [d, delta] = map[e.key];
        const x = cells[active];
        const nk = key(d === "h" ? x.r : x.r + delta, d === "h" ? x.c + delta : x.c);
        if (cells[nk]) { dir = wordCells(nk, d === "h") ? d : dir; select(nk, true); }
      }
      if (e.key === "Tab") {
        // Tab — к следующему слову
        e.preventDefault();
        const cur = wordCells(active, dir === "h");
        const i = cur ? placed.indexOf(cur.p) : -1;
        const nextP = placed[(i + 1 + (e.shiftKey ? placed.length - 2 : 0)) % placed.length];
        dir = nextP.horiz ? "h" : "v";
        select(key(nextP.r, nextP.c), true);
      }
    });
    // Тап по подсказке выбирает её слово — искать клетку по номеру не нужно
    document.querySelectorAll(".cw-clue").forEach(cl => cl.addEventListener("click", () => {
      const p = placed.find(x => String(x.num) === cl.dataset.clue);
      if (!p) return;
      dir = p.horiz ? "h" : "v";
      select(key(p.r, p.c), true);
    }));
    // Стартуем с первой клетки первого слова: сразу видно, куда печатать
    select(key(placed[0].r, placed[0].c), true);

    document.getElementById("cw-check").addEventListener("click", () => {
      let allOk = true, wrong = 0, empty = 0;
      Object.values(cells).forEach(x => {
        const ok = x.val === x.ch;
        x.el.classList.toggle("ok", ok);
        x.el.classList.toggle("err", !ok);
        // Цвет — не единственный носитель смысла: дальтоник и незрячий
        // не различат зелёную клетку и красную. aria-invalid слышно,
        // а надпись ниже сообщает итог словами всем сразу.
        x.el.setAttribute("aria-invalid", ok ? "false" : "true");
        if (!ok) { allOk = false; x.val ? wrong++ : empty++; }
      });
      const say = document.getElementById("cw-result");
      if (say) {
        say.className = "type-feedback " + (allOk ? "ok" : "err");
        say.textContent = allOk
          ? "Всё верно, мяу! Кроссворд собран."
          : [wrong && `неверных букв: ${wrong}`, empty && `пустых клеток: ${empty}`]
              .filter(Boolean).join(", ").replace(/^./, m => m.toUpperCase()) + ".";
      }
      if (allOk) {
        placed.forEach(p => statUpdate(p.w, true));
        award(15 * placed.length);
        setTimeout(() => exFinish(placed.length, placed.length), 700);
      }
    });
  },
};
