// Визуальные образы слов для карточек.
// Эмодзи вместо фотографий: мгновенно грузятся, работают офлайн,
// безопасны для детей и не требуют платных фотостоков.
// Абстрактным словам подобран образ-метафора, а не буквальная картинка.

const WORD_ART = {
  "juice": "🧃",
  "spoon": "🥄",
  "plate": "🍽️",
  "garden": "🌷",
  "shop": "🏪",
  "street": "🛣️",
  "park": "🏞️",
  "river": "🏞️",
  "winter": "❄️",
  "summer": "☀️",
  "doctor": "👨‍⚕️",
  "village": "🏘️",
  "forest": "🌲",
  "island": "🏝️",
  "wall": "🧱",
  "floor": "🔲",
  "slow": "🐌",
  "clean": "✨",
  "young": "🌱",
  "heavy": "🏋️",
  "careful": "⚠️",
  "brave": "🦁",
  "nervous": "😰",
  "lend": "🤝",
  "repeat": "🔁",
  "explain": "💬",
  "choose": "👉",
  "collect": "📦",
  "repair": "🔧",
  "save": "🏦",
  "challenge": "🎯",
  "develop": "📈",
  "encourage": "👏",
  "expect": "⏳",
  "familiar": "👀",
  "goal": "🥅",
  "influence": "🌊",
  "prefer": "💛",
  "realise": "💡",
  "responsible": "🎓",
  "solve": "🧩",
  "succeed": "🏆",
  "suffer": "😣",
  "suitable": "✅",
  "adequate": "👌",
  "consequence": "➡️",
  "considerable": "📊",
  "demonstrate": "🎬",
  "emphasise": "❗",
  "essential": "⭐",
  "furthermore": "➕",
  "gradually": "🐢",
  "implement": "🛠️",
  "indicate": "👉",
  "maintain": "🔩",
  "substantial": "📦",
  "tendency": "📉",
  "thorough": "🔍",
  "compile": "📚",
  "conceive": "💭",
  "elaborate": "📝",
  "viable": "✅",
  "astute": "🦉",
  "cogent": "🎯",
  "dearth": "🕳️",
  "eloquent": "🎤",
  "equivocal": "🌫️",
  "juxtapose": "⚖️",
  "penchant": "💘",
  "substantiate": "📑",
  "tacit": "🤐",
  "vociferous": "📢",
  // --- A1 ---
  apple: "🍎", water: "💧", milk: "🥛", food: "🍽️",
  house: "🏠", door: "🚪", book: "📖", school: "🏫",
  sun: "☀️", night: "🌙", morning: "🌅",
  cold: "🥶", big: "🐘", small: "🐁",
  happy: "😄", friend: "👫", family: "👨‍👩‍👧",
  run: "🏃", eat: "😋", sleep: "😴",

  // --- A2 ---
  weather: "🌦️", holiday: "🏖️", breakfast: "🥐",
  expensive: "💎", cheap: "🏷️", journey: "🗺️", luggage: "🧳",
  borrow: "🤲", arrive: "🛬", dangerous: "⚠️", famous: "🌟",
  healthy: "🥗", hungry: "🤤", invite: "💌", neighbour: "🏘️",
  promise: "🤝", quiet: "🤫", share: "🍕", terrible: "😱", weekend: "🎉",

  // --- B1 ---
  achieve: "🏆", advantage: "🃏", avoid: "🚧", behaviour: "🎭",
  confident: "💪", decrease: "📉", environment: "🌍", experience: "🎓",
  improve: "📈", income: "💰", opportunity: "🎯", persuade: "🗣️",
  pollution: "🏭", predict: "🔮", purpose: "🧭", reliable: "🛡️",
  solution: "💡", although: "🔀", definitely: "✅", curious: "🐈",

  // --- B2 ---
  accomplish: "🏁", ambiguous: "❓", anticipate: "🔭", assess: "📊",
  comprehensive: "📚", controversy: "⚖️", deliberately: "👉",
  distinguish: "🔍", emphasize: "❗", inevitable: "⏳", negotiate: "💼",
  perceive: "👁️", reluctant: "😕", significant: "⭐", subtle: "🪶",
  sustain: "🌱", tremendous: "🎆", undermine: "🪓", vague: "🌫️", widespread: "🌐",

  // --- C1 ---
  alleviate: "💊", coherent: "🧩", compelling: "🧲", discrepancy: "📐",
  feasible: "🗝️", meticulous: "🔬", notorious: "🦹", plausible: "🤔",
  profound: "🌊", scrutiny: "🕵️", tangible: "✋", ubiquitous: "📱",
  versatile: "🛠️", advocate: "📢", deteriorate: "🥀", intricate: "🕸️",
  resilient: "🎋", spontaneous: "💥", paradigm: "🏛️", endeavour: "🚀",

  // --- C2 ---
  capricious: "🌪️", ephemeral: "🫧", gregarious: "🫂", idiosyncrasy: "🦄",
  juxtaposition: "🖼️", magnanimous: "👑", obfuscate: "🌀", pernicious: "☠️",
  quintessential: "💯", serendipity: "🍀", taciturn: "🤐", vicissitude: "🎢",
  esoteric: "📜", laconic: "✂️", zealous: "🔥", obsequious: "🙇",

  // --- A1 (расширение) ---
  bread: "🍞", egg: "🥚", cheese: "🧀", tea: "🍵",
  banana: "🍌", cake: "🍰", meat: "🍖", rice: "🍚",
  soup: "🍲", mother: "👩", father: "👨", sister: "👭",
  brother: "👬", baby: "👶", grandmother: "👵", cat: "🐱",
  dog: "🐶", bird: "🐦", horse: "🐴", cow: "🐮",
  fish: "🐟", rabbit: "🐰", red: "🔴", blue: "🔵",
  green: "🟢", yellow: "🟡", black: "⚫", white: "⚪",
  good: "👍", bad: "👎", hot: "🥵", new: "🆕",
  one: "1️⃣", two: "2️⃣", three: "3️⃣", five: "5️⃣",
  ten: "🔟", pen: "🖊️", pencil: "✏️", teacher: "👩‍🏫",
  ruler: "📏", hand: "🖐️", leg: "🦵", foot: "🦶",
  nose: "👃", ear: "👂", mouth: "👄", tooth: "🦷",
  shirt: "👕", shoe: "👟", hat: "🧢", dress: "👗",
  coat: "🧥", sock: "🧦", chair: "🪑", bed: "🛏️",
  window: "🪟", kitchen: "🍳", key: "🔑", rain: "🌧️",
  snow: "❄️", wind: "💨", cloud: "☁️", tree: "🌳",
  flower: "🌷", sea: "🌊", mountain: "⛰️", walk: "🚶",
  swim: "🏊", jump: "🤸", sit: "💺", stand: "🧍",
  write: "✍️", drink: "🥤", sing: "🎤", dance: "💃",
  sad: "😢", angry: "😠", tired: "🥱", love: "❤️",

  // --- A2 (расширение) ---
  supermarket: "🛒", receipt: "🧾", price: "🏷️", spend: "💸",
  earn: "💵", wallet: "👛", bank: "🏦", ticket: "🎫",
  station: "🚉", bicycle: "🚲", taxi: "🚕", passenger: "🚌",
  airport: "🛫", traffic: "🚦", seat: "💺", drive: "🚗",
  bridge: "🌉", road: "🛣️", building: "🏢", museum: "🏛️",
  hotel: "🏨", hospital: "🏥", headache: "🤕", temperature: "🌡️",
  ill: "🤒", heart: "🫀", nurse: "👩‍⚕️", jacket: "🧥",
  scarf: "🧣", gloves: "🧤", boots: "🥾", wear: "👕",
  guitar: "🎸", paint: "🎨", draw: "✏️", win: "🥇",
  chess: "♟️", fishing: "🎣", gym: "🏋️", alarm: "⏰",
  shower: "🚿", wash: "🧼", mirror: "🪞", umbrella: "☂️",
  clock: "🕰️", cook: "👨‍🍳", lunch: "🥪", keyboard: "⌨️",
  headphones: "🎧", camera: "📷", battery: "🔋", message: "💬",
  afraid: "😨", surprised: "😲", worried: "😟", excited: "🤩",
  boring: "😑", lazy: "🦥", polite: "🙏", funny: "🤣",
  cloudy: "☁️", storm: "⛈️", always: "♾️", never: "🚫",
  often: "🔁", sometimes: "🎲", usually: "📆", early: "🐓",
  late: "🕚", busy: "📅",

  // --- B1 (расширение) ---
  colleague: "🧑‍🤝‍🧑", employer: "🧑‍💼", salary: "💵", apply: "📄",
  interview: "🎙️", career: "🧗", skill: "🤹", deadline: "⏰",
  manage: "🎛️", afford: "💳", degree: "🎓", essay: "📝",
  graduate: "👩‍🎓", attend: "🙋", progress: "🪜", knowledge: "🦉",
  concentrate: "🧘", memorize: "🧠", attitude: "💁", realize: "😲",
  consider: "🧐", doubt: "🤨", schedule: "🗓️", postpone: "🔜",
  arrange: "📋", deserve: "🎖️", suggest: "💬", complain: "😤",
  admit: "🫢", apologize: "🙏", discuss: "🗨️", argue: "🗯️",
  remind: "🔔", mention: "☝️", however: "↩️", therefore: "➡️",
  instead: "🔄", actually: "🔎", eventually: "⏱️", relationship: "👩‍❤️‍👨",
  trust: "🛟", support: "🙌", generous: "🎁", patient: "🐢",
  selfish: "🪞", honest: "😇", jealous: "💚", embarrassed: "😳",
  disappointed: "😞", proud: "🦚", lonely: "🧍", device: "🖥️",
  download: "📥", software: "💿", update: "🆕", charge: "🔋",
  compete: "🤼", coach: "📣", score: "🥅", athlete: "🏅",
  injury: "🤕", exhausted: "🥱", recycle: "♻️", waste: "🗑️",
  energy: "⚡", climate: "🌡️", protect: "☂️", increase: "⬆️",

  // --- B2 (расширение) ---
  justify: "🧑‍⚖️", assume: "💭", conclude: "🔚", evidence: "🧾",
  bias: "👓", flaw: "🕳️", outcome: "🎲", analyse: "🧮",
  estimate: "📏", phenomenon: "🌌", observe: "👀", imply: "🗨️",
  contradict: "🙅", clarify: "🔦", acknowledge: "🫡", claim: "🗯️",
  summarize: "📝", outline: "🗂️", objection: "🚫", consequently: "➡️",
  nevertheless: "↪️", moreover: "➕", whereas: "↔️", regardless: "🤷",
  somewhat: "🌗", inequality: "🪜", poverty: "🏚️", discrimination: "🚷",
  authority: "👮", democracy: "🗳️", campaign: "🪧", protest: "✊",
  reform: "🔧", welfare: "🛟", minority: "🧍", corruption: "💸",
  urban: "🏙️", budget: "📒", investment: "🪙", profit: "🤑",
  debt: "⛓️", wealth: "🛥️", consumer: "🛒", shortage: "🫙",
  unemployment: "📭", wage: "💵", currency: "💱", innovation: "⚙️",
  breakthrough: "⚡", artificial: "🤖", conduct: "📋", accurate: "📌",
  relevant: "📎", sufficient: "🔋", crucial: "🔑", beneficial: "💚",
  moderate: "🌡️", diverse: "🌈", gradual: "📶", drastic: "🌋",

  // --- C1 (расширение) ---
  inherent: "🧬", cumbersome: "🗄️", redundant: "🗑️", futile: "🌬️",
  mundane: "🧺", robust: "🦾", arbitrary: "🎲", constraint: "⛓️",
  entail: "🪢", premise: "🧱", criterion: "📋", mitigate: "🧯",
  exacerbate: "⛽", obsolete: "📟", proliferate: "🍄", reconcile: "🕊️",
  foster: "🪴", pragmatic: "🔧", candid: "🪞", sceptical: "🧐",
  complacent: "😌", impartial: "🧑‍⚖️", nuance: "🎨", articulate: "🗨️",
  convey: "📡", concede: "🏳️", lucrative: "🤑", incentive: "🥕",
  deficit: "💸", allocate: "🥧", legitimate: "🪪", consensus: "🙌",
  endorse: "👍", loophole: "🕳️", daunting: "⛰️", resent: "😤",
  apprehensive: "😟", exhilarating: "🪂", imminent: "🌩️", unprecedented: "🆕",
  milestone: "🚩", nonetheless: "↪️", hence: "➡️", conversely: "↔️",
  arguably: "🗯️", adhere: "📌", streamline: "⚙️", depict: "🖌️",

  // --- C2 (расширение) ---
  ineffable: "🌌", lugubrious: "😔", perfunctory: "⏩", recalcitrant: "🐎",
  truculent: "🥊", inexorable: "🚂", mellifluous: "🎶", ostensible: "🪞",
  protean: "🦎", sanguine: "🌤️", tenuous: "🧵", venerate: "🛐",
  assiduous: "🐜", cacophony: "🔊", ebullient: "🍾", fastidious: "🧼",
  garrulous: "🦜", hackneyed: "🥱", impecunious: "👛", maudlin: "😭",
  nebulous: "☁️", opulent: "🏰", supercilious: "🦚", trenchant: "🗡️",
  wistful: "🍂", anachronism: "🕰️", bucolic: "🐑", clandestine: "🕶️",
  incongruous: "🙃", ostracize: "🚷", vitriolic: "🧪", halcyon: "🕊️",
  inscrutable: "🗿", torpor: "🦥", equivocate: "↔️", myopic: "👓",
  seminal: "🌰", nascent: "🐣", wanderlust: "🎒", tantamount: "🟰",
};

