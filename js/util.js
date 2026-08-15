// Общие утилиты для страницы ученика и панели репетитора.

/** Экранирование для вставки в HTML.
 * Имена учеников, слова словаря и заголовки домашки пишут люди —
 * без этого ученик, назвавшись «<img onerror=…>», выполнил бы свой код
 * в браузере репетитора и увёл его кабинет. */
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Безопасная подстановка в шаблонную строку: html`<b>${имя}</b>` */
function html(strings, ...values) {
  return strings.reduce((out, s, i) => out + s + (i < values.length ? esc(values[i]) : ""), "");
}

/** Витрина без бэкенда (GitHub Pages и любая статика).
 * Там нет server.py, поэтому панель репетитора, домашка и синхронизация
 * работать не могут — сайт должен это честно объяснить, а не «зависать». */
const STATIC_HOSTS = ["github.io", "githubusercontent.com", "netlify.app", "vercel.app"];

function isStaticHost() {
  if (location.protocol === "file:") return true;
  return STATIC_HOSTS.some(h => location.hostname.endsWith(h));
}

/** Проверка живого API: один раз за загрузку страницы. */
let _apiAlivePromise = null;
function apiAlive() {
  if (isStaticHost()) return Promise.resolve(false);
  if (!_apiAlivePromise) {
    _apiAlivePromise = fetch("health", { method: "GET" })
      .then(r => r.ok)
      .catch(() => false);
  }
  return _apiAlivePromise;
}

/* ---------- Показать пароль ----------
 * Глазок у поля. Пароль здесь не «раскрывается» из базы — там лежит хеш,
 * а не пароль, и показать сохранённый нельзя в принципе. Это про другое:
 * увидеть, что ты сам сейчас набрал. На телефоне вслепую промахнуться
 * мимо клавиши — обычное дело, а форма в ответ говорит только «неверный
 * пароль», не уточняя, что не так.
 *
 * Разметка: .pass-field > input + button.pass-eye[data-eye="id-поля"]
 * Иконку рисуем через icon() — если icons.js не загрузился, кнопка
 * останется пустой, но рабочей. */
function paintPassEyes(root) {
  (root || document).querySelectorAll(".pass-eye").forEach(btn => {
    if (btn.dataset.wired) return;
    btn.dataset.wired = "1";
    const field = document.getElementById(btn.dataset.eye);
    if (!field) return;
    const draw = () => {
      const shown = field.type === "text";
      if (typeof icon === "function") btn.innerHTML = icon(shown ? "eye-off" : "eye", 18);
      btn.setAttribute("aria-label", shown ? "Скрыть пароль" : "Показать пароль");
      btn.setAttribute("aria-pressed", shown ? "true" : "false");
    };
    btn.addEventListener("click", () => {
      field.type = field.type === "password" ? "text" : "password";
      draw();
      // Возвращаем курсор в поле: иначе человек жмёт глазок и продолжает
      // печатать в пустоту.
      field.focus();
    });
    draw();
  });
}

document.addEventListener("DOMContentLoaded", () => paintPassEyes());

// ===== Подгрузка тяжёлых файлов по требованию =====

/** Загрузить скрипт один раз и дождаться его.
 *
 * Нужно ради двух файлов: js/words.js — это 1,1 МБ (326 КБ сжатыми,
 * 11 484 слова), js/phrases.js — ещё 150 КБ. Пока они висели обычными
 * тегами на странице, их качали ВСЕ и ВСЕГДА: и репетитор, который
 * просто открыл форму входа, и ученик, которому до словаря ещё три
 * экрана. На телефоне по медленной сети это прямая задержка до первой
 * буквы на экране.
 *
 * Версию (?v=) берём из адреса самой страницы: она там уже проставлена
 * bump.py, и второго места, где её надо не забыть поднять, не появляется.
 */
const _loading = {};
function loadScriptOnce(src) {
  if (_loading[src]) return _loading[src];
  _loading[src] = new Promise((resolve, reject) => {
    const ver = (document.querySelector('script[src*="?v="], link[href*="?v="]') || {});
    const m = String(ver.src || ver.href || "").match(/\?v=(\d+)/);
    const el = document.createElement("script");
    el.src = src + (m ? "?v=" + m[1] : "");
    el.onload = () => resolve(true);
    el.onerror = () => { delete _loading[src]; reject(new Error("не загрузился " + src)); };
    document.head.appendChild(el);
  });
  return _loading[src];
}

