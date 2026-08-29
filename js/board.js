/* Доска для урока: рисуем, клеим стикеры и раскладываем слова вдвоём.
 *
 * Почему не Miro и не готовая библиотека. Во-первых, доска должна знать
 * про словарь ученика — карточка со словом здесь такой же объект, как
 * линия, и в этом вся её ценность для урока. Во-вторых, весь проект
 * держится на «никаких сборщиков и внешних зависимостей»: чужая
 * библиотека на полмегабайта окупалась бы только если бы делала больше,
 * чем этот файл.
 *
 * Как устроена синхронизация. Веб-сокетов на нашем хостинге нет, поэтому
 * опрос: раз в 1,2 секунды клиент отправляет накопленные изменения
 * и забирает чужие, начиная со своей версии. Слияние — пообъектное,
 * «последний по объекту побеждает» (см. db.board_sync). Своё рисование
 * при этом мгновенное: сначала показываем, потом отправляем.
 *
 * Координаты. У доски свои, «мировые» — они не зависят от масштаба
 * и от того, куда сдвинули полотно. Перевод в экранные ровно в двух
 * местах: при отрисовке и при обработке нажатия. Всё остальное живёт
 * в мировых, иначе объект «уезжал» бы при зуме у второго участника.
 */

const BD = {
  boardId: 0,
  role: "",            // tutor | student
  token: "",
  rev: 0,
  me: "",
  objects: new Map(),  // id -> объект
  tool: "select",
  color: "ink",
  size: 3,
  view: { x: 0, y: 0, k: 1 },   // сдвиг и масштаб полотна
  selected: null,
  dirty: new Map(),    // что отправить на сервер
  deleted: new Set(),
  undo: [],
  redo: [],
  students: [],
  words: [],
  userMoved: false,      // трогал ли человек масштаб и сдвиг сам
  needsPaint: true,
};

const $ = id => document.getElementById(id);
const canvas = $("board-canvas");
const ctx = canvas.getContext("2d");

/* ---------- цвета ----------
   Значения лежат в css/tokens.css: одно место на весь проект, и ночная
   тема меняет их сама. Здесь только имена. */
const COLORS = ["ink", "red", "blue", "green", "orange", "violet"];
const NOTE_COLORS = ["note", "note2", "note3"];
const cssColor = name => getComputedStyle(document.documentElement)
  .getPropertyValue("--bd-" + name).trim() || "#000";