// Слова, которые картинка действительно опознаёт: увидел образ — назвал слово.
// Только они попадают в упражнение «Слово и картинка»; у абстрактных слов
// вроде deliberately образ работает как напоминание, но не как загадка.
const PICTURABLE = new Set([
  "juice",
  "spoon",
  "plate",
  "garden",
  "shop",
  "park",
  "river",
  "winter",
  "summer",
  "doctor",
  "forest",
  "island",
  "wall",
  "street",
  "village",
  "apple", "water", "milk", "food", "house", "door", "book", "school",
  "sun", "night", "morning", "cold", "happy", "friend", "family",
  "run", "eat", "sleep",
  "weather", "holiday", "breakfast", "luggage", "dangerous", "healthy",
  "hungry", "quiet", "expensive", "neighbour", "invite",
  "environment", "pollution", "income", "solution", "confident", "achieve",
  "decrease", "improve", "predict",
  "negotiate", "emphasize", "sustain", "vague",
  "alleviate", "meticulous", "intricate", "advocate", "deteriorate",
  "ephemeral", "taciturn", "zealous", "magnanimous", "obsequious", "serendipity",
  // расширение базы
  "bread", "egg", "cheese", "tea", "banana", "cake",
  "meat", "rice", "soup", "baby", "grandmother", "cat",
  "dog", "bird", "horse", "cow", "fish", "rabbit",
  "red", "blue", "green", "yellow", "black", "white",
  "good", "bad", "hot", "new", "one", "two",
  "three", "five", "ten", "pen", "pencil", "teacher",
  "ruler", "hand", "leg", "foot", "nose", "ear",
  "mouth", "tooth", "shirt", "shoe", "hat", "dress",
  "coat", "sock", "chair", "bed", "window", "key",
  "rain", "snow", "cloud", "tree", "flower", "sea",
  "mountain", "walk", "swim", "write", "drink", "sing",
  "dance", "sad", "angry", "tired", "love", "supermarket",
  "receipt", "spend", "wallet", "bank", "ticket", "station",
  "bicycle", "taxi", "seat", "bridge", "road", "building",
  "hotel", "hospital", "headache", "temperature", "ill", "heart",
  "jacket", "scarf", "gloves", "boots", "guitar", "paint",
  "win", "chess", "fishing", "gym", "alarm", "shower",
  "mirror", "umbrella", "cook", "keyboard", "headphones", "camera",
  "battery", "message", "afraid", "surprised", "lazy", "funny",
  "storm", "charge", "injury", "recycle", "energy", "democracy",
  "protest", "urban", "currency", "artificial", "constraint", "concede",
  "endorse", "exhilarating",
]);

