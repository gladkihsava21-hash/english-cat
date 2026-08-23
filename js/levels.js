// Уровни, их названия и небольшие вспомогательные списки.
//
// Вынесено из words.js, и это не косметика. Сам словарь — 1,1 МБ на диске
// и 326 КБ по проводу; эти же константы весят пару килобайт, но нужны
// почти везде: подпись уровня в шапке, названия тем в панели репетитора,
// оценка запаса после теста. Пока они лежали в одном файле со словарём,
// словарь приходилось грузить всем и сразу — в том числе тому, кто ещё
// не завёл аккаунт и видит только экран приветствия.
//
// Теперь маленькое грузится всегда, большое — когда действительно нужно
// (ensureWords в js/util.js).

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

// Примерный прирост словарного запаса на каждом уровне
const LEVEL_VOCAB_SIZE = { A1: 500, A2: 500, B1: 1000, B2: 2000, C1: 4000, C2: 8000 };

const LEVEL_NAMES = {
  A1: "Начинающий",
  A2: "Элементарный",
  B1: "Средний",
  B2: "Выше среднего",
  C1: "Продвинутый",
  C2: "Свободное владение",
};

const CATEGORY_NAMES = {
  food: "Еда", home: "Дом", objects: "Вещи", places: "Места", nature: "Природа",
  time: "Время", qualities: "Качества", feelings: "Чувства", people: "Люди",
  actions: "Действия", travel: "Дорога и отдых", communication: "Общение",
  mind: "Мышление", character: "Характер", change: "Изменения",
  money: "Деньги и работа", society: "Общество", linkers: "Слова-связки",
  family: "Семья", animals: "Животные", school: "Школа", body: "Тело",
  clothes: "Одежда", weather: "Погода", city: "Город", health: "Здоровье",
  art: "Творчество", sports: "Спорт", tech: "Техника", work: "Работа",
};

// Устойчивые сочетания (Collocation Matching) — пары подобраны так,
// чтобы перекрёстные комбинации были ошибочными
const COLLOCATIONS = [
  { h: "make", tl: "a decision" },
  { h: "do", tl: "homework" },
  { h: "take", tl: "a photo" },
  { h: "have", tl: "breakfast" },
  { h: "pay", tl: "attention" },
  { h: "tell", tl: "the truth" },
  { h: "keep", tl: "a secret" },
  { h: "catch", tl: "a cold" },
];

/* Синонимы и антонимы.
 *
 * Переводы обязательны у всех трёх слов. Без них упражнение проверяло
 * чутьё вслепую: ученик видел «meticulous → thorough / careless» и,
 * даже угадав, не узнавал, что это значит (жалоба методиста). Теперь
 * при ошибке показывается разбор с переводами всей тройки.
 *
 * Поля: w — заглавное слово, ru — его перевод; syn/synRu — синоним,
 * ant/antRu — антоним. Пары школьные: и синоним, и антоним должны быть
 * знакомыми словами, иначе упражнение проверяет везение.
 */
