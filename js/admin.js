// Админка владельца: сводка, репетиторы, тарифы.

const AKEY = "savelyAdminToken";
const $ = id => document.getElementById(id);
const atoken = () => localStorage.getItem(AKEY) || "";

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

let data = null;

function money(n) { return (n || 0).toLocaleString("ru-RU") + " ₽"; }

function accessTag(t) {
  if (t.access === "paid") {
    const d = Math.floor(t.paidDaysLeft);
    return `<span class="at-tag paid">оплачено ${d} дн.</span>`;
  }
  if (t.access === "trial") {
    const h = Math.ceil(t.trialHoursLeft);
    return `<span class="at-tag trial">пробный, ${h > 24 ? Math.ceil(h/24) + " дн." : h + " ч."}</span>`;
  }
  return `<span class="at-tag stop">не оплачено</span>`;
}

function ago(iso) {
  if (!iso) return "ни разу";
  // Репетиторские даты — «2026-08-20», у учеников-одиночек полный
  // ISO-штамп с временем; второму суффикс времени ломает разбор.
  const days = Math.floor((Date.now() - new Date(iso.includes("T") ? iso : iso + "T00:00:00")) / 864e5);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return days + " дн. назад";
  if (days < 30) return Math.floor(days / 7) + " нед. назад";
  return Math.floor(days / 30) + " мес. назад";
}

function renderOverview() {
  const o = data.overview;
  // Не просто «включён», а кто работает: чат и проверка могут идти
  // через разных провайдеров (Алиса — Яндекс, данные в РФ; Claude — США).
  $("ai-chip").textContent = data.aiOn
    ? "ИИ: " + (data.aiChat && data.aiPhoto && data.aiChat !== data.aiPhoto
        ? `чат — ${data.aiChat}, фото — ${data.aiPhoto}`
        : (data.aiChat || data.aiPhoto))
    : "ИИ: в разработке (выключен)";
  $("ai-chip").classList.toggle("plan-full", !data.aiOn);
  $("overview").innerHTML = [
    ["Репетиторов", o.tutors, `подтвердили почту: ${o.verified}`],
    ["Учеников", o.students, `занимались за неделю: ${o.activeWeek}`],
    ["Домашек", o.homework, `фото тетрадей: ${o.photos}`],
    // Пока нейросети нет, проверка домашек не начисляется никому
    // (db.CHECKS_SUSPENDED) — и здесь это должно быть сказано словами,
    // а не выглядеть как пропавшая выручка.
    ["Выручка в месяц", money(o.revenue),
      data.aiOn
        ? `тарифы ${money(o.baseRevenue)} + проверка ${money(o.checksRevenue)}`
        : `тарифы ${money(o.baseRevenue)} · проверка выключена, не начисляется`],
    // Не оценка, а факт: сообщения и проверки считаются в базе
    ["Расходы на ИИ", money(o.aiCost),
      `${o.chatMessages} сообщений, ${o.checksUsed} проверок`],
    ["Чистыми", money(o.profit), "минус комиссия 3%"],
    ["Ошибок за 7 дней", o.errorsWeek || 0,
      o.errorsWeek ? "подробности внизу страницы" : "сервер молчит — хорошо"],
  ].map(([label, val, note]) => `
    <div class="admin-stat">
      <p class="stat-label">${esc(label)}</p>
      <p class="stat-value">${esc(String(val))}</p>
      <p class="stat-note">${esc(note)}</p>
    </div>`).join("");
}