// Запасные образы по категориям — для слов, добавленных вручную
const CATEGORY_ART = {
  food: "🍽️", home: "🏠", objects: "📦", places: "📍", nature: "🌿",
  time: "⏰", qualities: "✨", feelings: "💭", people: "👥",
  actions: "⚡", travel: "✈️", communication: "💬", mind: "🧠",
  character: "🎭", change: "🔄", money: "💰", society: "🏙️", linkers: "🔗",
  family: "👨‍👩‍👧", animals: "🐾", school: "🎒", body: "🫀", clothes: "👕",
  weather: "🌦️", city: "🏙️", health: "💊", art: "🎨", sports: "⚽",
  tech: "💻", work: "💼",
};

// Фон карточки — оттенок по категории, чтобы слова не сливались в кучу.
//
// Раньше здесь лежали тридцать захардкоженных пастелей. Две беды: треть из
// них была оранжевой (гамма давно другая), и ночью они не темнели — плитки
// светились на тёмном фоне, и это приходилось перебивать через !important.
// Теперь возвращаем ИМЯ ТОКЕНА: цвет живёт в tokens.css и меняется с темой.
const CATEGORY_TINT = {
  // тёплые: еда, дом, вещи, работа
  food: "clay", home: "clay", objects: "clay", work: "clay", art: "clay",
  clothes: "clay", body: "clay",
  // зелёные: природа, здоровье, спорт, деньги
  nature: "mint", health: "mint", sports: "mint", money: "mint",
  places: "mint", travel: "mint", change: "mint",
  // синие: техника, город, школа, общение
  tech: "sky", city: "sky", school: "sky", communication: "sky",
  society: "sky", time: "sky", people: "sky",
  // сиреневые: чувства, характер, мышление, качества
  feelings: "lavender", character: "lavender", mind: "lavender",
  qualities: "lavender", family: "lavender", animals: "lavender",
  linkers: "lavender",
};

