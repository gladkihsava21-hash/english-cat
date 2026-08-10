// Панель репетитора: вход, список учеников с прогрессом, выдача домашки.

const TOKEN_KEY = "savelyTutorToken";
let tutor = null;
let students = [];
let sortMode = "name";
let picked = [];   // слова для домашки

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

// ===== Вход =====
let authMode = "login";

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    authMode = tab.dataset.mode;
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t === tab));
    $("name-row").classList.toggle("hidden", authMode === "login");
    $("auth-submit").textContent = authMode === "login" ? "Войти" : "Создать кабинет";
    $("auth-error").textContent = "";
  });
});

$("auth-form").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("t-email").value.trim();
  const password = $("t-pass").value;
  const name = $("t-name").value.trim();
  const path = authMode === "login" ? "/api/tutor/login" : "/api/tutor/register";
  let res;
  try {
    res = await api(path, { email, password, name });
  } catch (err) {
    $("auth-error").textContent = "Сервер недоступен. Запущен ли server.py?";
    return;
  }
  if (!res.ok) {
    $("auth-error").textContent = res.error || "Не получилось.";
    return;
  }
  localStorage.setItem(TOKEN_KEY, res.token);
  tutor = res.tutor;
  openPanel();
});

$("logout-btn").addEventListener("click", () => {
  localStorage.removeItem(TOKEN_KEY);
  location.reload();
});

