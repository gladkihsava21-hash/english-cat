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
    const v = $("call-remote");
    if (v.srcObject !== e.streams[0]) v.srcObject = e.streams[0];
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
}

async function onAnswer(m) {
  if (!CALL.pc) return;
  if (CALL.state === "live") {
    // Ответ на пересборку: просто применяем
    if (CALL.isCaller) { try { await CALL.pc.setRemoteDescription(m.data); } catch (e) { /* уже не ждём */ } }
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
  teardownPeer();
  if (CALL.stream) CALL.stream.getTracks().forEach(t => t.stop());
  CALL.stream = null;
  CALL.offer = null;
  CALL.state = "idle";
  $("bd-call").hidden = true;
  $("bd-ring").hidden = true;
  $("call-remote").srcObject = null;
  $("call-local").srcObject = null;
}

/* ---------- показ экрана ----------
   Репетитор вместо камеры отправляет экран: подменяем видеодорожку в
   ТОМ ЖЕ соединении (replaceTrack) — у ученика картинка меняется сама,
   без нового звонка. Сервер видео по-прежнему не видит: и камера, и
   экран идут напрямую между браузерами, ничего не записывается. */
const SCREEN = { track: null };

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
  const sender = await videoSender();
  if (!sender) {
    track.stop();
    toast("Не получилось начать показ. Попробуйте перезвонить.");
    return;
  }
  SCREEN.track = track;
  await sender.replaceTrack(track);
  $("call-local").srcObject = new MediaStream([track]);
  $("call-local").classList.remove("novideo");
  $("call-screen").classList.add("on");
  setCallState("вы показываете экран");
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
  if (!CALL.pc) return;
  const sender = CALL.pc.getSenders().find(s => s.track === track)
    || CALL.pc.getSenders().find(s => s.track && s.track.kind === "video");
  const cam = CALL.stream && CALL.stream.getVideoTracks()[0];
  if (sender) {
    try { await sender.replaceTrack(cam || null); } catch (e) { /* конец звонка */ }
  }
  $("call-local").srcObject = CALL.stream;
  $("call-local").classList.toggle("novideo", !cam);
  if (!silent) setCallState("соединено");
}

function toggleScreenShare() {
  if (SCREEN.track) stopScreenShare(false);
  else startScreenShare();
}

/* ---------- панель ---------- */
function setCallState(text) { $("call-state").textContent = text; }

function showCallPanel() {
  $("bd-call").hidden = false;
  const local = $("call-local");
  local.srcObject = CALL.stream;
  const hasCam = !!(CALL.stream && CALL.stream.getVideoTracks().length);
  const hasMic = !!(CALL.stream && CALL.stream.getAudioTracks().length);
  local.classList.toggle("novideo", !hasCam);
  $("call-cam").disabled = !hasCam;
  $("call-mic").disabled = !hasMic;
  $("call-cam").classList.remove("off");
  $("call-mic").classList.remove("off");
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
  makeCallDraggable();
  callPollLoop();
}

// Доска сообщает о готовности сама (boot в board.js); если событие уже
// прозвучало до загрузки этого файла, ловим по факту — poll сам молчит,
// пока BD.boardId пустой.
addEventListener("board-ready", callBoot);
if (window.BD && BD.boardId) callBoot();
