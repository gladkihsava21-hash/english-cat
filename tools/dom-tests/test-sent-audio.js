// Озвучка предложений диктанта записями (audio/sent/) и гейт «нет озвучки».
//
// Слова, словарные фразы и тройки глаголов всегда есть записью
// (WORD_AUDIO), предложения — по списку хэшей уровня (SENT_AUDIO, едет
// лениво), синтез речи — запасной путь. В jsdom синтеза нет (TTS_OK =
// false) — ровно тот телефон из Telegram, ради которого всё это.
const fs = require("fs");
const path = require("path");
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const tick = ms => new Promise(r => setTimeout(r, ms || 30));
let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };
// Слушатель нужен, чтобы посчитать «чужие» отказы промисов (play() без
// catch и т.п.), но он же мешает Node завершиться кодом 1, когда падает
// само тело теста, — поэтому у async-обёртки ниже свой catch с exit(1).
const rejections = [];
process.on("unhandledRejection", e => rejections.push(String(e)));

// Записи слов — как в браузере: тегом, до упражнений. Стенд сам их не
// грузит: остальные тесты проверяют ветку «нет озвучки вообще».
const ROOT = path.resolve(__dirname, "..", "..");
const tag = doc.createElement("script");
tag.textContent = fs.readFileSync(path.join(ROOT, "js", "word-audio.js"), "utf8");
doc.head.appendChild(tag);

// Audio в jsdom есть, но play() не реализован — возвращает undefined, а не
// промис. Подменяем записывающей заглушкой; __audioFail имитирует «файл
// не доехал», чтобы проверить откат в синтез.
//
// loadScriptOnce стенд и так отвергает для sent-audio-*.js; здесь он
// управляемый: уровни из __present «доезжают», остальные — 404.
w.eval(`
  window.__audio = [];
  window.__audioFail = false;
  window.Audio = function (url) {
    this.src = url; this.playbackRate = 1; this.currentTime = 0; this.paused = true;
    window.__audio.push(this);
  };
  window.Audio.prototype.play = function () {
    this.paused = false;
    return window.__audioFail ? Promise.reject(new Error("нет файла")) : Promise.resolve();
  };
  window.Audio.prototype.pause = function () { this.paused = true; };
  window.__asked = [];
  window.__present = {};
  window.loadScriptOnce = function (src) {
    window.__asked.push(src);
    const m = src.match(/sent-audio-([A-C][12])\\.js/);
    if (m && m[1] in window.__present) {
      window.SENT_AUDIO = window.SENT_AUDIO || {};
      SENT_AUDIO[m[1]] = window.__present[m[1]];
      return Promise.resolve(true);
    }
    return Promise.reject(new Error("стенд: нет файла " + src));
  };
`);
const audio = () => JSON.parse(w.eval(
  "JSON.stringify(window.__audio.map(a => ({ src: a.src, rate: a.playbackRate, paused: a.paused })))"));
const asked = () => JSON.parse(w.eval("JSON.stringify(window.__asked)"));
const stageText = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();
// «Список уровня доехал» с настоящими хэшами настоящих предложений: диктант
// без синтеза диктует только записанное, и с чужими хэшами он бы не открылся.
const realHashes = (lvl, n) => w.eval(
  `WORDS.${lvl}.filter(x => x.ex).slice(0, ${n}).map(x => sentAudioKey(x.ex)).join(" ")`);

// Эталоны — из сборщика, byte-for-byte:
//   python3 -c "import sys; sys.path.insert(0,'tools'); import build_sent_audio as b;
//               print(b.fnv1a64('Hello world.'), b.fnv1a64('Café — «тест»'), b.fnv1a64(''))"
const HELLO = "9e528114572077eb";
const CAFE = "8725db232107eb00";
const EMPTY = "cbf29ce484222325";

