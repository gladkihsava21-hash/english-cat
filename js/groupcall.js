/* Групповой видеоурок: репетитор + несколько учеников на одной доске.
 *
 * Почему отдельный файл, а не правка call.js: личный звонок 1:1 отлажен
 * и живёт своей жизнью (дозвон, оффер-на-проверке, починка ICE). Группа
 * устроена иначе — никакого «звонка» нет вовсе: кто открыл общую доску и
 * нажал «войти», тот на связи. Общего у них только «сватовство» через
 * /api/call/send|poll и STUN; всё остальное — своё, и путать два потока
 * в одном файле — просить регрессий в личном звонке.
 *
 * Топология — mesh: каждый браузер держит по одному RTCPeerConnection
 * на каждого участника. Сервер видео по-прежнему не видит (хостинг
 * его не переживёт), поэтому потолок — GC_MAX человек: сверх того
 * исходящий канал домашнего интернета репетитора превращается в узкое
 * место. Настоящий SFU — отдельный проект и отдельная машина.
 *
 * Кто кому звонит, решается без дипломатии: пару всегда строит участник
 * с меньшим id (t2 < s7 значит репетитор строит). Встречные офферы
 * при пересборке разбирает вежливость: вежливый тот, чей id больше.
 *
 * Все групповые сообщения помечены { g:1, from } — личный звонок их
 * игнорирует, мы игнорируем его. Одновременно личный и групповой на
 * одной доске не живут: доска либо «всем», либо одному ученику.
 */

const GC = {
  active: false,        // мы в групповом уроке
  myId: null,           // наш peer id по версии сервера (t2 / s17)
  stream: null,         // наши дорожки
  peers: new Map(),     // id -> { pc, name, role, helloAt, tracks[], video, tile }
  since: 0,
  primed: false,
  helloTimer: 0,
  pollTimer: 0,
  sweepTimer: 0,
};

const GC_MAX = 6;           // репетитор + пять учеников; дальше упираемся в аплинк
const GC_HELLO_MS = 10000;  // как часто напоминаем о себе
const GC_ALIVE_MS = 25000;  // кто молчит дольше — вышел
const GC_POLL_IDLE_MS = 5000;   // слушаем «не начался ли урок»
const GC_POLL_LIVE_MS = 1500;   // на связи — почаще: там ICE

/* Как нас зовут показать остальным. Имени ученика на странице доски нет
   в явном виде — берём из сохранённого состояния, а не спрашиваем. */
function gcMyName() {
  if (BD.role === "tutor") return "Репетитор";
  try {
    const st = JSON.parse(localStorage.getItem("savelyState") || "{}");
    if (st.name) return String(st.name).slice(0, 30);
  } catch (e) { /* приватный режим */ }
  return "Ученик";
}

function gcSend(kind, data) {
  // from кладём в тело: call_poll наружу sender не отдаёт (так задумано
  // для личного звонка), а mesh без отправителя не собрать.
  return api("/api/call/send", {
    token: BD.token, boardId: BD.boardId, kind,
    data: { ...data, g: 1, from: GC.myId },
  }).catch(() => { /* мигнула сеть — следующее уедет */ });
}

/* ---------- опрос ----------
   Свой цикл, своё since: личный звонок читает ту же таблицу своим
   курсором, и оба не мешают друг другу. В покое редко (ждём «hello» от
   репетитора), в уроке — чаще (там офферы и ICE). */
async function gcPollOnce() {
  if (!BD.boardId || !BD.token) return;
  let res;
  try {
    res = await api("/api/call/poll", { token: BD.token, boardId: BD.boardId, since: GC.since });
  } catch (e) { return; }
  if (!res.ok) return;
  if (res.me && !GC.myId) GC.myId = res.me;
  for (const m of res.msgs || []) {
    GC.since = Math.max(GC.since, m.id);
    const d = m.data || {};
    if (!d.g) continue;                    // личный звонок — не наше
    if (!GC.primed && m.age > 30) continue; // эхо прошлого урока
    gcHandle(m.kind, d);
  }
  GC.primed = true;
}