/* ---------- вспомогательное ---------- */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const toast = (text, ms = 2600) => {
  const t = $("bd-toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
};
const paint = () => { BD.needsPaint = true; };

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

/* ---------- экран ↔ доска ---------- */
function toWorld(sx, sy) {
  return { x: (sx - BD.view.x) / BD.view.k, y: (sy - BD.view.y) / BD.view.k };
}
function fitCanvas() {
  // Рисуем в физических пикселях экрана: без этого на телефоне и на
  // ретине линия выглядит рыхлой.
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.floor(innerWidth * dpr);
  canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + "px";
  canvas.style.height = innerHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Пока человек сам не двигал полотно, держим содержимое в кадре.
  // На старте окно бывает ещё не разложено (ширина крошечная), и подгонка
  // по нему давала 17% — доска открывалась «муравьиной».
  if (!BD.userMoved && BD.objects.size) fitToContent();
  paint();
}

/* ---------- отрисовка ---------- */
function draw() {
  if (!BD.needsPaint) return;
  BD.needsPaint = false;
  const w = innerWidth, h = innerHeight;
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = cssColor("paper");
  ctx.fillRect(0, 0, w, h);
  drawGrid(w, h);

  ctx.translate(BD.view.x, BD.view.y);
  ctx.scale(BD.view.k, BD.view.k);

  // Порядок один и тот же у обоих участников — по версии объекта,
  // иначе у репетитора стикер сверху, а у ученика под линией.
  const list = [...BD.objects.values()].sort((a, b) => (a.rev || 0) - (b.rev || 0));
  for (const o of list) drawObject(o);
  if (BD.selected && BD.objects.has(BD.selected)) drawSelection(BD.objects.get(BD.selected));
  ctx.restore();
  // Указка анимируется по времени — доска перерисовывается, пока та жива
  for (const o of BD.objects.values()) {
    if (o.kind === "ping" && (performance.now() - (PING_SEEN.get(o.id) || performance.now())) < PING_MS) {
      BD.needsPaint = true;
      break;
    }
  }
}

function bgMode() {
  // Фон — общий объект доски (id зашит): меняет один, видят оба.
  const o = BD.objects.get("board-bg");
  return (o && o.text) || "dots";
}

function drawGrid(w, h) {
  const mode = bgMode();
  if (mode === "clean") return;
  const step = 40 * BD.view.k;
  if (step < 14) return;
  const x0 = BD.view.x % step, y0 = BD.view.y % step;
  if (mode === "grid") {
    // Клетка — как тетрадь по математике: удобно чертить и писать столбиком
    ctx.strokeStyle = cssColor("grid");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = y0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    return;
  }
  if (mode === "lines") {
    // Линейка — как тетрадь по английскому: письмо на строчках
    ctx.strokeStyle = cssColor("grid");
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = y0; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    return;
  }
  // Точки (по умолчанию): сетка как чувство масштаба, а не разлиновка
  ctx.fillStyle = cssColor("grid");
  for (let x = x0; x < w; x += step)
    for (let y = y0; y < h; y += step) ctx.fillRect(x, y, 1.5, 1.5);
}

/* ---------- картинки ----------
   Картинка живёт в объекте data-URL-ом и рисуется через кэш: Image
   создаётся один раз на id, дальше drawImage как обычно. */
const IMG_CACHE = new Map();
function imgFor(o) {
  let rec = IMG_CACHE.get(o.id);
  if (rec && rec.src === o.src) return rec.img.complete ? rec.img : null;
  const img = new Image();
  img.onload = paint;
  img.src = o.src;
  IMG_CACHE.set(o.id, { src: o.src, img });
  return img.complete ? img : null;
}

/* Указка «смотри сюда»: пульсирующее кольцо живёт пару секунд.
   Время появления у каждого своё, локальное — в объекте времени нет. */
const PING_SEEN = new Map();   // id -> когда увидели
const PING_MS = 2600;

function drawObject(o) {
  if (o.kind === "bg") return;               // фон нарисован до объектов
  const color = cssColor(o.color || "ink");
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (o.kind === "image") {
    const img = imgFor(o);
    if (!img) {                              // ещё грузится — рамка-заглушка
      ctx.strokeStyle = cssColor("grid");
      ctx.lineWidth = 2;
      ctx.beginPath();
      roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.stroke();
      return;
    }
    ctx.save();
    ctx.beginPath();
    roundRect(o.x, o.y, o.w, o.h, 8);
    ctx.clip();
    ctx.drawImage(img, o.x, o.y, o.w, o.h);
    ctx.restore();
    return;
  }

  if (o.kind === "ping") {
    if (!PING_SEEN.has(o.id)) PING_SEEN.set(o.id, performance.now());
    const t = (performance.now() - PING_SEEN.get(o.id)) / PING_MS;
    if (t >= 1) return;
    // Три расходящихся кольца со сдвигом по фазе — глаз ловит движение
    // даже боковым зрением, ради этого указка и нужна.
    for (let k = 0; k < 3; k++) {
      const p = t * 1.4 - k * 0.18;
      if (p < 0 || p > 1) continue;
      ctx.strokeStyle = cssColor(o.color || "red");
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.lineWidth = 3 / BD.view.k;
      ctx.beginPath();
      ctx.arc(o.x, o.y, (8 + p * 46) / BD.view.k, 0, 7);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (o.kind === "pen" || o.kind === "marker") {
    if (!o.pts || o.pts.length < 4) return;
    ctx.globalAlpha = o.kind === "marker" ? 0.35 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = o.size * (o.kind === "marker" ? 4 : 1);
    ctx.beginPath();
    ctx.moveTo(o.pts[0], o.pts[1]);
    // Сглаживаем по серединам отрезков: рука дрожит, а квадратичная
    // кривая через середины убирает углы почти бесплатно.
    for (let i = 2; i < o.pts.length - 2; i += 2) {
      const mx = (o.pts[i] + o.pts[i + 2]) / 2;
      const my = (o.pts[i + 1] + o.pts[i + 3]) / 2;
      ctx.quadraticCurveTo(o.pts[i], o.pts[i + 1], mx, my);
    }
    ctx.lineTo(o.pts[o.pts.length - 2], o.pts[o.pts.length - 1]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    return;
  }

  if (o.kind === "rect" || o.kind === "ellipse") {
    ctx.strokeStyle = color;
    ctx.lineWidth = o.size;
    ctx.beginPath();
    if (o.kind === "rect") roundRect(o.x, o.y, o.w, o.h, 8);
    else ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.abs(o.w / 2), Math.abs(o.h / 2), 0, 0, 7);
    ctx.stroke();
    return;
  }

  if (o.kind === "line" || o.kind === "arrow") {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = o.size;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y);
    ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.stroke();
    if (o.kind === "arrow") {
      const a = Math.atan2(o.h, o.w), len = 10 + o.size * 2.2;
      const tx = o.x + o.w, ty = o.y + o.h;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx - Math.cos(a - 0.45) * len, ty - Math.sin(a - 0.45) * len);
      ctx.lineTo(tx - Math.cos(a + 0.45) * len, ty - Math.sin(a + 0.45) * len);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (o.kind === "note") {
    ctx.fillStyle = cssColor(o.color && o.color.startsWith("note") ? o.color : "note");
    ctx.strokeStyle = "rgba(0,0,0,.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(o.x, o.y, o.w, o.h, 10);
    ctx.fill();
    ctx.stroke();
    drawText(o.text || "", o.x + 12, o.y + 12, o.w - 24, 19, cssColor("ink"), "600");
    return;
  }

  if (o.kind === "text") {
    drawText(o.text || "", o.x, o.y, o.w || 460, Math.max(16, o.size * 6), color, "600");
    return;
  }

  if (o.kind === "word") {
    // Карточка со словом: перевод закрыт, пока по ней не нажали, —
    // на доске это готовое упражнение, а не просто подпись.
    const open = o.text2 && o.h > 70;
    ctx.fillStyle = cssColor("paper");
    ctx.strokeStyle = cssColor("green");
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(o.x, o.y, o.w, o.h, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cssColor("ink");
    ctx.font = '700 22px Nunito, system-ui, sans-serif';
    ctx.textBaseline = "top";
    ctx.fillText(o.text || "", o.x + 14, o.y + 12);
    if (open) {
      ctx.fillStyle = cssColor("green");
      ctx.font = '400 17px Inter, system-ui, sans-serif';
      ctx.fillText(o.text2 || "", o.x + 14, o.y + 44);
    } else {
      ctx.fillStyle = cssColor("grid");
      ctx.fillRect(o.x + 14, o.y + 46, o.w - 28, 10);
    }
  }
}

function roundRect(x, y, w, h, r) {
  // Отрицательные ширина и высота бывают, когда фигуру тянут влево-вверх
  const x0 = w < 0 ? x + w : x, y0 = h < 0 ? y + h : y;
  const ww = Math.abs(w), hh = Math.abs(h);
  const rr = Math.min(r, ww / 2, hh / 2);
  ctx.moveTo(x0 + rr, y0);
  ctx.arcTo(x0 + ww, y0, x0 + ww, y0 + hh, rr);
  ctx.arcTo(x0 + ww, y0 + hh, x0, y0 + hh, rr);
  ctx.arcTo(x0, y0 + hh, x0, y0, rr);
  ctx.arcTo(x0, y0, x0 + ww, y0, rr);
  ctx.closePath();
}

function drawText(text, x, y, maxW, lh, color, weight) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${Math.round(lh * 0.86)}px Nunito, system-ui, sans-serif`;
  ctx.textBaseline = "top";
  let line = "", ty = y;
  for (const word of String(text).split(/\s+/)) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, ty);
      ty += lh;
      line = word;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, ty);
}

/** У каких объектов есть смысл тянуть размер за уголок. Линии и штрихи
 *  не растягиваем: у них «размер» — это сама геометрия. */
const resizable = o => ["image", "rect", "ellipse", "note", "word"].includes(o.kind);

function drawSelection(o) {
  const b = bounds(o);
  ctx.strokeStyle = cssColor("green");
  ctx.lineWidth = 1.5 / BD.view.k;
  ctx.setLineDash([6 / BD.view.k, 4 / BD.view.k]);
  ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
  ctx.setLineDash([]);
  if (resizable(o)) {
    // Уголок-ручка: квадратик в правом нижнем углу рамки
    const r = 7 / BD.view.k;
    ctx.fillStyle = cssColor("green");
    ctx.fillRect(b.x + b.w + 6 - r, b.y + b.h + 6 - r, r * 2, r * 2);
  }
}

/** Попал ли указатель в уголок-ручку выделенного объекта. */
function hitResizeHandle(wx, wy) {
  if (!BD.selected) return null;
  const o = BD.objects.get(BD.selected);
  if (!o || !resizable(o)) return null;
  const b = bounds(o);
  const r = 14 / BD.view.k;                  // зона больше рисунка: палец не мышь
  if (Math.abs(wx - (b.x + b.w + 6)) < r && Math.abs(wy - (b.y + b.h + 6)) < r) return o;
  return null;
}

function bounds(o) {
  if (o.kind === "pen" || o.kind === "marker") {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (let i = 0; i < o.pts.length; i += 2) {
      x1 = Math.min(x1, o.pts[i]); x2 = Math.max(x2, o.pts[i]);
      y1 = Math.min(y1, o.pts[i + 1]); y2 = Math.max(y2, o.pts[i + 1]);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  const x = o.w < 0 ? o.x + o.w : o.x, y = o.h < 0 ? o.y + o.h : o.y;
  return { x, y, w: Math.abs(o.w) || 120, h: Math.abs(o.h) || 40 };
}

/** Служебные объекты: их нельзя выделить, стереть или двигать. */
const isService = o => o.kind === "ping" || o.kind === "bg";

function hitTest(wx, wy) {
  // Сверху вниз: последним нарисованное ловится первым — так и ожидают
  const list = [...BD.objects.values()].sort((a, b) => (b.rev || 0) - (a.rev || 0));
  for (const o of list) {
    if (isService(o)) continue;
    if (o.kind === "pen" || o.kind === "marker") {
      const t = Math.max(8, o.size * 2);
      for (let i = 0; i < o.pts.length - 2; i += 2) {
        if (distToSegment(wx, wy, o.pts[i], o.pts[i + 1], o.pts[i + 2], o.pts[i + 3]) < t) return o;
      }
      continue;
    }
    const b = bounds(o);
    if (wx >= b.x - 4 && wx <= b.x + b.w + 4 && wy >= b.y - 4 && wy <= b.y + b.h + 4) return o;
  }
  return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/* ---------- изменения ---------- */
function put(o, remember = true) {
  if (remember) pushUndo({ type: "put", before: BD.objects.get(o.id) ? { ...BD.objects.get(o.id) } : null, id: o.id });
  BD.objects.set(o.id, o);
  BD.dirty.set(o.id, o);
  paint();
  scheduleSync();
}
function remove(id, remember = true) {
  const o = BD.objects.get(id);
  if (!o) return;
  if (remember) pushUndo({ type: "del", before: { ...o }, id });
  BD.objects.delete(id);
  BD.dirty.delete(id);
  BD.deleted.add(id);
  if (BD.selected === id) BD.selected = null;
  paint();
  scheduleSync();
}
function pushUndo(step) {
  BD.undo.push(step);
  if (BD.undo.length > 80) BD.undo.shift();
  BD.redo.length = 0;
}
function doUndo() {
  const step = BD.undo.pop();
  if (!step) return;
  const now = BD.objects.get(step.id);
  BD.redo.push({ type: now ? "put" : "del", before: now ? { ...now } : null, id: step.id });
  if (step.before) put(step.before, false);
  else remove(step.id, false);
}
function doRedo() {
  const step = BD.redo.pop();
  if (!step) return;
  const now = BD.objects.get(step.id);
  BD.undo.push({ type: now ? "put" : "del", before: now ? { ...now } : null, id: step.id });
  if (step.before) put(step.before, false);
  else remove(step.id, false);
}

/* ---------- синхронизация ---------- */
let syncTimer = null, syncBusy = false;
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 250);   // копим штрихи, но не дольше четверти секунды
}

async function syncNow() {
  if (syncBusy || !BD.boardId) return;
  syncBusy = true;
  const changes = [...BD.dirty.values()];
  const deletes = [...BD.deleted];
  BD.dirty.clear();
  BD.deleted.clear();
  try {
    const res = await api("/api/board/sync", {
      token: BD.token, boardId: BD.boardId, since: BD.rev,
      changes, deletes,
    });
    if (!res.ok) {
      // Отправленное не подтвердилось — возвращаем в очередь, иначе
      // штрих просто пропадёт у второго участника.
      changes.forEach(o => BD.dirty.set(o.id, o));
      deletes.forEach(id => BD.deleted.add(id));
      setState(res.error === "unauthorized" ? "нет доступа к доске" : (res.error || "нет связи"), true);
      syncBusy = false;
      return;
    }
    BD.me = res.me || BD.me;
    BD.rev = res.rev;
    let changed = false;
    (res.objects || []).forEach(o => {
      // Свой же объект с сервера не принимаем поверх свежего: пока летел
      // ответ, руку могли увести дальше.
      if (BD.dirty.has(o.id)) return;
      BD.objects.set(o.id, o);
      changed = true;
    });
    (res.deleted || []).forEach(id => {
      if (BD.objects.delete(id)) changed = true;
    });
    if (changed) paint();
    if (res.title) $("bd-name").textContent = res.title;
    setState(BD.dirty.size ? "сохраняю…" : "сохранено");
    if (BD.role === "tutor") {
      $("bd-share").textContent = res.shared ? "Закрыть доступ" : "Открыть ученику";
      $("bd-share").classList.toggle("on", !!res.shared);
      $("bd-live").hidden = !res.shared;
    }
  } catch (e) {
    changes.forEach(o => BD.dirty.set(o.id, o));
    deletes.forEach(id => BD.deleted.add(id));
    setState("нет связи — рисунок сохранится, когда сеть вернётся", true);
  }
  syncBusy = false;
}

function setState(text, bad) {
  const el = $("bd-state");
  el.textContent = text;
  el.classList.toggle("err", !!bad);
}

/* ---------- инструменты и указатель ---------- */
let drawing = null, panning = null, moving = null, resizing = null;

canvas.addEventListener("pointerdown", e => {
  // Захват указателя — удобство: линия не рвётся, если палец уехал за
  // край экрана. Но он же умеет бросать исключение (указателя уже нет,
  // событие пришло не от «живого» касания), и тогда всё, что ниже,
  // не выполнялось вовсе — рисование просто не начиналось.
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не беда */ }
  const w = toWorld(e.clientX, e.clientY);

  // Средняя кнопка и пробел — всегда перетаскивание полотна
  if (e.button === 1 || e.shiftKey || BD.tool === "hand") {
    panning = { x: e.clientX, y: e.clientY, vx: BD.view.x, vy: BD.view.y };
    canvas.classList.add("grabbing");
    return;
  }

  if (BD.tool === "select") {
    // Уголок выделенного проверяем ДО хит-теста: ручка висит за рамкой
    // объекта, и попадание по ней — это точно про размер, а не про выбор.
    const rz = hitResizeHandle(w.x, w.y);
    if (rz) {
      resizing = { id: rz.id, orig: { ...rz }, b: bounds(rz) };
      return;
    }
    const hit = hitTest(w.x, w.y);
    BD.selected = hit ? hit.id : null;
    if (hit) {
      // Карточка со словом переворачивается по нажатию — это её смысл
      if (hit.kind === "word" && e.detail === 2) {
        put({ ...hit, h: hit.h > 70 ? 62 : 96 });
        return;
      }
      moving = { id: hit.id, dx: w.x, dy: w.y, orig: { ...hit } };
    } else {
      // Двойной тап по пустому месту — указка «смотри сюда»: у второго
      // участника в этой точке пульсирует кольцо. Жест, а не инструмент:
      // на уроке «сюда смотри» нужно мгновенно, без похода в панель.
      if (e.detail === 2) {
        sendPing(w.x, w.y);
        return;
      }
      panning = { x: e.clientX, y: e.clientY, vx: BD.view.x, vy: BD.view.y };
      canvas.classList.add("grabbing");
    }
    paint();
    return;
  }

  if (BD.tool === "eraser") {
    const hit = hitTest(w.x, w.y);
    if (hit) remove(hit.id);
    drawing = { erase: true };
    return;
  }

  if (BD.tool === "pen" || BD.tool === "marker") {
    drawing = {
      id: uid(), kind: BD.tool, color: BD.color, size: BD.size,
      pts: [w.x, w.y], x: 0, y: 0, w: 0, h: 0,
    };
    return;
  }

  if (BD.tool === "note") {
    const o = { id: uid(), kind: "note", x: w.x - 90, y: w.y - 60, w: 180, h: 120,
                color: "note", size: 3, text: "" };
    put(o);
    openEditor(o);
    return;
  }

  if (BD.tool === "text") {
    const o = { id: uid(), kind: "text", x: w.x, y: w.y, w: 420, h: 40,
                color: BD.color, size: BD.size, text: "" };
    put(o);
    openEditor(o);
    return;
  }

  // прямоугольник, овал, стрелка — тянем мышью
  drawing = { id: uid(), kind: BD.tool, x: w.x, y: w.y, w: 0, h: 0,
              color: BD.color, size: BD.size };
});

canvas.addEventListener("pointermove", e => {
  if (panning) {
    BD.userMoved = true;
    BD.view.x = panning.vx + (e.clientX - panning.x);
    BD.view.y = panning.vy + (e.clientY - panning.y);
    paint();
    return;
  }
  const w = toWorld(e.clientX, e.clientY);

  if (resizing) {
    const o = BD.objects.get(resizing.id);
    if (!o) return;
    const b = resizing.b;
    const nw = Math.max(24, w.x - b.x - 6);
    const nh = Math.max(24, w.y - b.y - 6);
    if (o.kind === "image") {
      // Картинку тянем с сохранением пропорций: перекошенное фото
      // на доске никому не нужно, а два ползунка — лишняя возня.
      const k = Math.max(nw / Math.max(1, b.w), nh / Math.max(1, b.h));
      BD.objects.set(o.id, { ...o, x: b.x, y: b.y,
                             w: Math.max(24, b.w * k), h: Math.max(24, b.h * k) });
    } else {
      BD.objects.set(o.id, { ...o, x: b.x, y: b.y, w: nw, h: nh });
    }
    paint();
    return;
  }

  if (moving) {
    const o = BD.objects.get(moving.id);
    if (!o) return;
    const dx = w.x - moving.dx, dy = w.y - moving.dy;
    if (o.kind === "pen" || o.kind === "marker") {
      const pts = moving.orig.pts.slice();
      for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
      BD.objects.set(o.id, { ...o, pts });
    } else {
      BD.objects.set(o.id, { ...o, x: moving.orig.x + dx, y: moving.orig.y + dy });
    }
    paint();
    return;
  }

  if (!drawing) return;
  if (drawing.erase) {
    const hit = hitTest(w.x, w.y);
    if (hit) remove(hit.id);
    return;
  }
  if (drawing.kind === "pen" || drawing.kind === "marker") {
    const n = drawing.pts.length;
    // Не пишем точку, пока рука не сдвинулась заметно: иначе линия
    // из тысячи точек на пару сантиметров, и доска тяжелеет зря.
    if (Math.hypot(w.x - drawing.pts[n - 2], w.y - drawing.pts[n - 1]) > 1.4 / BD.view.k) {
      drawing.pts.push(w.x, w.y);
      BD.objects.set(drawing.id, drawing);
      paint();
    }
    return;
  }
  drawing.w = w.x - drawing.x;
  drawing.h = w.y - drawing.y;
  BD.objects.set(drawing.id, drawing);
  paint();
});

canvas.addEventListener("pointerup", () => {
  canvas.classList.remove("grabbing");
  if (panning) { panning = null; return; }
  if (resizing) {
    const o = BD.objects.get(resizing.id);
    if (o) { pushUndo({ type: "put", before: resizing.orig, id: o.id }); BD.dirty.set(o.id, o); scheduleSync(); }
    resizing = null;
    return;
  }
  if (moving) {
    const o = BD.objects.get(moving.id);
    if (o) { pushUndo({ type: "put", before: moving.orig, id: o.id }); BD.dirty.set(o.id, o); scheduleSync(); }
    moving = null;
    return;
  }
  if (!drawing) return;
  if (drawing.erase) { drawing = null; return; }
  const o = drawing;
  drawing = null;
  if ((o.kind === "pen" || o.kind === "marker") && o.pts.length < 4) {
    BD.objects.delete(o.id); paint(); return;      // случайный тычок
  }
  if (["rect", "ellipse", "arrow", "line"].includes(o.kind)
      && Math.abs(o.w) < 4 && Math.abs(o.h) < 4) {
    BD.objects.delete(o.id); paint(); return;
  }
  put(o);
});

/* Колесо: зум к курсору, а не к центру — иначе нужное место убегает. */
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const factor = e.ctrlKey ? 1 - e.deltaY * 0.01 : 1 - e.deltaY * 0.0016;
  zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

function zoomAt(sx, sy, factor) {
  BD.userMoved = true;
  const k = Math.max(0.15, Math.min(5, BD.view.k * factor));
  const before = toWorld(sx, sy);
  BD.view.k = k;
  const after = toWorld(sx, sy);
  BD.view.x += (after.x - before.x) * k;
  BD.view.y += (after.y - before.y) * k;
  $("bd-zoom").textContent = Math.round(k * 100) + "%";
  paint();
}

/* Два пальца: масштаб и сдвиг одновременно — как в любой карте. */
let pinch = null;
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 2) {
    drawing = null;
    const [a, b] = e.touches;
    pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
              x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }
}, { passive: true });
canvas.addEventListener("touchmove", e => {
  if (e.touches.length === 2 && pinch) {
    e.preventDefault();
    const [a, b] = e.touches;
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
    BD.view.x += cx - pinch.x;
    BD.view.y += cy - pinch.y;
    zoomAt(cx, cy, d / pinch.d);
    pinch = { d, x: cx, y: cy };
  }
}, { passive: false });
canvas.addEventListener("touchend", () => { pinch = null; }, { passive: true });

/* ---------- ввод текста ---------- */
let editing = null;
function openEditor(o) {
  editing = o;
  const box = $("bd-editor"), input = $("bd-editor-input");
  box.hidden = false;
  input.value = o.text || "";
  input.focus();
  input.select();
}
$("bd-editor-ok").addEventListener("click", () => {
  if (!editing) return;
  const text = $("bd-editor-input").value.trim();
  if (!text) remove(editing.id, false);
  else put({ ...BD.objects.get(editing.id), text });
  $("bd-editor").hidden = true;
  editing = null;
});
$("bd-editor-cancel").addEventListener("click", () => {
  if (editing && !(BD.objects.get(editing.id) || {}).text) remove(editing.id, false);
  $("bd-editor").hidden = true;
  editing = null;
});
$("bd-editor-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) $("bd-editor-ok").click();
  if (e.key === "Escape") $("bd-editor-cancel").click();
});

/* ---------- панели ---------- */
function buildStyleBar() {
  const colors = $("bd-colors");
  COLORS.concat(NOTE_COLORS).forEach(name => {
    const b = document.createElement("button");
    // Помечаем, к чему цвет: чернила рисуют линию, бумага красит стикер.
    // Раньше все девять кружков лежали вперемешку, и выбрать «жёлтый»
    // для ручки было нельзя — он оказывался цветом стикера.
    b.dataset.kind = NOTE_COLORS.includes(name) ? "note" : "ink";
    b.className = "bd-swatch" + (name === BD.color ? " active" : "");
    b.style.background = cssColor(name);
    b.title = name;
    b.addEventListener("click", () => {
      BD.color = name;
      document.querySelectorAll(".bd-swatch").forEach(x => x.classList.toggle("active", x === b));
      // Цвет применяется и к выделенному объекту: иначе пришлось бы
      // стирать и рисовать заново.
      if (BD.selected && BD.objects.has(BD.selected)) {
        put({ ...BD.objects.get(BD.selected), color: name });
      }
    });
    colors.appendChild(b);
  });
  const sizes = $("bd-sizes");
  [2, 4, 8, 14].forEach(px => {
    const b = document.createElement("button");
    b.className = "bd-size" + (px === BD.size ? " active" : "");
    b.innerHTML = `<i style="width:${Math.min(px + 2, 16)}px;height:${Math.min(px + 2, 16)}px"></i>`;
    b.title = px + " px";
    b.addEventListener("click", () => {
      BD.size = px;
      document.querySelectorAll(".bd-size").forEach(x => x.classList.toggle("active", x === b));
      if (BD.selected && BD.objects.has(BD.selected)) {
        put({ ...BD.objects.get(BD.selected), size: px });
      }
    });
    sizes.appendChild(b);
  });
}

/* Какие настройки нужны инструменту.
 *
 * У ластика и выделения нет ни цвета, ни толщины — показывать их значит
 * предлагать выбор, который ни на что не влияет. У стикера цвет есть,
 * но это цвет бумаги, а не чернил, и толщина ему не нужна. */
const TOOL_STYLE = {
  select:  { colors: null,  sizes: false },
  eraser:  { colors: null,  sizes: false },
  note:    { colors: "note", sizes: false },
  text:    { colors: "ink", sizes: false },
  pen:     { colors: "ink", sizes: true },
  marker:  { colors: "ink", sizes: true },
  rect:    { colors: "ink", sizes: true },
  ellipse: { colors: "ink", sizes: true },
  arrow:   { colors: "ink", sizes: true },
};

function syncStyleBar() {
  const conf = TOOL_STYLE[BD.tool] || TOOL_STYLE.pen;
  const box = $("bd-style");
  box.hidden = !conf.colors && !conf.sizes;
  $("bd-colors").hidden = !conf.colors;
  $("bd-sizes").hidden = !conf.sizes;
  document.querySelectorAll(".bd-swatch").forEach(sw => {
    sw.hidden = sw.dataset.kind !== conf.colors;
  });
  // Инструмент сменился, а выбранный цвет из чужого набора — берём
  // первый подходящий, иначе рисовали бы цветом бумаги по холсту.
  const list = conf.colors === "note" ? NOTE_COLORS : COLORS;
  if (conf.colors && !list.includes(BD.color)) {
    BD.color = list[0];
    document.querySelectorAll(".bd-swatch").forEach(sw =>
      sw.classList.toggle("active", sw.title === BD.color));
  }
}

document.querySelectorAll(".bd-tool[data-tool]").forEach(b => {
  b.addEventListener("click", () => {
    BD.tool = b.dataset.tool;
    document.querySelectorAll(".bd-tool[data-tool]").forEach(x => x.classList.toggle("active", x === b));
    canvas.classList.toggle("picking", BD.tool === "select");
    syncStyleBar();
  });
});

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  const map = { v: "select", p: "pen", m: "marker", e: "eraser", s: "note",
                t: "text", r: "rect", o: "ellipse", a: "arrow" };
  const key = e.key.toLowerCase();
  if (map[key]) {
    document.querySelector(`.bd-tool[data-tool="${map[key]}"]`).click();
  }
  if (key === "w") $("bd-words").click();
  if ((e.ctrlKey || e.metaKey) && key === "z") { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
  if ((e.key === "Delete" || e.key === "Backspace") && BD.selected) { e.preventDefault(); remove(BD.selected); }
});

$("bd-undo").addEventListener("click", doUndo);
$("bd-redo").addEventListener("click", doRedo);
$("bd-zoom-in").addEventListener("click", () => zoomAt(innerWidth / 2, innerHeight / 2, 1.2));
$("bd-zoom-out").addEventListener("click", () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2));
$("bd-zoom").addEventListener("click", () => {
  BD.view = { x: 0, y: 0, k: 1 };
  $("bd-zoom").textContent = "100%";
  paint();
});
$("bd-fit").addEventListener("click", fitToContent);

function fitToContent() {
  const list = [...BD.objects.values()].filter(o => !isService(o));
  if (!list.length) return;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  list.forEach(o => {
    const b = bounds(o);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  });
  // Панели плавают поверх полотна, поэтому «весь экран» — это не весь
  // экран. Отступы МЕРЯЕМ по факту, а не задаём числами: раскладка
  // меняется от ширины и поворота экрана (на планшете док уезжает вниз,
  // список слов становится выдвижным ящиком), и зашитые константы врали —
  // после «показать всё» содержимое пряталось под открытой панелью.
  const free = { L: 16, R: 16, T: 16, B: 16 };
  [".bd-top", ".bd-bottom", ".bd-dock", ".bd-panel"].forEach(sel => {
    const el = document.querySelector(sel);
    if (!el || el.hidden || !el.offsetParent) return;
    const b = el.getBoundingClientRect();
    if (b.width > innerWidth * 0.6) {
      // Широкая панель — значит прижата к верху или к низу
      if (b.top < innerHeight / 2) free.T = Math.max(free.T, b.bottom + 12);
      else free.B = Math.max(free.B, innerHeight - b.top + 12);
    } else {
      // Узкая — прижата к левому или правому краю
      if (b.left < innerWidth / 2) free.L = Math.max(free.L, b.right + 12);
      else free.R = Math.max(free.R, innerWidth - b.left + 12);
    }
  });
  const L = free.L, R = free.R, TOP = free.T, BOT = free.B;
  const availW = Math.max(200, innerWidth - L - R);
  const availH = Math.max(200, innerHeight - TOP - BOT);
  const k = Math.max(0.15, Math.min(2, Math.min(
    availW / Math.max(1, x2 - x1),
    availH / Math.max(1, y2 - y1))));
  BD.view.k = k;
  BD.view.x = L + availW / 2 - ((x1 + x2) / 2) * k;
  BD.view.y = TOP + availH / 2 - ((y1 + y2) / 2) * k;
  $("bd-zoom").textContent = Math.round(k * 100) + "%";
  paint();
}

/* Очистка — в два нажатия: доска это конспект урока. */
let clearArmed = false;
$("bd-clear").addEventListener("click", async () => {
  if (!clearArmed) {
    // Кнопка теперь с иконкой, и textContent затирал бы её насовсем.
    // Взводим классом, а предупреждение говорим словами в тосте.
    clearArmed = true;
    $("bd-clear").classList.add("armed");
    toast("Нажми ещё раз, чтобы стереть всю доску.");
    setTimeout(() => { clearArmed = false; $("bd-clear").classList.remove("armed"); }, 4000);
    return;
  }
  clearArmed = false;
  $("bd-clear").classList.remove("armed");
  if (BD.role === "tutor") {
    await api("/api/board/update", { token: BD.token, boardId: BD.boardId, action: "clear" });
    BD.objects.clear();
    BD.rev = 0;
    paint();
    syncNow();
  } else {
    toast("Очистить доску может только репетитор.");
  }
});

$("bd-theme").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("savelyTheme", next); } catch (e) { /* приватный режим */ }
  paint();
});

/* Скачать картинкой: конспект урока можно отправить ученику в чат. */
$("bd-png").addEventListener("click", () => {
  const list = [...BD.objects.values()];
  if (!list.length) { toast("Доска пустая."); return; }
  const saveView = { ...BD.view };
  fitToContent();
  draw();
  canvas.toBlob(blob => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ($("bd-name").textContent || "доска").trim() + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    BD.view = saveView;
    paint();
  });
});

/* ---------- указка ---------- */
function sendPing(x, y) {
  const o = { id: "ping-" + uid(), kind: "ping", x, y, w: 0, h: 0,
              color: "red", size: 3 };
  put(o, false);                             // жест не попадает в отмену
  // Убираем за собой: у второго участника кольцо погаснет само по
  // времени, а надгробие не даст объекту скапливаться в базе.
  setTimeout(() => remove(o.id, false), 4000);
}

/* ---------- картинки на доску ----------
   Три пути один в один как в мессенджерах: кнопка в панели, Ctrl+V
   из буфера, перетащить файл на полотно. На уроке это фотография
   упражнения из учебника — ученик снял страницу, кинул на доску,
   и разбираем прямо поверх неё.

   Жмём на клиенте до ~тысячи точек по длинной стороне и в JPEG:
   доска ограничена по весу (сервер: BOARD_MAX_BYTES), а для разбора
   задания хватает и такого качества. */
async function addImageFile(file, at) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = await new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = bad;
    r.readAsDataURL(file);
  }).catch(() => null);
  if (!url) { toast("Не смог прочитать файл."); return; }
  const img = new Image();
  const loaded = await new Promise(ok => {
    img.onload = () => ok(true);
    img.onerror = () => ok(false);
    img.src = url;
  });
  if (!loaded) { toast("Это не похоже на картинку."); return; }

  // Сжимаем итерациями: сначала мягко, и только если data-URL всё ещё
  // толще лимита — жёстче. Обычной фотографии хватает первого захода.
  let side = 1100, quality = 0.82, src = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const k = Math.min(1, side / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const cc = c.getContext("2d");
    cc.fillStyle = "#fff";                   // JPEG не умеет прозрачность
    cc.fillRect(0, 0, c.width, c.height);
    cc.drawImage(img, 0, 0, c.width, c.height);
    src = c.toDataURL("image/jpeg", quality);
    if (src.length < 600000) break;
    side *= 0.7; quality = Math.max(0.5, quality - 0.12);
  }
  if (src.length >= 700000) { toast("Картинка слишком тяжёлая даже после сжатия."); return; }

  // Ставим по центру экрана (или в точку сброса), шириной ~420 мировых
  const ratio = img.height / img.width;
  const w = Math.min(420, img.width);
  const point = at || toWorld(innerWidth / 2, innerHeight / 2);
  const o = { id: uid(), kind: "image", x: point.x - w / 2, y: point.y - (w * ratio) / 2,
              w, h: w * ratio, color: "ink", size: 3, src };
  put(o);
  // Сразу в режим выделения: картинку обычно тут же двигают и растягивают
  BD.selected = o.id;
  const sel = document.querySelector('.bd-tool[data-tool="select"]');
  if (sel) sel.click(); else BD.tool = "select";
  paint();
}

$("bd-img").addEventListener("click", () => $("bd-img-file").click());
$("bd-img-file").addEventListener("change", e => {
  addImageFile(e.target.files && e.target.files[0]);
  e.target.value = "";                       // тот же файл можно выбрать снова
});
document.addEventListener("paste", e => {
  if (!e.clipboardData) return;
  if (editing) return;                       // в поле текста вставляется текст
  const item = [...e.clipboardData.items].find(x => x.type.startsWith("image/"));
  if (item) { e.preventDefault(); addImageFile(item.getAsFile()); }
});
canvas.addEventListener("dragover", e => e.preventDefault());
canvas.addEventListener("drop", e => {
  e.preventDefault();
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) addImageFile(f, toWorld(e.clientX, e.clientY));
});

/* ---------- фон доски ---------- */
const BG_ORDER = ["dots", "grid", "lines", "clean"];
const BG_NAMES = { dots: "точки", grid: "клетка", lines: "линейка", clean: "чистый" };
$("bd-bg").addEventListener("click", () => {
  const next = BG_ORDER[(BG_ORDER.indexOf(bgMode()) + 1) % BG_ORDER.length];
  // Фиксированный id: у доски один фон, и меняется он на месте
  put({ id: "board-bg", kind: "bg", x: 0, y: 0, w: 0, h: 0,
        color: "ink", size: 3, text: next }, false);
  toast("Фон: " + BG_NAMES[next]);
});

/* ---------- слова ученика ---------- */
$("bd-words").addEventListener("click", () => {
  const panel = $("bd-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden && !BD.students.length) loadStudents();
});
$("bd-panel-close").addEventListener("click", () => { $("bd-panel").hidden = true; });
$("bd-search").addEventListener("input", renderWords);
$("bd-student").addEventListener("change", () => loadWords($("bd-student").value));

async function loadStudents() {
  if (BD.role !== "tutor") {
    // Ученику показываем его собственный словарь — он лежит в браузере
    $("bd-student").hidden = true;
    try {
      const st = JSON.parse(localStorage.getItem("savelyState") || "{}");
      BD.words = (st.dictionary || []).map(d => ({ w: d.w, t: d.t }));
    } catch (e) { BD.words = []; }
    renderWords();
    return;
  }
  const res = await api("/api/tutor/students", { token: BD.token });
  if (!res.ok) { $("bd-words-hint").textContent = "Не удалось загрузить учеников."; return; }
  BD.students = res.students || [];
  const sel = $("bd-student");
  // words у ученика — это разбивка по статусам, а не число: в подпись
  // берём общее количество, иначе в списке стоит «[object Object] слов».
  const total = s => (s.words && typeof s.words === "object" ? s.words.total : s.words) || 0;
  sel.innerHTML = BD.students.map(s =>
    `<option value="${s.id}">${esc(s.name)} — ${total(s)} ${wordsPlural(total(s))}</option>`).join("");
  if (BD.students.length) loadWords(BD.students[0].id);
  else $("bd-words-hint").textContent = "У вас пока нет учеников.";
}

async function loadWords(studentId) {
  const res = await api("/api/tutor/student", { token: BD.token, studentId: Number(studentId) });
  if (!res.ok) { BD.words = []; renderWords(); return; }
  BD.words = (res.student.dictionary || []).map(d => ({ w: d.w, t: d.t }));
  renderWords();
}

function renderWords() {
  const q = $("bd-search").value.trim().toLowerCase();
  const list = BD.words.filter(x =>
    !q || x.w.toLowerCase().includes(q) || (x.t || "").toLowerCase().includes(q)).slice(0, 300);
  const box = $("bd-word-list");
  box.innerHTML = list.length
    ? list.map((x, i) => `<button class="bd-word" data-i="${i}"><b>${esc(x.w)}</b><span>${esc(x.t || "")}</span></button>`).join("")
    : `<p class="bd-hint">Ничего не нашлось.</p>`;
  box.querySelectorAll("[data-i]").forEach(b => {
    b.addEventListener("click", () => {
      const x = list[+b.dataset.i];
      dropWordCard(x);
    });
  });
}

function wordsPlural(n) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return "слов";
  if (b > 1 && b < 5) return "слова";
  if (b === 1) return "слово";
  return "слов";
}

/** Карточка кладётся в центр видимой области и чуть в сторону от
 *  предыдущей — иначе десять слов подряд лягут одно на другое. */
let dropN = 0;
function dropWordCard(x) {
  const c = toWorld(innerWidth / 2, innerHeight / 2);
  const step = 26;
  const o = {
    id: uid(), kind: "word",
    x: c.x - 90 + (dropN % 5) * step, y: c.y - 40 + Math.floor(dropN / 5) * step,
    w: 200, h: 62, color: "green", size: 3,
    text: x.w, text2: x.t || "",
  };
  dropN++;
  put(o);
  toast("«" + x.w + "» на доске. Двойное нажатие — открыть перевод.");
}

/* ---------- доступ ученику ---------- */
$("bd-share").addEventListener("click", async () => {
  const on = !$("bd-share").classList.contains("on");
  const res = await api("/api/board/update", {
    token: BD.token, boardId: BD.boardId, action: "share", shared: on,
  });
  if (!res.ok) { toast(res.error || "Не получилось."); return; }
  $("bd-share").classList.toggle("on", on);
  $("bd-share").textContent = on ? "Закрыть доступ" : "Открыть ученику";
  $("bd-live").hidden = !on;
  toast(on ? "Ученики видят доску и могут рисовать." : "Доступ закрыт.");
});

/** Объяснение вместо пустого полотна: когда доски нет, ученик должен
 *  понимать почему, а не смотреть в серую сетку. */
function showEmpty(title, note) {
  // Рисовать не на чем: инструменты и зум только сбивают с толку.
  ["bd-dock", "bd-bottom"].forEach(id => {
    const el = document.getElementById(id) || document.querySelector("." + id);
    if (el) el.hidden = true;
  });
  document.querySelectorAll(".bd-dock, .bd-bottom").forEach(el => el.hidden = true);
  const box = document.createElement("div");
  box.className = "bd-empty";
  box.innerHTML = `<b></b><p></p>`;
  box.querySelector("b").textContent = title;
  box.querySelector("p").textContent = note;
  document.body.appendChild(box);
}

/** Ждать, пока репетитор откроет доску, и войти в неё сам.
 *
 *  Перезагружаем страницу целиком, а не достраиваем состояние на лету:
 *  доска в этот момент пустая и ничего не потеряется, зато запуск идёт
 *  ровно тем же путём, что и обычно, — без второй ветки, которая живёт
 *  своей жизнью и ломается молча. */
function waitForBoard(token) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const res = await api("/api/student/board", { token });
      if (res.ok && res.board) { stopped = true; location.reload(); return; }
    } catch (e) { /* нет связи — просто попробуем ещё раз */ }
    setTimeout(tick, 5000);
  };
  setTimeout(tick, 5000);
  // Вкладку могли открыть заранее и свернуть: при возвращении спросим
  // сразу, не дожидаясь следующего круга.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !stopped) tick();
  });
}

/* ---------- запуск ---------- */
async function boot() {
  fitCanvas();
  buildStyleBar();
  syncStyleBar();                 // стартовый инструмент — выделение, настройки прячем
  if (typeof paintIcons === "function") paintIcons();
  addEventListener("resize", fitCanvas);

  const params = new URLSearchParams(location.search);
  const tutorToken = localStorage.getItem("savelyTutorToken") || "";
  const studentToken = localStorage.getItem("savelyStudentToken") || "";

  if (tutorToken && params.get("id")) {
    BD.role = "tutor";
    BD.token = tutorToken;
    BD.boardId = Number(params.get("id"));
    $("bd-share").hidden = false;
    $("bd-back").href = "tutor.html";
  } else if (studentToken) {
    BD.role = "student";
    BD.token = studentToken;
    $("bd-back").href = "index.html";
    // Очистка доски — только репетитору. Раньше кнопка была видна всем
    // и на нажатие отвечала «может только репетитор»: кнопка, которая
    // существует, чтобы отказать, хуже отсутствующей.
    $("bd-clear").hidden = true;
    const res = await api("/api/student/board", { token: studentToken });
    if (!res.ok || !res.board) {
      // Две разные причины, и путать их нельзя: одиночка может ждать
      // вечно, доска бывает только на уроке с репетитором.
      if (res.ok && !res.hasTutor) {
        $("bd-name").textContent = "Доска";
        setState("доска бывает на уроке с репетитором", true);
        showEmpty("Доска — это общий лист на уроке.",
                  "Она появится, когда ты начнёшь заниматься с репетитором: "
                  + "он откроет доску, и вы будете писать на ней вдвоём.");
      } else {
        $("bd-name").textContent = "Доска закрыта";
        setState("репетитор ещё не открыл доску", true);
        showEmpty("Репетитор ещё не открыл доску.",
                  "Она откроется сама, когда начнётся урок, — эту страницу "
                  + "можно не перезагружать.");
        // И это должно быть правдой. Раньше здесь стоял просто выход:
        // страница обещала открыться сама, а никакого опроса не было —
        // ученик сидел перед ней весь урок и ждал. Теперь спрашиваем
        // раз в пять секунд: нагрузка копеечная (одна строка из базы),
        // зато обещание выполняется.
        waitForBoard(studentToken);
      }
      return;
    }
    BD.boardId = res.board.id;
    $("bd-name").textContent = res.board.title;
  } else {
    setState("сначала войдите в свой кабинет", true);
    return;
  }

  await syncNow();
  // Два кадра ожидания: к этому моменту раскладка уже посчитана
  // и innerWidth настоящий, а не промежуточный.
  requestAnimationFrame(() => requestAnimationFrame(fitToContent));
  // Опрос: чужие штрихи должны появляться сами, без перезагрузки.
  setInterval(syncNow, 1200);
  requestAnimationFrame(function loop() { draw(); requestAnimationFrame(loop); });
}

boot();
