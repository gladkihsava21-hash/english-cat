// Разбор своего текста без нейросети.
//
// Зачем. В упражнении «Свои предложения» ученик пишет фразы сам, и до
// сих пор система смотрела ровно одно: на месте ли три заданных слова.
// Методист спросила прямо — «можно настроить, чтобы проверялась
// грамматика?». Нейросеть у нас на паузе (AI_PAUSED в server.py), а
// ждать её включения, ничего не проверяя, — значит оставить упражнение
// беззубым: ученик пишет «he go», получает «мур-р, все слова на месте»
// и запоминает ошибку.
//
// Что это НЕ такое. Это не грамматический анализатор английского языка
// и не замена репетитору. Здесь набор точечных правил на самые частые
// школьные ошибки — те, что видно без разбора предложения по членам.
//
// Главное правило файла: ЛУЧШЕ ПРОМОЛЧАТЬ, ЧЕМ СОВРАТЬ. Ложное
// замечание хуже пропущенной ошибки: ученик поверит, что правильное
// написание неправильно, и «исправит» верную фразу. Поэтому каждое
// правило срабатывает только на однозначных случаях, а всё, что похоже
// на исключение, пропускается. По той же причине итог всегда честный:
// «нашёл вот это» или «явных ошибок не вижу» — никогда «всё правильно».
//
// Возвращает массив { bad, good, why } — что нашли, как надо, почему.

/* Формы be и вспомогательных: их «третье лицо» устроено не через -s,
   и общее правило к ним неприменимо. */
const GC_IRREGULAR_BE = new Set(["is", "are", "am", "was", "were", "be", "been", "being"]);

/* Модальные: после них голый инфинитив, окончания -s не бывает никогда.
   Это самая надёжная проверка во всём файле — исключений нет. */
const GC_MODALS = ["can", "could", "may", "might", "must", "shall", "should", "will", "would"];

/* Местоимения третьего лица единственного числа — с ними глагол требует -s.
   Имён собственных здесь нет намеренно: «Anna go» мы не ловим, потому что
   отличить имя от чужого слова без словаря нельзя, а ошибиться дороже. */
const GC_THIRD = ["he", "she", "it"];
/* Глаголы, у которых прошедшее совпадает с настоящим: по одной форме не
   понять, ошибка ли «he put» или верное прошедшее, — значит молчим. */
const GC_PAST_SAME = ["put", "cut", "let", "hit", "set", "hurt", "cost", "shut", "read"];
/* После этих слов it начинает новое предложение внутри фразы и может
   быть подлежащим: «…because it works». */
const GC_CLAUSE_START = new Set(["and", "but", "or", "so", "because", "that", "when",
  "if", "as", "while", "before", "after", "since", "until", "although", "though",
  "where", "why", "how", "what", "which", "who"]);

/* Глаголы, которые в школьных текстах встречаются чаще всего. Проверяем
   -s только у них: на произвольном слове после he/she легко принять
   существительное за глагол («he books» — он бронирует? его книги?). */
const GC_COMMON_VERBS = [
  "go", "do", "have", "like", "live", "love", "make", "play", "read", "say",
  "see", "take", "want", "work", "write", "come", "get", "give", "know",
  "look", "need", "put", "run", "speak", "study", "think", "try", "use",
  "watch", "help", "learn", "listen", "eat", "drink", "sleep", "walk",
  "talk", "buy", "call", "feel", "find", "keep", "let", "mean", "meet",
  "open", "close", "start", "stop", "tell", "visit", "wait", "ask",
  // Добавлены к первой полусотне: те же школьные глаголы, которых не
  // хватало — из-за них «she can sings» и «my sister cook» проходили
  // мимо. Все — заметно чаще глаголы, чем существительные, поэтому
  // направление «нет -s, где нужно» на них безопасно.
  "sing", "dance", "cook", "drive", "swim", "teach", "clean", "wash",
  "cry", "smile", "dream", "believe", "remember", "forget", "understand",
  "wear", "win", "sell", "pay", "spend", "send", "break", "grow", "draw",
  "paint", "build", "hope", "enjoy", "happen", "follow", "change", "bring",
  "leave", "become", "hold", "move", "share", "show", "turn", "answer",
  "decide", "explain", "join", "prefer", "receive", "return", "travel",
  "worry", "ride", "hear", "cook", "swim",
  // rain и snow — самые частые погодные фразы «it rain», «it snow».
  // В EN_VERBS их нет (в словаре перевод — существительное), поэтому
  // «It rain a lot» ловило правило 15 с неверным диагнозом «нет
  // сказуемого» вместо пропущенного -s. От ложного «make it rain»
  // защищает проверка it-дополнения ниже.
  "rain", "snow",
];

/* Неисчисляемые существительные: с ними much (не many), а глагол — в
   единственном числе (information is, не are). Список закрытый и не
   спорный — это самые частые в школьных текстах. */
const GC_UNCOUNTABLE = new Set(["money", "water", "time", "information", "advice",
  "bread", "milk", "music", "homework", "furniture", "news", "weather", "coffee",
  "tea", "sugar", "salt", "rice", "snow", "rain", "work", "luggage", "progress",
  "knowledge", "food", "fun", "help", "traffic", "paper", "cheese", "butter"]);
