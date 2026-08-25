// Генератор QR-кода. Своими руками и без единой зависимости.
//
// Зачем свой. Весь сайт живёт без внешних библиотек и работает офлайн
// (PWA с сервис-воркером). Подключать чужой скрипт с чужого домена ради
// одной картинки — значит и сломать офлайн, и завести ещё один адрес,
// который может однажды не ответить. Кода здесь на страницу, а спецификация
// QR не меняется с 2006 года.
//
// Что поддерживается: байтовый режим (то есть любой текст, включая
// кириллицу через UTF-8), версии 1–10, уровни коррекции L/M/Q/H.
// Ссылки вида https://wordcat.ru/?join=ABC123 — это версия 2–3,
// с огромным запасом.
//
// Проверено: матрицу рисовали в PNG и читали обратно детектором OpenCV,
// плюс сверка кодовых слов с эталонным примером из спецификации
// (см. tools/check-qr.py).

/* ---------- арифметика поля GF(256) ---------- */
// Коды Рида — Соломона считаются в поле из 256 элементов. Таблицы
// логарифмов делают умножение сложением — иначе каждый байт коррекции
// стоил бы цикла умножений.
const QR_EXP = new Uint8Array(512);
const QR_LOG = new Uint8Array(256);
(function () {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    QR_EXP[i] = x;
    QR_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;          // порождающий многочлен поля
  }
  for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255];
})();

const qrMul = (a, b) => (a === 0 || b === 0) ? 0 : QR_EXP[QR_LOG[a] + QR_LOG[b]];

/** Порождающий многочлен для n байт коррекции. */
function qrGenPoly(n) {
  let poly = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= qrMul(poly[j], QR_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Байты коррекции для блока данных. */
function qrEcBytes(data, ecLen) {
  const gen = qrGenPoly(ecLen);
  const res = new Array(data.length + ecLen).fill(0);
  data.forEach((b, i) => res[i] = b);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (!coef) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= qrMul(gen[j], coef);
  }
  return res.slice(data.length);
}

/* ---------- таблицы версий ---------- */
// [байт коррекции на блок, блоков в группе 1, данных в блоке группы 1,
//  блоков в группе 2, данных в блоке группы 2] для версий 1..10.
const QR_ECC = {
  L: [[7,1,19,0,0],[10,1,34,0,0],[15,1,55,0,0],[20,1,80,0,0],[26,1,108,0,0],
      [18,2,68,0,0],[20,2,78,0,0],[24,2,97,0,0],[30,2,116,0,0],[18,2,68,2,69]],
  M: [[10,1,16,0,0],[16,1,28,0,0],[26,1,44,0,0],[18,2,32,0,0],[24,2,43,0,0],
      [16,4,27,0,0],[18,4,31,0,0],[22,2,38,2,39],[22,3,36,2,37],[26,4,43,1,44]],
  Q: [[13,1,13,0,0],[22,1,22,0,0],[18,2,17,0,0],[26,2,24,0,0],[18,2,15,2,16],
      [24,4,19,0,0],[18,2,14,4,15],[22,4,18,2,19],[20,4,16,4,17],[24,6,19,2,20]],
  H: [[17,1,9,0,0],[28,1,16,0,0],[22,2,13,0,0],[16,4,9,0,0],[22,2,11,2,12],
      [28,4,15,0,0],[26,4,13,1,14],[26,4,14,2,15],[24,4,12,4,13],[28,6,15,2,16]],
};

// Где стоят выравнивающие квадраты (кроме углов с «прицелами»)
const QR_ALIGN = [[], [6,18], [6,22], [6,26], [6,30], [6,34],
                  [6,22,38], [6,24,42], [6,26,46], [6,28,50]];

const QR_EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

/* ---------- кодирование ---------- */

/** Текст → байты UTF-8. Кириллица в QR живёт именно так. */
function qrUtf8(text) {
  const out = [];
  const enc = encodeURIComponent(text);
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === "%") { out.push(parseInt(enc.substr(i + 1, 2), 16)); i += 2; }
    else out.push(enc.charCodeAt(i));
  }
  return out;
}

/** Сколько данных влезает в версию при данном уровне коррекции. */
function qrCapacity(version, level) {
  const [ec, g1, d1, g2, d2] = QR_ECC[level][version - 1];
  return g1 * d1 + g2 * d2;
}