function gcPollLoop() {
  clearTimeout(GC.pollTimer);
  gcPollOnce().finally(() => {
    GC.pollTimer = setTimeout(gcPollLoop, GC.active ? GC_POLL_LIVE_MS : GC_POLL_IDLE_MS);
  });
}

function gcHandle(kind, d) {
  if (d.from === GC.myId) return;          // своё же эхо
  if (kind === "hello") return gcOnHello(d);
  if (kind === "bye") return gcDropPeer(d.from, "вышел из урока");
  if (kind === "screen") return gcOnScreen(d);
  if (d.to !== GC.myId) return;            // адресные — только нам
  if (kind === "offer") return gcOnOffer(d);
  if (kind === "answer") return gcOnAnswer(d);
  if (kind === "ice") return gcOnIce(d);
}

/* ---------- присутствие ---------- */
function gcOnHello(d) {
  const id = d.from;
  if (!id) return;
  let p = GC.peers.get(id);
  if (!p) {
    p = { pc: null, name: d.name || (id[0] === "t" ? "Репетитор" : "Ученик"),
          role: id[0] === "t" ? "tutor" : "student", helloAt: 0,
          tracks: [], screen: false };
    GC.peers.set(id, p);
    gcRenderTiles();
  }
  p.helloAt = Date.now();
  p.name = d.name || p.name;
  // Нас ещё нет в уроке, а репетитор зовёт — покажем приглашение.
  if (!GC.active && p.role === "tutor") gcShowJoin();
  // Мы в уроке, а пир без соединения — строим, если мы меньший id.
  if (GC.active && !p.pc) gcConnect(id);
}

function gcShowJoin() {
  if (GC.active || CALL.state !== "idle") return;   // личный звонок важнее
  const bar = $("gc-join");
  if (!bar) return;
  bar.hidden = false;
}

function gcSweep() {
  const now = Date.now();
  for (const [id, p] of [...GC.peers]) {
    if (now - p.helloAt > GC_ALIVE_MS) gcDropPeer(id, "");
  }
  // Урок кончился, а мы так и не вошли — прячем приглашение.
  if (!GC.active) {
    const tutorHere = [...GC.peers.values()].some(p => p.role === "tutor");
    if (!tutorHere && $("gc-join")) $("gc-join").hidden = true;
  }
}

/* ---------- соединения ---------- */
function gcConnect(id) {
  const p = GC.peers.get(id);
  if (!p || p.pc) return;
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  p.pc = pc;
  p.polite = GC.myId > id;   // вежливый при встречных офферах — больший id
  p.iceBuf = [];
  p.iceTimer = 0;

  if (GC.stream) GC.stream.getTracks().forEach(t => pc.addTrack(t, GC.stream));
  else {
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
  }

  pc.onicecandidate = e => {
    if (!e.candidate) return;
    // Кандидаты идут пачками по одному — а каждый это POST. Копим полсекунды
    // и шлём одним сообщением: лимит /api/call/send — 120 в минуту, и без
    // пакетирования шестёрка участников его выедала на входе.
    p.iceBuf.push(e.candidate.toJSON());
    clearTimeout(p.iceTimer);
    p.iceTimer = setTimeout(() => {
      const batch = p.iceBuf.splice(0);
      if (batch.length) gcSend("ice", { to: id, cands: batch });
    }, 400);
  };
  pc.ontrack = e => {
    if (!p.tracks.includes(e.track)) p.tracks.push(e.track);
    e.track.onended = () => {
      p.tracks = p.tracks.filter(t => t !== e.track);
      gcRenderTiles();
    };
    gcRenderTiles();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "connected") gcRenderTiles();
    if (pc.connectionState === "failed") {
      // Пара не собралась — пересоздаём, если мы строитель.
      if (GC.myId < id) { gcClosePeer(id); gcConnect(id); }
    }
  };

  // Строит меньший id — дипломатия не нужна вообще.
  if (GC.myId < id) gcOffer(id);
}

async function gcOffer(id) {
  const p = GC.peers.get(id);
  if (!p || !p.pc) return;
  try {
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    await gcSend("offer", { to: id, sdp: offer.sdp, type: offer.type });
  } catch (e) { /* пир уже вышел */ }
}