// ===== Навигация =====
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b === btn));
    ["students", "homework", "invite"].forEach(t => {
      $("tab-" + t).classList.toggle("hidden", t !== btn.dataset.tab);
    });
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
async function openPanel() {
  $("screen-auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  await loadStudents();
  setInterval(loadStudents, 60000);  // подтягиваем свежий прогресс раз в минуту
}

async function loadStudents() {
  const res = await api("/api/tutor/students", { token: token() });
  if (!res.ok) {
    if (res.error === "unauthorized") {
      localStorage.removeItem(TOKEN_KEY);
      location.reload();
    }
    return;
  }
  tutor = res.tutor;
  students = res.students || [];
  $("tutor-name").textContent = tutor.name;
  $("stu-count").textContent = students.length;
  renderOverview();
  renderStudents();
  renderInvite();
  fillStudentSelect();
}

// ===== Обзор =====
function daysAgo(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

function renderOverview() {
  const total = students.length;
  const learned = students.reduce((s, x) => s + (x.words?.learned || 0), 0);
  const activeWeek = students.filter(x => { const d = daysAgo(x.lastSeen); return d !== null && d <= 7; }).length;
  const sleeping = students.filter(x => { const d = daysAgo(x.lastSeen); return d === null || d > 7; }).length;
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
    </div>`;
}

// ===== Список учеников =====
function sortedStudents() {
  const arr = [...students];
  if (sortMode === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  if (sortMode === "active") arr.sort((a, b) => (daysAgo(a.lastSeen) ?? 999) - (daysAgo(b.lastSeen) ?? 999));
  if (sortMode === "progress") arr.sort((a, b) => (b.words?.learned || 0) - (a.words?.learned || 0));
  return arr;
}

function lastSeenText(iso) {
  const d = daysAgo(iso);
  if (d === null) return { text: "ещё не заходил", cls: "bad" };
  if (d === 0) return { text: "сегодня", cls: "good" };
  if (d === 1) return { text: "вчера", cls: "good" };
  if (d <= 7) return { text: `${d} дн. назад`, cls: "" };
  return { text: `${d} дн. назад`, cls: "bad" };
}

function renderStudents() {
  const list = $("students-list");
  $("students-empty").classList.toggle("hidden", students.length > 0);
  list.innerHTML = sortedStudents().map(s => {
    const seen = lastSeenText(s.lastSeen);
    const w = s.words || {};
    const pct = w.total ? Math.round((w.learned / w.total) * 100) : 0;
    const hw = (s.homework || []).filter(h => h.total);
    return `
      <div class="card stu-card">
        <div class="stu-main">
          <div class="stu-id">
            <div class="cat-avatar cat-small">🧑‍🎓</div>
            <div>
              <b class="stu-name">${s.name}</b>
              <p class="muted-small">
                <span class="seen ${seen.cls}">${seen.text}</span>
                ${s.streak >= 2 ? ` · 🔥 ${s.streak} дн. подряд` : ""}
              </p>
            </div>
          </div>
          <div class="stu-level">
            <span class="level-chip">${s.level || "—"}</span>
            <span class="muted-small">⭐ ${s.xp || 0}</span>
          </div>
        </div>

        <div class="stu-bars">
          <div class="stu-bar-row">
            <span class="muted-small">Слова: ${w.learned || 0} выучено из ${w.total || 0}</span>
            <div class="xp-bar"><div class="xp-bar-fill" style="width:${pct}%"></div></div>
          </div>
        </div>

        ${hw.length ? `<div class="stu-hw">${hw.map(h => `
          <span class="hw-chip ${h.done >= h.total ? "hw-chip-done" : ""}">
            📋 ${h.title}: ${h.done}/${h.total}
          </span>`).join("")}</div>` : ""}

        ${s.weak && s.weak.length ? `
          <details class="stu-weak">
            <summary>Проблемные слова (${s.weak.length})</summary>
            <div class="weak-list">${s.weak.map(x =>
              `<span class="weak-word">${x.w} <i>${x.t}</i> <b>−${x.forgot}</b></span>`).join("")}</div>
          </details>` : ""}

        <button class="link-btn stu-del" data-del="${s.id}">удалить ученика</button>
      </div>`;
  }).join("");

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

// ===== Ссылка =====
function renderInvite() {
  const url = location.origin + location.pathname.replace(/tutor\.html$/, "index.html") + "?join=" + tutor.inviteCode;
  $("invite-url").value = url;
  $("invite-code").textContent = tutor.inviteCode;
}

$("copy-link").addEventListener("click", () => {
  const input = $("invite-url");
  input.select();
  navigator.clipboard.writeText(input.value).then(() => {
    $("copy-link").textContent = "Скопировано ✓";
    setTimeout(() => ($("copy-link").textContent = "Копировать"), 2000);
  }).catch(() => document.execCommand("copy"));
});

// ===== Домашка =====
function fillStudentSelect() {
  const sel = $("hw-student");
  const cur = sel.value;
  sel.innerHTML = `<option value="">всем ученикам</option>` +
    students.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  if (cur) sel.value = cur;
}

function fillLevels() {
  $("hw-level").innerHTML = LEVELS.map(l =>
    `<option value="${l}">${l} — ${LEVEL_NAMES[l]}</option>`).join("");
  $("hw-level").value = "A2";
}

function renderWordPicker() {
  const lvl = $("hw-level").value;
  const q = $("hw-search").value.trim().toLowerCase();
  const pool = (WORDS[lvl] || []).filter(w =>
    !q || w.w.toLowerCase().includes(q) || w.t.toLowerCase().includes(q));
  const chosen = new Set(picked.map(p => p.w.toLowerCase()));
  $("hw-words").innerHTML = pool.map(w => `
    <button class="hw-word${chosen.has(w.w.toLowerCase()) ? " picked" : ""}" data-w="${w.w}">
      <span class="hw-word-art" style="background:${wordTint(w.cat)}">${wordArt(w.w, w.cat)}</span>
      <span class="hw-word-en">${w.w}</span>
      <span class="hw-word-ru">${w.t}</span>
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
      picked.map(p => `<span class="picked-chip" data-rm="${p.w}">${p.w} <i>${p.t}</i> ✕</span>`).join("")
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
  if (!picked.length) {
    msg.className = "type-feedback err";
    msg.textContent = "Сначала выберите слова.";
    return;
  }
  const res = await api("/api/tutor/homework", {
    token: token(),
    title: $("hw-title").value.trim() || "Слова на дом",
    studentId: $("hw-student").value || null,
    dueDate: $("hw-due").value || null,
    words: picked,
  });
  if (!res.ok) {
    msg.className = "type-feedback err";
    msg.textContent = res.error || "Не получилось.";
    return;
  }
  msg.className = "type-feedback ok";
  const who = $("hw-student").selectedOptions[0].textContent;
  msg.textContent = `Готово! Домашка из ${picked.length} слов отправлена: ${who}.`;
  picked = [];
  $("hw-title").value = "";
  renderWordPicker();
  renderPicked();
  loadStudents();
});

// ===== Старт =====
fillLevels();
renderWordPicker();
renderPicked();
if (token()) openPanel();
