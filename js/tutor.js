// Панель репетитора: вход, список учеников с прогрессом, выдача домашки.

const TOKEN_KEY = "savelyTutorToken";
let tutor = null;
let students = [];
let groups = [];
let tasks = [];
let messages = [];
let sortMode = "name";
let groupFilter = "all";   // "all" | "none" | id группы
let picked = [];           // слова для домашки

const $ = id => document.getElementById(id);

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

function token() { return localStorage.getItem(TOKEN_KEY) || ""; }

/** Постоянный идентификатор устройства.
 *  Нужен ровно для одного: бесплатный период выдаётся один раз на
 *  устройство. Раньше триал заканчивался — заводилась новая почта, и он
 *  начинался заново; почта бесплатна и бесконечна, устройство — нет.
 *
 *  Стирается вместе с localStorage и обходится режимом инкогнито, поэтому
 *  сервер на нём ничего не ЗАПРЕЩАЕТ: кабинет создастся в любом случае,
 *  просто без бесплатных дней. Строить на таком запрет — запереть честных
 *  и не задержать остальных.
 *
 *  Никаких отпечатков браузера: случайное число не рассказывает о человеке
 *  ничего, а canvas-фингерпринт — это слежка, и в продукте для детей ей
 *  не место. */
const DEVICE_KEY = "savelyDeviceId";
function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID()
                            : String(Date.now()) + Math.random().toString(36).slice(2));
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

// ===== Вход =====
let authMode = "login";

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    authMode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    $("name-row").classList.toggle("hidden", authMode === "login");
    const crow = $("consent-row");
    if (crow) crow.classList.toggle("hidden", authMode === "login");
    if ($("t-consent")) $("t-consent").required = authMode !== "login";
    const cr = $("count-row");
    if (cr) cr.classList.toggle("hidden", authMode === "login");
    $("auth-submit").textContent = authMode === "login" ? "Войти" : "Создать кабинет";
    $("auth-error").textContent = "";
  });
});

$("auth-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("t-email").value.trim();
  const password = $("t-pass").value;
  const name = $("t-name").value.trim();
  const countEl = $("t-count");
  const studentCount = countEl ? Number(countEl.value) || 0 : 0;
  if (authMode === "register") {
    const consent = $("t-consent");
    if (consent && !consent.checked) {
      $("auth-error").textContent =
        "Отметьте согласие на обработку данных — без него кабинет завести нельзя.";
      consent.focus();
      return;
    }
  }
  const path = authMode === "login" ? "/api/tutor/login" : "/api/tutor/register";
  let res;
  try {
    res = await api(path, { email, password, name, studentCount, deviceId: deviceId() });
  } catch (err) {
    $("auth-error").textContent = "Не дозвонились до сервера. Проверьте интернет и попробуйте ещё раз — данные на месте.";
    return;
  }
  if (!res.ok) {
    $("auth-error").textContent = res.error || "Не получилось.";
    return;
  }
  localStorage.setItem(TOKEN_KEY, res.token);
  if (res.tutor && res.tutor.email) localStorage.setItem("savelyTutorEmail", res.tutor.email);
  tutor = res.tutor;
  // Почта не подтверждена — панель не открываем: иначе регистрация
  // на чужой адрес сразу даёт доступ к данным учеников
  if (res.access === "expired" && typeof showPaywall === "function" && !res.needVerify) {
    showPaywall(res.tutor);
    return;
  }
  // Бесплатные дни с этого устройства уже брали. Сказать об этом надо
  // сразу и прямо: молча открыть кабинет без триала — это когда человек
  // по истечении бесплатных дней упирается в оплату и не понимает, за что.
  if (res.trialSkipped) {
    $("auth-error").textContent =
      "Кабинет создан, но бесплатные дни с этого устройства уже использованы — "
      + "они даются один раз. Если это ошибка, напишите @KOTSAVELII.";
  }
  if (res.needVerify && typeof showVerifyScreen === "function") {
    if (res.recoveryCode && typeof showRecoveryCode === "function") {
      showRecoveryCode(res.recoveryCode);
    }
    // Передаём и судьбу письма: если оно не ушло, экран не должен
    // утверждать, что ушло.
    showVerifyScreen(res.tutor && res.tutor.email,
                     { sent: res.mailSent, error: res.mailError });
    return;
  }
  openPanel();
  // код восстановления показываем один раз — второго шанса не будет
  if (res.recoveryCode && typeof showRecoveryCode === "function") {
    showRecoveryCode(res.recoveryCode);
  }
});

$("logout-btn").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

// ===== Навигация =====
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => {
      const on = b === btn;
      b.classList.toggle("active", on);
      // Активную вкладку было видно только по цвету — то есть незрячий
      // репетитор не знал, в каком он разделе. aria-current произносится.
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    // Список вкладок берём из самих кнопок: захардкоженный перечень
    // молча ломал каждую новую вкладку — она просто не открывалась
    document.querySelectorAll(".nav-btn").forEach(b => {
      const sec = $("tab-" + b.dataset.tab);
      if (sec) sec.classList.toggle("hidden", b.dataset.tab !== btn.dataset.tab);
    });
    if (btn.dataset.tab === "tasks") renderTasks();
    if (btn.dataset.tab === "checks") loadChecks();
  });
});

document.querySelectorAll(".stu-sort").forEach(btn => {
  btn.addEventListener("click", () => {
    sortMode = btn.dataset.sort;
    document.querySelectorAll(".stu-sort").forEach(b => b.classList.toggle("active", b === btn));
    renderStudents();
  });
});

// ===== Загрузка данных =====
/** Почта из последнего входа — нужна экрану подтверждения после перезагрузки,
 *  когда объекта tutor ещё нет. */
function pendingEmail() { return localStorage.getItem("savelyTutorEmail") || ""; }

async function openPanel() {
  $("screen-auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  // Словарь нужен только внутри панели — выбрать слова для домашки.
  // На экране входа он не нужен вообще, а это 326 КБ сжатыми: раньше
  // их качал каждый, кто просто открыл форму. Не ждём: список учеников
  // важнее, а подборщик слов лежит на другой вкладке.
  ensureWords().then(fillWordPicker).catch(() => {});
  await loadStudents();
  setInterval(loadStudents, 60000);  // подтягиваем свежий прогресс раз в минуту
}

/** Всё, что нельзя нарисовать без словаря. Зовётся, когда он приехал. */
function fillWordPicker() {
  fillLevels();
  renderWordPicker();
  renderPicked();
}

function showConnError(on) {
  let bar = document.getElementById("conn-error");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "conn-error";
    bar.className = "conn-error hidden";
    bar.textContent = "Нет связи — показываю последние загруженные данные. Обновится само, как только связь вернётся.";
    document.querySelector("main").prepend(bar);
  }
  bar.classList.toggle("hidden", !on);
}

async function loadStudents() {
  let res;
  try {
    res = await api("/api/tutor/students", { token: token() });
    // Оба состояния надо ПОКАЗАТЬ. Раньше на need_verify код молча выходил,
    // и репетитор видел открытую панель без учеников и без ссылки —
    // без единого намёка, что нужно подтвердить почту.
    if (res && res.error === "need_payment" && typeof showPaywall === "function") {
      showPaywall(tutor);
      return;
    }
    if (res && res.error === "need_verify" && typeof showVerifyScreen === "function") {
      showVerifyScreen((tutor && tutor.email) || pendingEmail());
      return;
    }
  } catch (e) {
    // без этого панель молча оставалась бы пустой и репетитор решил бы,
    // что учеников нет
    showConnError(true);
    return;
  }
  showConnError(false);
  if (!res.ok) {
    if (res.error === "unauthorized") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }
    return;
  }
  tutor = res.tutor;
  students = res.students || [];
  groups = res.groups || [];
  tasks = res.homework || [];
  messages = res.messages || [];
  $("tutor-name").textContent = tutor.name;
  $("stu-count").textContent = students.length;
  renderOnboarding();
  renderOverview();
  renderGroups();
  renderStudents();
  renderInvite();
  if (typeof renderLesson === "function") renderLesson();
  if (typeof renderNotify === "function") renderNotify();
  if (typeof fillGameSelect === "function") fillGameSelect();
  fillStudentSelect();
  fillMsgTarget();
  renderMessages();
  if (!$("tab-tasks").classList.contains("hidden")) renderTasks();
}