/** Возвращает CSS-значение, а не хекс: цвет берётся из токенов и темнеет
 *  вместе с темой. Полупрозрачность — чтобы плитка была подложкой,
 *  а не пятном: эмодзи на ней должен читаться в обеих темах. */
function wordTint(category) {
  const name = CATEGORY_TINT[category] || "mint";
  return `color-mix(in srgb, var(--soft-${name}) 38%, var(--surface))`;
}

/** Образ слова СТРОКОЙ. Остаётся эмодзи и после появления фотографий:
 *  на нём держится сравнение образов в exercises.js — ловушка не должна
 *  получить ту же картинку, что правильный ответ. Сравнивать разметку
 *  вместо символа значило бы сличать теги и полагаться на случайность. */
function wordArt(word, category) {
  const key = String(word || "").toLowerCase().trim();
  return WORD_ART[key] || CATEGORY_ART[category] || "🐾";
}

/** Образ слова РАЗМЕТКОЙ — то, что реально видит ученик.
 *  Для 110 конкретных слов это фотография (список в js/word-photos.js),
 *  для остальных — прежний эмодзи. Абстрактному слову фотография не
 *  помогает: «therefore» нечем сфотографировать, и попытка кончается
 *  случайной картинкой, которая мешает больше, чем помогает.
 *
 *  alt пустой: плитка декоративная, слово написано рядом текстом, и
 *  озвучивать его скринридеру второй раз незачем. */