/** Собирает поток кодовых слов: режим, длина, данные, хвост, заполнитель. */
function qrDataCodewords(bytes, version, level) {
  const capacity = qrCapacity(version, level);
  const bits = [];
  const push = (value, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };
  push(0b0100, 4);                                  // байтовый режим
  push(bytes.length, version <= 9 ? 8 : 16);        // длина
  bytes.forEach(b => push(b, 8));
  // терминатор: до четырёх нулей, но не длиннее остатка
  const free = capacity * 8 - bits.length;
  push(0, Math.min(4, free));
  while (bits.length % 8) bits.push(0);             // добить до байта
  const words = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  // Стандартный заполнитель — чередование двух байт
  const PAD = [0xec, 0x11];
  for (let i = 0; words.length < capacity; i++) words.push(PAD[i % 2]);
  return words;
}

/** Данные + коррекция, перемешанные по блокам, как требует стандарт. */
function qrFinalMessage(bytes, version, level) {
  const [ecLen, g1, d1, g2, d2] = QR_ECC[level][version - 1];
  const words = qrDataCodewords(bytes, version, level);

  const blocks = [], ecBlocks = [];
  let pos = 0;
  for (let i = 0; i < g1; i++) { blocks.push(words.slice(pos, pos + d1)); pos += d1; }
  for (let i = 0; i < g2; i++) { blocks.push(words.slice(pos, pos + d2)); pos += d2; }
  blocks.forEach(b => ecBlocks.push(qrEcBytes(b, ecLen)));

  // Чередуем байты блоков: первый байт каждого блока, второй каждого и так
  // далее. Это и делает код устойчивым к пятну — повреждение размазывается
  // по всем блокам вместо одного.
  const out = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i++) {
    blocks.forEach(b => { if (i < b.length) out.push(b[i]); });
  }
  for (let i = 0; i < ecLen; i++) ecBlocks.forEach(b => out.push(b[i]));
  return out;
}

/* ---------- матрица ---------- */

function qrEmpty(size) {
  return Array.from({ length: size }, () => new Array(size).fill(null));
}

function qrPlaceFinder(m, row, col) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const rr = row + r, cc = col + c;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6))
                  || (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m[rr][cc] = inRing || inCore;
    }
  }
}

function qrPlaceAlign(m, version) {
  const pos = QR_ALIGN[version - 1];
  for (const r of pos) {
    for (const c of pos) {
      // углы заняты «прицелами»
      if (m[r][c] !== null) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          m[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }
}

/** Служебные модули: их нельзя занимать данными. */
function qrReserved(size, version) {
  const res = Array.from({ length: size }, () => new Array(size).fill(false));
  const mark = (r, c) => { if (r >= 0 && c >= 0 && r < size && c < size) res[r][c] = true; };
  [[0, 0], [0, size - 7], [size - 7, 0]].forEach(([r, c]) => {
    for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) mark(r + dr, c + dc);
  });
  for (let i = 0; i < size; i++) { mark(6, i); mark(i, 6); }      // синхродорожки
  // поля формата
  for (let i = 0; i < 9; i++) { mark(8, i); mark(i, 8); }
  for (let i = 0; i < 8; i++) { mark(8, size - 1 - i); mark(size - 1 - i, 8); }
  // поля версии (с 7-й)
  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
      mark(size - 11 + j, i); mark(i, size - 11 + j);
    }
  }
  // выравнивающие квадраты
  const pos = QR_ALIGN[version - 1];
  for (const r of pos) for (const c of pos) {
    const corner = (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
    if (corner) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) mark(r + dr, c + dc);
  }
  return res;
}

/** Раскладка данных «змейкой» снизу вверх, по два столбца. */
function qrPlaceData(m, reserved, data) {
  const size = m.length;
  let bit = 0;
  const nextBit = () => {
    const byte = data[bit >> 3];
    const b = byte === undefined ? 0 : (byte >> (7 - (bit & 7))) & 1;
    bit++;
    return b === 1;
  };
  let up = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;                       // шестой столбец занят дорожкой
    for (let i = 0; i < size; i++) {
      const row = up ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (reserved[row][c]) continue;
        m[row][c] = nextBit();
      }
    }
    up = !up;
  }
}

const QR_MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0,
];