(async () => {
  console.log("TTS_OK =", w.eval("TTS_OK"), "| записи слов:", w.eval("wordAudioReady()"));

  console.log("\n1. sentAudioKey совпадает с fnv1a64() из tools/build_sent_audio.py");
  ok(w.eval('sentAudioKey("Hello world.")') === HELLO, "«Hello world.» → " + HELLO);
  ok(w.eval('sentAudioKey("Café — «тест»")') === CAFE, "не-ASCII считается по байтам UTF-8 → " + CAFE);
  ok(w.eval('sentAudioKey("  Hello \\n  world. ")') === HELLO, "нормализация: trim + пробельные последовательности в один пробел");
  ok(w.eval('sentAudioKey("hello world.")') !== HELLO, "регистр НЕ сбрасывается");
  ok(w.eval('sentAudioKey("")') === EMPTY, "пустая строка — базовое смещение FNV");
  // Пробелы — по таблице Python str.split(), а не JS \s: там, где они
  // расходятся, эталон — сборщик. Значения:
  //   b.fnv1a64('a﻿b'), b.fnv1a64('a\x85b'), b.fnv1a64('a\x1cb'),
  //   b.fnv1a64('\x1c Hello world. \x85'), b.fnv1a64('a　b')
  const AB = "e63f991904833892";   // 'a b'
  ok(w.eval('sentAudioKey("a\\ufeffb")') === "453947a9e7bf4c3b", "U+FEFF — не пробел (JS \\s считает иначе)");
  ok(w.eval('sentAudioKey("a\\x85b")') === AB, "U+0085 — пробел (JS \\s считает иначе)");
  ok(w.eval('sentAudioKey("a\\x1cb")') === AB && w.eval('sentAudioKey("a\\x1fb")') === AB,
     "U+001C–U+001F — пробелы (JS \\s считает иначе)");
  ok(w.eval('sentAudioKey("\\x1c Hello world. \\x85")') === HELLO, "такие пробелы срезаются и с концов — не trim()");
  ok(w.eval('sentAudioKey("a\\u3000b")') === AB && w.eval('sentAudioKey("a\\u00a0b")') === AB,
     "идеографический пробел и NBSP схлопываются, как и у Python");

  console.log("\n2. ensureSentAudio: уровня нет — это «нет», а не ошибка");
  let r;
  try { r = await w.eval("ensureSentAudio()"); } catch (e) { r = "отвергся: " + e; }
  ok(r === false, "промис разрешился false, а не отвергся: " + r);
  ok(asked().length === 3 && asked().every(s => /js\/sent-audio-(A1|A2|B1)\.js/.test(s)),
     "запрошены уровни ученика A2 — A1, A2, B1: " + asked().join(", "));
  ok(w.eval("sentAudioReady()") === true, "уровни помечены «нет» — ждать больше нечего");
  w.eval("window.__asked = [];");
  await w.eval("ensureSentAudio()");
  ok(asked().length === 0, "второй раз не переспрашиваем");
  ok(w.eval('sentAudioHas("Hello world.")') === false, "без списка предложения нет");
  ok(w.eval('canHear("listening")') === true, "аудирование слышно: записи слов есть");
  ok(w.eval('canHear("dictation")') === false, "диктант — нет: ни записей предложений, ни синтеза");
  ok(w.eval('canHear("word")') === true, "тройки глаголов и игры — есть (записи слов)");

  console.log("\n3. speak(): слово — записью, предложение без записи — молчит без исключений");
  ok(w.eval('!!WORD_AUDIO["zoo"]'), "слово zoo есть в WORD_AUDIO");
  w.eval("window.__audio = [];");
  w.eval('speak("zoo")');
  ok(audio().length === 1 && audio()[0].src === "audio/words/zoo.mp3", "speak(«zoo») → audio/words/zoo.mp3");
  w.eval("window.__audio = [];");
  let threw = null;
  try { w.eval('speak("Hello world.")'); } catch (e) { threw = e.message; }
  ok(!threw && audio().length === 0, "speak(предложение) без записи: Audio не создан, исключений нет");

  console.log("\n4. Список уровня доехал — предложение играется файлом");
  const A2_HASHES = realHashes("A2", 12);
  ok(A2_HASHES.split(" ").length === 12, "у 12 слов A2 есть примеры — их хэши идут в список A2");
  w.eval(`window.__present.A1 = "${HELLO} ${CAFE}"; window.__present.A2 = "${A2_HASHES}";
          _sentAudioMissing.clear(); window.__asked = [];`);
  r = await w.eval("ensureSentAudio()");
  ok(r === true, "ensureSentAudio → true: есть уровень с записями");
  ok(w.eval('sentAudioHas("Hello world.") && sentAudioHas("  Hello   world. ")'), "sentAudioHas — по нормализованному тексту");
  ok(w.eval('sentAudioHas("Hello world")') === false, "другое предложение — нет");
  ok(w.eval('canHear("dictation")') === true, "диктант слышно без синтеза: записан уровень A2 ученика");
  w.eval("window.__audio = [];");
  ok(w.eval('speakSentence("Hello world.")') === true, "speakSentence вернул true");
  ok(audio().length === 1 && audio()[0].src === "audio/sent/" + HELLO + ".mp3", "URL: audio/sent/<хэш>.mp3");
  ok(audio().length === 1 && audio()[0].rate === 1, "обычная скорость → playbackRate 1");
  w.eval('speak("Hello world.", { rate: 0.62 })');
  ok(audio().length === 1 && audio()[0].rate === 0.72, "«Медленно» — тот же Audio из кэша, playbackRate 0.72");
  w.eval('speak("zebra")');
  ok(audio().length === 2 && audio()[0].paused === true, "слово заглушило предложение");
  w.eval("window.__audio = []; window.__audioFail = true;");
  w.eval('speak("Café — «тест»")');
  await tick(10);
  w.eval("window.__audioFail = false;");
  w.eval('speak("Café — «тест»")');
  ok(audio().length === 2, "после неудачного play() Audio пересоздан, а не взят из кэша");
  ok(rejections.length === 0, "необработанных отказов промисов нет");

  console.log("\n5. Гейт хаба: без speechSynthesis, но с записями слов раздел «На слух» открыт");
  w.eval("renderPracticeHub()");
  const sec = [...doc.querySelectorAll("#practice-grid .ex-group")]
    .find(s => /На слух/.test(s.querySelector("h3").textContent));
  ok(!!sec, "раздел «На слух» на месте");
  ok(sec && !sec.querySelector(".audio-help"), "подсказка «Здесь нет английской озвучки» не показана");
  const cards = sec ? [...sec.querySelectorAll(".ex-card")] : [];
  ok(cards.length === 2 && cards.every(c => !c.disabled), "обе плитки живые");

  console.log("\n6. Вход в аудирование и диктант");
  w.eval("window.__audio = [];");
  w.eval('openExercise("listening")');
  await tick(60);
  ok(!doc.querySelector("#ex-stage .audio-help"), "openExercise(«listening») не показывает подсказку");
  ok(!!doc.querySelector("#ex-stage .mcq-options"), "аудирование открылось");
  await tick(450);   // автоозвучка вопроса через 350 мс
  ok(audio().some(a => /^audio\/words\//.test(a.src)), "слово вопроса прозвучало записью: "
     + JSON.stringify(audio().map(a => a.src)));
  w.eval("state.trainFolders = []; state.trainWords = []; homeworkScope = null;");
  w.eval('openExercise("dictation")');
  await tick(60);
  ok(!!doc.getElementById("type-input"), "диктант открылся");
  w.eval("window.__audio = [];");
  doc.getElementById("type-audio").click();
  const recorded = new Set(A2_HASHES.split(" "));
  ok(audio().length === 1 && /^audio\/sent\//.test(audio()[0].src)
     && recorded.has(audio()[0].src.replace(/^audio\/sent\/|\.mp3$/g, "")),
     "без синтеза диктуется только записанное предложение: " + JSON.stringify(audio().map(a => a.src)));

  console.log("\n7. Гейт входа: список есть, но пустой — диктант закрыт, аудирование нет");
  w.eval(`window.SENT_AUDIO = { A1: "" }; _sentAudioMissing.clear();
          _sentAudioMissing.add("A2"); _sentAudioMissing.add("B1");`);
  ok(w.eval("sentAudioReady()") === true && w.eval('canHear("dictation")') === false,
     "пустой список = записей нет");
  w.eval('openExercise("dictation")');
  await tick(60);
  ok(!!doc.querySelector("#ex-stage .audio-help"), "диктант без записей и без синтеза — подсказка");
  ok(!doc.getElementById("type-input"), "и поле ввода не рисуется");
  w.eval('openExercise("listening")');
  await tick(60);
  ok(!!doc.querySelector("#ex-stage .mcq-options"), "аудирование при этом открыто");

  console.log("\n8. Экран ожидания: диктант стартует ПОСЛЕ загрузки списка");
  w.eval(`delete window.SENT_AUDIO; _sentAudioMissing.clear();
          window.__present = { A2: "${A2_HASHES}" }; window.__asked = [];`);
  w.eval('openExercise("dictation")');
  ok(/Достаю озвучку/.test(stageText()), "показан экран ожидания: " + stageText().slice(0, 30));
  ok(asked().length === 2 && asked().every(s => /sent-audio-(A2|B1)\.js/.test(s)),
     "запрошены списки уровней, откуда диктант берёт предложения, — свой и следующий: " + asked().join(", "));
  await tick(60);
  ok(!!doc.getElementById("type-input"), "после загрузки диктант открылся");

  console.log("\n9. Файл списка пришёл, но уровня не определил — вход не зацикливается");
  // Обрезанный файл: 200 и load, SyntaxError onerror не даёт. Раньше
  // sentAudioReady() оставался false навсегда, и вход в диктант звал сам
  // себя в микрозадачах без конца — вкладка висла на «Достаю озвучку…».
  w.eval(`delete window.SENT_AUDIO; _sentAudioMissing.clear(); window.__asked = [];
          window.__loadStub = window.loadScriptOnce;
          window.loadScriptOnce = src => { window.__asked.push(src); return Promise.resolve(true); };
          window.__openReal = openExercise; window.__opened = 0;
          openExercise = function (id) {
            if (++window.__opened > 20) throw new Error("openExercise по кругу");
            return window.__openReal(id);
          };`);
  w.eval('openExercise("dictation")');
  await tick(60);
  ok(w.eval("window.__opened") === 2, "вход повторился один раз, а не по кругу: " + w.eval("window.__opened"));
  ok(w.eval("sentAudioReady(dictationLevels())") === true, "уровни, что не определились, помечены «нет»");
  ok(!!doc.querySelector("#ex-stage .audio-help"), "и диктант закрыт подсказкой, а не завис на ожидании");
  w.eval("openExercise = window.__openReal; window.loadScriptOnce = window.__loadStub;");

  console.log("\n10. Гейт судит по уровням диктанта, а не «хоть один уровень записан»");
  // Ученик B2: список A1 полон, а его диктант берёт B2+C1, где записей
  // нет. Раньше гейт открывал беззвучный диктант — ровно то, что закрывал
  // прежний !TTS_OK, и репетитору уходило «0 из 5».
  w.eval(`state.level = "B2"; window.SENT_AUDIO = { A1: "${realHashes("A1", 12)}" };
          _sentAudioMissing.clear(); _sentAudioMissing.add("B2"); _sentAudioMissing.add("C1");`);
  ok(JSON.stringify(w.eval("JSON.stringify(dictationLevels())")) === JSON.stringify('["B2","C1"]'),
     "уровни диктанта B2 — B2 и C1: " + w.eval("JSON.stringify(dictationLevels())"));
  ok(w.eval("sentAudioLoaded()") === true && w.eval('canHear("dictation")') === false,
     "записи A1 есть, но диктанту B2 они не помогут — гейт закрыт");
  w.eval("window.__audio = [];");
  w.eval('openExercise("dictation")');
  await tick(450);
  ok(!!doc.querySelector("#ex-stage .audio-help") && !doc.getElementById("type-input"),
     "вход показывает подсказку, а не беззвучный диктант");
  ok(audio().length === 0, "ни одного Audio не создано");
  w.eval('state.level = "A2";');

  console.log("\n11. Домашка из слов чужого уровня: список — по уровню слов, без записи фразы — само слово");
  // Репетитор задал A2-ученику пять слов C1: список C1 запрашивается по
  // уровню слов (wordsLevels() до него не дотянется), записей нет — и
  // диктуются сами слова, а не тишина: «именно эти слова» важнее фразы.
  const HW = JSON.parse(w.eval(`JSON.stringify(WORDS.B1.filter(x => x.ex && WORD_AUDIO[x.w.toLowerCase()])
    .slice(0, 5).map(x => ({ w: x.w, t: x.t, ex: x.ex, level: "C1", added: Date.now(), seen: 1 })))`));
  ok(HW.length === 5, "пять слов с примером и записью слова");
  w.eval(`window.__dict = state.dictionary; state.dictionary = ${JSON.stringify(HW)};
          homeworkScope = state.dictionary.map(d => d.w.toLowerCase());
          delete window.SENT_AUDIO; _sentAudioMissing.clear(); window.__asked = []; window.__audio = [];`);
  ok(w.eval("JSON.stringify(dictationLevels())") === '["C1"]', "уровни диктанта — уровень слов домашки: C1");
  w.eval('openExercise("dictation")');
  await tick(60);
  ok(asked().length === 1 && /sent-audio-C1\.js/.test(asked()[0]), "запрошен список C1: " + asked().join(", "));
  ok(!!doc.getElementById("type-input"), "диктант открылся");
  ok(/Послушай и напиши слово/.test(stageText()), "диктуется слово, не фраза: " + stageText().slice(0, 40));
  doc.getElementById("type-audio").click();
  ok(audio().length === 1 && /^audio\/words\//.test(audio()[0].src)
     && HW.some(d => audio()[0].src === "audio/words/" + d.w.toLowerCase().replace(/[^a-z0-9-]+/g, "_") + ".mp3"),
     "слово домашки прозвучало записью: " + JSON.stringify(audio().map(a => a.src)));
  w.eval("homeworkScope = null; state.dictionary = window.__dict;");

  console.log("\n" + (fails ? "ПРОБЛЕМ: " + fails : "озвучка предложений и гейт работают")
    + "; ошибки обработчиков: " + JSON.stringify(errors)
    + (rejections.length ? "; отказы промисов: " + JSON.stringify(rejections) : ""));
  process.exit(fails || rejections.length ? 1 : 0);
})().catch(e => {
  // Падение тела теста — провал, а не тихий выход с кодом 0: слушатель
  // unhandledRejection выше иначе «обработал» бы отказ async-обёртки.
  console.log("  ✗ тест упал: " + (e && e.stack || e));
  process.exit(1);
});