/* Множественные исчисляемые: с ними many (не much). Тоже закрытый список
   из самых ходовых, чтобы «much people» ловилось, а спорное — молчало. */
const GC_PLURAL_COUNT = new Set(["people", "children", "men", "women", "friends",
  "students", "books", "cars", "things", "days", "years", "cats", "dogs", "words",
  "questions", "photos", "toys", "games", "ideas", "boys", "girls", "apples"]);

/* Неправильная форма → правильная. Ошибки из школьных тетрадей:
   ученик образует прошедшее время или третье лицо по общему правилу
   там, где глагол неправильный. */
const GC_WRONG_FORMS = {
  goed: "went", comed: "came", runned: "ran", swimmed: "swam", writed: "wrote",
  readed: "read", teached: "taught", buyed: "bought", catched: "caught",
  bringed: "brought", thinked: "thought", falled: "fell", eated: "ate",
  drinked: "drank", speaked: "spoke", taked: "took", maked: "made",
  gived: "gave", knowed: "knew", sleeped: "slept", finded: "found",
  haved: "had", doed: "did", sayed: "said", seed: "saw", getted: "got",
  childrens: "children", peoples: "people", mans: "men", womans: "women",
  informations: "information", advices: "advice", moneys: "money",
  gooder: "better", bestest: "best", worser: "worse", baddest: "worst",
  "more better": "better", "most best": "the best",
};

/* Частые опечатки и кальки — не грамматика, но ученик их повторяет
   из работы в работу, а репетитор видит один раз в месяц. */
const GC_MISSPELL = {
  becouse: "because", bacause: "because", becuase: "because",
  wich: "which", whit: "with", freind: "friend", frend: "friend",
  intresting: "interesting", intresting_: "interesting",
  recieve: "receive", beleive: "believe", diffrent: "different",
  alot: "a lot", allot: "a lot", untill: "until", realy: "really",
  dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't",
  wont: "won't", isnt: "isn't", arent: "aren't", wasnt: "wasn't",
  havent: "haven't", hasnt: "hasn't", im: "I'm", ive: "I've", dosent: "doesn't",
  wan: "want", wnat: "want", teh: "the", adn: "and", taht: "that",
  goverment: "government", tommorow: "tomorrow", tomorow: "tomorrow",
  favourit: "favourite", favorit: "favorite", allways: "always",
  bicycle_: "bicycle", enviroment: "environment", excercise: "exercise",
};

/** Гласный ли ЗВУК в начале слова. Артикль выбирается по звуку, а не по
 *  букве, поэтому список исключений обязателен: university → a,
 *  hour → an. Без него правило врало бы на самых частых словах. */
function gcVowelSound(word) {
  const w = word.toLowerCase();
  // /juː/ в начале — согласный звук при гласной букве: a university,
  // a European. Список — приставки, а не слова целиком: «univers»
  // закрывает university, universe и universal разом. Голое «uni»
  // брать нельзя: «uninhabited» читается с /ʌ/. «use»/«usu» не задевают
  // «usher» (ush-) — проверено намеренно.
  const consonantSound = ["univers", "unique", "uniform", "unit", "union",
    "urine", "util", "use", "usu", "ubiquitous", "ukulele", "unic", "ufo",
    "euro", "eulog", "euph", "eucalypt", "eureka", "one", "once"];
  // Немая h — гласный звук при согласной букве: an hour, an honest man.
  // «heir» закрывает heiress и heirloom, «honest» — honesty.
  const vowelSound = ["hour", "honest", "honour", "honor", "heir"];
  if (consonantSound.some(x => w.startsWith(x))) return false;
  if (vowelSound.some(x => w.startsWith(x))) return true;
  return "aeiou".includes(w[0]);
}

/* Служебные слова: артикли, местоимения, предлоги, союзы, числительные.
   Они не глаголы и не существительные, но встречаются в каждой фразе —
   без них проверка «все ли слова мне знакомы» не прошла бы никогда. */
const GC_FUNCTION_WORDS = new Set(["a", "an", "the", "this", "that", "these", "those",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "themselves",
  "and", "or", "but", "so", "because", "if", "when", "while", "before", "after",
  "since", "until", "although", "though", "than", "as", "that", "which", "who",
  "whom", "whose", "what", "where", "why", "how", "in", "on", "at", "to", "from",
  "of", "for", "with", "without", "about", "into", "onto", "over", "under",
  "between", "among", "through", "during", "by", "up", "down", "out", "off",
  "near", "against", "per", "not", "no", "yes", "very", "too", "also", "only",
  "just", "still", "already", "always", "never", "often", "sometimes", "usually",
  "now", "then", "today", "tomorrow", "yesterday", "here", "there", "every",
  "each", "some", "any", "all", "both", "few", "many", "much", "more", "most",
  "less", "least", "other", "another", "same", "such", "own", "one", "two",
  "three", "four", "five", "six", "seven", "eight", "nine", "ten", "first",
  "second", "third", "last", "next", "please", "well", "really", "quite",
  "s", "t", "don", "doesn", "didn", "isn", "aren", "wasn", "weren", "can",
  "won", "hasn", "haven", "couldn", "wouldn", "shouldn", "let"]);

