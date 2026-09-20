/* Видеозвонок на доске.
 *
 * Как это работает и почему хостингу всё равно. Видео и голос идут
 * НАПРЯМУЮ между двумя браузерами (WebRTC): наш сервер их не видит
 * и не пересылает. Серверу достаётся только «сватовство» — обмен
 * короткими сообщениями, чтобы браузеры нашли друг друга. Эти
 * сообщения ездят тем же способом, что и рисунки доски: опросом раз
 * в секунду-две (веб-сокетов на хостинге нет, и здесь они не нужны —
 * пара лишних секунд на дозвон урока не портит).
 *
 * STUN-серверы в списке — публичные и бесплатные: они лишь говорят
 * браузеру его внешний адрес. Если оба участника за «жёсткими» NAT
 * (чаще всего мобильный интернет с обеих сторон), прямое соединение
 * может не собраться — тогда честно говорим об этом, а не молчим
 * с чёрным экраном. Лекарство на потом — свой TURN-сервер.
 *
 * Роли не равные, и это намеренно: звонок живёт на доске, доска — на
 * уроке. Позвонить может любая сторона, но при встречных звонках
 * побеждает репетитор (см. onOffer): двух вежливых «после вас» между
 * автоматами быть не должно.
 */

const CALL = {
  pc: null,             // RTCPeerConnection
  stream: null,         // свои дорожки (камера+микрофон)
  state: "idle",        // idle | calling | ringing | live
  since: 0,             // номер последнего увиденного сообщения
  primed: false,        // первый опрос прошёл (старьё отфильтровано)
  pendingIce: [],       // кандидаты, пришедшие раньше ответа на оффер
  offer: null,          // входящий оффер, пока человек решает
  timer: 0,             // таймер дозвона
  isCaller: false,      // кто строил соединение — тот его и чинит
  repairs: 0,           // сколько раз подряд чинили, не дождавшись связи
  fixTimer: 0,
  link: null,           // последний замер качества: { rttMs, lossPct, tier }
  linkPrev: null,       // счётчики пакетов прошлого замера (дельта потерь)
  linkTimer: 0,         // setInterval замеров getStats
};

const ICE_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },
];
const RING_MAX_AGE = 45;      // оффер старше — эхо, а не звонок
const DIAL_TIMEOUT = 45000;   // столько зовём, потом «не отвечает»

function callPeerName() {
  return BD.role === "tutor" ? "ученик" : "репетитор";
}

async function callSend(kind, data) {
  try {
    await api("/api/call/send", { token: BD.token, boardId: BD.boardId, kind, data });
  } catch (e) { /* сеть мигнула — следующее сообщение доедет */ }
}

/* ---------- опрос ----------
   Пока доска открыта, спрашиваем сервер, нет ли сообщений от второй
   стороны. В покое раз в две секунды (успеть увидеть входящий звонок),
   во время дозвона — чаще: там каждое сообщение двигает соединение. */
async function callPollOnce() {
  if (!BD.boardId || !BD.token) return;
  let res;
  try {
    res = await api("/api/call/poll", { token: BD.token, boardId: BD.boardId, since: CALL.since });
  } catch (e) { return; }
  if (!res.ok) return;
  for (const m of res.msgs || []) {
    CALL.since = Math.max(CALL.since, m.id);
    // Первый опрос только запоминает, где мы: в таблице могло остаться
    // эхо прошлого урока, и «звонить» по нему нельзя. Свежий оффер
    // (моложе RING_MAX_AGE) пропускаем и в первый раз — это значит, что
    // нас уже зовут, а страница только открылась.
    if (!CALL.primed && !(m.kind === "offer" && m.age < RING_MAX_AGE)) continue;
    handleCallMsg(m);
  }
  CALL.primed = true;
}

let callPollTimer = 0;
function callPollLoop() {
  clearTimeout(callPollTimer);
  const busy = CALL.state === "calling" || CALL.state === "ringing"
    || (CALL.pc && CALL.pc.connectionState !== "connected");
  callPollOnce().finally(() => {
    callPollTimer = setTimeout(callPollLoop, CALL.state === "idle" ? 2000 : busy ? 800 : 2000);
  });
}

function handleCallMsg(m) {
  if (m.kind === "offer") return onOffer(m);
  if (m.kind === "answer") return onAnswer(m);
  if (m.kind === "ice") return onIce(m);
  if (m.kind === "bye") return onBye();
  // Вторая сторона просит перезапустить соединение (у неё сменилась
  // сеть). Чинит всегда позвонивший — у двух одновременных починок
  // офферы сталкиваются лбами.
  if (m.kind === "needfix" && CALL.state === "live" && CALL.isCaller) return tryRepair();
  if (m.kind === "screen") {
    CALL.remoteScreen = !!(m.data && m.data.on);
    layoutRemote();
    setCallState(CALL.remoteScreen ? "вам показывают экран" : "соединено");
    return;
  }
}