const SYNONYMS = [
  { w: "big", ru: "большой", syn: "large", synRu: "крупный", ant: "small", antRu: "маленький" },
  { w: "happy", ru: "счастливый", syn: "glad", synRu: "радостный", ant: "sad", antRu: "грустный" },
  { w: "cold", ru: "холодный", syn: "chilly", synRu: "прохладный", ant: "hot", antRu: "горячий" },
  { w: "cheap", ru: "дешёвый", syn: "inexpensive", synRu: "недорогой", ant: "expensive", antRu: "дорогой" },
  { w: "dangerous", ru: "опасный", syn: "risky", synRu: "рискованный", ant: "safe", antRu: "безопасный" },
  { w: "famous", ru: "знаменитый", syn: "well-known", synRu: "широко известный", ant: "unknown", antRu: "неизвестный" },
  { w: "quiet", ru: "тихий", syn: "silent", synRu: "безмолвный", ant: "noisy", antRu: "шумный" },
  { w: "terrible", ru: "ужасный", syn: "awful", synRu: "отвратительный", ant: "wonderful", antRu: "замечательный" },
  { w: "improve", ru: "улучшать(ся)", syn: "get better", synRu: "становиться лучше", ant: "worsen", antRu: "ухудшаться" },
  { w: "reliable", ru: "надёжный", syn: "dependable", synRu: "на которого можно положиться", ant: "unreliable", antRu: "ненадёжный" },
  { w: "significant", ru: "значительный", syn: "important", synRu: "важный", ant: "minor", antRu: "незначительный" },
  { w: "vague", ru: "расплывчатый", syn: "unclear", synRu: "неясный", ant: "precise", antRu: "точный" },
  { w: "tremendous", ru: "огромный", syn: "huge", synRu: "громадный", ant: "tiny", antRu: "крошечный" },
  { w: "inevitable", ru: "неизбежный", syn: "unavoidable", synRu: "которого не миновать", ant: "avoidable", antRu: "которого можно избежать" },
  { w: "feasible", ru: "выполнимый", syn: "doable", synRu: "осуществимый", ant: "impossible", antRu: "невозможный" },
  { w: "meticulous", ru: "дотошный", syn: "thorough", synRu: "тщательный", ant: "careless", antRu: "небрежный" },
  { w: "ubiquitous", ru: "вездесущий", syn: "everywhere", synRu: "повсюду", ant: "rare", antRu: "редкий" },
  { w: "taciturn", ru: "неразговорчивый", syn: "reserved", synRu: "сдержанный", ant: "talkative", antRu: "болтливый" },
  { w: "ephemeral", ru: "мимолётный", syn: "short-lived", synRu: "недолговечный", ant: "permanent", antRu: "постоянный" },
  { w: "gregarious", ru: "общительный", syn: "sociable", synRu: "компанейский", ant: "shy", antRu: "застенчивый" },

  { w: "fast", ru: "быстрый", syn: "quick", synRu: "скорый", ant: "slow", antRu: "медленный" },
  { w: "clever", ru: "умный", syn: "smart", synRu: "сообразительный", ant: "stupid", antRu: "глупый" },
  { w: "beautiful", ru: "красивый", syn: "pretty", synRu: "хорошенький", ant: "ugly", antRu: "уродливый" },
  { w: "difficult", ru: "трудный", syn: "hard", synRu: "сложный", ant: "easy", antRu: "лёгкий" },
  { w: "begin", ru: "начинать", syn: "start", synRu: "стартовать", ant: "finish", antRu: "заканчивать" },
  { w: "close", ru: "закрывать", syn: "shut", synRu: "затворять", ant: "open", antRu: "открывать" },
  { w: "angry", ru: "сердитый", syn: "annoyed", synRu: "раздражённый", ant: "calm", antRu: "спокойный" },
  { w: "tired", ru: "усталый", syn: "exhausted", synRu: "измотанный", ant: "energetic", antRu: "энергичный" },
  { w: "strange", ru: "странный", syn: "odd", synRu: "чудной", ant: "normal", antRu: "обычный" },
  { w: "brave", ru: "храбрый", syn: "courageous", synRu: "отважный", ant: "cowardly", antRu: "трусливый" },
  { w: "rich", ru: "богатый", syn: "wealthy", synRu: "состоятельный", ant: "poor", antRu: "бедный" },
  { w: "funny", ru: "смешной", syn: "amusing", synRu: "забавный", ant: "serious", antRu: "серьёзный" },
  { w: "old", ru: "старый", syn: "ancient", synRu: "древний", ant: "modern", antRu: "современный" },
  { w: "dirty", ru: "грязный", syn: "filthy", synRu: "чумазый", ant: "clean", antRu: "чистый" },
  { w: "small", ru: "маленький", syn: "tiny", synRu: "крошечный", ant: "enormous", antRu: "громадный" },
  { w: "kind", ru: "добрый", syn: "gentle", synRu: "мягкий", ant: "cruel", antRu: "жестокий" },
  { w: "correct", ru: "правильный", syn: "right", synRu: "верный", ant: "wrong", antRu: "неверный" },
  { w: "strong", ru: "сильный", syn: "powerful", synRu: "мощный", ant: "weak", antRu: "слабый" },
  { w: "wet", ru: "мокрый", syn: "damp", synRu: "влажный", ant: "dry", antRu: "сухой" },
  { w: "empty", ru: "пустой", syn: "bare", synRu: "голый, ничем не занятый", ant: "full", antRu: "полный" },
  { w: "buy", ru: "покупать", syn: "purchase", synRu: "приобретать", ant: "sell", antRu: "продавать" },
  { w: "speak", ru: "говорить", syn: "talk", synRu: "разговаривать", ant: "listen", antRu: "слушать" },
  { w: "shout", ru: "кричать", syn: "yell", synRu: "вопить", ant: "whisper", antRu: "шептать" },
  { w: "help", ru: "помогать", syn: "assist", synRu: "содействовать", ant: "hinder", antRu: "мешать" },
  { w: "choose", ru: "выбирать", syn: "pick", synRu: "отобрать", ant: "refuse", antRu: "отказываться" },
  { w: "real", ru: "настоящий", syn: "genuine", synRu: "подлинный", ant: "fake", antRu: "поддельный" },
  { w: "polite", ru: "вежливый", syn: "courteous", synRu: "учтивый", ant: "rude", antRu: "грубый" },
  { w: "usual", ru: "обычный", syn: "ordinary", synRu: "заурядный", ant: "unusual", antRu: "необычный" },
  { w: "safe", ru: "безопасный", syn: "secure", synRu: "защищённый", ant: "dangerous", antRu: "опасный" },
  { w: "glad", ru: "довольный", syn: "pleased", synRu: "обрадованный", ant: "upset", antRu: "расстроенный" },
  { w: "wide", ru: "широкий", syn: "broad", synRu: "просторный", ant: "narrow", antRu: "узкий" },
  { w: "smooth", ru: "гладкий", syn: "even", synRu: "ровный", ant: "rough", antRu: "шершавый" },
  { w: "bright", ru: "яркий", syn: "shiny", synRu: "блестящий", ant: "dull", antRu: "тусклый" },
  { w: "fair", ru: "справедливый", syn: "just", synRu: "честный", ant: "unfair", antRu: "несправедливый" },
  { w: "hungry", ru: "голодный", syn: "starving", synRu: "умирающий с голоду", ant: "full up", antRu: "сытый" },
  { w: "important", ru: "важный", syn: "essential", synRu: "необходимый", ant: "unimportant", antRu: "неважный" },
  { w: "hot", ru: "горячий", syn: "boiling", synRu: "кипящий", ant: "freezing", antRu: "ледяной" },
  { w: "sad", ru: "грустный", syn: "unhappy", synRu: "несчастный", ant: "cheerful", antRu: "весёлый" },
  { w: "loud", ru: "громкий", syn: "noisy", synRu: "шумный", ant: "soft", antRu: "тихий" },
  { w: "finish", ru: "заканчивать", syn: "complete", synRu: "завершать", ant: "begin", antRu: "начинать" },
];