async function gcOnOffer(d) {
  const id = d.from;
  let p = GC.peers.get(id);
  if (!p) { gcOnHello(d); p = GC.peers.get(id); }
  if (!p) return;
  if (!GC.active) return;                  // нас позвали, но мы не входили
  if (!p.pc) gcConnect(id);                // построителем был он (больший id у нас)
  const pc = p.pc;
  try {
    // Встречные офферы (пересборка лбами): невежливый стоит на своём,
    // вежливый откатывается и отвечает.
    if (pc.signalingState === "have-local-offer") {
      if (!p.polite) return;
      await pc.setLocalDescription({ type: "rollback" });
    }
    await pc.setRemoteDescription({ sdp: d.sdp, type: d.type });
    for (const c of (p.pendingIce || [])) {
      try { await pc.addIceCandidate(c); } catch (e) { /* кривой */ }
    }
    p.pendingIce = [];
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await gcSend("answer", { to: id, sdp: answer.sdp, type: answer.type });
  } catch (e) { /* состояние уехало — hello-цикл перестроит */ }
}

async function gcOnAnswer(d) {
  const p = GC.peers.get(d.from);
  if (!p || !p.pc) return;
  if (p.pc.signalingState !== "have-local-offer") return;
  try {
    await p.pc.setRemoteDescription({ sdp: d.sdp, type: d.type });
    for (const c of (p.pendingIce || [])) {
      try { await p.pc.addIceCandidate(c); } catch (e) { /* мимо */ }
    }
    p.pendingIce = [];
  } catch (e) { /* опоздал */ }
}

function gcOnIce(d) {
  const p = GC.peers.get(d.from);
  if (!p || !p.pc) return;
  const list = d.cands || (d.candidate ? [d.candidate] : []);
  for (const c of list) {
    if (p.pc.remoteDescription) {
      p.pc.addIceCandidate(c).catch(() => {});
    } else {
      (p.pendingIce = p.pendingIce || []).push(c);
    }
  }
}

function gcOnScreen(d) {
  const p = GC.peers.get(d.from);
  if (!p) return;
  p.screen = !!(d.on);
  gcRenderTiles();
}

function gcClosePeer(id) {
  const p = GC.peers.get(id);
  if (p && p.pc) { try { p.pc.close(); } catch (e) { /* уже мёртв */ } p.pc = null; }
}

function gcDropPeer(id, why) {
  const p = GC.peers.get(id);
  if (!p) return;
  gcClosePeer(id);
  GC.peers.delete(id);
  if (why && GC.active) toast(`${p.name}: ${why}`);
  gcRenderTiles();
}

/* ---------- вход и выход ---------- */
async function gcJoin() {
  if (GC.active) return;
  if (CALL.state !== "idle") {
    toast("Сначала завершите личный звонок — одновременно нельзя.");
    return;
  }
  if (GC.peers.size >= GC_MAX) {
    toast(`Группа полная: максимум ${GC_MAX} человек. Больше домашний интернет не тянет.`);
    return;
  }
  GC.stream = await getCallMedia();   // та же лестница «видео→звук→ничего»
  GC.active = true;
  $("gc-join").hidden = true;
  $("gc-stage").hidden = false;
  // На время группового урока личная трубка прячется: два звонка на одной
  // доске не живут, и лишняя кнопка — лишний способ запутаться.
  const phone = $("bd-phone");
  if (phone) phone.hidden = true;
  await gcSend("hello", { name: gcMyName() });
  clearInterval(GC.helloTimer);
  GC.helloTimer = setInterval(() => gcSend("hello", { name: gcMyName() }), GC_HELLO_MS);
  for (const id of GC.peers.keys()) gcConnect(id);
  gcRenderTiles();
  gcPollLoop();
}

function gcLeave(silent) {
  if (!GC.active) return;
  GC.active = false;
  if (!silent) gcSend("bye", {});
  clearInterval(GC.helloTimer);
  for (const id of [...GC.peers.keys()]) gcClosePeer(id);
  GC.peers.clear();
  if (GC.stream) GC.stream.getTracks().forEach(t => t.stop());
  GC.stream = null;
  $("gc-stage").hidden = true;
  const phone = $("bd-phone");
  if (phone) phone.hidden = false;
  gcRenderTiles();
}