function renderTutors() {
  if (!data.tutors.length) {
    $("tutors").innerHTML = `<p class="muted-note">Пока никто не зарегистрировался.</p>`;
    return;
  }
  $("tutors").innerHTML = data.tutors.map(t => `
    <div class="admin-tutor${t.verified ? "" : " unverified"}" data-t="${t.id}">
      <div class="at-head">
        <div>
          <p class="at-name">${esc(t.name)}
            ${t.verified ? "" : `<span class="at-warn">почта не подтверждена</span>`}
            ${accessTag(t)}</p>
          <p class="muted-note">${esc(t.email)} · код ${esc(t.inviteCode)} ·
            с ${esc((t.createdAt || "").slice(0, 10))}</p>
        </div>
        <div class="at-money">
          <p class="at-price">${money(t.price)}</p>
          <p class="muted-note">${esc(t.planName)}</p>
        </div>
      </div>

      <div class="at-nums">
        <span><b>${t.students}</b> из ${t.limit} мест</span>
        <span><b>${t.activeWeek}</b> занимались за неделю</span>
        <span>последняя активность: <b>${esc(ago(t.lastSeen))}</b></span>
      </div>

      ${t.kids.length ? `
        <details class="at-kids">
          <summary>Ученики (${t.kids.length})</summary>
          <table class="at-table">
            <tr><th>Имя</th><th>Уровень</th><th>Очки</th><th>Дней</th><th>Последний раз</th></tr>
            ${t.kids.map(k => `<tr>
              <td>${esc(k.name)}</td><td>${esc(k.level || "—")}</td>
              <td>${k.xp || 0}</td><td>${k.days}</td><td>${esc(ago(k.lastSeen))}</td>
            </tr>`).join("")}
          </table>
        </details>` : `<p class="muted-note">Учеников ещё нет.</p>`}

      <div class="at-actions">
        <button class="btn btn-primary btn-small" data-pay="${t.id}">Оплата на 30 дней</button>
        <select class="at-plan" data-plan="${t.id}">
          ${data.plans.map(p => `<option value="${p.id}"${p.id === t.plan ? " selected" : ""}>
            ${esc(p.name)} — ${p.price ? p.price + " ₽" : "бесплатно"}</option>`).join("")}
        </select>
        <input type="number" class="at-limit" data-limit="${t.id}" value="${t.limit}" min="1" max="500">
        <button class="btn btn-ghost btn-small" data-save="${t.id}">Сохранить</button>
        ${t.verified
          ? `<button class="btn btn-ghost btn-small" data-unverify="${t.id}">Снять подтверждение</button>`
          : `<button class="btn btn-primary btn-small" data-verify="${t.id}">Подтвердить вручную</button>`}
        <button class="btn btn-ghost btn-small danger" data-del="${t.id}">Удалить</button>
      </div>
    </div>`).join("");

  const refresh = res => { if (res.ok) { data.tutors = res.tutors; data.overview = res.overview; renderOverview(); renderTutors(); } };

  document.querySelectorAll("[data-save]").forEach(b => b.addEventListener("click", async () => {
    const id = Number(b.dataset.save);
    refresh(await api("/api/admin/plan", {
      token: atoken(), tutorId: id,
      plan: document.querySelector(`[data-plan="${id}"]`).value,
      limit: Number(document.querySelector(`[data-limit="${id}"]`).value),
    }));
  }));

  document.querySelectorAll("[data-pay]").forEach(b => b.addEventListener("click", async () => {
    const days = prompt("На сколько дней продлить доступ?", "30");
    if (days === null) return;
    refresh(await api("/api/admin/pay", {
      token: atoken(), tutorId: Number(b.dataset.pay), days: Number(days) || 0,
    }));
  }));

  document.querySelectorAll("[data-verify], [data-unverify]").forEach(b => b.addEventListener("click", async () => {
    const id = Number(b.dataset.verify || b.dataset.unverify);
    refresh(await api("/api/admin/verify", {
      token: atoken(), tutorId: id, value: !!b.dataset.verify,
    }));
  }));

  // Удаление уносит учеников, домашки и фото — просим написать слово,
  // случайным кликом такое терять нельзя
  document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const t = data.tutors.find(x => x.id === Number(b.dataset.del));
    const word = prompt(`Удалить «${t.name}» вместе с ${t.students} учениками,\nдомашками и фото?\n\nНапишите УДАЛИТЬ для подтверждения:`);
    if (!word) return;
    const res = await api("/api/admin/delete", { token: atoken(), tutorId: t.id, confirm: word });
    if (!res.ok) { alert(res.error || "Не получилось."); return; }
    refresh(res);
  }));
}

// ===== Ученики без репетитора =====

function renderStandalone() {
  const box = $("standalone"), lead = $("standalone-lead");
  if (!box) return;
  const list = data.standalone || [];
  lead.textContent = list.length
    ? `Всего: ${list.length}. Личный код здесь — для поддержки: по нему человек возвращает аккаунт на новом устройстве.`
    : "Пока никого — все ученики пришли по ссылкам репетиторов.";
  box.innerHTML = list.map(s => `
    <div class="card check-row" data-sid="${s.id}">
      <div class="check-who">
        <b>${esc(s.name)}</b>
        <span class="muted-small">${s.email ? esc(s.email) + " · " : ""}уровень ${esc(s.level || "—")}
          · слов ${s.words} · ⭐ ${s.xp} · дней ${s.days} · был: ${esc(ago(s.lastSeen))}</span>
      </div>
      <span class="at-tag trial" style="user-select:all" title="Личный код для входа">${esc(s.restoreCode)}</span>
      <button class="link-btn danger" data-sdel="${s.id}">удалить</button>
    </div>`).join("");
  box.querySelectorAll("[data-sdel]").forEach(b => {
    let armed = false, timer = null;
    b.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        b.textContent = "точно удалить? нажмите ещё раз";
        timer = setTimeout(() => { armed = false; b.textContent = "удалить"; }, 4000);
        return;
      }
      clearTimeout(timer);
      const res = await api("/api/admin/student/delete",
        { token: atoken(), studentId: Number(b.dataset.sdel), confirm: "УДАЛИТЬ" });
      if (res.ok) { data.standalone = res.standalone; data.overview = res.overview; renderStandalone(); renderOverview(); }
    });
  });
}