/** Монолинейная заглушка по категории — то, что стоит в плитке, когда
 *  фотографии у слова нет.
 *
 *  Раньше там был эмодзи-метафора, и это оказалось хуже, чем казалось:
 *  фото есть у 110 слов из 2500, то есть эмодзи стояли ПОЧТИ ВЕЗДЕ.
 *  В списке словаря из четырнадцати строк получалось четырнадцать
 *  разноцветных системных значков — самые насыщенные пиксели экрана,
 *  а в ночной теме единственные цветные вообще. Плюс метафора у трёх
 *  разных слов выходила одна и та же (✨ у translucent, cordial и
 *  sluggish), то есть не различала их, а сливала. И ✅ у слова suitable
 *  читался как «выучено» и спорил со статусом строки.
 *
 *  Иконка из общего набора решает всё это разом: один цвет, наследуемый
 *  от родителя, одна толщина линии, и она честно говорит «это категория»,
 *  не притворяясь изображением предмета. */
const CATEGORY_ICON = {
  food: "categories", home: "home", objects: "categories", places: "target",
  nature: "sparkle", time: "clock", qualities: "sparkle", feelings: "chat",
  people: "personal", actions: "blitz", travel: "target", communication: "chat",
  mind: "mcq", character: "personal", change: "refresh", money: "categories",
  society: "personal", linkers: "matching", family: "personal", animals: "paw",
  school: "book", body: "personal", clothes: "categories", weather: "sparkle",
  city: "categories", health: "sparkle", art: "picture", sports: "medal",
};

