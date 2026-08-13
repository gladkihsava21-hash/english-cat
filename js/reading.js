// Чтение вслух: ученик читает текст, браузер распознаёт речь,
// сравниваем со словами эталона и показываем, что переврал.
//
// Claude аудио не принимает, поэтому разбор делаем сами — зато
// это работает без ключа API и бесплатно.

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

function readingSupported() { return !!SR; }

/** Слова в сравнимый вид: без пунктуации и регистра. */
function normWords(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Выравнивание двух последовательностей слов (Левенштейн с восстановлением пути).
 *  Возвращает список шагов: ok | wrong | missed | extra. */
function alignWords(target, said) {
  const n = target.length, m = said.length;
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = target[i - 1] === said[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  const steps = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (target[i - 1] === said[j - 1] ? 0 : 1)) {
      steps.push(target[i - 1] === said[j - 1]
        ? { type: "ok", word: target[i - 1] }
        : { type: "wrong", word: target[i - 1], said: said[j - 1] });
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      steps.push({ type: "missed", word: target[i - 1] }); i--;
    } else {
      steps.push({ type: "extra", said: said[j - 1] }); j--;
    }
  }
  return steps.reverse();
}

function readingVerdict(targetText, saidText) {
  const target = normWords(targetText);
  const said = normWords(saidText);
  const steps = alignWords(target, said);
  const good = steps.filter(s => s.type === "ok").length;
  const score = target.length ? Math.round(good / target.length * 100) : 0;
  const problems = steps.filter(s => s.type === "wrong" || s.type === "missed");
  return { score, steps, problems, total: target.length, good };
}

function readingComment(v) {
  if (!v.total) return "Не с чем сравнивать — репетитор не задал текст.";
  if (v.score >= 95) return "Отлично прочитано! Почти без единой запинки, мур-р-р 🎉";
  if (v.score >= 80) return "Хорошо! Пара слов сбилась — повтори их и будет чисто.";
  if (v.score >= 60) return "Неплохо, но есть над чем поработать. Прочитай ещё раз, помедленнее.";
  return "Пока трудно. Попробуй читать медленнее и вслух по одному предложению.";
}

// Имя своё, не общее: voice.js объявляет свой распознаватель под именем
// recog, и на общем имени reading.js падал целиком с «already declared» —
// проверка чтения не работала вообще, хотя код был на месте
let readRecog = null, readListening = false;

function startReading(targetText, onDone, onPartial) {
  if (!SR) { onDone(null, "Браузер не умеет распознавать речь. Попробуй Chrome или Safari."); return; }
  if (readListening) return;
  readRecog = new SR();
  readRecog.lang = "en-US";
  readRecog.continuous = true;
  readRecog.interimResults = true;
  let finalText = "";

  readRecog.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += " " + t; else interim += t;
    }
    if (onPartial) onPartial((finalText + " " + interim).trim());
  };
  readRecog.onerror = ev => {
    readListening = false;
    const why = ev.error === "not-allowed"
      ? "Нет доступа к микрофону — разреши его в настройках браузера."
      : "Не расслышал. Попробуй ещё раз.";
    onDone(null, why);
  };
  readRecog.onend = () => {
    readListening = false;
    if (!finalText.trim()) { onDone(null, "Ничего не услышал. Говори погромче."); return; }
    onDone(readingVerdict(targetText, finalText.trim()), null);
  };

  readListening = true;
  try { readRecog.start(); } catch (e) { readListening = false; onDone(null, "Не удалось включить микрофон."); }
}

function stopReading() {
  if (readRecog && readListening) { try { readRecog.stop(); } catch (e) { /* уже остановлен */ } }
}

/** Разметка текста: что прочитано верно, что переврано. */
function readingMarkup(v) {
  return v.steps.map(s => {
    if (s.type === "ok") return `<span class="rd-ok">${esc(s.word)}</span>`;
    if (s.type === "wrong") return `<span class="rd-wrong" title="услышал: ${esc(s.said)}">${esc(s.word)}</span>`;
    if (s.type === "missed") return `<span class="rd-missed" title="пропущено">${esc(s.word)}</span>`;
    return "";
  }).join(" ");
}