/* ---------- медиа ----------
   Камера есть не у всех и не всегда разрешена. Пробуем по убывающей:
   видео+звук → только звук → совсем без своих дорожек (видеть и слышать
   урок можно и так). Каждый раз честно говорим, что получилось. */
async function getCallMedia() {
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
      audio,
    });
  } catch (e) { /* камеры нет или не разрешили */ }
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio });
    toast("Камера недоступна — идёт только голос.");
    return s;
  } catch (e) { /* и микрофона нет */ }
  toast("Камера и микрофон недоступны — ты видишь и слышишь, тебя нет.", 4000);
  return null;
}

function buildPeer() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.onicecandidate = e => {
    if (e.candidate) callSend("ice", e.candidate.toJSON());
  };
  pc.ontrack = e => {
    // Дорожки копим сами: при демонстрации экрана их ДВЕ видео (лицо
    // и экран), и раскладку решает сигнал "screen", а не порядок прихода.
    if (!CALL.remoteTracks) CALL.remoteTracks = [];
    if (!CALL.remoteTracks.includes(e.track)) CALL.remoteTracks.push(e.track);
    e.track.onended = () => {
      CALL.remoteTracks = (CALL.remoteTracks || []).filter(t => t !== e.track);
      layoutRemote();
    };
    layoutRemote();
  };
  pc.onconnectionstatechange = () => {
    if (!CALL.pc) return;
    const st = pc.connectionState;
    if (st === "connected") {
      setCallState("соединено");
      CALL.repairs = 0;
      clearTimeout(CALL.fixTimer);
    }
    if (st === "disconnected") {
      // Обрыв на живом уроке — чаще всего смена сети у ученика (ушёл
      // с Wi-Fi, телефон переполз на LTE). Не хороним звонок, а чиним:
      // пересобираем маршруты (перезапуск ICE) и соединяемся заново.
      setCallState("связь прерывается — чиню…");
      clearTimeout(CALL.fixTimer);
      CALL.fixTimer = setTimeout(tryRepair, 3000);
    }
    if (st === "failed") {
      if (CALL.state === "live" && CALL.repairs < 3) { tryRepair(); return; }
      // Трижды не собралось — это уже не мигнувшая сеть, а жёсткие NAT
      // с обеих сторон. Говорим словами, а не тишиной.
      toast("Не удалось соединиться напрямую. Попробуйте ещё раз; "
        + "если не выходит — смените сеть (Wi-Fi вместо мобильного).", 6000);
      endCall(false);
    }
  };
  if (CALL.stream) {
    CALL.stream.getTracks().forEach(t => pc.addTrack(t, CALL.stream));
  } else {
    // Своих дорожек нет — просим встречные явно, иначе в оффере
    // не будет медиа вообще и соединение окажется пустым.
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
  }
  return pc;
}

/* ---------- починка соединения ---------- */
async function tryRepair() {
  if (!CALL.pc || CALL.state !== "live") return;
  CALL.repairs++;
  setCallState("восстанавливаю связь…");
  if (!CALL.isCaller) {
    // Не мы строили — просим строителя пересобрать
    callSend("needfix", {});
    return;
  }
  try {
    const offer = await CALL.pc.createOffer({ iceRestart: true });
    await CALL.pc.setLocalDescription(offer);
    await callSend("offer", { sdp: offer.sdp, type: offer.type });
  } catch (e) { /* соединение уже закрыто */ }
}

/* ---------- исходящий ---------- */
async function startCall() {
  if (CALL.state !== "idle") return;
  CALL.state = "calling";
  CALL.isCaller = true;
  CALL.stream = await getCallMedia();
  showCallPanel();
  refreshDial();
  setCallState("зовём…");
  CALL.pc = buildPeer();
  const offer = await CALL.pc.createOffer();
  await CALL.pc.setLocalDescription(offer);
  await callSend("offer", { sdp: offer.sdp, type: offer.type });
  callPollLoop();
  clearTimeout(CALL.timer);
  CALL.timer = setTimeout(() => {
    if (CALL.state === "calling") {
      toast(`${callPeerName()[0].toUpperCase() + callPeerName().slice(1)} не отвечает. `
        + "Звонок виден, только пока доска открыта у обоих.", 5000);
      endCall(true);
    }
  }, DIAL_TIMEOUT);
}