/** Глагол ли слово в любой школьной форме. Список — js/verbs.js
 *  (tools/build_verbs.py); не загрузился — правило молчит. */
function gcIsVerb(w) {
  return typeof EN_VERBS !== "undefined" && EN_VERBS.has(w);
}

/* Слова словаря сайта: WORDS грузится по уровням ученика. Собираем один
   раз и запоминаем — на каждое предложение перебирать 11 тысяч записей
   незачем. */
let _gcLex = null;
let _gcLexLevels = 0;
function gcLexicon() {
  const levels = (typeof WORDS !== "undefined" && WORDS) ? Object.keys(WORDS).length : 0;
  if (_gcLex && levels === _gcLexLevels) return _gcLex;
  const set = new Set();
  if (typeof WORDS !== "undefined" && WORDS) {
    Object.values(WORDS).forEach(list => (list || []).forEach(x => {
      String(x.w || "").toLowerCase().split(/\s+/).forEach(part => set.add(part));
    }));
  }
  if (typeof state !== "undefined" && state && Array.isArray(state.dictionary)) {
    state.dictionary.forEach(d => String(d.w || "").toLowerCase()
      .split(/\s+/).forEach(part => set.add(part)));
  }
  _gcLex = set;
  _gcLexLevels = levels;
  return set;
}

/** Знакомо ли нам слово. «Знакомо» — служебное, глагол или слово нашего
 *  словаря (с поправкой на множественное число и притяжательное). */
