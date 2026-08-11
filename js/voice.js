// ===== Голосовой чат с Савелием =====
// Распознавание: Web Speech API (SpeechRecognition, бесплатно, работает в Chrome/Edge/Safari).
// Озвучка: speechSynthesis, двуязычно — русский голос + английский для слов.

const SR_CLS = window.SpeechRecognition || window.webkitSpeechRecognition;
const STT_OK = !!SR_CLS;

let RU_VOICE = null;

// настройки голоса (на устройство, не в аккаунт)
let VOICE_PREFS = {};
try { VOICE_PREFS = JSON.parse(localStorage.getItem("savelyVoicePrefs") || "{}"); } catch (e) {}
function saveVoicePrefs() {
  localStorage.setItem("savelyVoicePrefs", JSON.stringify(VOICE_PREFS));
}

// шуточные голоса макоси — не для репетитора
const JUNK_VOICES = /Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Organ|Trinoids|Whisper|Wobble|Zarvox|Jester|Albert|Fred|Junior|Ralph|Superstar|Good News|Kathy|Grandma|Grandpa|Rocko|Eddy|Flo|Reed|Sandy|Shelley/i;

function voiceScore(v, langPrefix) {
  let s = 0;
  if (/Google/i.test(v.name)) s += 5;          // сетевые голоса Google — лучшие
  if (!v.localService) s += 2;
  if (/Enhanced|Premium|Natural/i.test(v.name)) s += 3;
  if (langPrefix === "en") {
    if (/Samantha/i.test(v.name)) s += 2;
    if (v.lang === "en-US") s += 1;
  }
  if (JUNK_VOICES.test(v.name)) s -= 20;
  return s;
}

function voicesFor(langPrefix) {
  return speechSynthesis.getVoices()
    .filter(v => v.lang && v.lang.toLowerCase().startsWith(langPrefix))
    .sort((a, b) => voiceScore(b, langPrefix) - voiceScore(a, langPrefix));
}

function bestVoice(langPrefix) {
  const vs = voicesFor(langPrefix);
  if (!vs.length) return null;
  const wanted = VOICE_PREFS[langPrefix];
  return (wanted && vs.find(v => v.name === wanted)) || vs[0];
}

function refreshVoices() {
  const en = bestVoice("en");
  if (en) TTS_VOICE = en;
  RU_VOICE = bestVoice("ru");
  fillVoiceSelects();
}

/** Догружаем список голосов.
 *
 *  На телефонах getVoices() при первом вызове часто пуст, а событие
 *  voiceschanged срабатывает не везде: Android Chrome и iOS Safari
 *  наполняют список молча, через сотни миллисекунд. Из-за этого ученик
 *  видел один-два голоса там, где их десяток. Перепроверяем, пока
 *  список растёт, но не дольше десяти секунд. */
function watchVoices() {
  if (!TTS_OK) return;
  let seen = speechSynthesis.getVoices().length;
  let tries = 0;
  const timer = setInterval(() => {
    const now = speechSynthesis.getVoices().length;
    if (now !== seen) { seen = now; refreshVoices(); }
    if (++tries >= 20) clearInterval(timer);
  }, 500);
}

if (TTS_OK) {
  refreshVoices();
  speechSynthesis.onvoiceschanged = refreshVoices;
  watchVoices();
  // Часть браузеров отдаёт голоса только после действия пользователя
  window.addEventListener("click", () => refreshVoices(), { once: true });
}

let voiceMode = false;
let sttLang = "ru-RU";
let listening = false;
let recog = null;