/* ---------- входящий ---------- */
async function renegotiate(offer) {
  // Пересборка на живом звонке: строитель прислал новый оффер после
  // перезапуска ICE (см. tryRepair) — отвечаем, не трогая панель.
  try {
    await CALL.pc.setRemoteDescription(offer);
    const answer = await CALL.pc.createAnswer();
    await CALL.pc.setLocalDescription(answer);
    await callSend("answer", { sdp: answer.sdp, type: answer.type });
  } catch (e) { /* пересборка не удалась — statechange разберётся */ }
}

function onOffer(m) {
  if (CALL.state === "live") {
    // На живом звонке новый оффер шлют двое: строитель после починки ICE
    // и репетитор, включающий показ экрана. Ученик отвечает на оффер
    // всегда (правило «репетитор побеждает» уже действует при дозвоне),
    // репетитор — только если соединение строил не он.
    if (CALL.pc && (BD.role === "student" || !CALL.isCaller)) renegotiate(m.data);
    return;
  }
  if (CALL.state === "calling") {
    // Оба нажали «позвонить» одновременно. Репетитор своего оффера
    // держится, ученик уступает и отвечает на встречный — иначе оба
    // будут вечно ждать ответа друг от друга.
    if (BD.role === "tutor") return;
    teardownPeer();
    CALL.offer = m.data;
    return answerCall();
  }
  CALL.offer = m.data;
  CALL.pendingIce = [];
  CALL.state = "ringing";
  $("bd-ring-text").textContent =
    `Видеозвонок: ${callPeerName()} зовёт на урок`;
  $("bd-ring").hidden = false;
  callPollLoop();
}

async function answerCall() {
  $("bd-ring").hidden = true;
  if (!CALL.offer) { CALL.state = "idle"; return; }
  CALL.state = "calling";
  CALL.isCaller = false;
  if (!CALL.stream) CALL.stream = await getCallMedia();
  // Пока браузер спрашивал разрешение на камеру, звонок мог кончиться:
  // ребёнок ищет кнопку «разрешить», репетитор не дожидается и кладёт
  // трубку. endCall в этот момент останавливает CALL.stream, которого
  // ещё нет, — а он появляется здесь, секундой позже, и уже никем не
  // останавливается. У ученика оставалась гореть камера и висело
  // мёртвое соединение. Проверяем состояние ПОСЛЕ ожидания.
  if (CALL.state !== "calling") {
    if (CALL.stream) CALL.stream.getTracks().forEach(t => t.stop());
    CALL.stream = null;
    return;
  }
  showCallPanel();
  setCallState("соединяем…");
  CALL.pc = buildPeer();
  await CALL.pc.setRemoteDescription(CALL.offer);
  for (const c of CALL.pendingIce) {
    try { await CALL.pc.addIceCandidate(c); } catch (e) { /* кривой кандидат */ }
  }
  CALL.pendingIce = [];
  const answer = await CALL.pc.createAnswer();
  await CALL.pc.setLocalDescription(answer);
  await callSend("answer", { sdp: answer.sdp, type: answer.type });
  CALL.state = "live";
  CALL.offer = null;
  startLinkMeter();
  refreshCallStrip();
}

async function onAnswer(m) {
  if (!CALL.pc) return;
  if (CALL.state === "live") {
    // Ответ на пересборку соединения — например, когда включили показ
    // экрана и отправили новый оффер.
    //
    // Условие было `if (CALL.isCaller)`, и это неверно: пересобрать
    // соединение может ЛЮБАЯ из сторон, независимо от того, кто набирал
    // номер. Репетитор, которому позвонил ученик, включал показ экрана —
    // его оффер уходил, ученик отвечал, а ответ здесь выбрасывался.
    // Показ экрана просто не доходил, и починить это со стороны
    // репетитора было нельзя: надо было перезвонить самому.
    //
    // Правильная проверка — состояние самого соединения: have-local-offer
    // означает «я отправил оффер и жду ответ». Кто звонил изначально —
    // к делу отношения не имеет.
    if (CALL.pc.signalingState === "have-local-offer") {
      try { await CALL.pc.setRemoteDescription(m.data); } catch (e) { /* уже не ждём */ }
    }
    return;
  }
  if (CALL.state !== "calling") return;
  clearTimeout(CALL.timer);
  try {
    await CALL.pc.setRemoteDescription(m.data);
  } catch (e) { return; }
  for (const c of CALL.pendingIce) {
    try { await CALL.pc.addIceCandidate(c); } catch (err) { /* мимо */ }
  }
  CALL.pendingIce = [];
  CALL.state = "live";
  setCallState("соединяем…");
  startLinkMeter();
  refreshCallStrip();
}

