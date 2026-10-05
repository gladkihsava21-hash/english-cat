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
  selectedSet: new Set(),  // мультивыделение (рамка), см. selIds()
  dirty: new Map(),    // что отправить на сервер
  deleted: new Set(),
  undo: [],
  redo: [],
  students: [],
  words: [],
  userMoved: false,      // трогал ли человек масштаб и сдвиг сам
  needsPaint: true,
  laser: null,           // точка лазерной указки {x,y} в ЭКРАННЫХ координатах;
                         // живёт только здесь: не объект доски, не синхронизация
};

const $ = id => document.getElementById(id);
const canvas = $("board-canvas");
// let, а не const: экспорт в PNG временно подменяет контекст на
// офскринный (см. bd-png) — иначе снимок шёл бы с живого полотна и
// гонялся за перерисовкой.
let ctx = canvas.getContext("2d");

/* ---------- цвета ----------
   Значения лежат в css/tokens.css: одно место на весь проект, и ночная
   тема меняет их сама. Здесь только имена. */
const COLORS = ["ink", "red", "blue", "green", "orange", "violet"];
// Бумага стикера: жёлтый, зелёный, розовый, голубой, фиолетовый
// (+ «свой» из пикера). Раньше стикер был жёлтым всегда — цвет
// существовал только у трёх, и создание его игнорировало (владелец).
const NOTE_COLORS = ["note", "note2", "note3", "note4", "note5"];
// Маркер — свой набор. Чернила ручки под полупрозрачной широкой полосой
// превращали подчёркнутое слово в тёмное пятно; текстовыделителю нужны
// светлые яркие краски (просьба владельца).
const MARK_COLORS = ["mark1", "mark2", "mark3", "mark4", "mark5"];
const cssColor = name => {
  // Свой цвет из пикера приходит hex-ом. Правило «цвета только из
  // tokens.css» оно не нарушает: то правило про стили интерфейса,
  // а выбранные человеком чернила — ДАННЫЕ рисунка, как src картинки,
  // которую он сам положил на доску.
  if (String(name).startsWith("#")) return name;
  return getComputedStyle(document.documentElement)
    .getPropertyValue("--bd-" + name).trim() || "#000";
};

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

// Предел ожидания ответа. Без него запрос к подвисшему хостингу висел
// вечно: syncBusy оставался поднятым, опрос молчал, и доска не оживала
// даже когда связь возвращалась — только перезагрузка. 20 секунд с
// запасом: самый долгий вызов доски — страница PDF-книжки, и та
// укладывается в несколько.
// window.BD_API_TIMEOUT_MS задаёт только стенд (tools/dom-tests), чтобы не
// ждать двадцать секунд в каждом прогоне; в браузере его нет.
const API_TIMEOUT_MS = Number(window.BD_API_TIMEOUT_MS) || 20000;
// Пауза между попытками ученика узнать свою доску, когда сервер молчит.
const STUDENT_RETRY_MS = Number(window.BD_STUDENT_RETRY_MS) || 3000;

