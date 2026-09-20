// Звонок на доске: ступень качества связи и верхняя полоска статуса
// (значки микрофона, камеры, показа экрана, связь).
//
// Настоящий getStats без живого WebRTC не проверить, поэтому разбор
// отчёта в js/call.js — чистая функция summarizeCallStats, и сюда
// отчёты подсовываем руками ровно в том виде, как их отдаёт браузер.
// Вторая часть — поведение полоски в DOM: вкл/выкл микрофона, роль
// ученика, конец звонка.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..", "..");

let fails = 0;
const ok = (c, what) => { console.log((c ? "  ✓ " : "  ✗ ") + what); if (!c) fails++; };

const html = fs.readFileSync(path.join(ROOT, "board.html"), "utf8")
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
const dom = new JSDOM(html, {
  runScripts: "dangerously", pretendToBeVisual: true,
  url: "http://localhost:4210/board.html?id=5",
});
const w = dom.window;
const doc = w.document;
// То, что вживую даёт board.js, здесь подставляем руками: проверяется
// call.js, а не доска (её стенд — test-board-boot.js).
w.$ = id => doc.getElementById(id);
w.toast = () => {};
w.BD = { role: "tutor", boardId: 0, token: "" };
const load = f => {
  const s = doc.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  doc.head.appendChild(s);
};
["js/icons.js", "js/call.js"].forEach(load);
w.paintIcons();   // DOMContentLoaded у подложенных скриптов уже прошёл
// В jsdom navigator.mediaDevices нет: значок показа экрана честно прячется
// как «браузер не умеет». Здесь умеет — проверяем именно состояние значка.
Object.defineProperty(w.navigator, "mediaDevices",
  { value: { getDisplayMedia: () => Promise.reject(new Error("стенд")) } });

console.log("\n1. Ступень качества: callLinkTier по RTT и потерям");
{
  const t = (rtt, loss) => w.eval(`callLinkTier(${rtt}, ${loss})`);
  ok(t(80, 0.5) === "good", "80 мс и 0,5% потерь — хорошо");
  ok(t(150, 2) === "good", "ровно на порогах — ещё хорошо");
  ok(t(200, 0) === "ok", "200 мс без потерь — средне (темп разговора уже ломается)");
  ok(t(60, 5) === "ok", "5% потерь без задержки — средне");
  ok(t(400, 0) === "bad", "400 мс — плохо, даже без потерь");
  ok(t(60, 12) === "bad", "12% потерь — плохо, даже с быстрым откликом");
  ok(t(null, null) === "unknown", "нет данных — неизвестно, а не «хорошо»");
  ok(t(80, null) === "good", "потерь нет в отчёте — решает задержка");
}

console.log("\n2. Разбор отчёта getStats: summarizeCallStats");
{
  const pair = (rtt, nominated) => ({
    type: "candidate-pair", state: "succeeded",
    currentRoundTripTime: rtt, nominated: !!nominated,
  });
  const inbound = (kind, lost, recv) => ({
    type: "inbound-rtp", kind, packetsLost: lost, packetsReceived: recv,
  });
  // типичный отчёт: две пары succeeded, выбранная — nominated
  const r1 = w.eval(`summarizeCallStats(${JSON.stringify([
    pair(0.012, false), pair(0.048, true),
    inbound("audio", 2, 400), inbound("video", 1, 900),
    { type: "local-candidate" },
  ])}, null)`);
  ok(r1.rttMs === 48, "RTT берётся по выбранной (nominated) паре, а не по первой: " + r1.rttMs);
  ok(r1.lossPct === 0.2, "первый замер — по накопленным счётчикам: 3/1300 ≈ 0,2%: " + r1.lossPct);
  ok(r1.tier === "good", "итоговая ступень: " + r1.tier);

  // второй замер: потери считаются дельтой, иначе часовой звонок сгладил бы обрыв
  const r2 = w.eval(`summarizeCallStats(${JSON.stringify([
    pair(0.048, true),
    inbound("audio", 42, 410), inbound("video", 1, 900),
  ])}, ${JSON.stringify(r1.sample)})`);
  ok(r2.lossPct === 80, "свежий обрыв виден сразу: дельта 40 из 50 = 80%: " + r2.lossPct);
  ok(r2.tier === "bad", "ступень упала в «плохо»: " + r2.tier);

  // Firefox не пишет nominated — берём любую succeeded пару
  const r3 = w.eval(`summarizeCallStats(${JSON.stringify([
    pair(0.19, false), inbound("audio", 0, 100),
  ])}, null)`);
  ok(r3.rttMs === 190 && r3.tier === "ok", "без nominated — по succeeded: 190 мс, средне");

  const r4 = w.eval(`summarizeCallStats([{ type: "transport" }], null)`);
  ok(r4.rttMs === null && r4.lossPct === null && r4.tier === "unknown",
     "пустой отчёт — честное «неизвестно»");
}