async function onIce(m) {
  // Кандидаты обгоняют оффер и ответ — это нормально при полинге:
  // складываем в карман и применяем, когда соединение готово их съесть.
  if (CALL.pc && CALL.pc.remoteDescription) {
    try { await CALL.pc.addIceCandidate(m.data); } catch (e) { /* мимо */ }
  } else {
    CALL.pendingIce.push(m.data);
  }
}

function onBye() {
  if (CALL.state === "idle") return;
  toast("Звонок завершён.");
  endCall(false);
}

/* ---------- завершение ---------- */
function teardownPeer() {
  if (CALL.pc) { try { CALL.pc.close(); } catch (e) { /* уже мёртв */ } }
  CALL.pc = null;
  CALL.pendingIce = [];
}

function endCall(sendBye) {
  clearTimeout(CALL.timer);
  if (sendBye) callSend("bye", {});
  stopScreenShare(true);
  stopLinkMeter();
  teardownPeer();
  if (CALL.stream) CALL.stream.getTracks().forEach(t => t.stop());
  CALL.stream = null;
  CALL.offer = null;
  CALL.state = "idle";
  // В большом режиме после отбоя остаёмся на заставке с «Позвонить»:
  // человек пришёл на видеоурок, пустая доска ему сейчас не нужна.
  const big = $("bd-call").classList.contains("big");
  $("bd-call").hidden = !big;
  $("bd-ring").hidden = true;
  $("call-remote").srcObject = null;
  $("call-local").srcObject = null;
  const mini = $("call-remote-cam");
  if (mini) { mini.hidden = true; mini.srcObject = null; }
  $("screen-bar").hidden = true;
  CALL.remoteTracks = [];
  CALL.remoteScreen = false;
  setCallState(big ? "звонок завершён" : "");
  refreshDial();
  refreshCallStrip();
}

/* ---------- показ экрана ----------
   Репетитор вместо камеры отправляет экран: подменяем видеодорожку в
   ТОМ ЖЕ соединении (replaceTrack) — у ученика картинка меняется сама,
   без нового звонка. Сервер видео по-прежнему не видит: и камера, и
   экран идут напрямую между браузерами, ничего не записывается. */
const SCREEN = { track: null, sender: null };

function screenSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
}

async function videoSender() {
  const pc = CALL.pc;
  if (!pc) return null;
  let sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
  if (sender) return sender;
  // Камеры не было — соединение строилось «только приём». Разворачиваем
  // видеотрансивер на отправку; это меняет договор — нужен новый оффер.
  const tr = pc.getTransceivers().find(t =>
    (t.receiver.track && t.receiver.track.kind === "video"));
  if (!tr) return null;
  tr.direction = "sendrecv";
  await sendFreshOffer();
  return tr.sender;
}

async function sendFreshOffer() {
  try {
    const offer = await CALL.pc.createOffer();
    await CALL.pc.setLocalDescription(offer);
    await callSend("offer", { sdp: offer.sdp, type: offer.type });
  } catch (e) { /* соединение уже закрыто */ }
}

async function startScreenShare() {
  if (!CALL.pc || CALL.state !== "live") {
    toast("Сначала созвонитесь — экран показывается внутри звонка.");
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 12 } }, audio: false,
    });
  } catch (e) { return; }               // передумал в системном окне — не ошибка
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  // Экран уходит ОТДЕЛЬНЫМ вторым треком, камера продолжает идти своей
  // дорожкой — у второй стороны видны и страница, и лицо (как в Zoom).
  // Раньше replaceTrack подменял лицо экраном, и учитель «исчезал».
  try {
    SCREEN.sender = CALL.pc.addTrack(track, new MediaStream([track]));
    await sendFreshOffer();
  } catch (e) {
    track.stop();
    toast("Не получилось начать показ. Попробуйте перезвонить.");
    return;
  }
  SCREEN.track = track;
  await callSend("screen", { on: true });
  $("call-screen").classList.add("on");
  $("screen-bar").hidden = false;
  setCallState("вы показываете экран");
  refreshCallStrip();
  // «Прекратить показ» в плашке браузера должен работать как наша кнопка
  track.onended = () => stopScreenShare(false);
}