// озвучить реплику кота: русские сегменты — русским голосом, английские — английским
function speakSavely(text, onDone) {
  if (!TTS_OK) { if (onDone) onDone(); return; }
  const clean = String(text)
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/gu, "")
    .replace(/[«»"*_#]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (!clean) { if (onDone) onDone(); return; }
  const segs = clean
    .split(/([A-Za-z][A-Za-z'’\- ]*[A-Za-z'’]|[A-Za-z])/g)
    .filter(s => s && s.trim());
  const mode = VOICE_PREFS.mode || "full";
  const rateK = VOICE_PREFS.rate || 1;
  const utters = segs
    .filter(s => mode !== "en-only" || /^[A-Za-z]/.test(s.trim()))
    .map(s => {
      const en = /^[A-Za-z]/.test(s.trim());
      const u = new SpeechSynthesisUtterance(s);
      u.lang = en ? "en-US" : "ru-RU";
      const v = en ? TTS_VOICE : RU_VOICE;
      if (v) u.voice = v;
      u.rate = (en ? 0.95 : 1.04) * rateK;
      return u;
    });
  if (!utters.length) { if (onDone) onDone(); return; }
  const last = utters[utters.length - 1];
  if (onDone) { last.onend = onDone; last.onerror = onDone; }
  utters.forEach(u => speechSynthesis.speak(u));
}

function updateMicUI() {
  const mic = document.getElementById("mic-btn");
  if (mic) {
    mic.classList.toggle("listening", listening);
    mic.title = listening ? "Слушаю… (нажми, чтобы остановить)" : "Сказать голосом";
  }
}

function updateVoiceUI() {
  const btn = document.getElementById("voice-mode-btn");
  if (btn) {
    btn.classList.toggle("voice-active", voiceMode);
    btn.textContent = voiceMode ? "🎙️ Голос: вкл" : "🎙️ Голосовой чат";
  }
}

function startListening() {
  if (!STT_OK || listening) return;
  if (TTS_OK) speechSynthesis.cancel();
  recog = new SR_CLS();
  recog.lang = sttLang;
  recog.interimResults = true;
  recog.maxAlternatives = 1;
  listening = true;
  updateMicUI();
  const input = document.getElementById("chat-input");
  let finalText = "";
  recog.onresult = e => {
    let interim = "";
    for (const res of e.results) {
      if (res.isFinal) finalText += res[0].transcript;
      else interim += res[0].transcript;
    }
    input.value = (finalText + " " + interim).trim();
  };
  recog.onerror = e => {
    listening = false;
    updateMicUI();
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      deactivateVoice();
      catSay("Мяу, мне не дали микрофон! Разреши доступ к микрофону в браузере — и поговорим голосом.");
    }
  };
  recog.onend = () => {
    listening = false;
    updateMicUI();
    const text = input.value.trim();
    input.value = "";
    if (text) {
      sendToSavely(text);
    } else if (voiceMode) {
      maybeRestartMic(); // тишина — продолжаем слушать
    }
  };
  try { recog.start(); } catch (err) { listening = false; updateMicUI(); }
}

function stopListening() {
  if (recog && listening) { try { recog.stop(); } catch (e) {} }
  listening = false;
  updateMicUI();
}

function tryStartMicLoop() {
  const chatVisible = !document.getElementById("screen-chat").classList.contains("hidden");
  const speaking = TTS_OK && (speechSynthesis.speaking || speechSynthesis.pending);
  if (voiceMode && chatVisible && !listening && !chatBusy && !speaking) startListening();
}

function maybeRestartMic() {
  setTimeout(tryStartMicLoop, 500);
}

// сторож: onend озвучки не всегда приходит (например, после cancel) —
// пока голосовой режим включён, сами поднимаем прослушивание
let voiceWatchdog = null;

function deactivateVoice() {
  voiceMode = false;
  if (voiceWatchdog) { clearInterval(voiceWatchdog); voiceWatchdog = null; }
  stopListening();
  if (TTS_OK) speechSynthesis.cancel();
  updateVoiceUI();
}

// реплики кота: кнопка повтора + автоозвучка в голосовом режиме
window.onCatMessage = (text, el) => {
  if (TTS_OK) {
    const b = document.createElement("button");
    b.className = "msg-say";
    b.title = "Озвучить";
    b.textContent = "🔊";
    b.addEventListener("click", () => speakSavely(text));
    el.appendChild(b);
  }
  if (voiceMode) speakSavely(text, maybeRestartMic);
};