/** Штраф за «плохой» рисунок: чем меньше, тем надёжнее читается. */
function qrPenalty(m) {
  const n = m.length;
  let score = 0;
  // 1. подряд идущие одинаковые модули
  for (let i = 0; i < n; i++) {
    for (const line of [m[i], m.map(row => row[i])]) {
      let run = 1;
      for (let j = 1; j < n; j++) {
        if (line[j] === line[j - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
        else run = 1;
      }
    }
  }
  // 2. квадраты 2×2 одного цвета
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) {
    const v = m[r][c];
    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
  }
  // 3. рисунок, похожий на «прицел»
  const PAT1 = [1,0,1,1,1,0,1,0,0,0,0], PAT2 = [0,0,0,0,1,0,1,1,1,0,1];
  const same = (line, from, pat) => pat.every((v, k) => (line[from + k] ? 1 : 0) === v);
  for (let i = 0; i < n; i++) {
    const rows = [m[i], m.map(row => row[i])];
    for (const line of rows) {
      for (let j = 0; j + 11 <= n; j++) {
        if (same(line, j, PAT1) || same(line, j, PAT2)) score += 40;
      }
    }
  }
  // 4. перекос баланса чёрного и белого
  let dark = 0;
  m.forEach(row => row.forEach(v => { if (v) dark++; }));
  const percent = dark * 100 / (n * n);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

/** 15-битное поле формата: уровень коррекции и номер маски. */
function qrFormatBits(level, mask) {
  let data = (QR_EC_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18-битное поле версии (нужно с версии 7). */
function qrVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
  return (version << 12) | rem;
}

function qrApplyFormat(m, level, mask) {
  // Порядок здесь легко перепутать: в спецификации координаты идут
  // (столбец, строка), а в матрице — m[строка][столбец]. На этом я и
  // споткнулся: код выглядел рабочим, но ни один телефон его не читал,
  // потому что обе копии поля формата лежали транспонированно.
  const n = m.length;
  const bits = qrFormatBits(level, mask);
  const bit = i => ((bits >> i) & 1) === 1;
  // первая копия — вокруг левого верхнего «прицела»
  for (let i = 0; i <= 5; i++) m[i][8] = bit(i);
  m[7][8] = bit(6);
  m[8][8] = bit(7);
  m[8][7] = bit(8);
  for (let i = 9; i <= 14; i++) m[8][14 - i] = bit(i);
  // вторая копия — снизу и справа
  for (let i = 0; i <= 7; i++) m[8][n - 1 - i] = bit(i);
  for (let i = 8; i <= 14; i++) m[n - 15 + i][8] = bit(i);
  m[n - 8][8] = true;                             // всегда чёрный модуль
}

function qrApplyVersion(m, version) {
  if (version < 7) return;
  const n = m.length;
  const bits = qrVersionBits(version);
  for (let i = 0; i < 18; i++) {
    const on = ((bits >> i) & 1) === 1;
    const r = Math.floor(i / 3), c = i % 3;
    m[n - 11 + c][r] = on;
    m[r][n - 11 + c] = on;
  }
}

/**
 * Матрица QR для текста.
 * @returns {boolean[][]} true — чёрный модуль.
 */
function qrMatrix(text, opts) {
  // По умолчанию Q (восстанавливает четверть кода), а не спецификационный M.
  // Наши коды печатают на листке и показывают с экрана через весь класс:
  // палец, сгиб и блик — обычное дело. Разница в размере копеечная —
  // ссылка на приглашение занимает версию 3 вместо версии 2.
  const level = (opts && opts.level) || "Q";
  const bytes = qrUtf8(text);
  let version = 0;
  for (let v = 1; v <= 10; v++) {
    // 2 байта служебных (режим + длина) при версиях до 9, 3 — дальше
    const overhead = v <= 9 ? 2 : 3;
    if (bytes.length + overhead <= qrCapacity(v, level)) { version = v; break; }
  }
  if (!version) throw new Error("Слишком длинный текст для QR версии до 10");

  const size = 17 + version * 4;
  const data = qrFinalMessage(bytes, version, level);
  const reserved = qrReserved(size, version);

  const base = qrEmpty(size);
  qrPlaceFinder(base, 0, 0);
  qrPlaceFinder(base, 0, size - 7);
  qrPlaceFinder(base, size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    base[6][i] = i % 2 === 0;
    base[i][6] = i % 2 === 0;
  }
  qrPlaceAlign(base, version);
  qrApplyVersion(base, version);
  qrPlaceData(base, reserved, data);

  // Выбираем маску с наименьшим штрафом — так велит стандарт
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const m = base.map(row => row.slice());
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!reserved[r][c] && QR_MASKS[mask](r, c)) m[r][c] = !m[r][c];
    }
    qrApplyFormat(m, level, mask);
    const score = qrPenalty(m);
    if (score < bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/**
 * QR как SVG-строка. Вектор, а не картинка: одинаково чёткий и на экране
 * телефона, и на распечатке А4.
 */
function qrSvg(text, opts) {
  const o = opts || {};
  const m = qrMatrix(text, o);
  const n = m.length;
  const quiet = o.quiet === undefined ? 4 : o.quiet;   // белое поле по краям обязательно
  const total = n + quiet * 2;
  const dark = o.dark || "#12341A";
  const light = o.light || "#FFFFFF";
  let path = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" `
       + `shape-rendering="crispEdges" role="img" aria-label="QR-код со ссылкой">`
       + `<rect width="${total}" height="${total}" fill="${light}"/>`
       + `<path d="${path}" fill="${dark}"/></svg>`;
}