// ===== Лог ошибок =====

/** Время из базы (UTC, ISO) — в местное, коротко: «16.08 14:03». */
function when(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || "";
  const p = n => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderErrors(res) {
  const list = $("errors"), lead = $("err-lead"), clear = $("err-clear");
  const errors = res.errors || [];
  const s = res.summary || {};
  clear.hidden = errors.length === 0;
  if (!errors.length) {
    lead.textContent = "Пусто — ни одной ошибки не записано.";
    list.innerHTML = "";
    return;
  }
  lead.textContent = `За ${s.days || 7} дней: ${s.count || 0}. `
    + `Показаны последние ${errors.length}, свежие сверху. `
    + `Тело запроса не пишется — только адрес, стек и кого задело.`;

  // Кого задело — по имени, а не по номеру: по номеру владелец не поймёт,
  // кому написать. «гость» — запрос без токена: витрина, вход, регистрация.
  // Имена не склоняем («у Алины» не собрать из «Алина»), поэтому две
  // подписи через точку, а не фраза.
  const who = e => {
    if (e.studentName) return `ученик ${e.studentName}` + (e.tutorName ? ` · репетитор ${e.tutorName}` : "");
    if (e.tutorName) return `репетитор ${e.tutorName}`;
    return "гость";
  };
  list.innerHTML = errors.map(e => `
    <details class="err-item${e.status >= 500 ? " bad" : ""}">
      <summary>
        <span class="err-when">${esc(when(e.createdAt))}</span>
        <span class="err-status">${e.status}</span>
        <span class="err-where">${esc(e.endpoint)}</span>
        <span class="err-msg">${esc(e.message)}</span>
        <span class="err-who">${esc(who(e))}${e.ip ? " · " + esc(e.ip) : ""}</span>
      </summary>
      <pre class="err-trace">${esc(e.traceback || "(стека нет)")}</pre>
    </details>`).join("");
}

async function loadErrors() {
  let res;
  try { res = await api("/api/admin/errors", { token: atoken() }); }
  catch (e) { res = null; }
  if (!res || !res.ok) {
    $("err-lead").textContent = "Не удалось загрузить лог ошибок.";
    return;
  }
  renderErrors(res);
}

// Очистка в два нажатия вместо confirm(): системный диалог не объясняет,
// что именно пропадёт, и на телефоне выглядит как сбой сайта.
document.addEventListener("DOMContentLoaded", () => {
  const btn = $("err-clear");
  if (!btn) return;
  let armed = false, timer = null;
  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Точно очистить? Нажмите ещё раз";
      btn.classList.add("danger");
      timer = setTimeout(() => { armed = false; btn.textContent = "Очистить"; btn.classList.remove("danger"); }, 5000);
      return;
    }
    clearTimeout(timer);
    armed = false;
    btn.textContent = "Очистить";
    btn.classList.remove("danger");
    const res = await api("/api/admin/errors/clear", { token: atoken() });
    if (res.ok) {
      renderErrors(res);
      if (data && data.overview) { data.overview.errorsWeek = 0; renderOverview(); }
    }
  });
});

async function load() {
  const res = await api("/api/admin/data", { token: atoken() });
  if (!res.ok) {
    localStorage.removeItem(AKEY);
    $("app").classList.add("hidden");
    $("screen-login").classList.remove("hidden");
    return;
  }
  data = res;
  $("screen-login").classList.add("hidden");
  $("app").classList.remove("hidden");
  renderOverview();
  renderTutors();
  renderStandalone();
  loadErrors();
}

document.addEventListener("DOMContentLoaded", () => {
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault();
    $("login-error").textContent = "";
    const res = await api("/api/admin/login", { password: $("a-pass").value });
    if (!res.ok) { $("login-error").textContent = res.error || "Не получилось."; return; }
    localStorage.setItem(AKEY, res.token);
    $("a-pass").value = "";
    load();
  });

  $("logout-btn").addEventListener("click", async () => {
    await api("/api/admin/logout", { token: atoken() });
    localStorage.removeItem(AKEY);
    location.reload();
  });

  if (atoken()) load();
});