async function stopScreenShare(silent) {
  if (!SCREEN.track) return;
  const track = SCREEN.track;
  SCREEN.track = null;
  track.onended = null;
  try { track.stop(); } catch (e) { /* уже остановлен */ }
  $("call-screen").classList.remove("on");
  $("screen-bar").hidden = true;
  refreshCallStrip();
  if (!CALL.pc) return;
  try {
    if (SCREEN.sender) CALL.pc.removeTrack(SCREEN.sender);
    SCREEN.sender = null;
    await sendFreshOffer();
  } catch (e) { /* конец звонка */ }
  await callSend("screen", { on: false });
  if (!silent) setCallState("соединено");
}

function toggleScreenShare() {
  if (SCREEN.track) stopScreenShare(false);
  else startScreenShare();
}

/* ---------- качество связи ----------
   Полоска статуса (см. refreshCallStrip ниже) показывает три ступени:
   хорошо / средне / плохо. Браузерных событий «связь просела» нет —
   меряем сами: RTCPeerConnection.getStats() каждые LINK_POLL_MS.

   Пороги — из природы урока, а не абстрактной телефонии. Разговор
   выдерживает заметную задержку, но ломается её темп: до ~150 мс
   собеседники паузы не замечают (оценка ITU G.114), после ~350 мс
   начинают перебивать друг друга. Потери Opus прячет сам (встроенная
   коррекция ошибок) примерно до 2 %, к ~8 % речь слышно рассыпается.
   Ступень — ХУДШАЯ из двух метрик: нулевые потери не спасают урок,
   где каждый отвечает с секундной паузой. */
const LINK_POLL_MS = 2500;   // реже — обрыв человек заметит раньше значка

function callLinkTier(rttMs, lossPct) {
  if (rttMs == null && lossPct == null) return "unknown";
  const bad = (rttMs != null && rttMs > 350) || (lossPct != null && lossPct > 8);
  const mid = (rttMs != null && rttMs > 150) || (lossPct != null && lossPct > 2);
  return bad ? "bad" : mid ? "ok" : "good";
}

/* Сводка из отчёта getStats. Чистая функция: getStats без настоящего
   соединения не проверить, поэтому разбор отчёта отделён от браузера
   и покрыт тестом (tools/dom-tests/test-call-stats.js).

   Задержка — по выбранной паре кандидатов: nominated+succeeded, а если
   браузер nominated не проставляет (Firefox), то по любой succeeded.
   Потери — ПРИРОСТ lost/(lost+received) по входящим дорожкам между двумя
   замерами: счётчики накопительные с начала звонка, и свежий обрыв на
   их фоне был бы сглажен до неузнаваемости. */
function summarizeCallStats(entries, prev) {
  let rttAny = null, rttNom = null, lost = 0, recv = 0;
  for (const s of entries) {
    if (!s || !s.type) continue;
    if (s.type === "candidate-pair" && s.state === "succeeded"
        && typeof s.currentRoundTripTime === "number") {
      if (s.nominated) rttNom = s.currentRoundTripTime;
      else rttAny = s.currentRoundTripTime;
    }
    if (s.type === "inbound-rtp") {
      lost += s.packetsLost || 0;
      recv += s.packetsReceived || 0;
    }
  }
  const rttSec = rttNom != null ? rttNom : rttAny;
  const rttMs = rttSec == null ? null : Math.round(rttSec * 1000);
  let lossPct = null;
  // prev === null на первом замере: дельты нет, считаем по накопленному —
  // иначе первые LINK_POLL_MS значок молчал бы без причины.
  const base = prev || { lost: 0, recv: 0 };
  const dLost = lost - base.lost, dRecv = recv - base.recv;
  if (dLost + dRecv > 0) lossPct = (dLost / (dLost + dRecv)) * 100;
  lossPct = lossPct == null ? null : Math.round(lossPct * 10) / 10;
  return { rttMs, lossPct, tier: callLinkTier(rttMs, lossPct),
           sample: { lost, recv } };
}

async function measureCallLink() {
  if (!CALL.pc || CALL.state !== "live") return;
  let report;
  try { report = await CALL.pc.getStats(); } catch (e) { return; }
  // RTCStatsReport — Map-подобный; в массив, чтобы сводка оставалась
  // чистой функцией и проверялась без браузера.
  const link = summarizeCallStats([...report.values()], CALL.linkPrev);
  CALL.linkPrev = link.sample;
  CALL.link = link;
  refreshCallStrip();
}

function startLinkMeter() {
  stopLinkMeter();
  measureCallLink();
  CALL.linkTimer = setInterval(measureCallLink, LINK_POLL_MS);
}