function categoryIcon(category) {
  const name = CATEGORY_ICON[category] || "paw";
  return typeof icon === "function" ? icon(name, 22) : "";
}

function wordArtHTML(word, category) {
  const key = String(word || "").toLowerCase().trim();
  if (typeof WORD_PHOTOS !== "undefined" && WORD_PHOTOS[key]) {
    // Свой класс, а не расчёт на класс родителя: плитку рисуют четыре
    // разных места (.word-art у ученика, .hw-word-art в панели репетитора
    // и два размера внутри упражнений). Пока размер задавался через
    // «.word-art img», картинка в панели вылезала в натуральные 480×480
    // и накрывала собой пол-экрана — контейнер там называется иначе.
    // 336 — настоящий размер файла (tools/build_images.py --size 336).
    // Цифры здесь нужны браузеру, чтобы зарезервировать место до загрузки
    // и не дёргать вёрстку; врать в них нельзя.
    //
    // Откуда 336. Самая крупная плитка на сайте — фото во флешкарте,
    // 168 CSS-пикселей (на экранах уже 480px — 132). Ровно вдвое больше
    // и берём: на retina один пиксель картинки ложится на один пиксель
    // экрана. Стояло 480 — это на 40% больше байтов ни за что.
    // Проверять такое надо измерением, а не по стилям на глаз: правило
    // на 132px лежит внутри @media (max-width: 480px), и если прочитать
    // только его, легко ужать плитки до размытых.
    return `<img class="word-photo" src="img/words/${encodeURIComponent(key)}.webp"`
         + ` alt="" width="336" height="336" loading="lazy" decoding="async">`;
  }
  // Фотографии нет — ставим монолинейную заглушку по категории, а не
  // эмодзи: почему именно так, расписано у CATEGORY_ICON выше.
  return `<span class="word-icon">${categoryIcon(category)}</span>`;
}

// Готовый блок с картинкой для карточки
function artBlock(word, category, size = "mid") {
  const div = document.createElement("div");
  div.className = "word-art word-art-" + size;
  div.style.background = wordTint(category);
  div.innerHTML = wordArtHTML(word, category);
  return div;
}
