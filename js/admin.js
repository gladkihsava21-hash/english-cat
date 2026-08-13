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
  const days = Math.floor((Date.now() - new Date(iso + "T00:00:00")) / 864e5);
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  if (days < 7) return days + " дн. назад";
  if (days < 30) return Math.floor(days / 7) + " нед. назад";
  return Math.floor(days / 30) + " мес. назад";
}

function renderOverview() {
  const o = data.overview;
  $("ai-chip").textContent = data.aiOn ? "ИИ включён" : "ИИ выключен";
  $("ai-chip").classList.toggle("plan-full", !data.aiOn);
  $("overview").innerHTML = [
    ["Репетиторов", o.tutors, `подтвердили почту: ${o.verified}`],
    ["Учеников", o.students, `занимались за неделю: ${o.activeWeek}`],
    ["Домашек", o.homework, `фото тетрадей: ${o.photos}`],
    ["Выручка в месяц", money(o.revenue),
      `тарифы ${money(o.baseRevenue)} + проверка ${money(o.checksRevenue)}`],
    // Не оценка, а факт: сообщения и проверки считаются в базе
    ["Расходы на ИИ", money(o.aiCost),
      `${o.chatMessages} сообщений, ${o.checksUsed} проверок`],
    ["Чистыми", money(o.profit), "минус комиссия 3%"],
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
