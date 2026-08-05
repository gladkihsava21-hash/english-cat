// ===== Голосовой чат с Савелием =====
// Распознавание: Web Speech API (SpeechRecognition, бесплатно, работает в Chrome/Edge/Safari).
// Озвучка: speechSynthesis, двуязычно — русский голос + английский для слов.

const SR_CLS = window.SpeechRecognition || window.webkitSpeechRecognition;
const STT_OK = !!SR_CLS;

let RU_VOICE = null;
function pickRuVoice() {
  const vs = speechSynthesis.getVoices();
  RU_VOICE =
    vs.find(v => v.lang && v.lang.startsWith("ru") && /Milena|Google/i.test(v.name)) ||
    vs.find(v => v.lang && v.lang.startsWith("ru")) || null;
}
if (TTS_OK) {
  pickRuVoice();
  speechSynthesis.onvoiceschanged = () => { pickVoice(); pickRuVoice(); };
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
  const utters = segs.map(s => {
    const en = /^[A-Za-z]/.test(s.trim());
    const u = new SpeechSynthesisUtterance(s);
    u.lang = en ? "en-US" : "ru-RU";
    const v = en ? TTS_VOICE : RU_VOICE;
    if (v) u.voice = v;
    u.rate = en ? 0.95 : 1.04;
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