function stopLinkMeter() {
  clearInterval(CALL.linkTimer);
  CALL.linkTimer = 0;
  CALL.link = null;
  CALL.linkPrev = null;
}

/* ---------- полоска статуса урока ----------
   Значки микрофона, камеры, показа экрана и качества связи — сверху по
   центру (board.html, #call-strip). Полоска только ПОКАЗЫВАТ: своей копии
   состояния у неё нет, обновляется из тех же мест, что двигают кнопки
   углового окна (toggleTrack, показ экрана, конец звонка). Нажатия на
   значки ничего не переключают — органы управления одни, в окне звонка.

   Текстовая строка #call-state остаётся, но за ней теперь только ФАЗЫ
   («зовём…», «соединяем…», «восстанавливаю связь…»): состояние устройств
   и качества носит полоска, и дублировать их текстом было бы двумя
   источниками правды об одном. */
function stripChip(id, opts) {
  const el = $(id);
  if (!el) return;
  if (opts.hidden) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle("off", !opts.on);
  el.title = opts.title;
  el.setAttribute("aria-label", opts.title);
}

function refreshCallStrip() {
  const strip = $("call-strip");
  if (!strip) return;
  const live = CALL.state !== "idle";
  strip.hidden = !live;
  // Класс на body поднимает шапку над полноэкранным видеоуроком
  // (css/board.css): иначе в большом режиме полоска была бы под видео.
  document.body.classList.toggle("call-live", live);
  if (!live) return;
  const mic = CALL.stream ? CALL.stream.getAudioTracks() : [];
  const cam = CALL.stream ? CALL.stream.getVideoTracks() : [];
  const peer = callPeerName();
  stripChip("cs-mic", {
    on: !!mic.length && mic[0].enabled,
    title: !mic.length ? "Микрофона нет — " + peer + " вас не слышит"
         : mic[0].enabled ? "Микрофон включён" : "Микрофон выключен",
  });
  stripChip("cs-cam", {
    on: !!cam.length && cam[0].enabled,
    title: !cam.length ? "Камеры нет — " + peer + " вас не видит"
         : cam[0].enabled ? "Камера включена" : "Камера выключена",
  });
  // Показ экрана умеет только репетитор (кнопки у ученика нет), поэтому
  // ученику значка нет вовсе: перечёркнутый значок, который нельзя
  // включить, читается как «сломано».
  stripChip("cs-screen", {
    hidden: BD.role !== "tutor" || !screenSupported(),
    on: !!SCREEN.track,
    title: SCREEN.track ? "Вы показываете экран" : "Экран не показывается",
  });
  const el = $("cs-link");
  if (el) {
    const tier = CALL.link ? CALL.link.tier : "unknown";
    const WORD = { good: "хорошая", ok: "средняя", bad: "плохая", unknown: "…" };
    el.classList.remove("q-good", "q-ok", "q-bad", "q-unknown");
    el.classList.add("q-" + tier);
    const word = $("cs-link-word");
    if (word) word.textContent = WORD[tier];
    let text;
    if (!CALL.link || (CALL.link.rttMs == null && CALL.link.lossPct == null)) {
      text = "Замеряю качество связи…";
    } else {
      const parts = [];
      if (CALL.link.rttMs != null) parts.push("задержка " + CALL.link.rttMs + " мс");
      if (CALL.link.lossPct != null)
        parts.push("потери " + String(CALL.link.lossPct).replace(".", ",") + "%");
      text = "Связь " + WORD[tier] + ": " + parts.join(", ");
    }
    el.title = text;
    el.setAttribute("aria-label", text);
  }
}



/* ---------- панель ---------- */
function setCallState(text) { $("call-state").textContent = text; }

function showCallPanel() {
  $("bd-call").hidden = false;
  refreshDial();
  const local = $("call-local");
  local.srcObject = CALL.stream;
  const hasCam = !!(CALL.stream && CALL.stream.getVideoTracks().length);
  const hasMic = !!(CALL.stream && CALL.stream.getAudioTracks().length);
  local.classList.toggle("novideo", !hasCam);
  $("call-cam").disabled = !hasCam;
  $("call-mic").disabled = !hasMic;
  $("call-cam").classList.remove("off");
  $("call-mic").classList.remove("off");
  refreshCallStrip();
}

function toggleTrack(kindName, btn) {
  if (!CALL.stream) return;
  const tracks = kindName === "video"
    ? CALL.stream.getVideoTracks() : CALL.stream.getAudioTracks();
  if (!tracks.length) return;
  const on = !tracks[0].enabled;
  tracks.forEach(t => { t.enabled = on; });
  btn.classList.toggle("off", !on);
  if (kindName === "video") $("call-local").classList.toggle("novideo", !on);
  refreshCallStrip();
}