// ===== Настройки голоса =====
function fillVoiceSelects() {
  const selRu = document.getElementById("vs-ru");
  const selEn = document.getElementById("vs-en");
  if (!selRu || !selEn) return;
  const fill = (sel, langPrefix, current) => {
    const vs = voicesFor(langPrefix);
    sel.innerHTML = vs.length
      ? vs.map(v => `<option value="${v.name}"${current && v.name === current.name ? " selected" : ""}>${v.name} (${v.lang})</option>`).join("")
      : `<option value="">— голосов нет —</option>`;
    sel.disabled = !vs.length;
    return vs.length;
  };
  const nRu = fill(selRu, "ru", RU_VOICE);
  const nEn = fill(selEn, "en", TTS_VOICE);

  // Голоса берутся из системы, а не из сайта. Если их мало — это
  // не поломка, но ученик должен понимать, что делать
  const hint = document.getElementById("vs-hint");
  if (hint) {
    const few = nEn < 2 || nRu < 2;
    hint.classList.toggle("hidden", !few);
    if (few) {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      hint.innerHTML = ios
        ? "Голосов мало — их даёт сама система. Добавить: <b>Настройки → Универсальный доступ → Устный контент → Голоса</b>, там скачать английские."
        : "Голосов мало — их даёт сама система. На Android: <b>Настройки → Язык и ввод → Синтез речи</b>, скачать английский голосовой пакет.";
    }
  }
}

(function initVoiceSettings() {
  const btn = document.getElementById("voice-settings-btn");
  const panel = document.getElementById("voice-settings");
  if (!btn || !panel) return;
  if (!TTS_OK) { btn.classList.add("hidden"); return; }
  btn.addEventListener("click", () => {
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) fillVoiceSelects();
  });
  document.getElementById("vs-ru").addEventListener("change", e => {
    VOICE_PREFS.ru = e.target.value; saveVoicePrefs(); refreshVoices();
  });
  document.getElementById("vs-en").addEventListener("change", e => {
    VOICE_PREFS.en = e.target.value; saveVoicePrefs(); refreshVoices();
  });
  const modeSel = document.getElementById("vs-mode");
  modeSel.value = VOICE_PREFS.mode || "full";
  modeSel.addEventListener("change", e => {
    VOICE_PREFS.mode = e.target.value; saveVoicePrefs();
  });
  const rate = document.getElementById("vs-rate");
  rate.value = VOICE_PREFS.rate || 1;
  rate.addEventListener("input", e => {
    VOICE_PREFS.rate = parseFloat(e.target.value); saveVoicePrefs();
  });
  document.getElementById("vs-test-ru").addEventListener("click", () => {
    speakSavely("Мяу! Привет, я Савелий, твой кот-репетитор.");
  });
  document.getElementById("vs-test-en").addEventListener("click", () => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Hello! Let's learn the word serendipity.");
    u.lang = "en-US";
    if (TTS_VOICE) u.voice = TTS_VOICE;
    u.rate = 0.95 * (VOICE_PREFS.rate || 1);
    speechSynthesis.speak(u);
  });
})();

// кнопки
(function initVoiceUI() {
  const micBtn = document.getElementById("mic-btn");
  const modeBtn = document.getElementById("voice-mode-btn");
  const langBtn = document.getElementById("stt-lang-btn");
  if (!STT_OK) {
    if (micBtn) micBtn.classList.add("hidden");
    if (modeBtn) modeBtn.classList.add("hidden");
    if (langBtn) langBtn.classList.add("hidden");
    return;
  }
  micBtn.addEventListener("click", () => {
    if (listening) stopListening();
    else startListening();
  });
  modeBtn.addEventListener("click", () => {
    if (voiceMode) { deactivateVoice(); return; }
    voiceMode = true;
    updateVoiceUI();
    voiceWatchdog = setInterval(tryStartMicLoop, 900);
    catSay("Голосовой режим включён, мяу! Говори — я слушаю. Кнопка RU/EN переключает язык распознавания.");
  });
  langBtn.addEventListener("click", () => {
    sttLang = sttLang === "ru-RU" ? "en-US" : "ru-RU";
    langBtn.textContent = sttLang === "ru-RU" ? "RU" : "EN";
    if (listening) { stopListening(); setTimeout(startListening, 250); }
  });
})();
