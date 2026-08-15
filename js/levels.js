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

// Синонимы и антонимы
const SYNONYMS = [
  { w: "big", syn: "large", ant: "small" },
  { w: "happy", syn: "glad", ant: "sad" },
  { w: "cold", syn: "chilly", ant: "hot" },
  { w: "cheap", syn: "inexpensive", ant: "expensive" },
  { w: "dangerous", syn: "risky", ant: "safe" },
  { w: "famous", syn: "well-known", ant: "unknown" },
  { w: "quiet", syn: "silent", ant: "noisy" },
  { w: "terrible", syn: "awful", ant: "wonderful" },
  { w: "improve", syn: "get better", ant: "worsen" },
  { w: "reliable", syn: "dependable", ant: "unreliable" },
  { w: "significant", syn: "important", ant: "minor" },
  { w: "vague", syn: "unclear", ant: "precise" },
  { w: "tremendous", syn: "huge", ant: "tiny" },
  { w: "inevitable", syn: "unavoidable", ant: "avoidable" },
  { w: "feasible", syn: "doable", ant: "impossible" },
  { w: "meticulous", syn: "thorough", ant: "careless" },
  { w: "ubiquitous", syn: "everywhere", ant: "rare" },
  { w: "taciturn", syn: "reserved", ant: "talkative" },
  { w: "ephemeral", syn: "short-lived", ant: "permanent" },
  { w: "gregarious", syn: "sociable", ant: "shy" },
];