/** Разложить удалённые дорожки по окнам.
 *
 *  Обычный звонок: всё видео+звук — в большое окно. Идёт показ экрана:
 *  ПОСЛЕДНЯЯ видеодорожка (экран добавляется вторым треком) — в большое
 *  окно, первая (лицо) — в мини-окно рядом с моим превью. Так у ученика
 *  видны и страница, и учитель — как в Zoom (просьба владельца: раньше
 *  replaceTrack просто подменял лицо экраном).  */
function layoutRemote() {
  const vids = (CALL.remoteTracks || []).filter(t => t.kind === "video" && t.readyState === "live");
  const auds = (CALL.remoteTracks || []).filter(t => t.kind === "audio");
  const big = $("call-remote"), mini = $("call-remote-cam");
  if (CALL.remoteScreen && vids.length >= 2) {
    big.srcObject = new MediaStream([vids[vids.length - 1], ...auds]);
    mini.srcObject = new MediaStream([vids[0]]);
    mini.hidden = false;
  } else {
    big.srcObject = new MediaStream([...(vids.length ? [vids[0]] : []), ...auds]);
    mini.hidden = true;
    mini.srcObject = null;
  }
}

/* ---------- видеоурок: большой режим ----------
   Заход по board.html#video (вкладка «Урок» у ученика, кнопка в панели
   репетитора) открывает те же видео на весь экран. Разворот и сворот —
   только CSS-класс: соединение не пересобирается, звонок не рвётся.
   «К доске» сворачивает лица в привычный угол. */
const LESSON_MODE = location.hash === "#video";

function setCallSize(big) {
  const box = $("bd-call");
  box.classList.toggle("big", big);
  if (big) {
    // Развёрнутый режим всегда по центру: сохранённая позиция угла
    // не должна утаскивать полноэкранное окно
    box.style.left = ""; box.style.top = "";
    box.style.right = ""; box.style.bottom = "";
  }
  const b = $("call-size");
  if (b) b.title = big ? "Свернуть к доске" : "Развернуть видеоурок";
  refreshDial();
}

/** Кнопка «Позвонить» видна только на заставке видеоурока: панель
 *  открыта, а звонка ещё нет. В углу она не нужна — там есть трубка. */
function refreshDial() {
  const d = $("call-dial");
  if (!d) return;
  d.hidden = !($("bd-call").classList.contains("big") && CALL.state === "idle");
}

/* ---------- перетаскивание панели ----------
   Окно звонка закрывало то место доски, где шёл разбор, — теперь его
   можно оттащить за видео в любой угол. Позицию помним между уроками. */
function makeCallDraggable() {
  const box = $("bd-call");
  let drag = null;
  const clamp = (l, t) => {
    const r = box.getBoundingClientRect();
    return {
      l: Math.max(4, Math.min(innerWidth - r.width - 4, l)),
      t: Math.max(4, Math.min(innerHeight - r.height - 4, t)),
    };
  };
  const place = (l, t) => {
    const p = clamp(l, t);
    box.style.left = p.l + "px";
    box.style.top = p.t + "px";
    box.style.right = "auto";
    box.style.bottom = "auto";
  };
  box.addEventListener("pointerdown", e => {
    if (e.target.closest("button")) return;   // кнопки — не ручка
    if (box.classList.contains("big")) return; // весь экран не таскают
    const r = box.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { box.setPointerCapture(e.pointerId); } catch (err) { /* не беда */ }
    e.preventDefault();
  });
  box.addEventListener("pointermove", e => {
    if (!drag) return;
    place(e.clientX - drag.dx, e.clientY - drag.dy);
  });
  box.addEventListener("pointerup", () => {
    if (!drag) return;
    drag = null;
    try {
      localStorage.setItem("savelyCallPos", JSON.stringify({
        l: parseInt(box.style.left, 10), t: parseInt(box.style.top, 10) }));
    } catch (e) { /* приватный режим */ }
  });
  // Вернуть сохранённое место (и не дать окну спрятаться за краем)
  try {
    const p = JSON.parse(localStorage.getItem("savelyCallPos"));
    if (p && Number.isFinite(p.l)) requestAnimationFrame(() => place(p.l, p.t));
  } catch (e) { /* не было */ }
  addEventListener("resize", () => {
    if (box.style.left) place(parseInt(box.style.left, 10) || 4,
                              parseInt(box.style.top, 10) || 4);
  });
}

