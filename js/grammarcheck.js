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
];

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
  const consonantSound = ["university", "universe", "user", "unique", "uniform", "unit",
    "european", "one", "once", "useful", "usual"];
  const vowelSound = ["hour", "honest", "honour", "honor", "heir"];
  if (consonantSound.some(x => w.startsWith(x))) return false;
  if (vowelSound.some(x => w.startsWith(x))) return true;
  return "aeiou".includes(w[0]);
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
    const base = v.slice(0, -1);
    if (!GC_COMMON_VERBS.includes(base)) return;
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
    if (GC_WRONG_FORMS[w]) {
      add(w, GC_WRONG_FORMS[w], "Это неправильная форма — запомни её отдельно.");
    }
    if (GC_MISSPELL[w]) {
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

  return notes;
}