// ===== Группы =====
function groupById(id) { return groups.find(g => g.id === id); }

function renderGroups() {
  const box = $("group-chips");
  const counts = { none: students.filter(s => !s.groupId).length };
  groups.forEach(g => counts[g.id] = students.filter(s => s.groupId === g.id).length);
  const chip = (key, label, color) => `
    <button class="chip group-chip${groupFilter === key ? " active" : ""}" data-g="${key}"
      ${color ? `style="--gc:${esc(color)}"` : ""}>
      ${esc(label)} <b>${key === "all" ? students.length : (counts[key] || 0)}</b>
    </button>`;
  box.innerHTML =
    chip("all", "Все ученики") +
    groups.map(g => chip(String(g.id), g.name, g.color)).join("") +
    (counts.none ? chip("none", "Без группы") : "");

  box.querySelectorAll("[data-g]").forEach(b => {
    b.addEventListener("click", () => {
      groupFilter = b.dataset.g;
      renderGroups();
      renderStudents();
    });
  });
}

$("group-add").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("group-name").value.trim();
  if (!name) return;
  // Цвета групп берём из палитры темы, а не своим списком: прежний начинался
  // с того самого оранжевого и ночью светился на тёмном фоне.
  const palette = ["var(--soft-mint)", "var(--soft-sky)", "var(--soft-lavender)",
                   "var(--soft-clay)", "var(--accent-line)", "var(--line)"];
  await api("/api/tutor/group/create",
    { token: token(), name, color: palette[groups.length % palette.length] });
  $("group-name").value = "";
  loadStudents();
});

