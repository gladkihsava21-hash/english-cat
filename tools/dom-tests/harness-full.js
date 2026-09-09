// То же, что harness.js, но со всеми банками: словарь, выражения,
// грамматика, словообразование, неправильные глаголы, разбор текста.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
// Корень репозитория: tools/dom-tests → на два уровня вверх.
const ROOT = path.resolve(__dirname, "..", "..");

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");

const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost:4210/" });
const w = dom.window;
delete w.speechSynthesis;
// prefers-reduced-motion можно включить из теста: MOTION_MQ в motion.js —
// const, подменить его снаружи нельзя, а вот объект от matchMedia наш.
const MQ = { matches: false, media: "", addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} };
w.matchMedia = q => (MQ.media = q, MQ);
w.__mq = MQ;
w.scrollTo = () => {};
w.fetch = () => Promise.reject(new Error("сеть в тесте выключена"));
w.Element.prototype.scrollIntoView = function(){};

// Случайность делаем предсказуемой.
//
// Упражнения тасуют слова, варианты и сетку кроссворда через Math.random,
// поэтому один и тот же тест то проходит, то нет — а мигающий тест хуже
// отсутствующего: к нему привыкают и перестают читать. Ставим свой
// генератор с зерном; SEED=<число> в окружении повторяет любой прогон.
//
// Подменяем ДО загрузки скриптов: shuffled() и подбор слов зовутся уже
// на первом openExercise.
const SEED = Number(process.env.SEED || 20260909);
let _rnd = SEED >>> 0;
w.Math.random = () => {
  // xorshift32 — короткий, без зависимостей, распределения хватает
  _rnd ^= _rnd << 13; _rnd >>>= 0;
  _rnd ^= _rnd >> 17;
  _rnd ^= _rnd << 5;  _rnd >>>= 0;
  return _rnd / 4294967296;
};

const errors = [];
w.addEventListener("error", e => errors.push(String(e.error || e.message)));
// OLD_EX=1 / OLD_GAMES=1 — прогнать те же проверки на версии до починок:
// баг обязан воспроизводиться, иначе чинить было нечего
const OLD = { "js/exercises.js": "OLD_EX", "js/games.js": "OLD_GAMES" };
const load = f => {
  const src = (OLD[f] && process.env[OLD[f]])
    ? path.join(__dirname, path.basename(f, ".js") + "-old.js")
    : path.join(ROOT, f);
  const s = w.document.createElement("script");
  s.textContent = fs.readFileSync(src, "utf8");
  w.document.head.appendChild(s);
};
["js/theme.js","js/i18n.js","js/icons.js","js/cat.js","js/motion.js","js/util.js",
 "js/levels.js","js/srs.js","js/images.js","js/word-photos.js","js/app.js",
 "js/achievements.js","js/exercises.js","js/games.js",
 // банки, которые в браузере едут лениво
 //
 // Словарь грузим НЕ целиком, а ровно те уровни, которые ensureWords()
 // дал бы ученику A2: свой, всё что ниже и один следующий. Это не
 // экономия для теста, а проверка по делу — при живом ученике B2, C1 и
 // C2 в WORDS отсутствуют, и весь код, который ходит по LEVELS, обязан
 // это переживать. Загрузи мы всё — эта ветка не проверялась бы никогда.
 "js/words-A1.js", "js/words-A2.js", "js/words-B1.js",
 "js/phrases.js","js/grammar.js","js/wordform.js",
 "js/grammarcheck.js","js/irregular.js"].forEach(load);

w.eval(`
  state.user = { name: "Тест", id: 1 };
  state.level = "A2";
  state.trainFolders = [];
  state.dictionary = [...WORDS.A1.slice(0, 30), ...WORDS.A2.slice(0, 30)]
    .map(x => ({ w: x.w, t: x.t, ex: x.ex, added: Date.now(), seen: 1 }));
  saveState = function () {};
`);

module.exports = { dom, w, errors, MQ };