function gcKnownWord(w) {
  if (GC_FUNCTION_WORDS.has(w) || gcIsVerb(w)) return true;
  const lex = gcLexicon();
  if (lex.has(w)) return true;
  const stems = [w.replace(/'s$/, ""), w.replace(/ies$/, "y"), w.replace(/es$/, ""),
    w.replace(/s$/, ""), w.replace(/ed$/, ""), w.replace(/ing$/, "")];
  return stems.some(s => s !== w && s.length > 2 && (lex.has(s) || gcIsVerb(s)));
}

/** Разбор текста. Возвращает список замечаний; пустой список означает
 *  «правила молчат», а НЕ «текст безупречен» — так и пишем ученику. */
function grammarCheck(text) {
  const notes = [];
  const raw = String(text || "");
  if (!raw.trim()) return notes;

  const add = (bad, good, why) => {
    // Одна и та же ошибка дважды в тексте — одно замечание: список из
    // пяти строчек про «he go» не учит, а отбивает охоту. Сверяем по паре
    // «было → стало», а не по тексту причины: одну и ту же замену два
    // правила объясняют по-разному, ученику это лишний шум.
    if (notes.some(n => n.bad === bad && n.good === good)) return;
    notes.push({ bad, good, why });
  };

  // Слова с сохранением исходного написания — регистр нужен для проверки
  // заглавной буквы и местоимения I.
  const words = raw.match(/[A-Za-z']+/g) || [];
  const lower = words.map(w => w.toLowerCase());
  // Начинает ли слово новое предложение. Без этого «…like it. It is…»
  // читалось как повтор «it it», а правила про подлежащее заглядывали
  // в соседнее предложение.
  // Идём по тексту один раз и запоминаем, после какого слова стоял знак
  // конца предложения.
  const boundary = [];
  {
    const rx = /[A-Za-z']+|[.!?]/g;
    let m, k = -1;
    while ((m = rx.exec(raw))) {
      if (/[.!?]/.test(m[0])) { if (k >= 0) boundary[k] = true; }
      else k++;
    }
  }
  const sameSentence = i => !boundary[i];
  // Показываем ошибку так, как её написал ученик (с его регистром).
  const asWritten = i => words[i];

  // --- 1. Заглавная буква в начале предложения ---
  (raw.match(/(^|[.!?]\s+)([a-z])/g) || []).forEach(m => {
    const letter = m.trim().slice(-1);
    add(letter, letter.toUpperCase(), "Предложение начинается с заглавной буквы.");
  });

  // --- 2. Местоимение I всегда заглавное ---
  if (words.includes("i")) {
    add("i", "I", "Местоимение «я» по-английски пишется заглавной буквой всегда: I.");
  }

  // --- 2б. Кальки с русского ---
  //
  // Эти три ошибки не выводятся из общих правил: их делают именно
  // русскоязычные, дословно переводя привычную фразу. Все три однозначны,
  // исключений в школьных текстах нет.
  const calques = [
    { re: /\b(i|we|they|you)\s+am\s+agree\b/i, bad: "am agree", good: "agree",
      why: "Agree — уже глагол «соглашаться». «Я согласен» — просто I agree, без am." },
    // Только третье лицо: первое уже поймало правило выше, и два
    // замечания об одной ошибке — лишний шум.
    { re: /\b(he|she|it)\s+is\s+agree\b/i, bad: "is agree", good: "agrees",
      why: "Agree — глагол, а не прилагательное: he agrees, а не he is agree." },
    { re: /\b(i|he|she|we|they)\s+(have|has)\s+\d+\s+years?\b/i,
      bad: "have 15 years", good: "am 15 (years old)",
      why: "О возрасте говорят через be: I am 15, he is 15 — а не «have 15 years»." },
    { re: /\b(me|him|her|them|us)\s+(and|или)\s+\w+\s+(go|goes|is|are|was|were|have|has|like|likes|want|wants)\b/i,
      bad: "me and …", good: "… and I",
      why: "Подлежащее — I, а не me: «My friend and I go», не «me and my friend goes»." },
    { re: /\band\s+me\s+(go|goes|am|is|are|was|were|have|has|like|likes|want|wants)\b/i,
      bad: "and me", good: "and I",
      why: "В подлежащем — I: «My friend and I go», не «and me goes»." },
    { re: /\bhow\s+do\s+you\s+think\b/i, bad: "how do you think", good: "what do you think",
      why: "«Как ты думаешь?» по-английски — what do you think, а не how." },
    { re: /\bi\s+feel\s+myself\b/i, bad: "I feel myself", good: "I feel",
      why: "«Чувствую себя» — просто I feel good. Myself здесь лишнее и звучит двусмысленно." },
    // Согласование be в прошедшем: Ирина прислала скрин, где «yesterday
    // she were hasty» прошло без замечаний — ловим только с местоимением
    // прямо перед was/were, чтобы не спорить с сослагательным «if she
    // were» (перед ним стоит if/wish — под правило не попадает нарочно).
    { re: /(?<!\bif\s)(?<!\bwish\s)\b(he|she|it)\s+were\b/i, bad: "she were", good: "was",
      why: "С he, she, it в прошедшем — was: she was hasty. Were — для you, we, they." },
    { re: /\b(you|we|they)\s+was\b/i, bad: "they was", good: "were",
      why: "С you, we, they в прошедшем — were: they were late. Was — для I, he, she, it." },
    // Предлоги-кальки: устойчивые сочетания, где предлог в английском
    // закреплён, а ученик подставляет русский. Каждое — всегда ошибка,
    // как бы ни было построено остальное предложение.
    { re: /\bdepends\s+(of|from)\b/i, bad: "depends of", good: "depends on",
      why: "Depend идёт с on: it depends on the weather." },
    { re: /\bdepend\s+(of|from)\b/i, bad: "depend of", good: "depend on",
      why: "Depend идёт с on: they depend on us." },
    { re: /\bafraid\s+from\b/i, bad: "afraid from", good: "afraid of",
      why: "Afraid идёт с of: I'm afraid of dogs." },
    { re: /\blisten\s+(music|songs?|radio|me|him|her|us|them)\b/i,
      bad: "listen music", good: "listen to music",
      why: "Listen идёт с to: listen to music, listen to me." },
    { re: /\b(go|goes|going|went|come|comes|came|get|got)\s+to\s+home\b(?!\s+(page|screen|team|row|town|room|work))/i,
      bad: "go to home", good: "go home",
      why: "Home здесь без to и без артикля: go home, come home." },
    { re: /\bvery\s+(like|likes|liked|love|loves|loved|want|wants|need|needs|enjoy|enjoys|hate|hates)\b/i,
      bad: "very like", good: "really like",
      why: "Very не ставят перед глаголом. «Очень нравится» — I really like либо I like it very much." },
    { re: /\bhow\s+do\s+you\s+call\b/i, bad: "how do you call", good: "what do you call",
      why: "«Как это называется?» — what do you call it, а не how." },
    { re: /\bhow\s+(does\s+it|do\s+they|it)\s+looks?\s+like\b/i,
      bad: "how it looks like", good: "what it looks like",
      why: "Либо what it looks like, либо how it looks — но не «how … looks like» вместе." },
    { re: /\bmake\s+(a\s+)?(photos?|pictures?|foto)\b/i, bad: "make a photo", good: "take a photo",
      why: "Фотографию take a photo, а не make." },
    { re: /\bsince\s+\d+\s+(years?|months?|weeks?|days?|hours?)\b/i,
      bad: "since 3 years", good: "for 3 years",
      why: "Длительность — for: for three years. Since — про начало отсчёта: since 2020." },
    { re: /\bon\s+(the|this|that|a)\s+(picture|photo|photograph|image)\b/i,
      bad: "on the picture", good: "in the picture",
      why: "На изображении — in the picture, in the photo. On было бы «поверх картинки»." },
  ];
  calques.forEach(c => {
    const m = c.re.exec(raw);
    if (m) add(m[0].trim(), c.good, c.why);
  });

  // --- 3. Точка в конце ---
  const trimmed = raw.trim();
  if (trimmed.length > 12 && !/[.!?]$/.test(trimmed)) {
    add("…" + trimmed.slice(-14), "…" + trimmed.slice(-14) + ".",
        "В конце предложения нужна точка (или ? / !).");
  }

  // --- 4. Артикль a/an по звуку следующего слова ---
  lower.forEach((w, i) => {
    const nxt = lower[i + 1];
    if (!nxt || !sameSentence(i)) return;
    // «a a book» — это повтор слова, им занимается правило 10; советовать
    // здесь «an a» было бы враньём поверх чужой опечатки.
    if (nxt === "a" || nxt === "an" || nxt === "the") return;
    if (w === "a" && gcVowelSound(nxt)) {
      add("a " + nxt, "an " + nxt,
          `Перед гласным звуком ставится an: an ${nxt}.`);
    }
    if (w === "an" && !gcVowelSound(nxt)) {
      add("an " + nxt, "a " + nxt,
          `Перед согласным звуком ставится a: a ${nxt}.`);
    }
  });

  // --- 5. he / she / it + глагол без -s ---
  lower.forEach((w, i) => {
    if (!GC_THIRD.includes(w) || !sameSentence(i)) return;
    const v = lower[i + 1];
    if (!v) return;
    if (!GC_COMMON_VERBS.includes(v)) return;         // не уверены — молчим
    if (GC_IRREGULAR_BE.has(v)) return;
    // put, cut, let, hit, read… в прошедшем пишутся так же, как в
    // настоящем: «He put peanut butter on his toast» — верное прошедшее,
    // а правило требовало «he puts».
    if (GC_PAST_SAME.includes(v)) return;
    // «Did she call you?», «Does he like coffee?» — окончание ушло во
    // вспомогательный глагол слева, сказуемое есть. Без этой проверки
    // правило требовало «she calls» в правильном вопросе. Смотрим ровно
    // на одно слово влево: «He does his homework» не затрагивается —
    // там does стоит справа от местоимения и до v проверка не доходит
    // (does нет в GC_COMMON_VERBS).
    if (i > 0 && !boundary[i - 1]
        && ["do", "does", "did", "don't", "doesn't", "didn't"].includes(lower[i - 1])) return;
    // it — не только подлежащее, но и дополнение: «Pull it open»,
    // «I like it very much». Подлежащим it бывает в начале предложения или
    // после союза; после глагола или предлога это объект, и -s глаголу за
    // ним не положено.
    if (w === "it" && i > 0 && !boundary[i - 1] && !GC_CLAUSE_START.has(lower[i - 1])) return;
    if (GC_MODALS.includes(lower[i + 1])) return;
    // «he did not go», «he can go» — перед глаголом стоит служебное слово,
    // и -s там не нужно. Проверяем, что глагол идёт сразу за местоимением.
    const form = v === "go" || v === "do" ? v + "es"
               : v === "have" ? "has"
               : v === "study" ? "studies"
               : v === "try" ? "tries"
               : v === "watch" ? "watches" : v + "s";
    add(asWritten(i) + " " + v, asWritten(i) + " " + form,
        `После he / she / it глагол в настоящем времени получает -s: ${w} ${form}.`);
  });

  // --- 6. I / we / they / you + глагол С -s ---
  lower.forEach((w, i) => {
    if (!["i", "we", "they", "you"].includes(w) || !sameSentence(i)) return;
    const v = lower[i + 1];
    if (!v || !v.endsWith("s")) return;
    // goes, does, watches образуются через -es, studies/tries — через
    // -ies: раньше отрезали только «s», и «I goes» проходило мимо —
    // «goe» в списке глаголов нет.
    const bases = [v.slice(0, -1)];
    if (v.endsWith("ies")) bases.push(v.slice(0, -3) + "y");
    if (v.endsWith("es")) bases.push(v.slice(0, -2));
    const base = bases.find(b => GC_COMMON_VERBS.includes(b));
    if (!base) return;
    add(asWritten(i) + " " + v, asWritten(i) + " " + base,
        `Окончание -s бывает только у he / she / it. Правильно: ${w} ${base}.`);
  });

  // --- 7. После модального — голый инфинитив ---
  lower.forEach((w, i) => {
    if (!GC_MODALS.includes(w) || !sameSentence(i)) return;
    const v = lower[i + 1];
    if (!v) return;
    if (v === "to") {
      add(w + " to", w, `После ${w} частица to не нужна — сразу глагол.`);
      return;
    }
    if (v.endsWith("s") && GC_COMMON_VERBS.includes(v.slice(0, -1))) {
      add(w + " " + v, w + " " + v.slice(0, -1),
          `После ${w} глагол стоит в начальной форме, без -s.`);
    }
  });

  // --- 8. Неправильные формы и частые опечатки ---
  lower.forEach(w => {
    // Доступ ТОЛЬКО через hasOwnProperty: оба словаря — обычные объекты,
    // и GC_WRONG_FORMS["constructor"] находил Object по цепочке
    // прототипов. «constructor» — обычное слово нашего же словаря (C1),
    // и ученик видел «constructor → function Object() { [native code] }».
    // Та же мина ждала toString, valueOf и hasOwnProperty.
    if (Object.prototype.hasOwnProperty.call(GC_WRONG_FORMS, w)) {
      add(w, GC_WRONG_FORMS[w], "Это неправильная форма — запомни её отдельно.");
    }
    if (Object.prototype.hasOwnProperty.call(GC_MISSPELL, w)) {
      add(w, GC_MISSPELL[w], "Опечатка в написании слова.");
    }
  });

  // --- 9. Двойное отрицание (русская калька «я не знаю ничего») ---
  const NEG = ["not", "don't", "doesn't", "didn't", "dont", "doesnt", "didnt", "never", "can't", "cant"];
  const negIdx = lower.findIndex(w => NEG.includes(w));
  if (negIdx !== -1) {
    // Только в пределах того же предложения: «I do not know. Nobody came.» —
    // это две правильные фразы, а не двойное отрицание.
    let end = negIdx;
    while (end < lower.length - 1 && sameSentence(end)) end++;
    const tail = lower.slice(negIdx + 1, end + 1);
    const second = tail.find(w => ["nothing", "nobody", "nowhere", "never"].includes(w));
    if (second) {
      const fix = { nothing: "anything", nobody: "anybody", nowhere: "anywhere", never: "ever" }[second];
      if (fix) {
        add(second, fix,
            "В английском отрицание одно на предложение: «I do not know anything», не «nothing».");
      }
    }
  }

  // --- 10. Повтор слова подряд («the the») ---
  lower.forEach((w, i) => {
    if (w === lower[i + 1] && sameSentence(i)) {
      add(asWritten(i) + " " + words[i + 1], asWritten(i), "Слово написано дважды подряд.");
    }
  });

  // --- 11. Единственное подлежащее + наречие частоты + глагол без -s ---
  //
  // Ровно тот случай, с которого начался этот файл: «A philosophical
  // question always egg on…». Правило узкое нарочно — три условия сразу:
  //   • подлежащее начинается с a / an / this / every / each (не the:
  //     «the students» тоже так выглядит, а оно множественное);
  //   • перед глаголом стоит наречие частоты — после него почти наверняка
  //     глагол, и гадать, глагол это или существительное, не приходится;
  //   • между артиклем и наречием нет признаков множественности и второго
  //     подлежащего (of, and, people, s на конце существительного).
  // Плюс отсечка прошедшего времени: «A teacher always said» — не ошибка.
  const FREQ = ["always", "usually", "often", "sometimes", "never", "rarely", "seldom"];
  const PAST = new Set(["went", "said", "saw", "took", "gave", "made", "came", "got",
    "had", "did", "was", "were", "told", "found", "left", "felt", "kept", "knew",
    "thought", "brought", "bought", "ran", "wrote", "read", "put", "cut", "let", "set"]);
  const SINGULAR_START = ["a", "an", "this", "every", "each"];
  lower.forEach((w, i) => {
    if (!FREQ.includes(w) || !sameSentence(i)) return;
    const v = lower[i + 1], vRaw = words[i + 1];
    if (!v || !sameSentence(i)) return;
    if (v.endsWith("s") || GC_IRREGULAR_BE.has(v) || GC_MODALS.includes(v)) return;
    if (v.endsWith("ed") || PAST.has(v)) return;                 // прошедшее время
    if (["to", "not", "have", "has", "had", "do", "does", "did"].includes(v)) return;
    // Ищем начало подлежащего влево до начала предложения
    let start = i;
    while (start > 0 && sameSentence(start - 1)) start--;
    const subject = lower.slice(start, i);
    if (!subject.length || !SINGULAR_START.includes(subject[0])) return;
    // «A dog is never unfaithful», «A student can always write» — между
    // подлежащим и наречием уже стоит be или модальный: сказуемое есть,
    // а слово после наречия — прилагательное или второй глагол. Без этой
    // проверки правило советовало «unfaithfuls».
    if (subject.some(x => GC_IRREGULAR_BE.has(x) || GC_MODALS.includes(x))) return;
    // Признаки, при которых подлежащее уже не единственное или их два
    const risky = ["of", "and", "or", "people", "children", "men", "women", "both", "all", "many", "few"];
    if (subject.some(x => risky.includes(x))) return;
    if (subject.slice(1).some(x => x.length > 3 && x.endsWith("s") && !x.endsWith("ss"))) return;
    if (subject.length > 4) return;                              // длинное — не беремся
    const form = v === "go" || v === "do" || v === "watch" ? v + "es"
               : v === "have" ? "has"
               : /[^aeiou]y$/.test(v) ? v.slice(0, -1) + "ies" : v + "s";
    add(w + " " + vRaw, w + " " + form,
        `Подлежащее в единственном числе («${subject.join(" ")}») — глагол получает -s: ${form}.`);
  });

  // --- 12. much / many по исчислимости ---
  //
  // Закрытые списки: неисчисляемые всегда с much, эти множественные —
  // всегда с many. Оба однозначны, поэтому правило не ошибётся.
  lower.forEach((w, i) => {
    if (!sameSentence(i)) return;
    const nxt = lower[i + 1];
    if (!nxt) return;
    if (w === "many" && GC_UNCOUNTABLE.has(nxt)) {
      add("many " + nxt, "much " + nxt,
          `${nxt} не считают по штукам — с ним much: much ${nxt}.`);
    }
    if (w === "much" && GC_PLURAL_COUNT.has(nxt)) {
      add("much " + nxt, "many " + nxt,
          `${nxt} можно посчитать — с ним many: many ${nxt}.`);
    }
  });

  // --- 13. Неисчисляемое подлежащее + are / were ---
  //
  // information, news, money, advice — всегда единственное число, глагол
  // к ним тоже в единственном: «this information is», а не «are».
  lower.forEach((w, i) => {
    if (!GC_UNCOUNTABLE.has(w) || !sameSentence(i)) return;
    const v = lower[i + 1];
    if (v === "are") {
      add(asWritten(i) + " are", asWritten(i) + " is",
          `${w} — неисчисляемое, глагол в единственном числе: ${w} is.`);
    } else if (v === "were") {
      add(asWritten(i) + " were", asWritten(i) + " was",
          `${w} — неисчисляемое, глагол в единственном числе: ${w} was.`);
    }
  });

  // --- 14. Существительное-подлежащее в единственном числе + глагол без -s ---
  //
  // Правило 5 ловит только he/she/it. А «my mother work», «her brother
  // like» — та же ошибка, но с существительным, и именно её называла
  // методист. Берём closed-список явно единичных подлежащих (родня,
  // питомцы) и требуем определитель перед ним или начало предложения:
  // тогда это точно подлежащее, а не дополнение. Множественное («my
  // parents work») в список не входит и не трогается.
  const GC_SINGULAR_SUBJ = new Set(["mother", "father", "sister", "brother",
    "friend", "teacher", "dog", "cat", "mom", "mum", "dad", "son", "daughter",
    "wife", "husband", "boss", "uncle", "aunt", "grandmother", "grandfather",
    "grandma", "grandpa", "boy", "girl", "man", "woman", "child", "baby"]);
  const GC_SUBJ_DET = new Set(["my", "his", "her", "the", "a", "our", "your",
    "their", "every", "this", "that"]);
  lower.forEach((w, i) => {
    if (!GC_SINGULAR_SUBJ.has(w) || !sameSentence(i)) return;
    const okSubject = i === 0 || boundary[i - 1] || GC_SUBJ_DET.has(lower[i - 1]);
    if (!okSubject) return;
    // «Where does your brother live?» — окончание ушло во вспомогательный
    // слева от подлежащего. Ищем do/does/did (с отрицаниями) влево, но
    // не дальше своей клаузы: союз или wh-слово её закрывает, и чужой
    // «did» из соседней части («…and my brother go») настоящую ошибку
    // не спрячет.
    let auxLeft = false;
    for (let j = i - 1; j >= 0 && !boundary[j]; j--) {
      if (GC_CLAUSE_START.has(lower[j])) break;
      if (["do", "does", "did", "don't", "doesn't", "didn't"].includes(lower[j])) {
        auxLeft = true;
        break;
      }
    }
    if (auxLeft) return;
    const v = lower[i + 1];
    if (!v || !GC_COMMON_VERBS.includes(v)) return;   // не уверены — молчим
    if (GC_IRREGULAR_BE.has(v) || GC_MODALS.includes(v) || GC_PAST_SAME.includes(v)) return;
    const form = v === "go" || v === "do" ? v + "es"
               : v === "have" ? "has"
               : v === "study" ? "studies"
               : v === "try" ? "tries"
               : v === "watch" ? "watches" : v + "s";
    add(asWritten(i) + " " + v, asWritten(i) + " " + form,
        `Подлежащее в единственном числе — глагол получает -s: ${w} ${form}.`);
  });

  // --- 15. В предложении нет сказуемого ---
  //
  // Методист написала «Dialysis structural medical procedure to clean your
  // kidney from toxic chemicals» — пропущено «is a», а разбор промолчал:
  // все слова были написаны верно. Теперь смотрим, есть ли в предложении
  // личная форма глагола. Инфинитив с to сказуемым не считается — ровно
  // на нём и держалась ошибка.
  //
  // Молчим при любом сомнении: короткие фразы (там законно без глагола —
  // «Nice to meet you»), вопросы, восклицания и предложения, где есть
  // хоть одно незнакомое нам слово — вдруг это и был глагол.
  if (typeof EN_VERBS !== "undefined") {
    raw.split(/(?<=[.!?])\s+|\n+/).forEach(chunk => {
      const piece = chunk.trim();
      if (!piece || /[?!]\s*$/.test(piece)) return;
      // Кавычка-ёлочка в примерах словаря ломала разбор: «there’s»
      // распадалось на there и s, и предложение оставалось без глагола.
      const toks = (piece.toLowerCase().replace(/[\u2018\u2019]/g, "'").match(/[a-z']+/g) || []);
      if (toks.length < 5) return;
      const aux = w => GC_IRREGULAR_BE.has(w) || GC_MODALS.includes(w)
                    || ["have", "has", "had", "do", "does", "did", "ought",
                        "'s", "'re", "'ve", "'ll", "'d"].includes(w);
      const SUBJ = ["i", "you", "we", "they", "he", "she", "it", "who"];
      // Повелительное наклонение: «Plug the lamp into the socket» — глагол
      // стоит первым и может быть нам незнаком. Такие фразы пропускаем
      // целиком: отличить приказ от обрывка без разбора нельзя.
      if (!GC_FUNCTION_WORDS.has(toks[0]) && !gcIsVerb(toks[0])
          && ["the", "a", "an", "my", "your", "his", "her", "our", "their",
              "this", "that", "these", "those", "it", "them", "me", "us"].includes(toks[1])) return;
      const finite = toks.some((w, i) => {
        // -ed и -ing: даже незнакомое слово с таким хвостом почти всегда
        // глагольная форма. Ошибиться в эту сторону безопасно: правило
        // просто промолчит.
        // -s: «the catalyst speeds up» — незнакомое слово с известной
        // основой тоже считаем глаголом (и заодно молчим на множественном
        // числе: промолчать дешевле, чем обвинить зря).
        // Слово сразу после подлежащего-местоимения — почти всегда
        // сказуемое: «we boogie», «they hike».
        // Догадки по хвосту слова (-s, -ed, -ing) принимаем только НЕ в
        // самом конце фразы: сказуемое там почти не стоит, а вот хвост
        // «… from toxic chemicals» есть у каждого второго предложения — и
        // из-за него правило молчало бы всегда. Точные глаголы из списка
        // засчитываем в любом месте.
        const early = i <= toks.length - 3;
        const stemKnown = early && w.length > 3 && /s$/.test(w) && !/ss$/.test(w)
          && (gcKnownWord(w.replace(/(ie|e)?s$/, "")) || gcKnownWord(w.replace(/s$/, "")));
        const afterSubject = i > 0 && SUBJ.includes(toks[i - 1]) && !GC_FUNCTION_WORDS.has(w);
        // Знакомое слово, за которым идёт дополнение, наречие на -ly,
        // предлог или определитель, — почти всегда сказуемое: «barks
        // loudly», «scares me», «censor rude words».
        const nxt = toks[i + 1];
        const beforeObject = !!nxt && gcKnownWord(w) && !GC_FUNCTION_WORDS.has(w)
          && (["me", "us", "him", "her", "them", "it", "you"].includes(nxt)
              || /ly$/.test(nxt)
              || ["in", "on", "at", "from", "of", "for", "with", "by", "into",
                  "about", "over", "under", "through", "near", "against"].includes(nxt));
        // Определитель после слова НЕ признак глагола: «my brother a good
        // student» — как раз та фраза без сказуемого, которую мы ищем.
        const looksVerb = gcIsVerb(w) || beforeObject
          || (early && w.length > 4 && /(ed|ing)$/.test(w))
          || stemKnown || afterSubject;
        if (!looksVerb && !aux(w)) return false;
        if (toks[i - 1] === "to" && !aux(w)) return false;  // to clean — не сказуемое
        // «the work», «my study» — после определителя это существительное.
        // К be, have, do и модальным не относится: «that was», «this is».
        if (!aux(w) && ["a", "an", "the", "my", "your", "his", "her", "our", "their",
             "this", "that", "no", "every", "some", "any"].includes(toks[i - 1])) return false;
        return true;
      });
      // Отдельный, более надёжный признак: в предложении нет НИ ОДНОГО
      // слова из списка глаголов, а существительное стоит прямо перед
      // артиклем — «my brother a good student», «the conveyor a machine».
      // Так выглядит пропущенное is, и догадки по хвостам слов тут не
      // мешают: они для этой фразы ничего не находят.
      const PREP_G = ["in", "on", "at", "from", "of", "for", "with", "by", "into",
        "about", "over", "under", "through", "without", "after", "before"];
      const strictVerb = toks.some((w, i) => {
        // GC_COMMON_VERBS рядом с EN_VERBS: «It rain a lot» — rain есть
        // в школьном списке глаголов, но не в EN_VERBS (словарь перевёл
        // его существительным). Без этого фраза получала второе, неверное
        // замечание «нет сказуемого» рядом с верным «it rains». Школьный
        // список — про глаголы, поэтому молчание здесь безопасно.
        if (!gcIsVerb(w) && !GC_COMMON_VERBS.includes(w)) return false;
        if (toks[i - 1] === "to" && !aux(w)) return false;
        // «for moving things», «after leaving school» — это герундий,
        // сказуемым он не бывает.
        if (/ing$/.test(w) && PREP_G.includes(toks[i - 1])) return false;
        if (!aux(w) && ["a", "an", "the", "my", "your", "his", "her", "our",
             "their", "this", "that", "no"].includes(toks[i - 1])) return false;
        return true;
      });
      const nounThenArticle = toks.some((w, i) =>
        !GC_FUNCTION_WORDS.has(w) && !gcIsVerb(w) && gcKnownWord(w)
        // Слово с глагольным хвостом перед артиклем — это сказуемое
        // («booked a haircut»), а не пропущенное is.
        && !/(ed|ing|s)$/.test(w)
        && ["a", "an"].includes(toks[i + 1]));
      if (finite && !(!strictVerb && nounThenArticle)) return;
      if (!toks.every(gcKnownWord)) return;                // незнакомое слово — молчим
      const short = piece.length > 46 ? piece.slice(0, 44).trim() + "…" : piece;
      add(short, "",
          "Похоже, в предложении нет сказуемого: пропущен глагол. "
          + "«X is a procedure», «X cleans» — без is или без глагола фраза не складывается.");
    });
  }

  return notes;
}