async function api(path, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      signal: ctl.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
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
/* w/h — параметрами, а не innerWidth напрямую: экспорт в PNG рисует этой
   же функцией в офскрин размером с содержимое (см. bd-png). */
function draw(w = innerWidth, h = innerHeight) {
  if (!BD.needsPaint) return;
  BD.needsPaint = false;
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
  if (BD.selectedSet.size > 1) {
    // Мультивыделение: тонкая рамка у каждого + общая рамка группы (Miro)
    BD.selectedSet.forEach(id => {
      const o = BD.objects.get(id);
      if (o) drawSelection(o, true);
    });
    const uni = unionBounds();
    if (uni) {
      ctx.strokeStyle = cssColor("blue");
      ctx.lineWidth = 1.5 / BD.view.k;
      ctx.strokeRect(uni.x - 10, uni.y - 10, uni.w + 20, uni.h + 20);
    }
  } else if (BD.selected && BD.objects.has(BD.selected)) {
    drawSelection(BD.objects.get(BD.selected));
  }
  // Рамка-мультивыделение, которую тянут прямо сейчас
  if (banding) {
    const b = normBand(banding);
    ctx.strokeStyle = cssColor("blue");
    ctx.lineWidth = 1.5 / BD.view.k;
    ctx.setLineDash([6 / BD.view.k, 4 / BD.view.k]);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
  }
  ctx.restore();
  // Указка анимируется по времени — доска перерисовывается, пока та жива
  for (const o of BD.objects.values()) {
    if (o.kind === "ping" && (performance.now() - (PING_SEEN.get(o.id) || performance.now())) < PING_MS) {
      BD.needsPaint = true;
      break;
    }
  }
  updateBookBar();
  updateWordbar();
  updateMiniPanel();
  // Реакции-эмодзи поверх всего: всплывают вверх и тают ~3,5 с.
  // Временное, как пинг с лазером, — в объекты не складываем.
  if (BD.reacts.length) {
    const now = performance.now();
    BD.reacts = BD.reacts.filter(r => now - r.t0 < 3500);
    for (const r of BD.reacts) {
      const age = (now - r.t0) / 1000;
      ctx.globalAlpha = Math.max(0, age < 2.5 ? 1 : (3.5 - age));
      ctx.font = `${Math.round(30 * BD.view.k)}px system-ui, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(r.emoji,
        r.x * BD.view.k + BD.view.x - 15 * BD.view.k,
        (r.y - age * 30) * BD.view.k + BD.view.y);
    }
    ctx.globalAlpha = 1;
    if (BD.reacts.length) BD.needsPaint = true;   // анимируются по времени
  }
  /* Лазерная указка — последним слоем, поверх всего. Своя точка — это
     НЕ объект доски: в BD.objects не попадает, в синхронизацию и отмену
     не уезжает (второй участник видит её через поле laser в ответе
     синхронизации — см. syncNow). Не путать с ping: пинг — общий и
     гаснет сам, лазер живёт, пока активен инструмент. Точка статичная
     (без анимации), поэтому цикл перерисовки не форсируем: кадр придёт
     от pointermove. */
  const drawLaserDot = (sx, sy, colorName, label) => {
    ctx.fillStyle = cssColor(colorName);
    ctx.globalAlpha = 0.28;                 // ореол, чтобы точку было видно и на светлом, и на картинке
    ctx.beginPath();
    ctx.arc(sx, sy, 12, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(sx, sy, 4.5, 0, 7);
    ctx.fill();
    if (label) {
      ctx.font = "700 11px Inter, system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillText(label, sx + 10, sy + 12);
    }
  };
  if (BD.tool === "laser" && BD.laser) {
    drawLaserDot(BD.laser.x, BD.laser.y, "rec");
  }
  // Лазер второй стороны: приехал в ответе синхронизации, живёт пару
  // секунд. Цвет по стороне — у учителя красный, у ученика синий, —
  // и подпись, чья точка (владелец: «точка только для себя»).
  if (BD.remoteLaser && performance.now() - BD.remoteLaser.seen < 2600) {
    const r = BD.remoteLaser;
    const sx = r.x * BD.view.k + BD.view.x, sy = r.y * BD.view.k + BD.view.y;
    const fromTutor = String(r.by || "").startsWith("t");
    drawLaserDot(sx, sy, fromTutor ? "rec" : "blue",
                 fromTutor ? "учитель" : "ученик");
  } else if (BD.remoteLaser) {
    BD.remoteLaser = null;
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

/* ---------- страницы книжек ----------
   В объекте книги нет картинки — только bookId и номер страницы.
   Каждый клиент просит страницу у сервера сам и держит в кэше: листание
   для доски — это апдейт двух чисел, а JPEG едет один раз. */
const BOOK_CACHE = new Map();   // "bookId:page" -> { img | null (грузится) }
function bookPageFor(o) {
  const key = o.bookId + ":" + o.page;
  const rec = BOOK_CACHE.get(key);
  if (rec) {
    // Неудачную попытку повторяем не раньше чем через полминуты.
    if (rec.failedAt && performance.now() - rec.failedAt > 30000) {
      BOOK_CACHE.delete(key);
    } else {
      return rec.img && rec.img.complete ? rec.img : null;
    }
  }
  BOOK_CACHE.set(key, { img: null });
  api("/api/book/page", { token: BD.token, bookId: o.bookId, page: o.page })
    .then(res => {
      if (!res.ok) {
        // Помечаем неудачу и НЕ стираем запись.
        //
        // Раньше тут стоял BOOK_CACHE.delete(key), и это устраивало
        // лавину: paint() зовёт bookPageFor на каждой отрисовке, запись
        // исчезла — значит запрос уходит заново, и так по кругу десятки
        // раз в секунду. Достаточно было моргнуть сети или получить одну
        // ошибку от сервера, чтобы доска начала долбить его без остановки.
        //
        // Через полминуты пробуем ещё раз: страница могла не отдаться
        // из-за временного сбоя, и запирать книгу навсегда тоже нельзя.
        BOOK_CACHE.set(key, { img: null, failedAt: performance.now() });
        return;
      }
      const img = new Image();
      img.onload = paint;
      img.src = res.src;
      BOOK_CACHE.set(key, { img });
      // Пока читают эту, тихо попросим следующую: листание вперёд —
      // обычный ход урока, и страница уже будет тёплой.
      if (o.page < (o.pages || 1) && !BOOK_CACHE.has(o.bookId + ":" + (o.page + 1))) {
        const ahead = { ...o, page: o.page + 1 };
        setTimeout(() => bookPageFor(ahead), 800);
      }
    })
    .catch(() => BOOK_CACHE.delete(key));
  return null;
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

  if (o.kind === "book") {
    ctx.save();
    ctx.fillStyle = cssColor("paper");
    ctx.strokeStyle = cssColor("grid");
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRect(o.x, o.y, o.w, o.h, 8);
    ctx.fill();
    ctx.stroke();
    const img = bookPageFor(o);
    if (img) {
      ctx.beginPath();
      roundRect(o.x, o.y, o.w, o.h, 8);
      ctx.clip();
      // Вписываем страницу целиком, без растяжения: поля лучше
      // обрезанной строчки задания.
      const k = Math.min(o.w / img.width, o.h / img.height);
      const dw = img.width * k, dh = img.height * k;
      ctx.drawImage(img, o.x + (o.w - dw) / 2, o.y + (o.h - dh) / 2, dw, dh);
    } else {
      ctx.fillStyle = cssColor("grid");
      ctx.font = "400 14px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("страница грузится…", o.x + o.w / 2, o.y + o.h / 2);
      ctx.textAlign = "start";
    }
    ctx.restore();
    // Подпись под страницей: что за книга и где мы в ней
    ctx.fillStyle = cssColor("grid");
    ctx.font = "400 12px Inter, system-ui, sans-serif";
    ctx.fillText((o.text ? o.text + " · " : "") + "стр. " + o.page + " / " + (o.pages || 1),
                 o.x + 4, o.y + o.h + 16);
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
    // Цвет — из объекта: бумага из палитры (note…note5) или свой hex
    // (cssColor сам различает токен и данные рисунка)
    ctx.fillStyle = cssColor(o.color || "note");
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
    drawText(o.text || "", o.x, o.y, o.w || 460, textLH(o.size), color, "600");
    return;
  }

  if (o.kind === "task") {
    // Задание: репетитор кладёт на доску, ученик нажимает — тренировка
    // открывается в НОВОЙ вкладке, звонок и доска остаются жить здесь.
    ctx.fillStyle = cssColor("paper");
    ctx.strokeStyle = cssColor("blue");
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    roundRect(o.x, o.y, o.w, o.h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = cssColor("blue");
    ctx.font = '800 13px Inter, system-ui, sans-serif';
    ctx.textBaseline = "top";
    ctx.fillText("ЗАДАНИЕ", o.x + 16, o.y + 12);
    ctx.fillStyle = cssColor("ink");
    ctx.font = '700 21px Nunito, system-ui, sans-serif';
    ctx.fillText(o.text || "", o.x + 16, o.y + 30);
    if (o.result) {
      // Ученик прошёл: карточка сама показывает итог обоим участникам
      ctx.fillStyle = cssColor("green");
      ctx.font = '700 14px Inter, system-ui, sans-serif';
      ctx.fillText(o.result, o.x + 16, o.y + 60);
    } else {
      ctx.fillStyle = cssColor("grid");
      ctx.font = '400 13px Inter, system-ui, sans-serif';
      ctx.fillText(BD.role === "student" ? "нажми — откроется в новой вкладке"
                                         : "ученик нажмёт и начнёт", o.x + 16, o.y + 60);
    }
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
  let ty = y;
  // Абзацы: Enter в редакторе — это \n, и он ОБЯЗАН остаться абзацем
  // на доске. Раньше split(/\s+/) съедал переносы вместе с пробелами,
  // и стикер превращал любой список в сплошную строку.
  for (const para of String(text).split("\n")) {
    let line = "";
    const words = para.split(/[ \t]+/).filter(Boolean);
    if (!words.length) { ty += lh; continue; }   // пустая строка = отступ
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, ty);
        ty += lh;
        line = word;
      } else line = test;
    }
    if (line) { ctx.fillText(line, x, ty); ty += lh; }
  }
}

/** У каких объектов есть смысл тянуть размер за уголок. Линии и штрихи
 *  не растягиваем: у них «размер» — это сама геометрия. */
const resizable = o => ["image", "rect", "ellipse", "note", "word", "book"].includes(o.kind);

function drawSelection(o, group = false) {
  const b = bounds(o);
  ctx.strokeStyle = cssColor("green");
  ctx.lineWidth = 1.5 / BD.view.k;
  ctx.setLineDash([6 / BD.view.k, 4 / BD.view.k]);
  ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
  ctx.setLineDash([]);
  // В групповом выделении ручки размера не рисуем: растягивать будем
  // за рамку ОДНОГО объекта, а не группу — иначе путаница.
  if (!group && resizable(o) && !o.locked) {
    // Уголок-ручка: квадратик в правом нижнем углу рамки
    const r = 7 / BD.view.k;
    ctx.fillStyle = cssColor("green");
    ctx.fillRect(b.x + b.w + 6 - r, b.y + b.h + 6 - r, r * 2, r * 2);
  }
  if (lockable(o)) drawLockButton(o);
}

/** Замок на рамке выделения. Закреплённый объект не двигается, не
 *  тянется, не стирается ластиком и не удаляется — пока замок не снят.
 *  Любой объект, кроме служебных (пинг, фон): фигуры, стикеры, текст,
 *  карточки, картинки, книги. Ставит и снимает замок только учитель —
 *  проверка при нажатии (см. pointerdown) и на сервере (db.board_sync). */
const lockable = o => !isService(o);

function lockButtonPos(o) {
  const b = bounds(o);
  return { x: b.x - 6, y: b.y - 6 };     // левый верхний угол рамки
}

function drawLockButton(o) {
  const p = lockButtonPos(o);
  const r = 9 / BD.view.k;
  ctx.fillStyle = o.locked ? cssColor("green") : cssColor("paper");
  ctx.strokeStyle = cssColor("green");
  ctx.lineWidth = 1.6 / BD.view.k;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, 7);
  ctx.fill(); ctx.stroke();
  // сам замочек: корпус + дужка
  const ink = o.locked ? cssColor("paper") : cssColor("green");
  const u = r / 9;
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = 1.6 * u;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 1.5 * u, 3 * u, Math.PI, 0);   // дужка
  ctx.stroke();
  ctx.fillRect(p.x - 3.6 * u, p.y - 1 * u, 7.2 * u, 5.4 * u);  // корпус
}

function hitLockButton(wx, wy) {
  if (!BD.selected) return null;
  const o = BD.objects.get(BD.selected);
  if (!o || !lockable(o)) return null;
  const p = lockButtonPos(o);
  if (Math.hypot(wx - p.x, wy - p.y) < 14 / BD.view.k) return o;
  return null;
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
    // Штрих без pts — наследие того же серверного бага (см. hitTest):
    // рамку посчитать не из чего, отдаём пустую в точке объекта, чтобы
    // «показать всё» и рамка выделения не падали с тем же TypeError.
    if (!o.pts || o.pts.length < 2) return { x: o.x || 0, y: o.y || 0, w: 0, h: 0 };
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

/** Что стирает ластик: только нарисованное от руки и подписи.
 *
 *  Картинка, страница учебника, карточка слова, задание и его разбор —
 *  это ПОЛОЖЕННОЕ на доску содержимое, а не чернила. Стереть их случайным
 *  движением руки посреди урока (жалоба владельца) — потеря, которую на
 *  ходу не восстановишь: книгу надо снова искать и листать до страницы.
 *  Убрать их всё равно можно — выделить и нажать Delete, то есть намеренно. */
const ERASABLE = ["pen", "marker", "rect", "ellipse", "arrow", "line", "text", "note"];
/* note в списке осознанно: стикер — это написанное от руки, а не положенное
   содержимое вроде картинки или книги. Владелец водил по стикеру ластиком
   и получал молчание — читалось как «ластик не работает» (видео 23.09). */
const erasable = o => ERASABLE.includes(o.kind);

function hitTest(wx, wy) {
  // Сверху вниз: последним нарисованное ловится первым — так и ожидают
  const list = [...BD.objects.values()].sort((a, b) => (b.rev || 0) - (a.rev || 0));
  for (const o of list) {
    if (isService(o)) continue;
    if (o.kind === "pen" || o.kind === "marker") {
      // Маркеры, сохранённые сервером до 27.09 (баг `kind=="pen"` в
      // _clean_board_object), лежат в старых досках БЕЗ pts. Отрисовка
      // такие штрихи пропускает, а вот чтение o.pts.length здесь падало
      // с TypeError и уносило ВЕСЬ обработчик нажатия: на доске с таким
      // наследием переставали создаваться стикер и текст (hitTest стоит
      // в их ветке первым), не работали выделение и ластик на пустом
      // месте — ровно жалоба владельца «не работают только стикеры
      // и текст». Невидимый штрих не может быть попаданием — пропускаем.
      if (!o.pts) continue;
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
  BD.selectedSet.delete(id);   // из мультивыделения тоже убираем
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
  if (step.type === "multi") return applyMulti(step, BD.redo);
  const now = BD.objects.get(step.id);
  BD.redo.push({ type: now ? "put" : "del", before: now ? { ...now } : null, id: step.id });
  if (step.before) put(step.before, false);
  else remove(step.id, false);
}
function doRedo() {
  const step = BD.redo.pop();
  if (!step) return;
  if (step.type === "multi") return applyMulti(step, BD.undo);
  const now = BD.objects.get(step.id);
  BD.undo.push({ type: now ? "put" : "del", before: now ? { ...now } : null, id: step.id });
  if (step.before) put(step.before, false);
  else remove(step.id, false);
}
/* Групповая операция (передвижение мультивыделения): откат/повтор
   целиком, а не по одному объекту на Ctrl+Z. */
function applyMulti(step, otherStack) {
  otherStack.push({ type: "multi", items: step.items.map(it => ({
    id: it.id,
    before: BD.objects.get(it.id) ? { ...BD.objects.get(it.id) } : null,
  })) });
  step.items.forEach(it => {
    if (it.before) put({ ...it.before }, false);
    else remove(it.id, false);
  });
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
      // Ученик каждым опросом говорит «я тут» и видна ли вкладка —
      // из этого складывается плашка присутствия у репетитора.
      hidden: document.hidden,
      // Лазерная указка — единственное, что ходит вне объектов доски:
      // эфемерная точка для второго участника, в базу объектом её класть
      // нельзя (мусор и лишний трафик). Сервер хранит последнюю на доске
      // и раздаёт второй стороне пару секунд.
      laser: (BD.tool === "laser" && BD.laser)
        ? toWorld(BD.laser.x, BD.laser.y) : null,
      // «Покажи мой вид»: разовая команда репетитора — мировой центр
      // и зум его экрана. Шлётся один раз после нажатия (см. bd-follow);
      // сервер держит её ~10 с и отдаёт стороне ученика.
      follow: BD.followCmd || "skip",
      // Таймер урока: команда репетитора (старт/пауза/дальше/сброс),
      // состояние возвращается обоим — отсчёт ведём по серверу.
      timer: timerCmd === undefined ? "skip" : timerCmd,
      // Реакция-эмодзи: разовая, как лазер, — поле react в том же теле.
      react: reactCmd || "skip",
    });
    if (res.ok) { BD.followCmd = null; timerCmd = undefined; reactCmd = undefined; }
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
    // Чужой лазер: сервер отдаёт его только второй стороне и только
    // свежий (пару секунд). Свой ответ с той же точкой игнорируем —
    // своя точка рисуется локально.
    if (res.laser && res.laser.by !== BD.me) {
      BD.remoteLaser = { x: res.laser.x, y: res.laser.y,
                         by: res.laser.by, seen: performance.now() };
      paint();
      clearTimeout(BD._laserT);
      // У второй стороны опрос с перерывами: если следующая точка не
      // приехала, гасим сами, а не ждём вечно
      BD._laserT = setTimeout(() => { BD.remoteLaser = null; paint(); }, 2600);
    }
    // «Покажи мой вид» от репетитора. Разовая команда: применяем каждую
    // один раз (по метке времени); ученик в другой вкладке — ждёт
    // возвращения, но дольше 10 секунд не ждём: устаревшая не нужна.
    if (res.follow && res.follow.at > (BD.followSeen || 0)) {
      if (document.hidden) BD.followPending = res.follow;
      else applyFollow(res.follow);
    }
    // Таймер: серверное состояние — единое для обеих сторон (поле есть,
    // только пока таймер идёт/на паузе/недавно истёк; нет поля — сброшен)
    BD.serverTimer = res.timer || null;
    renderTimer();
    // Реакция второй стороны: сервер отдаёт чужую и свежую, но в КАЖДОМ
    // опросе — применяем одноразово по метке, иначе одна реакция
    // всплывала бы каждые 1,2 секунды (CDP-прогон).
    if (res.react && (res.react.by + ":" + res.react.at) !== BD.reactSeen) {
      BD.reactSeen = res.react.by + ":" + res.react.at;
      pushReact(res.react.emoji, { x: res.react.x, y: res.react.y }, res.react.by);
    }
    // Слово от репетитора (добавлено им в мой словарь с доски):
    // кладём в СВОЁ состояние — источник правды для словаря именно оно,
    // иначе ближайшая синхронизация состояния слово бы смыла.
    // Доска бывает открыта всем ученикам, а слово — одному: применяем,
    // только если оно адресовано мне (BD.me = «s» + id ученика).
    if (res.dictAdd && res.dictAdd.at > (BD.dictAddSeen || 0)
        && "s" + res.dictAdd.studentId === BD.me) {
      BD.dictAddSeen = res.dictAdd.at;
      const rec = studentTakeWord(res.dictAdd);
      if (rec) toast(`Учитель добавил вам слово: «${rec.w}».`);
    }
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
      renderShareState(res.shared, res.invited);
      renderPresence(!!res.shared, res.student);
    }
  } catch (e) {
    changes.forEach(o => BD.dirty.set(o.id, o));
    deletes.forEach(id => BD.deleted.add(id));
    setState("нет связи — рисунок сохранится, когда сеть вернётся", true);
  }
  syncBusy = false;
}

/* Плашка присутствия. Раньше она врала: «ученик на доске» горело от
 * самого «Открыть ученику», даже если никто не заходил. Теперь по факту:
 * на доске / в другой вкладке (пошёл тренировать задание) / ушёл.
 * Совладелец попросил именно это после первого урока со звонком —
 * репетитор должен видеть, что замёрзшее видео значит «ученик
 * тренируется», а не «связь умерла». */
const PRESENCE = {
  here: ["ученик на доске", ""],
  away: ["ученик в другой вкладке", "away"],
  gone: ["ученик ушёл с доски", "gone"],
  no:   ["ждём ученика", "gone"],
};
function renderPresence(shared, st) {
  const el = $("bd-live");
  el.hidden = !shared;
  if (!shared) return;
  const [text, cls] = PRESENCE[st] || PRESENCE.no;
  el.textContent = text;
  el.className = "bd-live" + (cls ? " " + cls : "");
}

function setState(text, bad) {
  const el = $("bd-state");
  el.textContent = text;
  el.classList.toggle("err", !!bad);
}

/* ---------- инструменты и указатель ---------- */
let drawing = null, panning = null, moving = null, resizing = null;
// Рамка-мультивыделение и перетаскивание группы (Miro-паритет):
// banding — тянется пунктирная рамка; groupMoving — группа едет за один
// из выделенных объектов (orig по id, чтобы вернуть одной undo-записью).
let banding = null, groupMoving = null, pendingSingle = null;

/* ---------- выделение ----------
   Одиночное — BD.selected (id), мультивыделение — BD.selectedSet
   (Set id'ов, рамка-выделение как в Miro). selIds() отдаёт актуальное:
   если есть мультивыделение — его, иначе одиночное. */
const selIds = () => BD.selectedSet.size
  ? [...BD.selectedSet]
  : (BD.selected ? [BD.selected] : []);
function setSelection(ids) {
  BD.selectedSet = new Set(ids);
  BD.selected = ids.length === 1 ? ids[0] : (ids.length ? ids[ids.length - 1] : null);
  paint();
}

canvas.addEventListener("pointerdown", e => {
  // Захват указателя — удобство: линия не рвётся, если палец уехал за
  // край экрана. Но он же умеет бросать исключение (указателя уже нет,
  // событие пришло не от «живого» касания), и тогда всё, что ниже,
  // не выполнялось вовсе — рисование просто не начиналось.
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* не беда */ }
  const w = toWorld(e.clientX, e.clientY);

  // Средняя кнопка, правая кнопка и пробел — всегда перетаскивание
  // полотна, в любом инструменте. Правая и пробел добавлены по жалобе
  // «мышью доску не двигается»: человек после пера или текста тянет
  // левой — и рисует вместо сдвига. Правая кнопка свободна всегда,
  // контекстное меню на полотне поэтому глушим (ниже).
  // Shift+левая — pan везде, КРОМЕ режима «Выделить»: там Shift+клик —
  // добавить/убрать в мультивыделении (Miro), а pan на Shift+тянуть
  // обрабатывается внутри select-ветки, если под пальцем пусто.
  if (e.button === 1 || e.button === 2 || spaceHeld || BD.tool === "hand"
      || (e.shiftKey && BD.tool !== "select")) {
    panning = { x: e.clientX, y: e.clientY, vx: BD.view.x, vy: BD.view.y };
    canvas.classList.add("grabbing");
    return;
  }

  // Лазер на полотне ничего не оставляет: без этого выхода нижняя ветка
  // завернула бы нажатие в drawing-объект «laser» и угнала бы его
  // в синхронизацию — а указка видна только владельцу.
  if (BD.tool === "laser") return;

  if (BD.tool === "select") {
    // Уголок выделенного проверяем ДО хит-теста: ручка висит за рамкой
    // объекта, и попадание по ней — это точно про размер, а не про выбор.
    const lk = hitLockButton(w.x, w.y);
    if (lk) {
      // Замок — право учителя: ученик закреплённое не открепит и сам
      // ничего не приклеит (на сервере это тоже отклоняется).
      if (BD.role !== "tutor") {
        toast(lk.locked ? "Закреплено учителем: не сдвинется и не сотрётся."
                        : "Замок ставит и снимает учитель.");
        return;
      }
      put({ ...lk, locked: lk.locked ? 0 : 1 });
      toast(lk.locked ? "Откреплено — можно двигать." : "Закреплено: не сдвинется и не сотрётся.");
      return;
    }
    const rz = hitResizeHandle(w.x, w.y);
    if (rz && !rz.locked) {
      resizing = { id: rz.id, orig: { ...rz }, b: bounds(rz) };
      return;
    }
    // Двойное нажатие: своё, а не e.detail.
    //
    // e.detail считает браузер, и для КАСАНИЙ он его не заполняет —
    // приходит 0. То есть перевернуть карточку со словом или открыть
    // заметку двойным тапом на планшете и телефоне было нельзя вовсе,
    // а именно iPad назван в css/board.css основным устройством урока.
    // Мышью работало, поэтому и не замечали.
    const now = performance.now();
    const near = BD._tapAt && Math.hypot(w.x - BD._tapAt.x, w.y - BD._tapAt.y) < 24;
    const isDouble = near && (now - BD._tapAt.t) < 350;
    BD._tapAt = { x: w.x, y: w.y, t: now };

    const hit = hitTest(w.x, w.y);

    // Shift+клик по объекту — добавить/убрать в мультивыделении (Miro).
    // Shift+ТЯНУТЬ по пустому месту — по-прежнему pan (ветка выше по
    // коду): жесты разведены по тому, под пальцем объект или нет.
    if (hit && e.shiftKey) {
      const set = new Set(selIds());
      if (set.has(hit.id)) set.delete(hit.id); else set.add(hit.id);
      setSelection([...set]);
      return;
    }

    if (hit) {
      // Карточка со словом переворачивается по нажатию — это её смысл.
      // Залоченная не трогается: замок это и «не менять».
      if (hit.kind === "word" && (e.detail === 2 || isDouble) && !hit.locked) {
        put({ ...hit, h: hit.h > 70 ? 62 : 96 });
        return;
      }
      // Дабл-клик по заметке или тексту — дописать. Раньше текст можно
      // было ввести ровно один раз при создании, и всё: повторного входа
      // в редактор не существовало (жалоба владельца). Залоченное не
      // редактируется и учителем — сначала сними замок.
      if ((hit.kind === "note" || hit.kind === "text") && (e.detail === 2 || isDouble)) {
        e.preventDefault();
        if (hit.locked) toast("Закреплено — сначала сними замок у рамки.");
        else openEditor(hit);
        return;
      }
      // Задание ученик запускает одним нажатием. Но САМО открытие — не
      // здесь: pointerdown для блокировщиков всплывашек не «настоящий
      // клик», и window.open из него молча резался (у ахмата «жму —
      // ничего»). Помечаем кандидата, открываем в обработчике click —
      // он приходит после отпускания и считается доверенным жестом.
      if (hit.kind === "task" && BD.role === "student") {
        pendingTask = { task: hit, x: e.clientX, y: e.clientY };
        return;
      }
      // Одиночное выделение кликом — как раньше; мульти сбрасываем,
      // но НЕ на pointerdown по члену группы: иначе групповое перетаскивание
      // умирало бы в тот же миг. Клик без движения по члену группы —
      // схлопывание до одиночного обрабатывается на pointerup.
      if (!(BD.selectedSet.size > 1 && BD.selectedSet.has(hit.id))
          && (BD.selectedSet.size > 1 || BD.selected !== hit.id)) {
        setSelection([hit.id]);
      }
      if (!hit.locked) {
        // Тянем за выделенный в группе — едет вся группа (залоченные
        // из неё не трогаем). pendingSingle: если это был клик без
        // движения, на pointerup схлопнемся до одиночного (как в Miro).
        if (BD.selectedSet.size > 1 && BD.selectedSet.has(hit.id)) {
          groupMoving = { dx: w.x, dy: w.y,
            orig: new Map(selIds().filter(id => {
              const o = BD.objects.get(id);
              return o && !o.locked;
            }).map(id => [id, { ...BD.objects.get(id) }])) };
          pendingSingle = hit.id;
        } else {
          moving = { id: hit.id, dx: w.x, dy: w.y, orig: { ...hit } };
        }
      }
    } else {
      // Shift+тянуть по пустому месту в режиме «Выделить» — pan
      // (Shift+клик по объекту выше добавляет его в мультивыделение).
      if (e.shiftKey) {
        panning = { x: e.clientX, y: e.clientY, vx: BD.view.x, vy: BD.view.y };
        canvas.classList.add("grabbing");
        return;
      }
      // Двойной клик МЫШЬЮ по пустому месту — новый текст (привычка из
      // Miro), двойной ТАП — указка ping (у касаний detail всегда 0,
      // см. выше). Жесты разведены по типу указателя, а не по месту.
      if (e.detail === 2 || isDouble) {
        banding = null;                       // первый клик уже начал рамку
        if (e.detail === 2) createTextAt(w.x, w.y);
        else sendPing(w.x, w.y);
        return;
      }
      // Рамка-мультивыделение: левая по пустому месту в режиме
      // «Выделить» — как в Miro. Pan полотна остался на правой и средней
      // кнопке, пробеле, Shift+левая и на тачпаде.
      setSelection([]);
      banding = { x0: w.x, y0: w.y, x1: w.x, y1: w.y };
      canvas.classList.add("grabbing");
    }
    paint();
    return;
  }

  if (BD.tool === "eraser") {
    eraseHintShown = false;      // новый подход ластика — объясняем снова
    eraseAt(w.x, w.y);
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

  if (BD.tool === "note" || BD.tool === "text") {
    // Клик по УЖЕ существующей заметке или тексту — редактирование, а не
    // новая запись поверх: «дописать» — самое частое, что делают дальше.
    // Залоченное не редактируется (замок это и «не менять»).
    const hit = hitTest(w.x, w.y);
    if (hit && (hit.kind === "note" || hit.kind === "text") && !hit.locked) {
      e.preventDefault();
      BD.selected = hit.id;
      openEditor(hit);
      paint();
      return;
    }
  }

  if (BD.tool === "note") {
    // Цвет бумаги — последний выбранный в палитре (или свой hex), а не
    // всегда жёлтый: раньше создание затирало выбор палитры.
    const o = { id: uid(), kind: "note", x: w.x - 90, y: w.y - 60, w: 180, h: 120,
                color: NOTE_COLORS.includes(BD.color) || String(BD.color).startsWith("#")
                  ? BD.color : "note",
                size: 3, text: "" };
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
  // Точка лазера — в экранных координатах: она следует за курсором,
  // а не за содержимым, и зум со сдвигом её не таскают. paint() лишь
  // поднимает флаг — сам кадр нарисует общий rAF-цикл, так что частые
  // pointermove не множат перерисовки.
  if (BD.tool === "laser") {
    BD.laser = { x: e.clientX, y: e.clientY };
    paint();
  }
  if (panning) {
    BD.userMoved = true;
    BD.view.x = panning.vx + (e.clientX - panning.x);
    BD.view.y = panning.vy + (e.clientY - panning.y);
    paint();
    return;
  }
  const w = toWorld(e.clientX, e.clientY);

  // Рамка-мультивыделение: тянем пунктир
  if (banding) {
    banding.x1 = w.x;
    banding.y1 = w.y;
    paint();
    return;
  }
  // Группа едет за один из выделенных: все незалоченные — на ту же дельту
  if (groupMoving) {
    const dx = w.x - groupMoving.dx, dy = w.y - groupMoving.dy;
    // Это уже перетаскивание, а не клик по члену группы
    if (Math.abs(dx) + Math.abs(dy) > 3) pendingSingle = null;
    groupMoving.orig.forEach((orig, id) => {
      const o = BD.objects.get(id);
      if (!o) return;
      if (o.kind === "pen" || o.kind === "marker") {
        const pts = orig.pts.slice();
        for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
        BD.objects.set(id, { ...o, pts });
      } else {
        BD.objects.set(id, { ...o, x: orig.x + dx, y: orig.y + dy });
      }
    });
    paint();
    return;
  }

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

  if (pendingTask && Math.hypot(e.clientX - pendingTask.x, e.clientY - pendingTask.y) > 6) {
    pendingTask = null;          // это перетаскивание, а не запуск задания
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

  if (!drawing) { hoverCursor(w.x, w.y); return; }
  if (drawing.erase) {
    eraseAt(w.x, w.y);
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
  // Отпустили рамку: выделяем всё, что она пересекла (Miro rubber band).
  // Клик без движения — просто снятие выделения (уже сделано на pointerdown).
  if (banding) {
    const b = normBand(banding);
    banding = null;
    if (b.w >= 4 || b.h >= 4) {
      const ids = [];
      BD.objects.forEach(o => {
        if (isService(o)) return;
        const ob = bounds(o);
        if (ob.x < b.x + b.w && ob.x + ob.w > b.x
            && ob.y < b.y + b.h && ob.y + ob.h > b.y) ids.push(o.id);
      });
      if (ids.length) setSelection(ids);
    }
    return;
  }
  // Группа доехала: коммитим все объекты одной undo-записью
  if (groupMoving) {
    // Это было перетаскивание, а не клик по члену группы — коммитим
    if (!pendingSingle) {
      const items = [];
      groupMoving.orig.forEach((before, id) => items.push({ id, before }));
      pushUndo({ type: "multi", items });
      groupMoving.orig.forEach((_, id) => {
        const o = BD.objects.get(id);
        if (o) BD.dirty.set(id, o);
      });
      scheduleSync();
    }
    groupMoving = null;
    // Клик по члену группы без движения — схлопывание до одиночного (Miro)
    if (pendingSingle) setSelection([pendingSingle]);
    pendingSingle = null;
    return;
  }
  if (resizing) {
    const o = BD.objects.get(resizing.id);
    if (o) {
      // Ручной ресайз стикера отключает его авторост по высоте
      if (o.kind === "note") noteManualH.add(o.id);
      pushUndo({ type: "put", before: resizing.orig, id: o.id });
      BD.dirty.set(o.id, o);
      scheduleSync();
    }
    resizing = null;
    return;
  }
  if (moving) {
    const o = BD.objects.get(moving.id);
    if (o) { pushUndo({ type: "put", before: moving.orig, id: o.id }); BD.dirty.set(o.id, o); scheduleSync(); }
    moving = null;
    return;
  }
  finishStroke();
});

/** Нормализованная рамка-мультивыделение: x/y — левый верх, w/h — размер. */
function normBand(b) {
  return { x: Math.min(b.x0, b.x1), y: Math.min(b.y0, b.y1),
           w: Math.abs(b.x1 - b.x0), h: Math.abs(b.y1 - b.y0) };
}

/** Общая рамка группы выделенных (объединение рамок всех объектов). */
function unionBounds() {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  let found = false;
  BD.selectedSet.forEach(id => {
    const o = BD.objects.get(id);
    if (!o) return;
    const b = bounds(o);
    found = true;
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  });
  return found ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}

/** Завершить начатый штрих: короткий выбросить, нормальный сохранить.
 *
 *  Вынесено из pointerup, потому что штрих обрывается не только пальцем,
 *  который подняли. Второй палец (начало щипка для масштаба) раньше делал
 *  просто `drawing = null` — а объект к этому моменту уже лежит в
 *  BD.objects, иначе его не было бы видно во время рисования. В BD.dirty
 *  он при этом не попадал: штрих оставался призраком — автор его видит,
 *  ученик нет, и после перезагрузки он исчезает. */
/** Стереть то, что под ластиком. Объяснение — один раз за подход
 *  ластика: иначе тост мигал бы на каждом движении руки по картинке. */
let eraseHintShown = false;
function eraseAt(wx, wy) {
  const hit = hitTest(wx, wy);
  if (!hit || hit.locked) return;
  if (erasable(hit)) { remove(hit.id); return; }
  if (!eraseHintShown) {
    eraseHintShown = true;
    toast("Ластик стирает рисунок и подписи. Картинку или карточку — нажми на неё и Delete.", 4200);
  }
}

function finishStroke() {
  if (!drawing) return;
  if (drawing.erase) { drawing = null; return; }
  const o = drawing;
  drawing = null;
  if ((o.kind === "pen" || o.kind === "marker") && (o.pts || []).length < 4) {
    BD.objects.delete(o.id); paint(); return;      // случайный тычок
  }
  if (["rect", "ellipse", "arrow", "line"].includes(o.kind)
      && Math.abs(o.w) < 4 && Math.abs(o.h) < 4) {
    BD.objects.delete(o.id); paint(); return;
  }
  // Живое превью писало объект в карту во время драга — и put() ниже
  // брал его как «до»: undo свежего штриха превращался в no-op и съедал
  // шаг отмены (чек-лист 27.09). Убираем превью до put: «до» — null,
  // и первый Ctrl+Z честно снимает объект.
  BD.objects.delete(o.id);
  put(o);
  // После разового действия — обратно в «Выделить». Иначе человек ставит
  // прямоугольник, тянет доску левой — и получает второй прямоугольник:
  // так доска и покрывалась случайными следами (видео владельца 23.09).
  // Ручку и маркер НЕ трогаем: подчеркнуть несколько слов подряд —
  // нормальный сценарий, и липкий инструмент там честнее.
  if (["rect", "ellipse", "arrow", "line"].includes(o.kind)) {
    const sel = document.querySelector('.bd-tool[data-tool="select"]');
    if (sel) sel.click();
  }
}

/** Курсор под мышью: что здесь можно сделать.
 *
 *  Владелец: «не даёт мышку на фигурах» — с инструментом «выделить»
 *  курсор оставался обычной стрелкой везде, и понять, что нарисованный
 *  прямоугольник вообще можно схватить, было неоткуда. Теперь форма
 *  курсора и есть ответ: стрелка с крестом — двигается, палец —
 *  нажимается, уголок — тянется за размер, ладонь — пустое место. */
function hoverCursor(wx, wy) {
  if (BD.tool !== "select") return;          // рисующим инструментам не мешаем
  let cur = "grab";
  const lk = hitLockButton(wx, wy);
  const rz = !lk && hitResizeHandle(wx, wy);
  const hit = !lk && !rz && hitTest(wx, wy);
  if (lk) cur = "pointer";
  else if (rz && !rz.locked) cur = "nwse-resize";
  else if (hit) {
    // Нажимается: задание у ученика, карточка слова (переворот), текст
    // и стикер (дописать). Закреплённое не двигается — курсор честно
    // показывает, что тянуть бесполезно.
    if (hit.locked) cur = "not-allowed";
    else if (hit.kind === "task" || hit.kind === "word") cur = "pointer";
    else cur = "move";
  }
  if (canvas.dataset.cur !== cur) {
    canvas.dataset.cur = cur;
    canvas.style.cursor = cur;
  }
}

/* Колесо: зум к курсору, а не к центру — иначе нужное место убегает.
 *
 *  deltaY приходит в РАЗНЫХ единицах: пиксели (трекпад, большинство мышей),
 *  строки (deltaMode 1 — Firefox и часть мышей под Windows) и страницы
 *  (deltaMode 2). Считали всегда как пиксели, поэтому у мыши со «строками»
 *  один щелчок колеса давал deltaY=3 и масштаб менялся на полпроцента:
 *  «колесо не работает». Приводим к пикселям и берём шаг от щелчка. */
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;

  // Трекпад против мышиного колеса — у них разные ожидания.
  // На тачпаде (Mac) «два пальца» — это прокрутка ПОЛОТНА: человек ведёт
  // двумя пальцами, чтобы ехать по доске, а она вместо этого зумит —
  // ровно жалоба владельца. Щипок приходит как ctrl+wheel и остаётся
  // масштабом. Мышиное колесо тоже остаётся масштабом (ранняя просьба
  // «норм масштаб колесиком»).
  //
  // Отличаем так: у тачпада события в пикселях, мелкие, дробные и часто
  // с горизонталью; у колеса — крупные целые щелчки (~100–120 в Chrome).
  // Это эвристика, и честная цена у неё одна: колесо мыши в Safari
  // (мелкие целые ~10) поедет полотном, а не зумом — на Mac это ощущается
  // естественно, а масштаб там же в ctrl+колесо и ползунке.
  const trackpad = !e.ctrlKey && e.deltaMode === 0
    && (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 40);
  if (trackpad) {
    BD.userMoved = true;
    BD.view.x -= e.deltaX;
    BD.view.y -= e.deltaY;
    paint();
    return;
  }

  const px = Math.max(-240, Math.min(240, e.deltaY * unit));
  // ctrl+колесо (щипок на трекпаде) — резче, это жест «приблизь»
  const factor = Math.pow(e.ctrlKey ? 1.006 : 1.0028, -px);
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
  showZoom(k);
  paint();
}

/** Подпись и ползунок — одно число в двух местах, обновляем вместе. */
function showZoom(k) {
  $("bd-zoom").textContent = Math.round(k * 100) + "%";
  const slider = $("bd-zoom-range");
  if (slider && document.activeElement !== slider) slider.value = Math.round(k * 100);
}

/* Два пальца: масштаб и сдвиг одновременно — как в любой карте. */
let pinch = null;
canvas.addEventListener("touchstart", e => {
  if (e.touches.length === 2) {
    // Второй палец — это щипок для масштаба. Начатый штрих доводим до
    // конца по общему правилу, а не бросаем: короткий отбросится сам,
    // нормальный уедет ученику. Раньше здесь стояло `drawing = null`,
    // и штрих оставался призраком на экране рисующего.
    finishStroke();
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

/* Стикер сам растёт под многострочный текст. Enter в редакторе давно
   работает, а высота оставалась как при создании (120) — список из пяти
   строк просто вылезал за край бумажки. Считаем строки той же раскладкой,
   что рисует drawText (та же гарнитура, интерлиньяж 19 и поля 12), но без
   рисования. Потолок 320: дальше остаётся ручной resize за уголок.
   Сервер режет текст до 600 символов (_clean_board_object в db.py),
   поэтому дальше не считаем: лишние символы до доски всё равно не доедут,
   а стикер вырос бы под текст, которого нет. */
const NOTE_LH = 19, NOTE_PAD = 12;
const NOTE_MIN_H = 120, NOTE_MAX_H = 320, NOTE_TEXT_LIMIT = 600;

/* Размер текстового объекта: size — не толщина (ей текст не рисуется),
 * а кегль: высота строки = size × 6 в разумных пределах 12–96 px.
 * Меняется рядом толщин в панели стиля — у текста это и есть «размер». */
const textLH = size => Math.min(96, Math.max(12, (size || 3) * 6));

/** Высота текстового объекта под переносы: рамка выделения и хит-тест
 *  обязаны совпадать с тем, что реально нарисовано. */
function textHeight(text, w, lh) {
  ctx.save();
  ctx.font = "600 " + Math.round(lh * 0.86) + "px Nunito, system-ui, sans-serif";
  let lines = 0;
  for (const para of String(text).split("\n")) {
    const words = para.split(/[ \t]+/).filter(Boolean);
    if (!words.length) { lines++; continue; }   // пустая строка = отступ, как в drawText
    let line = "";
    for (const word of words) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > w && line) { lines++; line = word; }
      else line = t;
    }
    if (line) lines++;
  }
  ctx.restore();
  return Math.max(lh, lines * lh);
}

function noteHeight(text, w) {
  ctx.save();
  ctx.font = "600 " + Math.round(NOTE_LH * 0.86) + "px Nunito, system-ui, sans-serif";
  let lines = 0;
  for (const para of String(text).slice(0, NOTE_TEXT_LIMIT).split("\n")) {
    const words = para.split(/[ \t]+/).filter(Boolean);
    if (!words.length) { lines++; continue; }   // пустая строка = отступ, как в drawText
    let line = "";
    for (const word of words) {
      const t = line ? line + " " + word : word;
      if (ctx.measureText(t).width > w - NOTE_PAD * 2 && line) { lines++; line = word; }
      else line = t;
    }
    if (line) lines++;
  }
  ctx.restore();
  return Math.max(NOTE_MIN_H, Math.min(NOTE_MAX_H, lines * NOTE_LH + NOTE_PAD * 2));
}

/* Высота, выбранная руками за уголок, важнее автороста: человек сам
   сказал, каким стикеру быть, и прыгать вслед за текстом после этого
   нельзя. Флаг живёт на клиенте, а не в объекте: сервер хранит доску
   по белому списку полей (_clean_board_object) и чужие ключи выбросит. */
const noteManualH = new Set();

let editing = null;
function openEditor(o) {
  editing = o;
  const box = $("bd-editor"), input = $("bd-editor-input");
  box.hidden = false;
  input.value = o.text || "";
  // Фокус — после того, как браузер закончит обрабатывать нажатие:
  // синхронный focus() внутри pointerdown он тут же и отбирает
  // (нажатие-то пришло по полотну), поле выглядело открытым, а печать
  // уходила в никуда.
  setTimeout(() => { input.focus(); input.select(); }, 0);
}
$("bd-editor-ok").addEventListener("click", () => {
  if (!editing) return;
  const text = $("bd-editor-input").value.trim();
  if (!text) remove(editing.id, false);
  else {
    const o = { ...BD.objects.get(editing.id), text };
    // Стикер подгоняем под текст, если его размер не выбирали руками
    if (o.kind === "note" && !noteManualH.has(o.id)) o.h = noteHeight(text, o.w);
    // У текстового объекта высота следует за кеглем и переносами: иначе
    // рамка выделения и хит-тест врут после смены текста или размера
    if (o.kind === "text") o.h = textHeight(text, o.w || 460, textLH(o.size));
    put(o);
  }
  $("bd-editor").hidden = true;
  editing = null;
  // И тут назад в «Выделить» — та же логика, что у фигур в finishStroke:
  // написал текст — и дальше по доске, а не новый текст на каждый клик.
  const sel = document.querySelector('.bd-tool[data-tool="select"]');
  if (sel) sel.click();
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
/* Последний цвет из пикера, общий для чернил и маркера: иначе активный
   кружок показывал бы не тот цвет, которым реально рисуешь. */
let customColor = "";
function applyCustomColor(hex) {
  customColor = hex;
  BD.color = hex;
  document.querySelectorAll(".bd-swatch").forEach(x => {
    const on = x.classList.contains("bd-custom");
    if (on) { x.style.background = hex; x.classList.add("picked"); }
    x.classList.toggle("active", on);
  });
  // Цвет применяется и к выделенному объекту — как у обычных кружков.
  // Залоченное не перекрашивается: замок это и «не менять».
  // В мультивыделении красим ВСЕ незалоченные объекты группы.
  selIds().forEach(id => {
    const o = BD.objects.get(id);
    if (o && !o.locked) put({ ...o, color: hex });
  });
}
function buildStyleBar() {
  const colors = $("bd-colors");
  COLORS.concat(NOTE_COLORS, MARK_COLORS).forEach(name => {
    const b = document.createElement("button");
    // Помечаем, к чему цвет: чернила рисуют линию, бумага красит стикер,
    // маркер светит поверх написанного. Раньше все кружки лежали
    // вперемешку, и выбрать «жёлтый» для ручки было нельзя — он
    // оказывался цветом стикера.
    b.dataset.kind = NOTE_COLORS.includes(name) ? "note"
                   : MARK_COLORS.includes(name) ? "mark" : "ink";
    b.className = "bd-swatch" + (name === BD.color ? " active" : "");
    b.style.background = cssColor(name);
    b.title = name;
    b.addEventListener("click", () => {
      BD.color = name;
      document.querySelectorAll(".bd-swatch").forEach(x => x.classList.toggle("active", x === b));
      // Цвет применяется и к выделенному объекту: иначе пришлось бы
      // стирать и рисовать заново. Залоченное — нет: замок это «не менять».
      // В мультивыделении красим ВСЕ незалоченные объекты группы.
      selIds().forEach(id => {
        const o = BD.objects.get(id);
        if (o && !o.locked) put({ ...o, color: name });
      });
    });
    colors.appendChild(b);
  });
  /* Кружок «свой цвет»: нативный пикер поверх обычного кружка. Чернилам
     и маркеру — можно (у маркера полупрозрачность задаётся альфой при
     отрисовке, globalAlpha 0.35 в drawObject, поэтому любой hex ложится
     так же, как токенные MARK_COLORS). Стикеру — тоже можно: его фон
     это данные объекта, как и чернила (просьба владельца — палитра
     стикера как в Miro).
     Последний выбранный цвет запоминается прямо в этом кружке; повторный
     клик снова открывает пикер, уже с этого цвета. */
  [["ink", "Свой цвет чернил"], ["mark", "Свой цвет маркера"],
   ["note", "Свой цвет стикера"]].forEach(([kind, hint]) => {
    const b = document.createElement("button");
    b.className = "bd-swatch bd-custom";
    b.dataset.kind = kind;
    b.title = hint;
    b.innerHTML = `<span data-icon="plus" data-icon-size="15"></span>`;
    const inp = document.createElement("input");
    inp.type = "color";
    inp.className = "bd-color-input";
    inp.value = cssColor(kind === "ink" ? "ink" : kind === "mark" ? "mark1" : "note");
    inp.setAttribute("aria-label", hint);
    inp.addEventListener("input", () => applyCustomColor(inp.value));
    b.appendChild(inp);
    // Обработчика на сам кружок нет нарочно: input растянут поверх него
    // (см. css .bd-color-input) и принимает нажатия сам — пикер открывается
    // нативно, а повторное открытие идёт с того же значения input, то есть
    // с последнего выбранного цвета. Программный inp.click() здесь только
    // мешал: Safari его игнорирует, а его синтетический click всплывал
    // обратно в этот же слушатель и диспатчил событие дважды.
    colors.appendChild(b);
  });
  if (typeof paintIcons === "function") paintIcons(colors);
  const sizes = $("bd-sizes");
  [2, 4, 8, 14].forEach(px => {
    const b = document.createElement("button");
    b.className = "bd-size" + (px === BD.size ? " active" : "");
    b.innerHTML = `<i style="width:${Math.min(px + 2, 16)}px;height:${Math.min(px + 2, 16)}px"></i>`;
    b.title = px + " px";
    b.addEventListener("click", () => {
      BD.size = px;
      document.querySelectorAll(".bd-size").forEach(x => x.classList.toggle("active", x === b));
      // Размер применяется к выделенным (в мультивыделении — ко всем
      // незалоченным). Залоченное не меняем: замок это и «не менять».
      const lockedHit = selIds().some(id => (BD.objects.get(id) || {}).locked);
      if (lockedHit && selIds().length === 1) {
        toast("Закреплено — сначала сними замок у рамки.");
      }
      selIds().forEach(id => {
        const o = BD.objects.get(id);
        if (!o || o.locked) return;
        // У текста кегль тянет и высоту рамки — пересчитываем сразу
        if (o.kind === "text") {
          put({ ...o, size: px, h: textHeight(o.text || "", o.w || 460, textLH(px)) });
        } else {
          put({ ...o, size: px });
        }
      });
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
  // У текста ряд толщин — это кегль (textLH): A маленькое и крупное
  text:    { colors: "ink", sizes: true },
  pen:     { colors: "ink", sizes: true },
  marker:  { colors: "mark", sizes: true },
  rect:    { colors: "ink", sizes: true },
  ellipse: { colors: "ink", sizes: true },
  arrow:   { colors: "ink", sizes: true },
  // Лазер только показывает точку: ни цвета, ни толщины у него нет
  laser:   { colors: null,  sizes: false },
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
  const list = conf.colors === "note" ? NOTE_COLORS
             : conf.colors === "mark" ? MARK_COLORS : COLORS;
  if (conf.colors && !list.includes(BD.color)) {
    // Свой hex годится чернилам, маркеру и стикеру: переживает смену
    // инструмента туда-обратно (бумага стикера — такие же данные
    // объекта, как чернила).
    if (String(BD.color).startsWith("#")) {
      document.querySelectorAll(".bd-swatch").forEach(sw =>
        sw.classList.toggle("active", sw.classList.contains("bd-custom")));
    } else {
      BD.color = list[0];
      document.querySelectorAll(".bd-swatch").forEach(sw =>
        sw.classList.toggle("active", sw.title === BD.color));
    }
  }
}

document.querySelectorAll(".bd-tool[data-tool]").forEach(b => {
  b.addEventListener("click", () => {
    BD.tool = b.dataset.tool;
    document.querySelectorAll(".bd-tool[data-tool]").forEach(x => x.classList.toggle("active", x === b));
    canvas.classList.toggle("picking", BD.tool === "select");
    // Лазеру — свой курсор из css и чистая точка; с любого другого
    // инструмента она погашена (BD.laser выставляется заново при входе).
    canvas.classList.toggle("laser", BD.tool === "laser");
    if (BD.tool !== "laser") { BD.laser = null; paint(); }
    // Форму курсора для «выделить» ставит hoverCursor по месту; для
    // рисующих инструментов возвращаем прицел из css.
    canvas.dataset.cur = "";
    canvas.style.cursor = "";
    syncStyleBar();
  });
});

// Какому закреплённому объекту уже объясняли про замок (см. Delete ниже)
let delLockHintFor = "";

/* Дубликат выделенного со сдвигом +20 (Ctrl+D и кнопка мини-панели):
   в мультивыделении дублируется вся группа и выделяются копии. */
function duplicateSelection() {
  const ids = selIds().filter(id => {
    const o = BD.objects.get(id);
    return o && !isService(o) && !o.locked;
  });
  if (!ids.length) return;
  const copies = ids.map(id => {
    const o = BD.objects.get(id);
    const copy = { ...o, id: uid(), rev: 0, locked: 0 };
    if (copy.pts) copy.pts = copy.pts.map((v, i) => v + 20);
    else { copy.x += 20; copy.y += 20; }
    put(copy);
    return copy.id;
  });
  setSelection(copies);
}

/* Удаление выделенного (Delete и кнопка мини-панели): залоченное не
   трогаем и один раз объясняем почему. */
function deleteSelection() {
  const ids = selIds();
  const lockedHit = ids.map(id => BD.objects.get(id)).find(o => o && o.locked);
  if (lockedHit) {
    if (delLockHintFor !== lockedHit.id) {
      delLockHintFor = lockedHit.id;
      toast("Закреплено — сначала сними замок у рамки, потом Delete.", 3600);
    }
  }
  let removed = 0;
  ids.forEach(id => {
    const o = BD.objects.get(id);
    if (o && !o.locked) { remove(id); removed++; }
  });
  if (removed > 1) toast(`Удалено объектов: ${removed}.`);
  setSelection(selIds().filter(id => BD.objects.has(id)));
}

/* Мини-панель над выделенным: позиция над общей рамкой, места нет —
   под ней. Прячется при снятии выделения. */
let minipanelKey = "";
function updateMiniPanel() {
  const p = $("bd-minipanel");
  if (!p) return;
  const ids = selIds().filter(id => BD.objects.has(id));
  if (!ids.length) {
    if (!p.hidden) { p.hidden = true; minipanelKey = ""; }
    return;
  }
  const uni = ids.length === 1 ? bounds(BD.objects.get(ids[0])) : unionBounds();
  if (!uni) { p.hidden = true; minipanelKey = ""; return; }
  const key = ids.join(",") + "|" + BD.role + "|" + Math.round(uni.x * BD.view.k + uni.w * BD.view.k)
            + "|" + Math.round(uni.y * BD.view.k + uni.h * BD.view.k);
  if (key === minipanelKey) return;
  minipanelKey = key;
  // Цвета: если выделены только стикеры — палитра бумаги, иначе чернила
  const allNotes = ids.every(id => BD.objects.get(id).kind === "note");
  const list = allNotes ? NOTE_COLORS : COLORS;
  p.querySelectorAll(".bd-minicolor").forEach((b, i) => {
    b.dataset.color = list[i] || "";
    b.style.background = cssColor(list[i] || "ink");
    b.hidden = !list[i];
  });
  p.hidden = false;
  $("bd-mp-lock").hidden = BD.role !== "tutor";
  // Позиция: над рамкой по центру; вверху нет места — под рамкой
  const sx = uni.x * BD.view.k + BD.view.x + (uni.w * BD.view.k) / 2;
  const sy = uni.y * BD.view.k + BD.view.y;
  const plateH = 40;
  const top = sy - 14 - plateH;
  p.style.left = Math.max(plateH, Math.min(innerWidth - plateH, sx)) + "px";
  p.style.transform = "translateX(-50%)";
  p.style.top = (top > 64 ? top : sy + uni.h * BD.view.k + 14) + "px";
}
document.querySelectorAll(".bd-minicolor").forEach(b => {
  b.addEventListener("click", () => {
    const name = b.dataset.color;
    if (!name) return;
    selIds().forEach(id => {
      const o = BD.objects.get(id);
      if (o && !o.locked) put({ ...o, color: name });
    });
  });
});
function mpResize(d) {
  selIds().forEach(id => {
    const o = BD.objects.get(id);
    if (!o || o.locked) return;
    const size = Math.min(60, Math.max(1, (o.size || 3) + d));
    if (o.kind === "text") {
      put({ ...o, size, h: textHeight(o.text || "", o.w || 460, textLH(size)) });
    } else {
      put({ ...o, size });
    }
  });
}
$("bd-mp-minus").addEventListener("click", () => mpResize(-2));
$("bd-mp-plus").addEventListener("click", () => mpResize(2));
$("bd-mp-dup").addEventListener("click", duplicateSelection);
$("bd-mp-del").addEventListener("click", deleteSelection);
$("bd-mp-lock").addEventListener("click", () => {
  // Замок группы: если хоть один незалочен — залочить всё, иначе отпереть
  const ids = selIds();
  const target = ids.map(id => BD.objects.get(id)).some(o => o && !o.locked) ? 1 : 0;
  ids.forEach(id => {
    const o = BD.objects.get(id);
    if (o) put({ ...o, locked: target });
  });
  toast(target ? "Закреплено." : "Откреплено.");
});

document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  // Ctrl/Cmd+D — дубликат выделенного со сдвигом +20 (как в Миро): готовую
  // карточку или фигуру быстрее размножить, чем рисовать заново.
  // В мультивыделении дублируется вся группа и выделяются копии.
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
    if (selIds().length) { e.preventDefault(); duplicateSelection(); }
    return;
  }
  const map = { v: "select", p: "pen", m: "marker", e: "eraser", s: "note", n: "note",
                t: "text", r: "rect", o: "ellipse", a: "arrow", l: "laser" };
  const key = e.key.toLowerCase();
  // Escape из лазера — обратно в выделение: инструмент без рисования
  // иначе неочевидно чем выключить, а точка так и висела бы за курсором.
  if (e.key === "Escape" && BD.tool === "laser") {
    document.querySelector('.bd-tool[data-tool="select"]').click();
    return;
  }
  // Escape — снять выделение (и одиночное, и рамку-мультивыделение)
  if (e.key === "Escape" && (BD.selected || BD.selectedSet.size)) {
    setSelection([]);
    return;
  }
  if (map[key]) {
    document.querySelector(`.bd-tool[data-tool="${map[key]}"]`).click();
  }
  if (key === "w") $("bd-words").click();
  if ((e.ctrlKey || e.metaKey) && key === "z") { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
  // Стрелки — сдвиг выделенного на 1 px (с Shift — на 10), как в Miro.
  // Залоченные объекты на месте остаются.
  const ARROW = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (ARROW[e.key] && selIds().length) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const [dx, dy] = ARROW[e.key].map(v => v * step);
    selIds().forEach(id => {
      const o = BD.objects.get(id);
      if (!o || o.locked) return;
      if (o.kind === "pen" || o.kind === "marker") {
        const pts = o.pts.slice();
        for (let i = 0; i < pts.length; i += 2) { pts[i] += dx; pts[i + 1] += dy; }
        put({ ...o, pts });
      } else {
        put({ ...o, x: o.x + dx, y: o.y + dy });
      }
    });
    return;
  }
  if ((e.key === "Delete" || e.key === "Backspace") && selIds().length) {
    e.preventDefault();
    deleteSelection();
  }
});

$("bd-undo").addEventListener("click", doUndo);
$("bd-redo").addEventListener("click", doRedo);

/* Пробел — временная «рука»: зажал — тянешь полотно даже с пером в руке.
   preventDefault, чтобы пробел не прокручивал страницу и не нажимал
   сфокусированную кнопку; в поле ввода (редактор стикера) не работаем —
   там пробел это буква. */
let spaceHeld = false;
document.addEventListener("keydown", e => {
  if (e.code !== "Space" || e.repeat) return;
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  spaceHeld = true;
  canvas.classList.add("hand");
  e.preventDefault();
});
document.addEventListener("keyup", e => {
  if (e.code !== "Space") return;
  spaceHeld = false;
  canvas.classList.remove("hand");
});
// Правая кнопка занята сдвигом полотна — контекстное меню на нём не нужно.
canvas.addEventListener("contextmenu", e => e.preventDefault());
// Ушли с полотна — точка не должна замирать на краю экрана.
canvas.addEventListener("pointerleave", () => {
  if (BD.laser) { BD.laser = null; paint(); }
});

/* Шпаргалка по доске: «?» открывает, «Понятно»/Escape/фон закрывают. */
const helpBox = $("bd-help");
const helpClose = () => { helpBox.hidden = true; };
$("bd-help-open").addEventListener("click", () => {
  helpBox.hidden = false;
  $("bd-help-close").focus();
});
$("bd-help-close").addEventListener("click", helpClose);
helpBox.addEventListener("click", e => { if (e.target === helpBox) helpClose(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !helpBox.hidden) helpClose();
});
$("bd-zoom-in").addEventListener("click", () => zoomAt(innerWidth / 2, innerHeight / 2, 1.2));
$("bd-zoom-out").addEventListener("click", () => zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.2));
$("bd-zoom").addEventListener("click", () => {
  BD.view = { x: 0, y: 0, k: 1 };
  showZoom(1);
  paint();
});
// Ползунок масштаба: тянем — доска растёт из центра экрана, а не из угла.
$("bd-zoom-range").addEventListener("input", e => {
  const want = Math.max(0.15, Math.min(5, Number(e.target.value) / 100));
  zoomAt(innerWidth / 2, innerHeight / 2, want / BD.view.k);
});
$("bd-fit").addEventListener("click", fitToContent);

function fitToContent() {
  // Штрихи без pts (наследие, см. hitTest) не рисуются — и вписывать
  // в кадр нечего: их точка (0,0) растягивала бы рамку на пустое место.
  const list = [...BD.objects.values()].filter(o => !isService(o) &&
    (o.pts || (o.kind !== "pen" && o.kind !== "marker")));
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
  showZoom(k);
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

/* Скачать картинкой: конспект урока можно отправить ученику в чат.
 *
 * Рисуем в ОФСКРИН, а не с живого полотна. Прежний вариант делал
 * fitToContent() на видимом канвасе и читал его через toBlob: blob
 * собирается асинхронно, и за это время цикл отрисовки успевал вернуть
 * и перерисовать обычный вид — в файл уезжал случайный кадр, а то и
 * пустой. Плюс снимок ограничен размером окна (мыло при маленьком окне).
 * Здесь: свой канвас размером с содержимое, с dpr как на ретине, фон
 * доски заливается тем же draw() — он умеет работать на любом размере. */
$("bd-png").addEventListener("click", () => {
  const list = [...BD.objects.values()].filter(o => !isService(o));
  if (!list.length) { toast("Доска пустая."); return; }
  // рамка содержимого с полем вокруг
  const pad = 40;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  list.forEach(o => {
    const b = bounds(o);
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  });
  if (!isFinite(x1)) { toast("Доска пустая."); return; }
  const cw = x2 - x1 + pad * 2, ch = y2 - y1 + pad * 2;
  // масштаб: не мельчить больше 2×, но и не гигантить за 4096px на сторону
  const k = Math.min(2, 4096 / cw, 4096 / ch);
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(cw * k * dpr));
  off.height = Math.max(1, Math.round(ch * k * dpr));
  const offCtx = off.getContext("2d");
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // подменяем контекст и вид на время отрисовки: draw() общая
  const realCtx = ctx, realView = { ...BD.view };
  const realSelected = BD.selected, realLaser = BD.laser;
  BD.selected = null;                       // рамка выделения — не содержимое доски
  BD.laser = null;                          // и точка указки
  ctx = offCtx;
  BD.view = { x: -x1 * k + pad * k, y: -y1 * k + pad * k, k };
  paint();
  draw(Math.ceil(cw * k), Math.ceil(ch * k));
  ctx = realCtx;
  BD.view = realView;
  BD.selected = realSelected;
  BD.laser = realLaser;
  paint();
  off.toBlob(blob => {
    if (!blob) { toast("Не получилось собрать картинку."); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = ($("bd-name").textContent || "доска").trim() + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
});

document.addEventListener("visibilitychange", () => {
  if (BD.boardId) syncNow();
  // Вернулись на доску — применить ждущую команду «покажи мой вид»,
  // если она ещё свежая (сервер держит её 10 секунд)
  if (!document.hidden && BD.followPending) {
    const f = BD.followPending;
    BD.followPending = null;
    if (Date.now() / 1000 - f.at <= 10) applyFollow(f);
  }
});

/* ---------- «Покажи мой вид» (репетитор) ----------
   Разовая команда, а не режим слежения: ученик после перелёта свободен.
   Команда едет с ближайшей синхронизацией (поле follow в теле sync —
   тот же канал, что лазер, объектом в базу не кладём). */
$("bd-follow").addEventListener("click", () => {
  const c = toWorld(innerWidth / 2, innerHeight / 2);
  BD.followCmd = { x: c.x, y: c.y, k: BD.view.k };
  toast("Ученику переносится ваш вид…");
  scheduleSync();
});

/* «Залочить всё» / «отпереть всё» (репетитор): ученик на волне
   растаскивания разметки не должен уметь разобрать доску за секунду.
   Служебное (пинг, фон) не трогаем. */
function lockAll(value) {
  let n = 0;
  BD.objects.forEach(o => {
    if (isService(o)) return;
    if (!!o.locked !== value) { put({ ...o, locked: value ? 1 : 0 }); n++; }
  });
  if (n) toast(value ? `Закрепил всё на доске (${n}).` : `Всё откреплено (${n}).`);
  else toast(value ? "Закреплять нечего." : "Закреплённого и не было.");
}
$("bd-lock-all").addEventListener("click", () => lockAll(true));
$("bd-unlock-all").addEventListener("click", () => lockAll(false));

/* ---------- реакции-эмодзи ----------
   Живая реакция на уроке: эмодзи всплывает снизу экрана и тает за
   ~3,5 с. Временное, как пинг с лазером, — не объект доски: едет полем
   react в теле sync, сервер держит последнюю на сторону ~5 секунд.
   Свою видишь сразу, чужую — из ответа синхронизации. */
BD.reacts = [];
let reactCmd;                 // undefined — ничего не шлём
$("bd-react").addEventListener("click", () => {
  const m = $("bd-react-menu");
  m.hidden = !m.hidden;
});
document.querySelectorAll(".bd-react-emoji").forEach(b => {
  b.addEventListener("click", () => {
    $("bd-react-menu").hidden = true;
    // всплывает от низа экрана по центру с лёгким разбросом
    const pt = toWorld(innerWidth / 2 + (Math.random() * 120 - 60), innerHeight - 60);
    pushReact(b.dataset.emoji, pt, BD.me || "me");
    reactCmd = { emoji: b.dataset.emoji, x: pt.x, y: pt.y };
    scheduleSync();
  });
});
function pushReact(emoji, pt, by) {
  BD.reacts.push({ emoji, x: pt.x, y: pt.y, t0: performance.now(), by });
  if (BD.reacts.length > 8) BD.reacts.shift();   // старые вытесняются
  paint();
}

/* ---------- таймер урока ----------
   Ставит репетитор (пресеты или своё число), команда едет тем же sync,
   что лазер и «покажи мой вид» (поле timer в теле запроса); сервер
   хранит состояние на доске, и его видят оба — и новый заход тоже.
   Источник правды для отсчёта — серверное состояние (BD.serverTimer):
   стороны не расходятся, даже если у кого-то часы спешат. */
let timerCmd;                 // undefined — ничего не шлём ("skip")
$("bd-timer").addEventListener("click", () => {
  const m = $("bd-timer-menu");
  m.hidden = !m.hidden;
});
document.querySelectorAll("#bd-timer-menu [data-min]").forEach(b => {
  b.addEventListener("click", () => startTimer(+b.dataset.min));
});
$("bd-timer-custom-ok").addEventListener("click", () => {
  const min = Math.max(1, Math.min(99, Number($("bd-timer-custom").value) || 0));
  if (min) startTimer(min);
});
function startTimer(min) {
  $("bd-timer-menu").hidden = true;
  timerCmd = { until: Date.now() / 1000 + min * 60 };
  toast(`Таймер: ${min} мин — поехали.`);
  scheduleSync();
}
$("bd-timer-pause").addEventListener("click", () => {
  const st = BD.serverTimer;
  if (!st) return;
  if (st.pausedLeft > 0) {
    // Дальше: снимаем с паузы — новый until от «сколько осталось»
    timerCmd = { until: Date.now() / 1000 + st.pausedLeft };
    toast("Таймер пошёл дальше.");
  } else {
    timerCmd = { pausedLeft: timerLeft() };
    toast("Таймер на паузе.");
  }
  scheduleSync();
});
$("bd-timer-reset").addEventListener("click", () => {
  timerCmd = null;                       // сброс — сервер чистит поля
  BD.serverTimer = null;
  renderTimer();
  toast("Таймер сброшен.");
  scheduleSync();
});

/** Осталось секунд по серверному состоянию таймера. */
function timerLeft() {
  const st = BD.serverTimer;
  if (!st) return 0;
  if (st.pausedLeft > 0) return st.pausedLeft;
  return Math.max(0, st.until - Date.now() / 1000);
}

function renderTimer() {
  const plate = $("bd-timer-plate");
  const st = BD.serverTimer;
  plate.hidden = !st;
  if (!st) return;
  // Кнопки — только репетитору; «Пауза»/«Дальше» по состоянию
  const isTutor = BD.role === "tutor";
  $("bd-timer-pause").hidden = !isTutor;
  $("bd-timer-reset").hidden = !isTutor;
  if (isTutor) $("bd-timer-pause").textContent = st.pausedLeft > 0 ? "Дальше" : "Пауза";
}

/* Тик раз в четверть секунды: отсчёт, финальные секунды и «время!».
   «Время!» звучит один раз на команду (at+by), а не каждый кадр. */
setInterval(() => {
  const st = BD.serverTimer;
  if (!st) return;
  const left = timerLeft();
  const plate = $("bd-timer-plate");
  const paused = st.pausedLeft > 0;
  const mm = Math.floor(left / 60), ss = Math.floor(left % 60);
  const done = !paused && left <= 0;
  $("bd-timer-left").textContent = done ? "Время!" : `${mm}:${String(ss).padStart(2, "0")}`;
  plate.classList.toggle("urgent", !paused && left > 0 && left <= 10);
  if (done) {
    const id = st.by + ":" + st.at;
    if (BD.timerBeeped !== id) {
      BD.timerBeeped = id;
      plate.classList.add("urgent");
      timerBeep();
    }
  }
}, 250);

/* Короткий сигнал двумя нотами: своя мини-пищалка на WebAudio, файлов
   и библиотек не надо — в духе «никаких зависимостей». */
function timerBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = timerBeep.ctx || (timerBeep.ctx = new AC());
    const t0 = ac.currentTime;
    [880, 660].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = t0 + i * 0.22;
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.22);
    });
  } catch (e) { /* беззвучный режим — просто не пищим */ }
}

/** Плавно (~0,5 с) перелететь в вид, который прислал репетитор:
 *  тот же мировой центр и зум, что у него на экране. */
function applyFollow(f) {
  BD.followSeen = f.at;
  const k = Math.max(0.1, Math.min(8, f.k || 1));
  const from = { ...BD.view };
  const to = { x: innerWidth / 2 - f.x * k, y: innerHeight / 2 - f.y * k, k };
  // Подгонку по содержимому больше не делаем сами: человек (и учитель)
  // уже выбрали вид
  BD.userMoved = true;
  const t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / 500);
    // easeInOutQuad: без рывка в начале и в конце
    const e = t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
    BD.view = {
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
      k: from.k + (to.k - from.k) * e,
    };
    paint();
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  toast("Учитель зовёт посмотреть сюда.");
}

/* ---------- указка ---------- */
/* Двойной клик мышью по пустому месту в режиме «Выделить» — новый
   текстовый объект, как в Miro. Создание — то же, что у инструмента
   «Текст»: объект + редактор. */
function createTextAt(x, y) {
  const o = { id: uid(), kind: "text", x, y, w: 420, h: 40,
              color: BD.color, size: BD.size, text: "" };
  put(o);
  openEditor(o);
}

function sendPing(x, y) {  const o = { id: "ping-" + uid(), kind: "ping", x, y, w: 0, h: 0,
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

/* ---------- задания на доску ----------
   Ид совпадают с js/exercises.js (EXERCISES): доска не грузит все
   упражнения ради восьми названий, поэтому короткий список здесь.
   Если id разойдутся, у ученика откроется просто список тренировок —
   страница на неизвестный id не падает (см. trainFromHash в app.js). */
const TASK_EXERCISES = [
  ["flashcards", "Карточки"],
  ["matching",   "Сопоставление"],
  ["mcq",        "Выбор варианта"],
  ["spelling",   "Ввод слова"],
  ["scramble",   "Собери слово"],
  ["listening",  "Аудирование"],
  ["dictation",  "Диктант"],
];

let pendingTask = null;

/** Адрес тренировки. Хвост t= делает адрес каждый раз новым: именованная
 *  вкладка на ТОТ ЖЕ адрес с решёткой не перезагружается вовсе — второй
 *  клик по той же карточке был бы мёртвым. */
function taskURL(o) {
  // card=… — обратный адрес: тренировка знает, в какую карточку
  // положить результат и что после финиша можно закрыть вкладку.
  return "index.html#train=" + encodeURIComponent((o.text2 || "").trim())
       + "&card=" + encodeURIComponent(o.id)
       + "&t=" + Date.now().toString(36);
}

canvas.addEventListener("click", () => {
  if (!pendingTask) return;
  const { task } = pendingTask;
  pendingTask = null;
  // Именованное окно: нетерпеливые клики попадают в ОДНУ вкладку.
  let win = null;
  try { win = window.open(taskURL(task), "savelyTrain"); } catch (e) { win = null; }
  if (!win) {
    // Блокировщик съел даже click. Настоящую ссылку, по которой человек
    // нажимает сам, не режет никто — показываем её.
    showTaskGo(task);
    return;
  }
  toast("Тренировка открылась в новой вкладке — доска и звонок остаются здесь.");
  /* Но «окно вернулось» ещё не значит «вкладка открылась».
   *
   * Во встроенных браузерах мессенджеров — Телеграм, ВК, инстаграм —
   * window.open отдаёт объект окна и тут же его роняет: вкладок у них
   * нет. Проверка `if (win)` считала это успехом, ученица видела всплывашку
   * «открылось в новой вкладке» и пустой экран. Отсюда и «нажимаю, а оно
   * просто пропадает»: не пропадало, а никогда и не открывалось.
   *
   * Ждём и смотрим по факту: окно закрылось или так и осталось пустым —
   * значит не открылось, показываем ссылку. Секунда с небольшим — с
   * запасом на медленную загрузку страницы в школьном интернете. */
  setTimeout(() => {
    let dead = false;
    try {
      dead = win.closed
        || !win.location
        || win.location.href === "about:blank";
    } catch (e) {
      dead = false;   // до чужого окна не дотянуться — значит, оно живо
    }
    if (!dead) return;
    try { win.close(); } catch (e) { /* уже закрыто */ }
    // Всплывашку про «открылась в новой вкладке» надо забрать назад:
    // она сказала неправду, и ученик пошёл искать несуществующую вкладку.
    toast("Вкладка не открылась — нажми «Открыть тренировку».");
    showTaskGo(task);
  }, 1200);
});

function showTaskGo(task) {
  const box = $("bd-task-go");
  $("bd-task-go-name").textContent = task.text || "Тренировка";
  const a = $("bd-task-go-link");
  a.href = taskURL(task);
  box.hidden = false;
}
$("bd-task-go-link").addEventListener("click", () => { $("bd-task-go").hidden = true; });
$("bd-task-go-close").addEventListener("click", () => { $("bd-task-go").hidden = true; });

function renderTaskChips() {
  const box = $("bd-task-list");
  if (!box) return;
  box.innerHTML = "";
  TASK_EXERCISES.forEach(([id, name]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bd-word";
    b.textContent = name;
    b.addEventListener("click", () => {
      const at = toWorld(innerWidth / 2, innerHeight / 2);
      const cardId = uid();
      put({ id: cardId, kind: "task", x: at.x - 130, y: at.y - 45,
            w: 260, h: 90, color: "blue", size: 3, text: name, text2: id });
      // Разбор кладём СРАЗУ, пустым: место под него занято ещё до того,
      // как ученик начал, и на уроке видно, куда смотреть после. Когда
      // ученик закончит, его браузер впишет сюда счёт и список ошибок
      // (reportBoardResult в js/sync.js находит эту карточку по id).
      put({ id: "rev-" + cardId, kind: "note",
            x: at.x + 150, y: at.y - 45, w: 250, h: 104,
            color: "note", size: 3,
            text: "Разбор · " + name + "\nЖдём: ученик ещё не проходил." });
      BD.selected = cardId;
      toast("Задание и карточка разбора на доске — ученик нажмёт и начнёт.");
    });
    box.appendChild(b);
  });
}

/* ---------- слова ученика ---------- */
$("bd-words").addEventListener("click", () => {
  const panel = $("bd-panel");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    if (!BD.students.length) loadStudents();
    // Список учеников мог приехать раньше через ensureStudents (меню
    // доступа): тогда loadStudents не зовётся, и селект надо заполнить
    // здесь — иначе он пустой, а слова добавить некому (CDP-прогон).
    else if (BD.role === "tutor" && !$("bd-student").childElementCount) {
      renderStudentOptions();
      loadWords($("bd-student").value);
    }
  }
  // Задания выдаёт репетитор; ученику в панели — только его слова
  if (!panel.hidden && BD.role === "tutor" && $("bd-tasks")) {
    $("bd-tasks").hidden = false;
    if (!$("bd-task-list").childElementCount) renderTaskChips();
  }
  if (!panel.hidden && BD.role === "tutor" && $("bd-books")) {
    $("bd-books").hidden = false;
    if (!BOOKS.length) loadBooks();
  }
  // Форма «добавить слово» — репетиторская (ученик добавляет себе сам,
  // у него своя кнопка в шапке и у карточек)
  if ($("bd-panel-add")) {
    $("bd-panel-add").hidden = panel.hidden || BD.role !== "tutor";
    if (!$("bd-panel-add").hidden) refreshPanelFolders();
  }
});

/* Папки в форме добавления — из словаря выбранного ученика. */
function refreshPanelFolders() {
  fillFolderSelect($("bd-add-folder"), $("bd-add-newfolder"),
                   BD.words.flatMap(x => x.folders || []));
}
$("bd-student").addEventListener("change", refreshPanelFolders);

/* Автоподстановка перевода из банка (банк едет лениво — см. ensureWordBank). */
let addLookupTimer = 0;
$("bd-add-w").addEventListener("input", () => {
  clearTimeout(addLookupTimer);
  addLookupTimer = setTimeout(async () => {
    await ensureWordBank();
    const rec = bankLookup($("bd-add-w").value);
    // перевод не затираем, если человек уже пишет свой
    if (rec && !$("bd-add-t").value.trim()) {
      $("bd-add-t").value = rec.t || "";
      $("bd-add-t").dataset.ex = rec.ex || "";
    }
  }, 250);
});

$("bd-add-ok").addEventListener("click", async () => {
  const w = $("bd-add-w").value.trim();
  const t = $("bd-add-t").value.trim();
  if (!w || !t) { toast("Нужны и слово, и перевод."); return; }
  const folder = chosenFolder($("bd-add-folder"), $("bd-add-newfolder"));
  const studentId = Number($("bd-student").value);
  if (!studentId) { toast("Сначала выберите ученика."); return; }
  const rec = bankLookup(w) || {};
  const res = await api("/api/tutor/add-word", {
    token: BD.token, studentId, w, t,
    ex: $("bd-add-t").dataset.ex || rec.ex || "",
    folders: folder ? [folder] : [], boardId: BD.boardId,
  }).catch(() => null);
  if (!res || !res.ok) { toast("Не сохранилось — " + ((res && res.error) || "нет связи")); return; }
  // Сразу в список панели: ждать следующей загрузки словаря не нужно
  if (!res.exists) {
    BD.words.push({ w, t, cat: rec.cat || "", ex: rec.ex || "",
                    folders: folder ? [folder] : [] });
  } else {
    const have = BD.words.find(x => x.w.toLowerCase() === w.toLowerCase());
    if (have && folder && !(have.folders || []).includes(folder)) {
      (have.folders = have.folders || []).push(folder);
    }
  }
  renderWords();
  refreshPanelFolders();
  $("bd-add-w").value = "";
  $("bd-add-t").value = "";
  delete $("bd-add-t").dataset.ex;
  toast(res.exists
    ? `«${w}» уже было в словаре${folder ? " — добавил папку." : "."}`
    : `«${w}» — в словаре ученика.`);
});
$("bd-panel-close").addEventListener("click", () => { $("bd-panel").hidden = true; });
$("bd-search").addEventListener("input", renderWords);
$("bd-student").addEventListener("change", () => loadWords($("bd-student").value));

/* При обрыве сети панель раньше пустела молча: api() бросает по таймауту
   20 с, а loadStudents/loadWords его не ловили — ни сообщения, ни способа
   попробовать ещё раз. Теперь ошибка с кнопкой «Повторить» живёт прямо
   в панели, там же, где её подсказки (системные диалоги в проекте
   запрещены). Кнопку создаём здесь, а не в board.html: она нужна только
   в случае сбоя. */
const WORDS_HINT_OK = $("bd-words-hint").textContent.trim();
let wordsRetryBtn = null;
function wordsError(text, retry) {
  $("bd-words-hint").textContent = text;
  $("bd-word-list").innerHTML = "";
  if (!wordsRetryBtn) {
    wordsRetryBtn = document.createElement("button");
    wordsRetryBtn.className = "bd-btn";
    $("bd-words-hint").after(wordsRetryBtn);
  }
  wordsRetryBtn.textContent = "Повторить";
  wordsRetryBtn.hidden = false;
  wordsRetryBtn.onclick = retry;
}
function wordsOk() {
  $("bd-words-hint").textContent = WORDS_HINT_OK;
  if (wordsRetryBtn) wordsRetryBtn.hidden = true;
}

async function loadStudents() {
  if (BD.role !== "tutor") {
    // Ученику показываем его собственный словарь — он лежит в браузере
    $("bd-student").hidden = true;
    try {
      const st = JSON.parse(localStorage.getItem("savelyState") || "{}");
      BD.words = (st.dictionary || [])
        .map(d => ({ w: d.w, t: d.t, cat: d.cat, ex: d.ex || "", folders: d.folders || [] }));
    } catch (e) { BD.words = []; }
    renderWords();
    return;
  }
  try {
    const res = await api("/api/tutor/students", { token: BD.token });
    if (!res.ok) {
      wordsError("Не удалось загрузить учеников.", loadStudents);
      return;
    }
    wordsOk();
    BD.students = res.students || [];
    renderStudentOptions();
    if (BD.students.length) loadWords(BD.students[0].id);
    else $("bd-words-hint").textContent = "У вас пока нет учеников.";
  } catch (e) {
    wordsError("Нет связи — список учеников не загрузился.", loadStudents);
  }
}

/* Опции селектора учеников — отдельно от загрузки: список мог приехать
   раньше через ensureStudents, и тогда панель заполняет его без сети. */
function renderStudentOptions() {
  const sel = $("bd-student");
  // words у ученика — это разбивка по статусам, а не число: в подпись
  // берём общее количество, иначе в списке стоит «[object Object] слов».
  const total = s => (s.words && typeof s.words === "object" ? s.words.total : s.words) || 0;
  sel.innerHTML = BD.students.map(s =>
    `<option value="${s.id}">${esc(s.name)} — ${total(s)} ${wordsPlural(total(s))}</option>`).join("");
}

async function loadWords(studentId) {
  try {
    const res = await api("/api/tutor/student", { token: BD.token, studentId: Number(studentId) });
    if (!res.ok) {
      wordsError("Не удалось загрузить слова ученика.", () => loadWords(studentId));
      return;
    }
    wordsOk();
    // folders нужны группировке списка и форме «добавить слово»
    BD.words = (res.student.dictionary || [])
      .map(d => ({ w: d.w, t: d.t, cat: d.cat, ex: d.ex || "", folders: d.folders || [] }));
    renderWords();
  } catch (e) {
    // Словарь не обнуляем: список прошлого ученика поверх ошибки
    // вводил бы в заблуждение, но и затирать его «Ничего не нашлось» —
    // врать. Ошибку говорим словами в подсказке, список чистим.
    wordsError("Нет связи — слова не загрузились.", () => loadWords(studentId));
  }
}

function renderWords() {
  const q = $("bd-search").value.trim().toLowerCase();
  const list = BD.words.filter(x =>
    !q || x.w.toLowerCase().includes(q) || (x.t || "").toLowerCase().includes(q)).slice(0, 300);
  const box = $("bd-word-list");
  if (!list.length) {
    box.innerHTML = `<p class="bd-hint">Ничего не нашлось.</p>`;
    return;
  }
  // Слова по папкам, как в словаре ученика: папка — заголовок, внутри
  // её слова. Без папки — в конце общей кучей.
  const groups = new Map();
  list.forEach((x, i) => {
    const f = (x.folders || [])[0] || "";
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push({ x, i });
  });
  const names = [...groups.keys()].sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, "ru"));
  box.innerHTML = names.map(f =>
    (f ? `<div class="bd-folder-head">${esc(f)}</div>` : "")
    + groups.get(f).map(({ x, i }) => `<button class="bd-word" data-i="${i}">${
        typeof wordArtHTML === "function"
          ? `<span class="bd-word-art">${wordArtHTML(x.w, x.cat)}</span>` : ""
      }<span class="bd-word-txt"><b>${esc(x.w)}</b><span>${esc(x.t || "")}</span></span></button>`).join("")
  ).join("");
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

/* ---------- добавление слов в словарь с доски ----------
   Банк для автоподстановки перевода грузим лениво и один раз: сотни
   килобайт на кнопку, которую могут и не нажать, не нужны. */
let wordBankPromise = null;
function ensureWordBank() {
  if (!wordBankPromise && typeof loadScriptOnce === "function") {
    // A1–B2: школьная лексика, которую репетитор добавляет чаще всего.
    // «moon» живёт в B2 — без него перевод не подставлялся (CDP-прогон).
    wordBankPromise = Promise.all(["A1", "A2", "B1", "B2"].map(l =>
      loadScriptOnce(`js/words-${l}.js`).catch(() => false)));
  }
  return wordBankPromise || Promise.resolve(false);
}
function bankLookup(word) {
  if (typeof WORDS === "undefined") return null;
  const lw = String(word || "").trim().toLowerCase();
  if (!lw) return null;
  for (const lvl of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    const rec = (WORDS[lvl] || []).find(x => x.w.toLowerCase() === lw);
    if (rec) return rec;
  }
  return null;
}

/* Папки в селект формы: из словаря ученика + «без папки» + «новая…».
   Возвращает выбранную папку (строку) или "" — без папки. */
const NEW_FOLDER = "__new__";
function fillFolderSelect(sel, newFolderInput, folders) {
  const uniq = [...new Set(folders.filter(Boolean))];
  sel.innerHTML = uniq.map(f => `<option value="${esc(f)}">${esc(f)}</option>`).join("")
    + `<option value="">Без папки</option>`
    + `<option value="${NEW_FOLDER}">Новая папка…</option>`;
  sel.onchange = () => { newFolderInput.hidden = sel.value !== NEW_FOLDER; };
  newFolderInput.hidden = true;
}
function chosenFolder(sel, newFolderInput) {
  return sel.value === NEW_FOLDER ? newFolderInput.value.trim() : sel.value;
}

/* Состояние ученика на этой же машине: board.html и index.html делят
   localStorage, поэтому слово, добавленное с доски, приложение ученика
   увидит сразу и увезёт на сервер ближайшей синхронизацией состояния —
   источник правды для словаря именно он (см. sync_student). */
function readStudentState() {
  try { return JSON.parse(localStorage.getItem("savelyState") || "{}"); }
  catch (e) { return {}; }
}
/** Положить слово в состояние ученика (с дедупом). Возвращает запись
 *  или null, если такое слово уже есть (папку тогда не трогаем). */
function studentTakeWord(a) {
  const st = readStudentState();
  st.dictionary = st.dictionary || [];
  const lw = String(a.w || "").toLowerCase();
  if (!lw || st.dictionary.some(d => (d.w || "").toLowerCase() === lw)) return null;
  const folder = ((a.folders || [])[0] || "").trim();
  const rec = { w: a.w, t: a.t || "", ex: a.ex || "",
                added: Date.now(), seen: 1, status: "new",
                folders: folder ? [folder] : [] };
  st.dictionary.push(rec);
  if (folder) {
    st.trainFolders = st.trainFolders || [];
    if (!st.trainFolders.includes(folder)) st.trainFolders.push(folder);
  }
  localStorage.setItem("savelyState", JSON.stringify(st));
  return rec;
}

/* ---------- доступ ученику: кого зовём на доску ----------
   Кнопка открывает меню: позвать всех, позвать одного, закрыть. Раньше
   был тумблер «всем сразу» — репетитор с группой не мог провести
   индивидуальный урок, не показав доску остальным. */

async function ensureStudents() {
  if (BD.students.length) return BD.students;
  try {
    const res = await api("/api/tutor/students", { token: BD.token });
    if (res.ok) BD.students = res.students || [];
  } catch (e) { /* меню покажет, что загрузить не вышло */ }
  return BD.students;
}

function shareLabel(shared, invited) {
  if (!shared) return "Открыть ученику";
  if (!invited) return "Доска: все ученики";
  const s = BD.students.find(x => x.id === invited);
  return "Доска: " + (s ? s.name : "один ученик");
}

let shareState = { shared: false, invited: null };
function renderShareState(shared, invited) {
  shareState = { shared: !!shared, invited: invited || null };
  $("bd-share").textContent = shareLabel(shareState.shared, shareState.invited);
  $("bd-share").classList.toggle("on", shareState.shared);
}

async function setShare(shared, studentId) {
  const res = await api("/api/board/update", {
    token: BD.token, boardId: BD.boardId, action: "share",
    shared, studentId: studentId || null,
  });
  if (!res.ok) { toast(res.error || "Не получилось."); return; }
  renderShareState(shared, studentId);
  $("bd-live").hidden = !shared;
  if (!shared) toast("Доступ закрыт.");
  else if (studentId) {
    const s = BD.students.find(x => x.id === studentId);
    toast("Доска открыта: " + (s ? s.name : "ученик") + " увидит её на главной.");
  } else toast("Доска открыта всем вашим ученикам.");
  $("bd-share-menu").hidden = true;
}

$("bd-share").addEventListener("click", async () => {
  const menu = $("bd-share-menu");
  if (!menu.hidden) { menu.hidden = true; return; }
  await ensureStudents();
  const rows = [];
  rows.push(`<button data-share="all" class="${shareState.shared && !shareState.invited ? "on" : ""}">Позвать всех</button>`);
  BD.students.forEach(s => {
    rows.push(`<button data-share="${s.id}" class="${shareState.invited === s.id ? "on" : ""}">${esc(s.name)}</button>`);
  });
  if (!BD.students.length) rows.push(`<p class="bd-hint">Учеников пока нет.</p>`);
  if (shareState.shared) rows.push(`<button data-share="off" class="danger">Закрыть доску</button>`);
  menu.innerHTML = rows.join("");
  menu.hidden = false;
  menu.querySelectorAll("[data-share]").forEach(b => {
    b.addEventListener("click", () => {
      const v = b.dataset.share;
      if (v === "off") setShare(false, null);
      else if (v === "all") setShare(true, null);
      else setShare(true, Number(v));
    });
  });
});
document.addEventListener("pointerdown", e => {
  const menu = $("bd-share-menu");
  if (!menu.hidden && !menu.contains(e.target) && e.target !== $("bd-share")) {
    menu.hidden = true;
  }
});

/* ---------- книжки (PDF) ---------- */

let BOOKS = [];
async function loadBooks() {
  try {
    const res = await api("/api/tutor/books", { token: BD.token });
    if (res.ok) { BOOKS = res.books || []; renderBooks(); }
  } catch (e) { /* панель просто останется пустой */ }
}

function renderBooks() {
  const box = $("bd-book-list");
  if (!box) return;
  box.innerHTML = BOOKS.length
    ? BOOKS.map(b => `
      <div class="bd-book-row" data-id="${b.id}">
        <button class="bd-word bd-book-add" data-add="${b.id}">
          <b>${esc(b.title)}</b><span>${b.pages} стр.</span></button>
        <button class="bd-btn bd-book-del" data-del="${b.id}" title="Удалить книгу">✕</button>
      </div>`).join("")
    : `<p class="bd-hint">Пока пусто. Загрузите PDF — он останется в вашей
       библиотеке и для следующих уроков.</p>`;
  box.querySelectorAll("[data-add]").forEach(b => {
    b.addEventListener("click", () => {
      const book = BOOKS.find(x => x.id === Number(b.dataset.add));
      if (book) dropBookCard(book);
    });
  });
  box.querySelectorAll("[data-del]").forEach(b => {
    let armed = false, timer = 0;
    b.addEventListener("click", async () => {
      if (!armed) {
        armed = true; b.textContent = "точно?";
        timer = setTimeout(() => { armed = false; b.textContent = "✕"; }, 3500);
        return;
      }
      clearTimeout(timer);
      const res = await api("/api/book/delete", {
        token: BD.token, bookId: Number(b.dataset.del) });
      if (res.ok) { BOOKS = res.books || []; renderBooks(); }
      else toast(res.error || "Не получилось удалить.");
    });
  });
}

function dropBookCard(book) {
  const c = toWorld(innerWidth / 2, innerHeight / 2);
  // Пропорции A4 портретом; репетитор растянет за уголок, если надо
  const w = 460, h = 640;
  put({
    id: uid(), kind: "book",
    x: c.x - w / 2, y: c.y - h / 2, w, h,
    color: "ink", size: 3,
    bookId: book.id, page: 1, pages: book.pages, text: book.title,
  });
  BD.selected = null;
  toast("«" + book.title + "» на доске. Выделите страницу — появятся стрелки листания.");
}

$("bd-book-upload").addEventListener("click", () => $("bd-book-file").click());
$("bd-book-file").addEventListener("change", e => {
  const f = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) {
    toast("PDF до 20 МБ. Большую книгу сожмите или разрежьте на части.", 4200);
    return;
  }
  const note = $("bd-book-note");
  note.hidden = false;
  note.textContent = "Загружаю «" + f.name + "»…";
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await api("/api/book/upload", {
        token: BD.token,
        title: f.name.replace(/\.pdf$/i, ""),
        data: String(reader.result),
      });
      if (!res.ok) { note.textContent = res.error || "Не получилось загрузить."; return; }
      BOOKS = res.books || [];
      renderBooks();
      note.hidden = true;
      dropBookCard(res.book);
    } catch (err) {
      note.textContent = "Сеть оборвалась — попробуйте ещё раз.";
    }
  };
  reader.readAsDataURL(f);
});

/* Листалка выделенной книги. Стрелки видит только репетитор: на уроке
   страницами управляет он, у ученика книга просто листается сама. */
let bookbarFor = "";
function updateBookBar() {
  const bar = $("bd-bookbar");
  if (!bar) return;
  const o = BD.selected ? BD.objects.get(BD.selected) : null;
  const show = !!(o && o.kind === "book" && BD.role === "tutor");
  const key = show ? o.id + ":" + o.page + ":" + o.pages : "";
  if (key === bookbarFor) return;
  bookbarFor = key;
  bar.hidden = !show;
  if (show) $("bd-book-page").textContent = "стр. " + o.page + " / " + (o.pages || 1);
}

/* Плашка «+ в словарь» у выделенной карточки со словом — только ученику
   и только если слова ещё нет у него в словаре. Рисуется поверх
   полотна тем же способом, что листалка книги (bd-bookbar). */
let wordbarFor = "";
function updateWordbar() {
  const bar = $("bd-wordbar");
  if (!bar) return;
  const o = BD.selected ? BD.objects.get(BD.selected) : null;
  let show = false;
  if (o && o.kind === "word" && BD.role === "student") {
    const st = readStudentState();
    const lw = (o.text || "").toLowerCase();
    show = !(st.dictionary || []).some(d => (d.w || "").toLowerCase() === lw);
  }
  const key = show ? o.id : "";
  if (key === wordbarFor) return;
  wordbarFor = key;
  bar.hidden = !show;
}
$("bd-wordbar-add").addEventListener("click", () => {
  const o = BD.selected ? BD.objects.get(BD.selected) : null;
  if (!o || o.kind !== "word") return;
  openAddwordDialog({ w: o.text || "", t: o.text2 || "" });
});

/* ---------- «+ слово» у ученика ----------
   Диалог добавления слова себе: общий и для кнопки в шапке, и для
   плашки у карточки. Перевод подставляется из банка (см. bankLookup),
   папку выбирает ученик — свою или новую. */
let addwordLookupTimer = 0;
function openAddwordDialog(prefill) {
  const box = $("bd-addword");
  box.hidden = false;
  $("bd-addword-w").value = (prefill && prefill.w) || "";
  $("bd-addword-t").value = (prefill && prefill.t) || "";
  fillFolderSelect($("bd-addword-folder"), $("bd-addword-newfolder"),
                   readStudentState().trainFolders || []);
  ensureWordBank();
  // Фокус — после кадра, как в редакторе текста: синхронный focus()
  // внутри клика браузер тут же и отбирает
  setTimeout(() => ($( "bd-addword-w").value ? $("bd-addword-t") : $("bd-addword-w")).focus(), 0);
}
function closeAddwordDialog() { $("bd-addword").hidden = true; }
$("bd-addword-btn").addEventListener("click", () => openAddwordDialog(null));
$("bd-addword-cancel").addEventListener("click", closeAddwordDialog);
$("bd-addword-w").addEventListener("input", () => {
  clearTimeout(addwordLookupTimer);
  addwordLookupTimer = setTimeout(async () => {
    await ensureWordBank();
    const rec = bankLookup($("bd-addword-w").value);
    if (rec && !$("bd-addword-t").value.trim()) {
      $("bd-addword-t").value = rec.t || "";
      $("bd-addword-t").dataset.ex = rec.ex || "";
    }
  }, 250);
});
$("bd-addword-ok").addEventListener("click", async () => {
  const w = $("bd-addword-w").value.trim();
  const t = $("bd-addword-t").value.trim();
  if (!w || !t) { toast("Нужны и слово, и перевод."); return; }
  const folder = chosenFolder($("bd-addword-folder"), $("bd-addword-newfolder"));
  const bank = bankLookup(w) || {};
  const rec = studentTakeWord({
    w, t, ex: $("bd-addword-t").dataset.ex || bank.ex || "",
    folders: folder ? [folder] : [],
  });
  if (!rec) { toast(`«${w}» уже есть в твоём словаре.`); closeAddwordDialog(); return; }
  // Дубль на сервер — на случай, если вкладка закроется раньше
  // синхронизации состояния (см. /api/student/add-word)
  api("/api/student/add-word", { token: BD.token, w, t,
                                 ex: rec.ex, folders: rec.folders }).catch(() => {});
  closeAddwordDialog();
  toast(`«${w}» — в словаре, мяу!`);
  updateWordbar();
  // В панели «Слова на доску» слово появляется сразу
  BD.words.push({ w, t, cat: bank.cat || "", ex: rec.ex, folders: rec.folders });
  renderWords();
});

function flipBook(delta) {
  const o = BD.selected ? BD.objects.get(BD.selected) : null;
  if (!o || o.kind !== "book") return;
  const page = Math.max(1, Math.min((o.pages || 1), (o.page || 1) + delta));
  if (page === o.page) return;
  put({ ...o, page });
}
$("bd-book-prev").addEventListener("click", () => flipBook(-1));
$("bd-book-next").addEventListener("click", () => flipBook(1));

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
    $("bd-follow").hidden = false;   // «Покажи мой вид» — кнопка репетитора
    $("bd-lock-all").hidden = false;
    $("bd-unlock-all").hidden = false;
    $("bd-timer").hidden = false;    // таймер ставит только репетитор
    $("bd-back").href = "tutor.html";
  } else if (studentToken) {
    BD.role = "student";
    BD.token = studentToken;
    $("bd-back").href = "index.html";
    // Очистка доски — только репетитору. Раньше кнопка была видна всем
    // и на нажатие отвечала «может только репетитор»: кнопка, которая
    // существует, чтобы отказать, хуже отсутствующей.
    $("bd-clear").hidden = true;
    // Фон доски — тоже репетиторский: ученик, переключивший фон посреди
    // урока, меняет его ОБОИМ (фон — общий объект доски). Сервер такую
    // смену от ученика тоже отклоняет (см. db.board_sync).
    $("bd-bg").hidden = true;
    // А вот добавлять слова себе ученик может и с доски: своя кнопка
    $("bd-addword-btn").hidden = false;
    // Тот же вопрос, что у репетитора с sync: что делать, если сервер
    // молчит. Раньше этот вызов висел вечно, теперь падает по таймауту —
    // и падал бы молча, за пределами try. Ученик перед уроком видел бы
    // тот же белый экран. Поэтому: сказать, что связи нет, и спрашивать
    // снова, пока не ответит; урок от этого не начнётся позже.
    let res;
    for (;;) {
      try {
        res = await api("/api/student/board", { token: studentToken });
        break;
      } catch (e) {
        setState("нет связи — пробую снова…", true);
        await new Promise(r => setTimeout(r, STUDENT_RETRY_MS));
      }
    }
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

  // Полотно оживает ДО первого ответа сервера, а не после.
  //
  // Раньше цикл отрисовки запускался в самом конце boot(), уже за
  // await syncNow(). На медленном хостинге первый ответ идёт десятки
  // секунд, а без предела ожидания — никогда; всё это время на экране
  // был голый белый прямоугольник без сетки и с надписью «сохраняю…».
  // Репетитор читал это как «доска не работает» и жал «Новая доска»
  // снова (см. tutor-boards.js). Теперь бумага и сетка рисуются сразу,
  // а строка состояния честно говорит, что происходит.
  setState("подключаюсь…");
  paint();
  requestAnimationFrame(function loop() { draw(); requestAnimationFrame(loop); });

  await syncNow();
  // Имена учеников нужны кнопке доступа уже при загрузке: без них
  // «Доска: Ира» рисовалась бы как безликое «один ученик».
  if (BD.role === "tutor") {
    ensureStudents().then(() => renderShareState(shareState.shared, shareState.invited));
  }
  // Доска готова — можно подключать то, что живёт поверх неё (звонок)
  dispatchEvent(new Event("board-ready"));
  // Заодно подтолкнём обновление сервис-воркера: доска на уроке открыта
  // часами, и без этого свежие правки ехали бы до учеников сутками.
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) reg.update();
  } catch (e) { /* без сервис-воркера тоже жизнь */ }
  // Два кадра ожидания: к этому моменту раскладка уже посчитана
  // и innerWidth настоящий, а не промежуточный.
  requestAnimationFrame(() => requestAnimationFrame(fitToContent));
  // Опрос: чужие штрихи должны появляться сами, без перезагрузки.
  // Он же — вторая попытка, если первый ответ не дошёл: syncNow сама
  // ставит «нет связи» и снимает syncBusy, дальше дело за опросом.
  setInterval(syncNow, 1200);
}

boot();