// ===== Обзор =====
function daysAgo(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

/** Аватар ученика: первая буква имени в кружке.
 *  Раньше тут стоял 🧑‍🎓 в блоке с классом .cat-avatar — то есть и чужой
 *  рисовки эмодзи, и класс от другой сущности: paintCats() при случайном
 *  вызове подменял «ученика» котом. Буква решает обе задачи сразу и в
 *  списке из двадцати учеников работает лучше двадцати одинаковых значков. */
function studentAvatar(name, size) {
  const letter = String(name || "?").trim().charAt(0).toUpperCase() || "?";
  return `<span class="stu-avatar" data-size="${size || "small"}"`
       + ` aria-hidden="true">${esc(letter)}</span>`;
}

function renderOverview() {
  const total = students.length;
  const learned = students.reduce((s, x) => s + (x.words?.learned || 0), 0);
  const activeWeek = students.filter(x => { const d = daysAgo(x.lastSeen); return d !== null && d <= 7; }).length;
  const sleeping = students.filter(x => { const d = daysAgo(x.lastSeen); return d === null || d > 7; }).length;
  // Кто забросил повторения — по границе из письма-дайджеста (сервер ставит
  // words.neglected). «Не заходили» ловит пропавших, эта плитка — тех, кто
  // заходит, но не повторяет: до неё такое было видно только в словаре ученика.
  const neglected = students.filter(x => x.words?.neglected).length;
  const overdueTotal = students.reduce((s, x) => s + (x.words?.overdue || 0), 0);
  $("overview").innerHTML = `
    <div class="card stat-card">
      <p class="stat-label">Учеников</p>
      <p class="stat-value">${total}</p>
      <p class="stat-note">всего в кабинете</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Занимались за неделю</p>
      <p class="stat-value">${activeWeek}</p>
      <p class="stat-note">${total ? Math.round(activeWeek / total * 100) : 0}% учеников</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Не заходили 7+ дней</p>
      <p class="stat-value" style="color:${sleeping ? "var(--red)" : "var(--green)"}">${sleeping}</p>
      <p class="stat-note">${sleeping ? "стоит напомнить" : "все на связи"}</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Выучено слов</p>
      <p class="stat-value">${learned}</p>
      <p class="stat-note">суммарно всеми</p>
    </div>
    <div class="card stat-card">
      <p class="stat-label">Забросили повторения</p>
      <p class="stat-value" style="color:${neglected ? "var(--red)" : "var(--green)"}">${neglected}</p>
      <p class="stat-note">${overdueTotal ? `ждут повторения: ${overdueTotal} ${plural(overdueTotal, "слово", "слова", "слов")}` : "просроченных слов нет"}</p>
    </div>`;
}

// ===== Список учеников =====
function sortedStudents() {
  let arr = [...students];
  if (groupFilter === "none") arr = arr.filter(s => !s.groupId);
  else if (groupFilter !== "all") arr = arr.filter(s => String(s.groupId) === groupFilter);
  if (sortMode === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  if (sortMode === "active") arr.sort((a, b) => (daysAgo(a.lastSeen) ?? 999) - (daysAgo(b.lastSeen) ?? 999));
  if (sortMode === "progress") arr.sort((a, b) => (b.words?.learned || 0) - (a.words?.learned || 0));
  // Кто больше всех запустил повторения — наверх: с них и начинать разговор
  if (sortMode === "overdue") arr.sort((a, b) => (b.words?.overdue || 0) - (a.words?.overdue || 0));
  return arr;
}

function lastSeenText(iso) {
  const d = daysAgo(iso);
  if (d === null) return { text: "ещё не заходил", cls: "bad" };
  if (d === 0) return { text: "сегодня", cls: "good" };
  if (d === 1) return { text: "вчера", cls: "good" };
  if (d <= 7) return { text: `${d} ${plural(d, "день", "дня", "дней")} назад`, cls: "" };
  return { text: `${d} ${plural(d, "день", "дня", "дней")} назад`, cls: "bad" };
}

/** Чип домашки в карточке ученика: слова — «сдано n/m», задание —
 *  результат подхода или «—», если ещё не открывал. */
function hwChip(h) {
  if (h.kind === "task") {
    const r = h.result;
    return `<span class="hw-chip ${r && !r.rushed ? "hw-chip-done" : ""}" ${r && r.rushed ? 'title="прокликано — не засчитано"' : ""}>
      ${iconInline("personal", 15)} ${esc(h.title)}: ${r ? `${r.correct}/${r.total}${r.rushed ? " ⚡" : ""}` : "—"}
    </span>`;
  }
  return `<span class="hw-chip ${h.done >= h.total ? "hw-chip-done" : ""}">
    ${iconInline("book", 15)} ${esc(h.title)}: ${h.done}/${h.total}
  </span>`;
}

function renderStudents() {
  const list = $("students-list");
  $("students-empty").classList.toggle("hidden", students.length > 0);
  list.innerHTML = sortedStudents().map(s => {
    const seen = lastSeenText(s.lastSeen);
    const w = s.words || {};
    const pct = w.total ? Math.round((w.learned / w.total) * 100) : 0;
    // Словарные домашки — с прогрессом по словам; задания-упражнения —
    // с результатом подхода. Фото-домашки в чипах не показываем: у них
    // нет цифры, они смотрятся на вкладке «Фото тетрадей».
    const hw = (s.homework || []).filter(h => h.total || h.kind === "task");
    return `
      <div class="card stu-card">
        <div class="stu-main">
          <div class="stu-id">
            ${studentAvatar(s.name, "small")}
            <div>
              <b class="stu-name">${esc(s.name)}</b>
              <p class="muted-small">
                <span class="seen ${seen.cls}">${seen.text}</span>
                ${s.streak >= 2 ? ` · ${iconInline("streak", 14)} ${s.streak} ${plural(s.streak, "день", "дня", "дней")} подряд` : ""}
              </p>
            </div>
          </div>
          <div class="stu-level">
            <select class="stu-group" data-group-for="${s.id}">
              <option value="">без группы</option>
              ${groups.map(g => `<option value="${g.id}"${s.groupId === g.id ? " selected" : ""}>${esc(g.name)}</option>`).join("")}
            </select>
            <span class="level-chip">${esc(s.level || "—")}</span>
            <span class="muted-small">⭐ ${s.xp || 0}</span>
          </div>
        </div>

        <div class="stu-bars">
          <div class="stu-bar-row">
            <span class="muted-small">Слова: ${w.learned || 0} выучено из ${w.total || 0}${
              // «Ждут повторения» — единственная цифра, по которой видно, что
              // ученик забросил, пока он ещё заходит. Красным — по той же
              // границе, что и письмо-дайджест (сервер ставит neglected).
              w.overdue ? ` · <span class="${w.neglected ? "seen bad" : ""}">ждут повторения: ${w.overdue}</span>` : ""}</span>
            <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
          </div>
        </div>

        ${hw.length ? `<div class="stu-hw">${hw.map(h => hwChip(h)).join("")}</div>` : ""}

        ${s.weak && s.weak.length ? `
          <details class="stu-weak">
            <summary>Проблемные слова (${s.weak.length})</summary>
            <div class="weak-list">${s.weak.map(x =>
              `<span class="weak-word">${esc(x.w)} <i>${esc(x.t)}</i> <b>−${x.forgot}</b></span>`).join("")}</div>
          </details>` : ""}

        <div class="stu-actions">
          <button class="btn btn-ghost btn-small" data-open="${s.id}">Открыть карточку</button>
          <button class="link-btn stu-del" data-del="${s.id}">удалить ученика</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => openStudent(Number(btn.dataset.open)));
  });

  list.querySelectorAll("[data-group-for]").forEach(sel => {
    sel.addEventListener("change", async () => {
      await api("/api/tutor/group/assign", {
        token: token(),
        studentId: Number(sel.dataset.groupFor),
        groupId: sel.value ? Number(sel.value) : null,
      });
      loadStudents();
    });
  });

  list.querySelectorAll("[data-del]").forEach(btn => {
    let armed = false;
    btn.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        btn.textContent = "точно удалить?";
        btn.classList.add("danger");
        setTimeout(() => { armed = false; btn.textContent = "удалить ученика"; btn.classList.remove("danger"); }, 4000);
        return;
      }
      await api("/api/tutor/student/delete", { token: token(), studentId: Number(btn.dataset.del) });
      loadStudents();
    });
  });
}

// ===== Карточка ученика =====
function activityStrip(activity) {
  // 28 дней: видно, регулярно ли занимается
  const out = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const xp = activity[key] || 0;
    const lvl = xp === 0 ? 0 : xp < 30 ? 1 : xp < 80 ? 2 : 3;
    out.push(`<i class="act act-${lvl}" title="${key}: ${xp} очков"></i>`);
  }
  return `<div class="act-strip">${out.join("")}</div>`;
}

async function openStudent(id) {
  const res = await api("/api/tutor/student", { token: token(), studentId: id });
  if (!res.ok) return;
  const s = res.student;
  const w = s.words || {};
  const grp = groupById(s.groupId);
  const seen = lastSeenText(s.lastSeen);
  const dict = s.dictionary || [];
  const learnedWords = dict.filter(d => d.status === "learned");

  $("modal-body").innerHTML = `
    <div class="modal-head">
      ${studentAvatar(s.name, "mid")}
      <div>
        <h2>${esc(s.name)}</h2>
        <p class="muted-small">
          <span class="seen ${seen.cls}">${seen.text}</span>
          ${grp ? ` · ${esc(grp.name)}` : ""}
          ${s.streak >= 2 ? ` · ${iconInline("streak", 14)} ${s.streak} ${plural(s.streak, "день", "дня", "дней")}` : ""}
        </p>
      </div>
    </div>

    ${s.restoreCode ? `
      <div class="restore-box">
        <p class="restore-label">Код для входа с другого устройства</p>
        <p class="restore-code-val">${esc(s.restoreCode)}</p>
        <p class="muted-note">Продиктуйте ученику, если он сменил телефон
          или потерял прогресс. На сайте: «Уже занимался?» → ввести код.</p>
      </div>` : ""}

    <div class="stats-grid">
      <div class="card stat-card"><p class="stat-label">Уровень</p>
        <select id="stu-level" class="type-input stu-level-select"
                title="Назначить уровень вручную">
          <option value="">${esc(s.level && !s.levelForced ? "по тесту — " + s.level : "по тесту")}</option>
          ${["A1", "A2", "B1", "B2", "C1", "C2"].map(l =>
            `<option value="${l}"${s.levelForced === l ? " selected" : ""}>${l}</option>`).join("")}
        </select>
        <p class="stat-note" id="stu-level-note">${s.levelForced
          ? "назначен вами" : `~${s.vocab || 0} слов запаса`}</p></div>
      <div class="card stat-card"><p class="stat-label">Выучено</p>
        <p class="stat-value">${w.learned || 0}</p>
        <p class="stat-note">из ${w.total || 0} в словаре</p></div>
      <div class="card stat-card"><p class="stat-label">Ждут повторения</p>
        <p class="stat-value"${w.neglected ? ` style="color:var(--red)"` : ""}>${w.overdue || 0}</p>
        <p class="stat-note">${w.neglected ? "повторения заброшены" : `из ${w.scheduled || 0} по расписанию`}</p></div>
      <div class="card stat-card"><p class="stat-label">Очки за неделю</p>
        <p class="stat-value">⭐ ${s.xpWeek || 0}</p>
        <p class="stat-note">за месяц: ${s.xpMonth || 0}</p></div>
      <div class="card stat-card"><p class="stat-label">Награды</p>
        <p class="stat-value">${iconInline("medal", 20)} ${(s.achievements || []).length}</p>
        <p class="stat-note">блиц-рекорд ${s.blitzBest || 0}</p></div>
    </div>

    <p class="stat-label" style="margin-top:18px">Занятия за 4 недели</p>
    ${activityStrip(s.activity || {})}

    ${s.homework && s.homework.filter(h => h.total || h.kind === "task").length ? `
      <p class="stat-label" style="margin-top:18px">Домашки</p>
      <div class="stu-hw">${s.homework.filter(h => h.total || h.kind === "task").map(h => hwChip(h)).join("")}</div>` : ""}

    ${s.weak && s.weak.length ? `
      <p class="stat-label" style="margin-top:18px">Проблемные слова</p>
      <div class="weak-list">${s.weak.map(x =>
        `<span class="weak-word">${esc(x.w)} <i>${esc(x.t)}</i> <b>−${x.forgot}</b></span>`).join("")}</div>` : ""}

    ${learnedWords.length ? `
      <details class="stu-weak" style="margin-top:14px">
        <summary>Выученные слова (${learnedWords.length})</summary>
        <div class="weak-list">${learnedWords.slice(0, 60).map(d =>
          `<span class="learned-word">${esc(d.w)} <i>${esc(d.t)}</i></span>`).join("")}</div>
      </details>` : ""}

    <p class="stat-label" style="margin-top:18px">Заметка (видите только вы)</p>
    <textarea id="stu-note" class="type-input type-area" rows="3"
      placeholder="Например: пропускает вторники, догнать времена">${esc(s.note || "")}</textarea>
    <div class="quiz-buttons" style="justify-content:flex-start">
      <button class="btn btn-primary btn-small" id="note-save">Сохранить заметку</button>
      <button class="btn btn-ghost btn-small" id="report-btn">${icon("book", 16)} Отчёт родителям</button>
    </div>
    <p class="type-feedback" id="note-msg"></p>`;

  openModal("stu-modal");

  // Уровень вручную: селект сохраняет сразу, ученик получит его при
  // следующей синхронизации (просьба совладельца — тест иногда врёт,
  // а слова для тренировок предлагаются от уровня).
  $("stu-level").addEventListener("change", async () => {
    const level = $("stu-level").value;
    const note = $("stu-level-note");
    note.textContent = "сохраняю…";
    const res = await api("/api/tutor/student/level",
      { token: token(), studentId: id, level });
    if (!res.ok) { note.textContent = res.error || "не сохранилось"; return; }
    note.textContent = level
      ? "назначен вами — применится у ученика при следующем заходе"
      : "снято — снова по тесту";
    s.levelForced = level;
    if (level) s.level = level;
  });

  $("note-save").addEventListener("click", async () => {
    await api("/api/tutor/student/note",
      { token: token(), studentId: id, note: $("stu-note").value });
    $("note-msg").className = "type-feedback ok";
    $("note-msg").textContent = "Заметка сохранена.";
    loadStudents();
  });
  $("report-btn").addEventListener("click", () => printReport(s, grp));
}

// Escape, клик по затемнению и возврат фокуса — всё внутри closeModal,
// см. js/util.js. Раньше слушатель Escape висел на документе постоянно
// и закрывал карточку ученика даже когда её никто не открывал.
$("modal-close").addEventListener("click", () => closeModal("stu-modal"));

/** Печатный отчёт — то, что репетитор сейчас пишет родителям руками. */
function printReport(s, grp) {
  const w = s.words || {};
  const days = Object.keys(s.activity || {}).length;
  const hw = s.homework || [];
  // Сдано: словарная — все слова; задание — есть результат; фото — не считаем
  const hwCounted = hw.filter(h => h.total || h.kind === "task");
  const hwDone = hwCounted.filter(h => h.kind === "task" ? !!(h.result && !h.result.rushed) : h.done >= h.total).length;
  const win = window.open("", "_blank", "width=760,height=900");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
  <title>Отчёт — ${esc(s.name)}</title>
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#2D2A26;
           max-width:680px; margin:40px auto; padding:0 20px; line-height:1.55; }
    h1 { font-size:24px; margin-bottom:4px; }
    .sub { color:#8A8279; margin-bottom:26px; }
    table { width:100%; border-collapse:collapse; margin:18px 0; }
    td { padding:9px 0; border-bottom:1px solid #EEE; }
    td:last-child { text-align:right; font-weight:700; }
    .box { background:#FFF8F0; border-radius:12px; padding:14px 18px; margin:18px 0; }
    ul { padding-left:20px; } li { margin:3px 0; }
    .foot { color:#8A8279; font-size:13px; margin-top:30px; }
    @media print { body { margin:0; } }
  </style></head><body>
  <h1>Отчёт об успеваемости</h1>
  <p class="sub">${esc(s.name)}${grp ? " · " + esc(grp.name) : ""} — английский язык, репетитор ${esc(tutor.name)}</p>

  <table>
    <tr><td>Уровень по тесту</td><td>${esc(s.level || "не определён")}</td></tr>
    <tr><td>Словарный запас (оценка)</td><td>~${s.vocab || 0} слов</td></tr>
    <tr><td>Слов в личном словаре</td><td>${w.total || 0}</td></tr>
    <tr><td>Из них выучено</td><td>${w.learned || 0}</td></tr>
    <tr><td>В процессе изучения</td><td>${w.learning || 0}</td></tr>
    <tr><td>Ждут повторения</td><td>${w.overdue || 0}</td></tr>
    <tr><td>Занятий за месяц</td><td>${days} ${plural(days, "день", "дня", "дней")}</td></tr>
    <tr><td>Занимается подряд</td><td>${s.streak || 0} ${plural(s.streak || 0, "день", "дня", "дней")}</td></tr>
    <tr><td>Домашних заданий выполнено</td><td>${hwDone} из ${hwCounted.length}</td></tr>
  </table>

  ${s.weak && s.weak.length ? `<div class="box">
    <b>Слова, которые стоит повторить дома:</b>
    <ul>${s.weak.map(x => `<li>${esc(x.w)} — ${esc(x.t)}</li>`).join("")}</ul>
  </div>` : ""}

  ${s.note ? `<div class="box"><b>Комментарий репетитора:</b><br>${esc(s.note)}</div>` : ""}

  <p class="foot">Отчёт сформирован ${new Date().toLocaleDateString("ru-RU")} в учебном сервисе «Савелий».</p>
  <script>window.onload = () => window.print();<\/script>
  </body></html>`);
  win.document.close();
}

// ===== Сообщения ученикам =====

function fillMsgTarget() {
  const sel = $("msg-target");
  const cur = sel.value;
  sel.innerHTML = `<option value="">всем ученикам</option>` +
    (groups.length
      ? `<optgroup label="Группы">${groups.map(g =>
          `<option value="g${g.id}">${esc(g.name)}</option>`).join("")}</optgroup>` : "") +
    `<optgroup label="Ученики">${students.map(s =>
      `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>`;
  if (cur) sel.value = cur;
}

function renderMessages() {
  const box = $("msg-list");
  if (!box) return;
  box.innerHTML = messages.length
    ? messages.map(m => {
        let who = "всем";
        if (m.studentId) {
          const s = students.find(x => x.id === m.studentId);
          who = s ? s.name : "ученику";
        } else if (m.groupId) {
          const g = groupById(m.groupId);
          who = g ? g.name : "группе";
        }
        return `
          <div class="msg-row">
            <span class="msg-to">${esc(who)}</span>
            <span class="msg-text">${esc(m.text)}</span>
            <button class="link-btn" data-msg="${m.id}">убрать</button>
          </div>`;
      }).join("")
    : "";
  box.querySelectorAll("[data-msg]").forEach(b => {
    b.addEventListener("click", async () => {
      await api("/api/tutor/message/archive", { token: token(), id: Number(b.dataset.msg) });
      loadStudents();
    });
  });
}

$("msg-send").addEventListener("click", async () => {
  const text = $("msg-text").value.trim();
  const status = $("msg-status");
  if (!text) {
    status.className = "type-feedback err";
    status.textContent = "Напишите текст сообщения.";
    return;
  }
  const target = $("msg-target").value;
  const res = await api("/api/tutor/message", {
    token: token(), text,
    studentId: target && !target.startsWith("g") ? target : null,
    groupId: target.startsWith("g") ? target.slice(1) : null,
  });
  status.className = res.ok ? "type-feedback ok" : "type-feedback err";
  status.textContent = res.ok
    ? `Отправлено: ${$("msg-target").selectedOptions[0].textContent}. Ученики увидят на главной.`
    : (res.error || "Не получилось.");
  if (res.ok) { $("msg-text").value = ""; loadStudents(); }
});

// ===== Выданные домашки =====
function renderTasks() {
  const box = $("tasks-list");
  $("tasks-empty").classList.toggle("hidden", tasks.length > 0);
  box.innerHTML = tasks.map(t => {
    // кому адресовано — тому и считаем выполнение
    let targets = students;
    let who = "всем ученикам";
    if (t.studentId) {
      targets = students.filter(s => s.id === t.studentId);
      who = targets[0] ? targets[0].name : "ученику";
    } else if (t.groupId) {
      targets = students.filter(s => s.groupId === t.groupId);
      const g = groupById(t.groupId);
      who = g ? g.name : "группе";
    }
    // Чем сдаётся: словами (по словарю), упражнением (результат подхода)
    // или фото/чтением (смотреть на вкладке «Фото тетрадей»).
    const kind = t.kind || (t.words.length ? "words" : "photo");
    const rows = targets.map(s => {
      const h = (s.homework || []).find(x => x.id === t.id);
      if (kind === "task") {
        const r = h && h.result;
        // Прокликанный подход (⚡) сданным не считается: результат есть,
        // но получен без чтения — см. «Защита от прокликивания» у ученика.
        const detail = r && (r.tries > 1 || r.rushed)
          ? ` · ${r.tries} ${plural(r.tries, "попытка", "попытки", "попыток")}${
              r.first !== undefined && r.first !== null && r.tries > 1 ? `, первая ${r.first}/${r.total}` : ""}`
          : "";
        return { name: s.name, ok: !!r && !r.rushed, rushed: !!(r && r.rushed),
                 label: r ? `${r.correct}/${r.total}${r.rushed ? " ⚡" : ""}${detail}` : "—" };
      }
      if (kind === "photo") return { name: s.name, ok: false, label: "фото" };
      const done = h ? h.done : 0, total = h ? h.total : t.words.length;
      return { name: s.name, done, total, ok: total && done >= total, label: `${done}/${total}` };
    });
    const ready = rows.filter(r => r.ok).length;
    const overdue = t.dueDate && new Date(t.dueDate) < new Date() && ready < rows.length;
    const what = kind === "words" ? `${t.words.length} слов`
      : kind === "task" ? (t.game === "custom" ? "своё задание" : t.game === "grammar" ? "грамматика" : "словообразование")
      : (t.hasReading && !t.hasText ? "чтение вслух" : "по фото тетради");
    return `
      <div class="card task-card${overdue ? " task-overdue" : ""}">
        <div class="task-head">
          <div>
            <b class="task-title">${esc(t.title)}</b>
            <p class="muted-small">${esc(who)} · ${esc(what)}${t.dueDate ? " · до " + esc(t.dueDate) : ""}</p>
          </div>
          ${kind === "photo" ? "" : `<div class="task-stat">
            <b>${ready} / ${rows.length}</b>
            <span class="muted-small">сдали</span>
          </div>`}
        </div>
        <div class="task-rows">
          ${rows.map(r => `
            <span class="task-pupil ${r.ok ? "ok" : "no"}">
              ${r.ok ? iconInline("check", 15) : iconInline("clock", 15)} ${esc(r.name)} <b>${esc(r.label)}</b>
            </span>`).join("")}
        </div>
        ${kind === "photo" ? `<p class="muted-small">Сдаётся ${t.hasReading && !t.hasText ? "записью чтения" : "фото тетради"} — смотрите на вкладке «Фото тетрадей».</p>` : ""}
        ${kind === "task" && t.game === "custom" && t.tasksetId ? `<p class="muted-small">Набор из «Своих заданий». Ученик может проходить сколько угодно раз — засчитывается лучший честный результат.</p>` : ""}
        ${rows.some(r => r.rushed) ? `<p class="muted-small">⚡ — прокликано: ответы шли быстрее, чем можно прочитать вопрос. Очки за такой подход не начислены, сданным он не считается.</p>` : ""}
        ${t.words.length ? `<div class="task-words">${t.words.slice(0, 12).map(w =>
          `<span class="task-word">${esc(w.w)}</span>`).join("")}${t.words.length > 12 ? " …" : ""}</div>` : ""}
        <button class="link-btn" data-arch="${t.id}">убрать из списка</button>
      </div>`;
  }).join("");

  box.querySelectorAll("[data-arch]").forEach(btn => {
    btn.addEventListener("click", async () => {
      await api("/api/tutor/homework/archive", { token: token(), id: Number(btn.dataset.arch) });
      loadStudents();
      renderTasks();
    });
  });
}

// ===== Ссылка =====
function renderInvite() {
  const url = location.origin + location.pathname.replace(/tutor\.html$/, "index.html") + "?join=" + tutor.inviteCode;
  $("invite-url").value = url;
  $("invite-code").textContent = tutor.inviteCode;
  renderInviteQr(url);
}

/** QR со ссылкой приглашения. Рисуем сами (js/qr.js) — ссылка с кодом
 *  никуда не уходит, и панель продолжает работать без интернета. */
function renderInviteQr(url) {
  const box = $("invite-qr");
  if (!box || typeof qrSvg !== "function") return;
  box.innerHTML = qrSvg(url, { level: "Q" });
  box.dataset.url = url;
}

/** Картинкой — чтобы вставить в презентацию или отправить родителям.
 *  Векторный SVG переводим в PNG через canvas: PNG открывается везде,
 *  включая старые мессенджеры, которые SVG показывать не умеют. */
function qrToPng(url, size, done) {
  const svg = qrSvg(url, { level: "Q" });
  const img = new Image();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const src = URL.createObjectURL(blob);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;      // модули должны остаться резкими
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(src);
    canvas.toBlob(done, "image/png");
  };
  img.onerror = () => { URL.revokeObjectURL(src); done(null); };
  img.src = src;
}

document.addEventListener("DOMContentLoaded", () => {
  const save = $("qr-save"), print = $("qr-print");
  if (save) save.addEventListener("click", () => {
    const url = $("invite-qr").dataset.url;
    if (!url) return;
    qrToPng(url, 1000, blob => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "wordcat-qr-" + (tutor && tutor.inviteCode ? tutor.inviteCode : "invite") + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  // Печать: отдельное окно с крупным кодом и подписью. Печатать саму
  // панель нельзя — на лист уедут таблицы, кнопки и меню.
  if (print) print.addEventListener("click", () => {
    const url = $("invite-qr").dataset.url;
    if (!url) return;
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const name = (tutor && tutor.name) ? esc(tutor.name) : "";
    w.document.write(`<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
      <title>QR для учеников</title><style>
        @page { margin: 18mm; }
        body { font-family: system-ui, sans-serif; color: #24302A; text-align: center;
               display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 24px; }
        h1 { font-size: 30px; margin: 0; }
        p { margin: 0; font-size: 17px; color: #5A665E; max-width: 46ch; line-height: 1.5; }
        .qr { width: 320px; height: 320px; }
        .url { font-family: ui-monospace, monospace; font-size: 15px; word-break: break-all; }
        .code { font-size: 26px; font-weight: 700; letter-spacing: .1em; }
      </style></head><body>
      <h1>Английский с котом Савелием</h1>
      <p>Наведи камеру телефона на код — откроется регистрация${name ? " у репетитора " + name : ""}.
         Имя, и можно заниматься.</p>
      <div class="qr">${qrSvg(url, { level: "Q" })}</div>
      <p class="code">${esc(tutor && tutor.inviteCode ? tutor.inviteCode : "")}</p>
      <p class="url">${esc(url)}</p>
      </body></html>`);
    w.document.close();
    // Печать зовём после отрисовки: без задержки часть браузеров
    // печатает пустой лист.
    setTimeout(() => { w.focus(); w.print(); }, 350);
  });
});

$("copy-link").addEventListener("click", () => {
  const input = $("invite-url");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    $("copy-link").textContent = "Скопировано ✓";
    // возвращаем ПОЛНУЮ подпись, а не однословное «Копировать»: после
    // копирования кнопка теряла смысл — непонятно, что именно копировать
    setTimeout(() => ($("copy-link").textContent = "Скопировать ссылку"), 2000);
  }).catch(() => document.execCommand("copy"));
});

// ===== Домашка =====
function fillStudentSelect() {
  const sel = $("hw-student");
  const cur = sel.value;
  sel.innerHTML = `<option value="">всем ученикам</option>` +
    (groups.length
      ? `<optgroup label="Группы">${groups.map(g =>
          `<option value="g${g.id}">${esc(g.name)}</option>`).join("")}</optgroup>` : "") +
    `<optgroup label="Ученики">${students.map(s =>
      `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</optgroup>`;
  if (cur) sel.value = cur;
}

function fillLevels() {
  // Словарь подгружается отдельно (см. openPanel). Если репетитор успел
  // щёлкнуть по вкладке раньше, чем он приехал, — говорим об этом, а
  // не падаем с пустым списком, из которого не понять, что происходит.
  if (typeof WORDS === "undefined") return;
  $("hw-level").innerHTML = LEVELS.map(l =>
    `<option value="${l}">${l} — ${LEVEL_NAMES[l]}</option>`).join("");
  $("hw-level").value = "A2";
  // темы: репетитор выдаёт «еду» или «путешествия» одним махом
  const cats = [...new Set(LEVELS.flatMap(l => WORDS[l].map(w => w.cat)))]
    .filter(Boolean)
    .sort((a, b) => (CATEGORY_NAMES[a] || a).localeCompare(CATEGORY_NAMES[b] || b, "ru"));
  $("hw-topic").innerHTML = `<option value="">все темы</option>` +
    cats.map(c => `<option value="${c}">${esc(CATEGORY_NAMES[c] || c)}</option>`).join("");
}

// выбрать сразу все слова из текущего фильтра
$("hw-pick-all").addEventListener("click", () => {
  const lvl = $("hw-level").value;
  const q = $("hw-search").value.trim().toLowerCase();
  const topic = $("hw-topic").value;
  if (typeof WORDS === "undefined") return;
  (WORDS[lvl] || [])
    .filter(w => (!topic || w.cat === topic) &&
                 (!q || w.w.toLowerCase().includes(q) || w.t.toLowerCase().includes(q)))
    .forEach(w => {
      if (!picked.some(p => p.w.toLowerCase() === w.w.toLowerCase())) {
        picked.push({ w: w.w, t: w.t, ex: w.ex, level: lvl });
      }
    });
  renderWordPicker();
  renderPicked();
  // подсветим уже выбранные
  document.querySelectorAll("#hw-words .hw-word").forEach(b => {
    if (picked.some(p => p.w === b.dataset.w)) b.classList.add("picked");
  });
});

$("hw-topic").addEventListener("change", renderWordPicker);

function renderWordPicker() {
  if (typeof WORDS === "undefined") {
    $("hw-words").innerHTML = '<p class="muted-small">Загружаю словарь…</p>';
    return;
  }
  const lvl = $("hw-level").value;
  const q = $("hw-search").value.trim().toLowerCase();
  const topic = $("hw-topic") ? $("hw-topic").value : "";
  const pool = (WORDS[lvl] || []).filter(w =>
    (!topic || w.cat === topic) &&
    (!q || w.w.toLowerCase().includes(q) || w.t.toLowerCase().includes(q)));
  const pickAll = $("hw-pick-all");
  if (pickAll) {
    pickAll.textContent = `выбрать всё (${pool.length})`;
    pickAll.classList.toggle("hidden", !pool.length);
  }
  const chosen = new Set(picked.map(p => p.w.toLowerCase()));
  $("hw-words").innerHTML = pool.map(w => `
    <button class="hw-word${chosen.has(w.w.toLowerCase()) ? " picked" : ""}" data-w="${esc(w.w)}">
      <!-- Здесь сознательно эмодзи, а не фотография. Панель — рабочий
           список на 311 строк, по которому репетитор быстро скользит
           глазами; фотографии есть у 39 слов из этих 311, и вперемешку
           с эмодзи они не помогают опознать слово, а сбивают ритм.
           Ученику фотография нужна (он по ней запоминает), репетитору —
           нет, он и так знает, что значит слово. -->
      <span class="hw-word-art" style="background:${wordTint(w.cat)}">${esc(wordArt(w.w, w.cat))}</span>
      <span class="hw-word-en">${esc(w.w)}</span>
      <span class="hw-word-ru">${esc(w.t)}</span>
    </button>`).join("");
  $("hw-words").querySelectorAll("[data-w]").forEach(btn => {
    btn.addEventListener("click", () => {
      const rec = pool.find(x => x.w === btn.dataset.w);
      togglePick({ w: rec.w, t: rec.t, ex: rec.ex, level: lvl });
    });
  });
}

function togglePick(word) {
  const i = picked.findIndex(p => p.w.toLowerCase() === word.w.toLowerCase());
  if (i >= 0) picked.splice(i, 1);
  else picked.push(word);
  // подсвечиваем только эту кнопку — перерисовка всего списка
  // сбрасывала бы прокрутку при выборе десятка слов
  const btn = $("hw-words").querySelector(`[data-w="${CSS.escape(word.w)}"]`);
  if (btn) btn.classList.toggle("picked", i < 0);
  renderPicked();
}

function renderPicked() {
  $("hw-selected").innerHTML = picked.length
    ? `<p class="muted-small">Выбрано слов: <b>${picked.length}</b></p>` +
      picked.map(p => `<span class="picked-chip" data-rm="${esc(p.w)}">${esc(p.w)} <i>${esc(p.t)}</i> ${iconInline("cross", 13)}</span>`).join("")
    : `<p class="muted-small">Слова ещё не выбраны.</p>`;
  $("hw-selected").querySelectorAll("[data-rm]").forEach(chip => {
    chip.addEventListener("click", () => togglePick({ w: chip.dataset.rm, t: "" }));
  });
}

$("hw-level").addEventListener("change", renderWordPicker);
$("hw-search").addEventListener("input", renderWordPicker);

$("hw-custom").addEventListener("submit", e => {
  e.preventDefault();
  const en = $("hw-own-en").value.trim();
  const ru = $("hw-own-ru").value.trim();
  if (!en || !ru) return;
  togglePick({ w: en, t: ru, ex: "", level: $("hw-level").value });
  $("hw-own-en").value = "";
  $("hw-own-ru").value = "";
});

$("hw-send").addEventListener("click", async () => {
  const msg = $("hw-msg");
  const game = $("hw-game") ? $("hw-game").value : "";
  const taskText = $("hw-task") ? $("hw-task").value.trim() : "";
  const readingText = $("hw-reading") ? $("hw-reading").value.trim() : "";
  const tasksetId = game === "custom" && $("hw-taskset") ? Number($("hw-taskset").value) || null : null;
  // Домашка без слов имеет смысл, если есть чем её сдать: текст задания,
  // чтение вслух, свой набор или встроенные упражнения со своими заданиями.
  // Раньше слова требовались всегда — даже к грамматике, которая их не использует.
  const exerciseOnly = game === "grammar" || game === "wordform" || game === "custom";
  if (game === "custom" && !tasksetId) {
    msg.className = "type-feedback err";
    msg.textContent = "Выберите набор — или соберите его на вкладке «Свои задания».";
    return;
  }
  if (!picked.length && !taskText && !readingText && !exerciseOnly) {
    msg.className = "type-feedback err";
    msg.textContent = "Выберите слова, напишите задание текстом или выберите упражнение со своими заданиями.";
    return;
  }
  const target = $("hw-student").value;              // "" | "g<id>" | "<id>"
  const res = await api("/api/tutor/homework", {
    token: token(),
    title: $("hw-title").value.trim() || (picked.length ? "Слова на дом" : ""),
    studentId: target && !target.startsWith("g") ? target : null,
    groupId: target.startsWith("g") ? target.slice(1) : null,
    dueDate: $("hw-due").value || null,
    taskText,
    readingText,
    game,
    tasksetId,
    words: picked,
  });
  if (!res.ok) {
    msg.className = "type-feedback err";
    msg.textContent = res.error || "Не получилось.";
    return;
  }
  msg.className = "type-feedback ok";
  const who = $("hw-student").selectedOptions[0].textContent;
  const what = picked.length
    ? `Домашка из ${picked.length} слов`
    : game === "custom" ? "Своё задание"
    : game === "grammar" ? "Грамматика"
    : game === "wordform" ? "Словообразование"
    : readingText && !taskText ? "Чтение вслух" : "Задание";
  msg.textContent = `Готово! ${what} — отправлено: ${who}. Результат появится на вкладке «Домашки».`;
  picked = [];
  $("hw-title").value = "";
  renderWordPicker();
  renderPicked();
  loadStudents();
});

// ===== Старт =====
// Подборщик слов рисуется не здесь, а в openPanel — после входа и после
// того, как приедет словарь. До входа его всё равно никто не видит.

// Витрина без бэкенда: панели тут работать негде, и лучше сказать это
// прямо, чем показывать форму входа, которая всегда отвечает ошибкой.
apiAlive().then(alive => {
  if (alive) {
    if (token()) openPanel();
    return;
  }
  document.querySelector("#screen-auth .auth-card").innerHTML = `
    <h3 style="font-weight:900;margin-bottom:10px">Панели тут нет — и это нормально</h3>
    <p style="font-weight:600;line-height:1.55;margin-bottom:14px">
      Вы открыли витрину проекта. Она показывает сайт ученика, но кабинет
      репетитора работает только там, где запущен сервер: он хранит учеников,
      прогресс и домашку.
    </p>
    <p class="muted-small" style="margin-bottom:10px">Чтобы открыть панель у себя:</p>
    <ol style="font-weight:600;font-size:14px;line-height:1.7;padding-left:20px;margin-bottom:14px">
      <li>Скачайте проект с GitHub</li>
      <li>В папке проекта выполните <code>python3 server.py</code></li>
      <li>Откройте <code>http://localhost:4210/tutor.html</code></li>
    </ol>
    <a class="btn btn-primary btn-wide" style="display:block;text-align:center;text-decoration:none"
       href="index.html">Посмотреть сайт ученика →</a>`;
});

// ===== Проверка домашек =====
// Отдельная подписка на каждого ученика. Разбор фото тетради идёт через
// самую сильную модель по почерку и стоит на порядок дороже чата, поэтому
// он вынесен из базового тарифа и включается точечно.
let checksData = null;

async function loadChecks() {
  const res = await api("/api/tutor/checks", { token: token() });
  if (!res || !res.ok) return;
  checksData = res;
  renderChecks();
}

function renderChecks() {
  if (!checksData) return;
  const { students, packs, bill, extraPrice, maxPhotos, freeForAll } = checksData;
  // Нейросети нет — говорим это первой строкой вкладки. Раньше вкладка
  // продавала пакеты как ни в чём не бывало, а у каждой работы стояло
  // «посмотрите сами», и связать одно с другим репетитор не мог.
  // Нейросеть на паузе (владелец запускает сайт без ИИ) — вкладка не
  // продаёт пакеты и не показывает счёт вовсе: одна честная карточка
  // «в разработке». Прайс вернётся вместе с включением разбора.
  const suspended = checksData.aiOn === false;
  if (suspended) {
    $("checks-packs").innerHTML = `
      <div class="card check-suspended" role="status">
        <p><b>Автоматический разбор домашек — в разработке.</b> Фото тетрадей
          и чтение вслух приходят к вам как обычно — на вкладку
          «Фото тетрадей», — пока смотрите их сами.</p>
        <p class="muted-note">Когда разбор заработает, здесь появятся пакеты
          проверок и счёт. Сейчас ничего не начисляется и подключать нечего —
          мы напишем, когда будет готово.</p>
      </div>`;
    $("checks-bill").innerHTML = "";
    $("checks-list").innerHTML = "";
    return;
  }
  // Тем, у кого проверка бесплатна, прайс показывать незачем —
  // он только заставляет гадать, не придёт ли счёт
  $("checks-packs").innerHTML = (freeForAll ? "" : `
    <div class="card">
      <p class="section-note" style="margin-top:0">Цена за одного ученика в месяц.
        До ${maxPhotos} фото на одну домашку. Сверх пакета — ${extraPrice} ₽ за проверку.</p>
      <div class="pack-row">
        ${packs.map(p => `
          <div class="pack-card">
            <div class="pack-name">${esc(p.name)}</div>
            <div class="pack-price">${p.price} ₽</div>
            <div class="pack-limit">${p.limit} проверок в месяц</div>
          </div>`).join("")}
      </div>
      ${students.length >= 10 ? `<p class="muted-small">Скидка за объём уже учтена: у вас ${students.length} учеников.</p>`
        : `<p class="muted-small">От 10 учеников цена ниже, от 20 — ещё ниже.</p>`}
    </div>`);

  if (freeForAll) {
    $("checks-bill").innerHTML = `<div class="card"><p class="stat-note">
      ${iconInline("sparkle", 16)} У вас проверка домашек бесплатно навсегда — вы подключились, когда она
      входила в основной тариф. Ничего доплачивать не нужно.</p></div>`;
  } else {
    $("checks-bill").innerHTML = `
      <div class="card">
        <h3 style="margin-top:0">Счёт за месяц</h3>
        <p>Подписка на ${bill.students} ${plural(bill.students, "ученика", "учеников", "учеников")}:
           <b>${bill.monthly} ₽</b></p>
        ${bill.extras ? `<p>Проверок сверх пакетов: ${bill.extras} × ${extraPrice} ₽ =
           <b>${bill.extrasCost} ₽</b></p>` : ""}
        <p class="pack-total">Итого: <b>${bill.total} ₽</b></p>
      </div>`;
  }

  $("checks-list").innerHTML = `
    <h3 class="section-title">Ученики</h3>
    ${students.map(s => `
      <div class="card check-row">
        <div class="check-who">
          <b>${esc(s.name)}</b>
          ${s.limit ? `<span class="muted-small">израсходовано ${s.used} из ${s.limit}${
            s.extra ? ` (+${s.extra} сверх)` : ""}</span>`
            : `<span class="muted-small">проверка не подключена</span>`}
        </div>
        ${s.free
          ? `<span class="plan-chip">включено бесплатно</span>`
          : `<select class="check-pick" data-student="${s.id}">
               <option value="">не подключать</option>
               ${packs.map(p => `<option value="${p.id}"${p.id === s.pack ? " selected" : ""}
                 >${esc(p.name)} — ${p.limit} шт, ${p.price} ₽</option>`).join("")}
             </select>`}
      </div>`).join("") || `<p class="section-note">Учеников пока нет.</p>`}`;

  document.querySelectorAll(".check-pick").forEach(sel => {
    sel.addEventListener("change", async () => {
      sel.disabled = true;
      const res = await api("/api/tutor/checks/set", {
        token: token(), studentId: Number(sel.dataset.student), pack: sel.value || null,
      });
      sel.disabled = false;
      if (res && res.ok) { checksData = res; renderChecks(); }
    });
  });
}

/** Русские окончания: 1 ученик, 2 ученика, 5 учеников. */
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Кнопка из пустого состояния: копирует ссылку прямо там, где о ней узнали.
// Отправлять человека на другую вкладку за единственным нужным действием —
// лишний шаг ровно в тот момент, когда панель ещё ничего не показывает.
document.addEventListener("click", e => {
  if (e.target.id !== "students-empty-copy") return;
  const input = document.getElementById("invite-url");
  if (!input || !input.value) return;
  navigator.clipboard.writeText(input.value).then(() => {
    e.target.textContent = "Скопировано ✓";
    setTimeout(() => (e.target.textContent = "Скопировать ссылку"), 2000);
  }).catch(() => { input.select(); document.execCommand("copy"); });
});

/* ===== Видеоурок =====
 * Комнату не создаём: у репетитора она своя. Наша работа — донести её до
 * ученика в нужный момент одной кнопкой. Расчёт, почему не встроенное
 * видео, лежит в db.py у LESSON_OPEN_MINUTES.
 */
function renderLesson() {
  const url = (tutor && tutor.lessonUrl) || "";
  const input = $("lesson-url");
  if (!input) return;
  // Не затираем то, что человек печатает прямо сейчас: renderLesson
  // зовётся и по таймеру обновления списка учеников.
  if (document.activeElement !== input) input.value = url;
  $("lesson-live-box").classList.toggle("hidden", !url);
  const live = tutor && tutor.lessonLive;
  $("lesson-open").classList.toggle("hidden", !!live);
  $("lesson-close").classList.toggle("hidden", !live);
  $("lesson-live-note").textContent = live
    ? "Идёт урок — ученики видят кнопку «На урок»."
    : "";
}

document.addEventListener("DOMContentLoaded", () => {
  const save = $("lesson-save");
  if (!save) return;

  save.addEventListener("click", async () => {
    const msg = $("lesson-msg");
    msg.className = "type-feedback";
    msg.textContent = "Сохраняю…";
    const res = await api("/api/tutor/lesson/set", {
      token: token(), url: $("lesson-url").value.trim(),
    });
    if (!res.ok) {
      msg.className = "type-feedback err";
      msg.textContent = res.error || "Не получилось сохранить.";
      return;
    }
    msg.className = "type-feedback ok";
    msg.textContent = res.url ? "Ссылка сохранена." : "Ссылка убрана — кнопки у учеников больше нет.";
    if (tutor) { tutor.lessonUrl = res.url; tutor.lessonLive = false; }
    renderLesson();
  });

  const toggle = async on => {
    const msg = $("lesson-msg");
    const res = await api("/api/tutor/lesson/open", { token: token(), on });
    if (!res.ok) {
      msg.className = "type-feedback err";
      msg.textContent = res.error || "Не получилось.";
      return;
    }
    if (tutor) tutor.lessonLive = on;
    msg.className = "type-feedback ok";
    msg.textContent = on
      ? `Ученики приглашены. Кнопка у них горит ${res.minutes} минут.`
      : "Урок закрыт.";
    renderLesson();
  };
  $("lesson-open").addEventListener("click", () => toggle(true));
  $("lesson-close").addEventListener("click", () => toggle(false));
});

/* ===== Письма на почту =====
 * Два переключателя: «о новых работах» и «раз в неделю — кто пропал».
 * Сохраняются сразу по щелчку, без кнопки «сохранить»: это переключатель,
 * а не форма, и лишняя кнопка тут читалась бы как «ещё не применилось».
 */
function renderNotify() {
  const work = $("notify-work"), remind = $("notify-remind");
  if (!work || !remind || !tutor) return;
  // Не сбиваем то, что человек щёлкает прямо сейчас: renderNotify зовётся
  // и по таймеру обновления списка учеников, а ответ сервера на щелчок
  // может прийти позже этого таймера.
  if (document.activeElement !== work) work.checked = tutor.notifyWork !== false;
  if (document.activeElement !== remind) remind.checked = tutor.notifyRemind !== false;
  const lead = $("notify-lead");
  if (lead && tutor.email) {
    lead.textContent = `Приходят на ${tutor.email}. `
      + "Коды подтверждения и письмо о конце пробного периода приходят всегда.";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const work = $("notify-work"), remind = $("notify-remind");
  if (!work || !remind) return;
  const msg = $("notify-msg");
  const save = async (field, box) => {
    msg.className = "type-feedback";
    msg.textContent = "Сохраняю…";
    let res;
    try { res = await api("/api/tutor/notify/set", { token: token(), [field]: box.checked }); }
    catch (e) { res = null; }
    if (!res || !res.ok) {
      // Откатываем галочку: иначе на экране одно, на сервере другое,
      // и человек уверен, что письма отключены, а они идут.
      box.checked = !box.checked;
      msg.className = "type-feedback err";
      msg.textContent = (res && res.error) || "Не сохранилось — проверьте связь и щёлкните ещё раз.";
      return;
    }
    tutor = res.tutor || tutor;
    msg.className = "type-feedback ok";
    msg.textContent = box.checked ? "Включено." : "Выключено — такие письма больше не придут.";
  };
  work.addEventListener("change", () => save("work", work));
  remind.addEventListener("change", () => save("remind", remind));
});

/* ===== Игра для домашки =====
 * Список здесь СВОЙ, а не импорт EXERCISES из js/exercises.js, и это
 * не дублирование по недосмотру. Панель не грузит движок упражнений —
 * он тянет за собой словарь, картинки, интервальное повторение и синтез
 * речи, а репетитору из всего этого не нужно ничего.
 *
 * И список сознательно КОРОТКИЙ. В движке 26 упражнений, но выдавать
 * домашку имеет смысл не всеми: «свои предложения» проверяются вручную,
 * «блиц» — про скорость, а не про конкретные слова. Двадцать шесть
 * пунктов в выпадающем списке — это не выбор, а прокрутка.
 */
// Значки те же, что у ученика в разделе тренировок: репетитор и ученик
// должны узнавать одну и ту же игру по одной и той же картинке.
const HOMEWORK_GAMES = [
  { id: "flashcards", name: "Карточки",        icon: "flashcards", note: "узнавание: слово и перевод" },
  { id: "mcq",        name: "Выбор варианта",  icon: "mcq",        note: "четыре варианта, один верный" },
  { id: "spelling",   name: "Ввод слова",      icon: "spelling",   note: "пишет слово сам — самое строгое" },
  { id: "matching",   name: "Сопоставление",   icon: "matching",   note: "соединить слово с переводом" },
  { id: "scramble",   name: "Собери слово",    icon: "scramble",   note: "буквы перемешаны" },
  { id: "listening",  name: "Аудирование",     icon: "listening",  note: "нужен звук на устройстве ученика" },
  { id: "wordsearch", name: "Поиск слов",      icon: "wordsearch", note: "найти слова в поле букв" },
  { id: "crossword",  name: "Кроссворд",       icon: "crossword",  note: "отгадать по переводам" },
  { id: "memory",     name: "Найди пару",      icon: "defmatch",   note: "открывать карточки парами" },
  { id: "wheel",      name: "Колесо",          icon: "target",    note: "вслух и по-честному, без проверки" },
  // Эти два — не по словам ученика, а по своим заданиям: слова из
  // домашки на них не влияют. Так и написано в подсказке, чтобы
  // репетитор не удивился, почему его слова «не подставились».
  { id: "wordform",   name: "Словообразование", icon: "translate",
    note: "формат ОГЭ. Свои задания — слова домашки не используются" },
  { id: "grammar",    name: "Грамматика",       icon: "book",
    note: "10 тем на выбор. Свои задания — слова домашки не используются" },
  // Набор из конструктора: свои вопросы, свои ответы. Слова домашки не
  // используются — содержимое берётся из набора.
  { id: "custom",     name: "Своё задание",     icon: "personal",
    note: "викторина, «впиши слово» или пары из ваших вопросов — набор с вкладки «Свои задания»" },
];

function fillGameSelect() {
  const sel = $("hw-game");
  const grid = $("hw-game-grid");
  if (!sel || sel.dataset.filled) return;
  sel.dataset.filled = "1";

  // Скрытый select остаётся источником значения: форма и сервер читают
  // его, и переписывать эту часть ради вида не нужно.
  HOMEWORK_GAMES.forEach(g => {
    const o = document.createElement("option");
    o.value = g.id;
    o.textContent = g.name;
    sel.appendChild(o);
  });

  if (!grid) return;
  const hint = $("hw-game-hint");
  // Подсказка — про ученика, а не «как было раньше»: репетитор не знает
  // и не должен знать, как было раньше.
  const ALL = [{ id: "", name: "Ученик выберет сам", icon: "paw",
                 note: "слова попадут в словарь ученика, а игру он выберет сам в тренировках" }].concat(HOMEWORK_GAMES);

  const pick = id => {
    sel.value = id;
    grid.querySelectorAll(".game-tile").forEach(t => {
      const on = t.dataset.game === id;
      t.classList.toggle("picked", on);
      t.setAttribute("aria-checked", String(on));
      // Роль radio: в группе табом останавливается один элемент,
      // остальные обходятся стрелками — так работает любой набор
      // взаимоисключающих вариантов.
      t.tabIndex = on ? 0 : -1;
    });
    const g = ALL.find(x => x.id === id);
    if (hint) hint.textContent = g && g.note ? g.note : "";
    // У плитки «Своё задание» появляется выбор набора; наборы подгружаем,
    // если ещё не приезжали.
    const row = $("hw-taskset-row");
    if (row) {
      row.classList.toggle("hidden", id !== "custom");
      if (id === "custom" && typeof loadTasksets === "function") {
        if (typeof tsLoaded !== "undefined" && tsLoaded) fillTasksetSelect();
        else loadTasksets();
      }
    }
  };

  ALL.forEach(g => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "game-tile";
    b.dataset.game = g.id;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", "false");
    b.innerHTML = `<span class="game-tile-ico">${icon(g.icon || "paw", 22)}</span>`
                + `<span class="game-tile-name">${esc(g.name)}</span>`;
    b.title = g.note || g.name;
    b.addEventListener("click", () => pick(g.id));
    b.addEventListener("keydown", e => {
      const tiles = [...grid.querySelectorAll(".game-tile")];
      const i = tiles.indexOf(b);
      let j = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tiles.length;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tiles.length) % tiles.length;
      if (j === null) return;
      e.preventDefault();
      tiles[j].focus();
      tiles[j].click();
    });
    grid.appendChild(b);
  });
  pick("");
}

// ===== Какая вкладка открыта при заходе =====
//
// Была всегда «Вход». Для того, кто уже пользуется панелью, это верно;
// для того, кто первый раз перешёл по ссылке из объявления — нет: он
// видит форму для аккаунта, которого у него ещё не существует, вводит
// туда что-нибудь, получает «неверный email или пароль» и уходит.
//
// Отличить одного от другого можно точно и без гаданий: у вернувшегося
// в браузере лежит либо токен, либо почта прошлого входа. Нет ни того,
// ни другого — человек здесь впервые, показываем «Регистрацию».
(function pickAuthTab() {
  const returning = !!token() || !!localStorage.getItem("savelyTutorEmail");
  if (returning) return;
  const tab = document.querySelector('.tab[data-mode="register"]');
  if (tab) tab.click();
})();