/* ---------- плитки ---------- */
function gcRenderTiles() {
  const stage = $("gc-stage");
  if (!stage) return;
  const grid = $("gc-grid");
  // Своя плитка
  let mine = $("gc-me");
  if (!mine) {
    mine = document.createElement("div");
    mine.className = "gc-tile";
    mine.id = "gc-me";
    mine.innerHTML = `<video autoplay playsinline muted></video><span class="gc-name"></span>`;
    grid.appendChild(mine);
  }
  const myVideo = mine.querySelector("video");
  if (myVideo.srcObject !== GC.stream) myVideo.srcObject = GC.stream;
  mine.querySelector(".gc-name").textContent = "это вы";

  // Чужие: синхронизируем набор плиток с картой пиров
  for (const el of [...grid.querySelectorAll(".gc-tile[data-peer]")]) {
    if (!GC.peers.has(el.dataset.peer)) el.remove();
  }
  let screenPeer = null;
  for (const [id, p] of GC.peers) {
    let tile = grid.querySelector(`.gc-tile[data-peer="${id}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "gc-tile";
      tile.dataset.peer = id;
      tile.innerHTML = `<video autoplay playsinline></video><span class="gc-name"></span>`;
      grid.appendChild(tile);
    }
    const vids = p.tracks.filter(t => t.kind === "video" && t.readyState === "live");
    const auds = p.tracks.filter(t => t.kind === "audio");
    // Экран репетитора — на сцену, лицо остаётся плиткой (как в 1:1).
    const face = p.screen && vids.length >= 2 ? vids[0] : vids[vids.length - 1];
    const v = tile.querySelector("video");
    const want = face || auds.length ? new MediaStream([...(face ? [face] : []), ...auds]) : null;
    if (v.srcObject !== want) v.srcObject = want;
    tile.querySelector(".gc-name").textContent = p.name;
    tile.classList.toggle("gc-novideo", !face);
    if (p.screen && vids.length >= 2) screenPeer = { p, track: vids[vids.length - 1] };
  }
  // Сцена под демонстрацию экрана
  let stage2 = $("gc-screen");
  if (screenPeer) {
    if (!stage2) {
      stage2 = document.createElement("video");
      stage2.id = "gc-screen";
      stage2.autoplay = true;
      stage2.playsInline = true;
      stage.appendChild(stage2);
    }
    const ms = new MediaStream([screenPeer.track]);
    if (stage2.srcObject !== ms) stage2.srcObject = ms;
    stage.classList.add("gc-with-screen");
  } else if (stage2) {
    stage2.srcObject = null;
    stage2.remove();
    stage.classList.remove("gc-with-screen");
  }
  // Сетка: 2 колонки по умолчанию, от трёх гостей — три.
  const n = GC.peers.size + 1;
  grid.dataset.n = String(n);
}

/* ---------- кнопки ---------- */
function gcToggle(kindName, btn) {
  if (!GC.stream) return;
  const tracks = kindName === "video"
    ? GC.stream.getVideoTracks() : GC.stream.getAudioTracks();
  if (!tracks.length) return;
  const on = !tracks[0].enabled;
  tracks.forEach(t => { t.enabled = on; });
  btn.classList.toggle("off", !on);
}

/* Демонстрация экрана в группе: тот же второй трек, что в 1:1, но в
   каждое соединение. Только репетитор — материал показывает учитель. */
const GC_SCREEN = { track: null, senders: [] };

async function gcScreenToggle(btn) {
  if (GC_SCREEN.track) return gcScreenStop();
  if (BD.role !== "tutor") return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 12 } }, audio: false });
  } catch (e) { return; }        // передумали в системном окне — не ошибка
  const track = stream.getVideoTracks()[0];
  if (!track) return;
  GC_SCREEN.track = track;
  GC_SCREEN.senders = [];
  for (const [id, p] of GC.peers) {
    if (!p.pc) continue;
    try {
      GC_SCREEN.senders.push(p.pc.addTrack(track, new MediaStream([track])));
      await gcOffer(id);          // новая дорожка = новая договорённость
    } catch (e) { /* пара перестроится по hello */ }
  }
  await gcSend("screen", { on: true });
  btn.classList.add("on");
  track.onended = () => gcScreenStop();
}

async function gcScreenStop() {
  const track = GC_SCREEN.track;
  if (!track) return;
  GC_SCREEN.track = null;
  track.onended = null;
  try { track.stop(); } catch (e) { /* уже */ }
  for (const [id, p] of GC.peers) {
    if (!p.pc) continue;
    for (const s of GC_SCREEN.senders) {
      try { p.pc.removeTrack(s); } catch (e) { /* мимо */ }
    }
    await gcOffer(id);
  }
  GC_SCREEN.senders = [];
  await gcSend("screen", { on: false });
  const btn = $("gc-screen-btn");
  if (btn) btn.classList.remove("on");
}

/* ---------- запуск ----------
   Своей разметки в board.html нет нарочно: этот файл подключается отдельно,
   и страница о нём знать не обязана — всё, что нужно, строим сами. */
function gcBoot() {
  if (!BD.boardId || !BD.token) return;
  if (!window.RTCPeerConnection || !navigator.mediaDevices) return;
  if ($("gc-stage")) return;               // уже встали

  const stage = document.createElement("div");
  stage.id = "gc-stage";
  stage.hidden = true;
  stage.innerHTML = `
    <div class="gc-grid" id="gc-grid"></div>
    <div class="gc-bar">
      <button type="button" id="gc-mic" title="Микрофон">${icon("mic")}</button>
      <button type="button" id="gc-cam" title="Камера">${icon("video") || icon("screen")}</button>
      ${BD.role === "tutor" && screenSupported()
        ? `<button type="button" id="gc-screen-btn" title="Показать экран">${icon("screen")}</button>` : ""}
      <button type="button" id="gc-leave" class="gc-danger" title="Выйти из урока">${icon("phone")}</button>
    </div>`;
  document.body.appendChild(stage);

  const join = document.createElement("button");
  join.type = "button";
  join.id = "gc-join";
  join.hidden = true;
  join.textContent = "Идёт групповой урок — войти";
  document.body.appendChild(join);

  join.addEventListener("click", gcJoin);
  $("gc-leave").addEventListener("click", () => gcLeave(false));
  $("gc-mic").addEventListener("click", e => gcToggle("audio", e.currentTarget));
  $("gc-cam").addEventListener("click", e => gcToggle("video", e.currentTarget));
  const scr = $("gc-screen-btn");
  if (scr) scr.addEventListener("click", () => gcScreenToggle(scr));

  // Репетитору — своя кнопка рядом с личной трубкой. Групповой урок
  // имеет смысл только на доске, открытой всем: на личной доске остальные
  // ученики просто не попадут.
  if (BD.role === "tutor") {
    const phone = $("bd-phone");
    if (phone) {
      const gbtn = document.createElement("button");
      gbtn.type = "button";
      gbtn.id = "bd-gcall";
      gbtn.className = phone.className;
      gbtn.title = "Групповой видеоурок (доска должна быть открыта всем)";
      gbtn.innerHTML = icon("users") || icon("phone");
      gbtn.addEventListener("click", () => {
        if (CALL.state !== "idle") {
          toast("Сначала завершите личный звонок.");
          return;
        }
        if (!$("bd-live") || $("bd-live").hidden) {
          toast("Сначала откройте доску всем: «Поделиться» → «Позвать всех».");
          return;
        }
        gcJoin();
      });
      phone.parentNode.insertBefore(gbtn, phone.nextSibling);
    }
  }

  // Закрыл вкладку — остальные не должны смотреть на замёрзший кадр.
  addEventListener("pagehide", () => {
    if (GC.active && navigator.sendBeacon) {
      navigator.sendBeacon("/api/call/send", JSON.stringify({
        token: BD.token, boardId: BD.boardId, kind: "bye",
        data: { g: 1, from: GC.myId } }));
    }
  });

  GC.sweepTimer = setInterval(gcSweep, 5000);
  gcPollLoop();
}

addEventListener("board-ready", gcBoot);
if (window.BD && BD.boardId) gcBoot();