/** Словарь. Всё, что читает WORDS, обязано сначала дождаться этого. */
function ensureWords() {
  if (typeof WORDS !== "undefined") return Promise.resolve(true);
  return loadScriptOnce("js/words.js");
}

/** Выражения: фразовые глаголы, идиомы, коллокации. */
function ensurePhrases() {
  if (typeof PHRASES !== "undefined") return Promise.resolve(true);
  return loadScriptOnce("js/phrases.js");
}

// ===== Модальные окна =====
//
// Их на сайте шесть, и до этого места ни одно не было диалогом в том
// смысле, в каком его понимает браузер и программа чтения с экрана:
// просто <div>, который перестал быть hidden. Что из этого выходило:
//
//   • скринридер продолжал читать страницу ПОД окном и ни словом не
//     сообщал, что открылось окно;
//   • Tab уходил за окно — в кнопки, которые закрыты затемнением;
//   • Escape не закрывал (кроме двух мест, где это дописали руками);
//   • после закрытия фокус улетал в начало страницы, и человек,
//     работающий с клавиатуры, каждый раз шёл до нужного места заново.
//
// Здесь это чинится один раз для всех.

let _modalTitleId = 0;
const _modalBack = new WeakMap();   // окно -> куда вернуть фокус

function _focusable(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]),' +
    ' textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null || el === document.activeElement);
}

function openModal(target, opts) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  const card = el.querySelector(".modal-card") || el;

  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  const title = card.querySelector("h1, h2, h3");
  if (title) {
    if (!title.id) title.id = "modal-title-" + (++_modalTitleId);
    card.setAttribute("aria-labelledby", title.id);
  }

  _modalBack.set(el, document.activeElement);
  el.classList.remove("hidden");

  // Остальная страница выключается целиком: inert убирает её и из
  // порядка обхода табом, и из дерева доступности разом.
  [...document.body.children].forEach(n => {
    if (n !== el && !n.contains(el)) n.setAttribute("inert", "");
  });

  // Фокус внутрь: сначала то, что попросили, иначе первое поле,
  // иначе сам диалог — но не «куда-нибудь».
  const first = (opts && opts.focus && card.querySelector(opts.focus))
             || _focusable(card)[0];
  if (first) {
    first.focus();
  } else {
    card.tabIndex = -1;
    card.focus();
  }

  el._modalKeys = e => {
    if (e.key === "Escape") { e.preventDefault(); closeModal(el); return; }
    // Ловушка табом — на случай браузера без inert (и просто надёжнее)
    if (e.key !== "Tab") return;
    const items = _focusable(card);
    if (!items.length) return;
    const a = items[0], z = items[items.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  };
  el.addEventListener("keydown", el._modalKeys);

  // Клик по затемнению — тоже закрытие: так ведут себя все окна,
  // которыми человек пользовался до нашего.
  el._modalBackdrop = e => { if (e.target === el) closeModal(el); };
  el.addEventListener("click", el._modalBackdrop);
}

function closeModal(target) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return;
  el.classList.add("hidden");
  [...document.body.children].forEach(n => n.removeAttribute("inert"));
  if (el._modalKeys) el.removeEventListener("keydown", el._modalKeys);
  if (el._modalBackdrop) el.removeEventListener("click", el._modalBackdrop);
  const back = _modalBack.get(el);
  // Возврат фокуса туда, откуда пришли. Без этого человек с клавиатуры
  // после каждого окна оказывается в начале страницы.
  if (back && document.contains(back) && back.offsetParent !== null) back.focus();
  _modalBack.delete(el);
}

// ===== Объявления для программ чтения с экрана =====

/** Сказать вслух то, что зрячий видит глазами.
 *
 * Нужно там, где на экране что-то поменялось само: сменился раздел,
 * пришёл ответ сервера, засчитался ответ. Без этого незрячий ученик
 * нажимает «Словарь», ничего не слышит и не понимает, сработало ли.
 *
 * Область одна на страницу и создаётся при первом обращении: держать
 * её в разметке трёх страниц значит трижды забыть про неё при правках.
 */
function announce(text) {
  let box = document.getElementById("sr-announcer");
  if (!box) {
    box = document.createElement("div");
    box.id = "sr-announcer";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    // Видна только программе чтения: display:none и visibility:hidden
    // убрали бы её и оттуда тоже.
    box.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;"
      + "padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
    document.body.appendChild(box);
  }
  // Тот же текст подряд не читается второй раз — сбрасываем.
  box.textContent = "";
  setTimeout(() => { box.textContent = text; }, 40);
}