console.log("\n3. Полоска статуса: состояния значков");
{
  const strip = doc.getElementById("call-strip");
  const micBtn = doc.getElementById("call-mic");
  const camBtn = doc.getElementById("call-cam");
  w.eval(`
    CALL.stream = {
      _a: [{ enabled: true }], _v: [{ enabled: true }],
      getAudioTracks() { return this._a; },
      getVideoTracks() { return this._v; },
      getTracks() { return this._a.concat(this._v); },
    };
    CALL.stream._a[0].stop = CALL.stream._v[0].stop = function () {};
  `);
  ok(strip.hidden, "до звонка полоски нет");
  w.eval(`CALL.state = "calling"; showCallPanel();`);
  ok(!strip.hidden, "в дозвоне полоска видна");
  ok(doc.body.classList.contains("call-live"), "body получил call-live (шапка над видеоуроком)");
  ok(!doc.getElementById("cs-mic").classList.contains("off"), "микрофон включён — без черты");
  ok(!doc.getElementById("cs-cam").classList.contains("off"), "камера включена — без черты");
  ok(!!doc.getElementById("cs-mic").querySelector("svg"), "значок микрофона нарисован");
  ok(!!doc.getElementById("cs-link-ico").querySelector("svg"), "значок связи нарисован");
  ok(doc.getElementById("cs-link").classList.contains("q-unknown"),
     "до первого замера связь «неизвестна», а не «хорошая»");

  // выключаем микрофон той же функцией, что жмёт кнопка углового окна
  // (callBoot здесь не поднимался: в jsdom нет RTCPeerConnection, и
  // обработчики кнопок — его работа). Полоска обязана увидеть то же
  // состояние без своей копии логики.
  w.eval(`toggleTrack("audio", document.getElementById("call-mic"))`);
  ok(micBtn.classList.contains("off"), "кнопка микрофона помечена выключенной");
  ok(doc.getElementById("cs-mic").classList.contains("off"),
     "полоска повторила выключение микрофона");
  ok(doc.getElementById("cs-mic").title === "Микрофон выключен",
     "подсказка говорит словами: " + doc.getElementById("cs-mic").title);

  w.eval(`toggleTrack("video", document.getElementById("call-cam"))`);
  ok(doc.getElementById("cs-cam").classList.contains("off"), "полоска повторила выключение камеры");

  // показ экрана: только репетитор, и состояние — по факту SCREEN.track
  const scr = doc.getElementById("cs-screen");
  ok(!scr.hidden && scr.classList.contains("off"), "у репетитора значок экрана виден и выключен");
  w.eval(`SCREEN.track = { stop() {}, onended: null }; refreshCallStrip();`);
  ok(!scr.classList.contains("off"), "показ экрана идёт — значок без черты");

  // качество: ступень, слово и цифры в подсказке
  w.eval(`CALL.link = { rttMs: 48, lossPct: 0.4, tier: "good" }; refreshCallStrip();`);
  const link = doc.getElementById("cs-link");
  ok(link.classList.contains("q-good"), "ступень хорошая");
  ok(doc.getElementById("cs-link-word").textContent === "хорошая", "слово рядом со значком");
  ok(/48 мс/.test(link.title) && /0,4%/.test(link.title),
     "подсказка с цифрами: " + link.title);
  w.eval(`CALL.link = { rttMs: 520, lossPct: 12, tier: "bad" }; refreshCallStrip();`);
  ok(link.classList.contains("q-bad") && doc.getElementById("cs-link-word").textContent === "плохая",
     "ступень плохая — и классом, и словом");

  // ученик: значка показа экрана нет вовсе (включить ему всё равно нельзя)
  w.eval(`BD.role = "student"; refreshCallStrip();`);
  ok(scr.hidden, "у ученика значок экрана спрятан");
  w.eval(`BD.role = "tutor"; refreshCallStrip();`);

  // конец звонка: полоска уходит, замеры остановлены
  w.eval(`endCall(false);`);
  ok(strip.hidden, "после отбоя полоска скрыта");
  ok(!doc.body.classList.contains("call-live"), "класс call-live снят");
  ok(w.eval(`CALL.linkTimer`) === 0 && w.eval(`CALL.link`) === null,
     "замеры getStats остановлены вместе со звонком");
  ok(!doc.getElementById("screen-bar").hidden === false, "панель демонстрации спрятана");
}

console.log("\n" + (fails ? "ПРОВАЛЕНО проверок: " + fails : "качество связи и полоска статуса в порядке"));
process.exit(fails ? 1 : 0);
