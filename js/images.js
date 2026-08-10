// Визуальные образы слов для карточек.
// Эмодзи вместо фотографий: мгновенно грузятся, работают офлайн,
// безопасны для детей и не требуют платных фотостоков.
// Абстрактным словам подобран образ-метафора, а не буквальная картинка.

const WORD_ART = {
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
};

// Слова, которые картинка действительно опознаёт: увидел образ — назвал слово.
// Только они попадают в упражнение «Слово и картинка»; у абстрактных слов
// вроде deliberately образ работает как напоминание, но не как загадка.
const PICTURABLE = new Set([
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
]);

// Запасные образы по категориям — для слов, добавленных вручную
const CATEGORY_ART = {
  food: "🍽️", home: "🏠", objects: "📦", places: "📍", nature: "🌿",
  time: "⏰", qualities: "✨", feelings: "💭", people: "👥",
  actions: "⚡", travel: "✈️", communication: "💬", mind: "🧠",
  character: "🎭", change: "🔄", money: "💰", society: "🏙️", linkers: "🔗",
};

// Фон карточки — свой оттенок на каждую категорию, чтобы слова
// визуально не сливались в одну кучу
const CATEGORY_TINT = {
  food: "#FFE8CC", home: "#FFE3D3", objects: "#EFE6DA", places: "#DDEEE6",
  nature: "#DCF0DC", time: "#E4E4F5", qualities: "#FFF0CC", feelings: "#FFE0E8",
  people: "#E6E9FA", actions: "#FFE1D6", travel: "#D9EEF7", communication: "#E9E2F7",
  mind: "#E3ECFB", character: "#F6E2F0", change: "#E0F0EA", money: "#E8F2D8",
  society: "#E7E7EF", linkers: "#EDEDED",
};

function wordArt(word, category) {
  const key = String(word || "").toLowerCase().trim();
  return WORD_ART[key] || CATEGORY_ART[category] || "🐾";
}

function wordTint(category) {
  return CATEGORY_TINT[category] || "#FFE8D6";
}

// Готовый блок с картинкой для карточки
function artBlock(word, category, size = "mid") {
  const div = document.createElement("div");
  div.className = "word-art word-art-" + size;
  div.style.background = wordTint(category);
  div.textContent = wordArt(word, category);
  return div;
}