/* ---------- запуск ---------- */
function callBoot() {
  // Кнопка появляется только когда доска настоящая (id есть и роль ясна)
  const phone = $("bd-phone");
  if (!phone) return;
  if (!window.RTCPeerConnection || !navigator.mediaDevices) return;
  phone.hidden = false;
  phone.addEventListener("click", () => {
    if (CALL.state === "idle") startCall();
  });
  $("call-end").addEventListener("click", () => endCall(true));
  $("call-mic").addEventListener("click", e => toggleTrack("audio", e.currentTarget));
  $("call-cam").addEventListener("click", e => toggleTrack("video", e.currentTarget));
  // Показ экрана — репетитору: на уроке материал показывает учитель.
  // Телефон ученика чужой экран и так развернёт двойным нажатием.
  if (BD.role === "tutor" && screenSupported() && $("call-screen")) {
    $("call-screen").hidden = false;
    $("call-screen").addEventListener("click", toggleScreenShare);
  }
  // Двойное нажатие по видео собеседника — на весь экран: страница
  // задания или демонстрация в маленьком окошке не читается.
  $("call-remote").addEventListener("dblclick", () => {
    const v = $("call-remote");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (v.requestFullscreen) v.requestFullscreen();
    else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();  // iPhone
  });
  $("ring-yes").addEventListener("click", answerCall);
  $("ring-no").addEventListener("click", () => {
    $("bd-ring").hidden = true;
    CALL.offer = null;
    CALL.state = "idle";
    callSend("bye", {});
  });
  // Закрыл вкладку посреди разговора — второй не должен смотреть в
  // замёрзший кадр и гадать. sendBeacon успевает уйти при закрытии.
  addEventListener("pagehide", () => {
    if (CALL.state !== "idle" && navigator.sendBeacon) {
      navigator.sendBeacon("/api/call/send", JSON.stringify(
        { token: BD.token, boardId: BD.boardId, kind: "bye", data: {} }));
    }
  });
  // А чтобы не закрыть её СЛУЧАЙНО — браузер переспросит, пока идёт звонок
  addEventListener("beforeunload", e => {
    if (CALL.state === "idle") return;
    e.preventDefault();
    e.returnValue = "";
  });
  // Стрелка «выйти с доски» во время звонка не убивает его: страница
  // откроется рядом, звонок останется здесь. Совладелец: «учитель сказал
  // потренировать задания — а звонок прерывается».
  $("bd-back").addEventListener("click", e => {
    if (CALL.state === "idle") return;
    e.preventDefault();
    window.open($("bd-back").href, "_blank");
    toast("Звонок остаётся на доске — страница открылась в новой вкладке.");
  });
  // Телефон вернулся из фона: если связь за это время расползлась,
  // чиним сразу, не дожидаясь таймера.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || CALL.state !== "live" || !CALL.pc) return;
    const st = CALL.pc.connectionState;
    if (st === "disconnected" || st === "failed") tryRepair();
  });
  // Вынести лицо собеседника поверх всех окон: тренируешься в другой
  // вкладке — репетитор остаётся на глазах.
  const pip = $("call-pip");
  if (pip) {
    if (!document.pictureInPictureEnabled) pip.hidden = true;
    else pip.addEventListener("click", async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await $("call-remote").requestPictureInPicture();
      } catch (e) { toast("Видео пока нечего выносить."); }
    });
  }
  $("call-size").addEventListener("click", () =>
    setCallSize(!$("bd-call").classList.contains("big")));
  // Клик по лицу в маленьком окне — естественный жест «сделай крупнее»
  $("call-remote").addEventListener("click", () => {
    if (!$("bd-call").classList.contains("big")) setCallSize(true);
  });
  $("call-dial").addEventListener("click", () => {
    if (CALL.state === "idle") startCall();
    refreshDial();
  });
  const sbStop = $("screen-bar-stop");
  if (sbStop) sbStop.addEventListener("click", () => stopScreenShare(false));
  makeCallDraggable();
  callPollLoop();
  // Пришли по вкладке «Урок»: сразу большой режим. Звонка ещё нет —
  // заставка с «Позвонить»; репетитор уже зовёт — обычный входящий.
  if (LESSON_MODE) {
    showCallPanel();
    setCallSize(true);
    setCallState("готов к уроку — позвони, когда будете оба");
  }
}

// Доска сообщает о готовности сама (boot в board.js); если событие уже
// прозвучало до загрузки этого файла, ловим по факту — poll сам молчит,
// пока BD.boardId пустой.
addEventListener("board-ready", callBoot);
if (window.BD && BD.boardId) callBoot();
