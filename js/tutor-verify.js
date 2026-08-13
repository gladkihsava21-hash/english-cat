// Подтверждение почты, надёжность пароля и подбор тарифа при регистрации.

// Прайс приходит с сервера (/api/plans). Здесь он лежал копией и разъезжался
// с настоящим при каждой правке цен — регистрация обещала одну сумму,
// а счёт выставлялся по другой. Значения ниже — только чтобы подсказка не
// была пустой, пока запрос летит; сразу после ответа они заменяются.
let PLANS = [
  { id: "start",    limit: 5,  price: 799,  name: "Старт" },
  { id: "practice", limit: 10, price: 1299, name: "Практика" },
  { id: "school",   limit: 20, price: 2399, name: "Школа" },
  { id: "pro",      limit: 50, price: 4990, name: "Профи" },
];
let EXTRA_STUDENT_PRICE = 119;

(async function loadPrices() {
  try {
    const res = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.plans) && data.plans.length) {
      PLANS = data.plans;
      EXTRA_STUDENT_PRICE = data.extraPrice;
      const count = document.getElementById("t-count");
      const hint = document.getElementById("plan-hint");
      if (count && hint && count.value) hint.textContent = planHintText(count.value);
    }
  } catch (e) { /* офлайн — остаются значения по умолчанию */ }
})();

function planCost(plan, n) {
  return plan.price + Math.max(0, n - plan.limit) * EXTRA_STUDENT_PRICE;
}

/** Самый дешёвый вариант, а не первый подходящий: при 12 учениках
 *  «Практика» + 2 места дешевле «Школы», и предлагать переплату нечестно. */
function planFor(count) {
  const n = Number(count) || 0;
  return PLANS.reduce((best, p) =>
    planCost(p, n) < planCost(best, n) ? p : best, PLANS[0]);
}

function planHintText(count) {
  const n = Number(count) || 0;
  if (!n) return "";
  const plan = planFor(n);
  if (n > plan.limit) {
    const extra = n - plan.limit;
    return `Тариф «${plan.name}» ${plan.price} ₽/мес + ${extra} сверх лимита × ${EXTRA_STUDENT_PRICE} ₽ = ${plan.price + extra * EXTRA_STUDENT_PRICE} ₽/мес`;
  }
  return plan.price
    ? `Подходит тариф «${plan.name}» — ${plan.price} ₽/мес, до ${plan.limit} учеников`
    : `Хватит бесплатного тарифа — до ${plan.limit} учеников`;
}

/** Оценка пароля: 0..4. Не пускаем в счёт длину сверх 16 —
 *  иначе «ааааааааааааааааааа» выглядит надёжнее, чем короткий, но разный. */
function passScore(pw) {
  const p = String(pw || "");
  if (p.length < 8) return { score: 0, text: "Коротковато — нужно хотя бы 8 символов" };
  let score = 1;
  const kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
  const uniq = new Set(p).size;
  if (p.length >= 12) score++;
  if (kinds >= 2) score++;
  if (kinds >= 3 && uniq >= 8) score++;
  if (/^[0-9]+$/.test(p)) score = Math.min(score, 1);
  if (uniq <= 3) score = Math.min(score, 1);
  const texts = ["Слабый — подберут быстро", "Слабоватый", "Нормальный",
                 "Хороший", "Отличный"];
  return { score, text: texts[score] };
}

document.addEventListener("DOMContentLoaded", () => {
  const $$ = id => document.getElementById(id);

  // ---- индикатор пароля ----
  const pass = $$("t-pass"), fill = $$("pass-fill"), hint = $$("pass-hint");
  if (pass && fill) {
    pass.addEventListener("input", () => {
      const { score, text } = passScore(pass.value);
      fill.style.width = (score / 4 * 100) + "%";
      fill.dataset.level = score;
      hint.textContent = pass.value ? text : "";
    });
  }

  // ---- подбор тарифа ----
  const count = $$("t-count"), planHint = $$("plan-hint");
  if (count && planHint) {
    count.addEventListener("input", () => { planHint.textContent = planHintText(count.value); });
  }

  // ---- подтверждение почты ----
  const vForm = $$("verify-form");
  if (vForm) vForm.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $$("verify-error"), note = $$("verify-note");
    err.textContent = ""; note.textContent = "";
    const res = await api("/api/tutor/verify/check", {
      token: token(), code: $$("v-code").value.trim(),
    });
    if (!res.ok) { err.textContent = res.error || "Не получилось."; return; }
    location.reload();
  });

  const resend = $$("verify-resend");
  if (resend) resend.addEventListener("click", async () => {
    const err = $$("verify-error"), note = $$("verify-note");
    err.textContent = ""; note.textContent = "Отправляю…";
    const res = await api("/api/tutor/verify/send", { token: token() });
    if (!res.ok) { note.textContent = ""; err.textContent = res.error || "Не получилось."; return; }
    note.textContent = "Письмо отправлено. Проверьте почту и папку «Спам».";
  });
});

/** Показать экран подтверждения вместо панели. */
function showVerifyScreen(email) {
  const scr = document.getElementById("screen-verify");
  const auth = document.getElementById("screen-auth");
  const app = document.getElementById("app");
  if (!scr) return;
  if (auth) auth.classList.add("hidden");
  if (app) app.classList.add("hidden");
  scr.classList.remove("hidden");
  const box = document.getElementById("verify-email");
  if (box) box.textContent = email || "";
}

// ---- блок подписки в панели ----

let planData = null;

function renderPlan() {
  const box = document.getElementById("plan-box");
  const chip = document.getElementById("plan-chip");
  if (!planData) return;
  const t = planData.tutor;
  const used = t.studentCount, limit = t.studentLimit;
  const left = Math.max(0, limit - used);
  const pct = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;

  if (chip) {
    chip.textContent = `${t.planName} · ${used}/${limit}`;
    chip.classList.toggle("plan-full", left === 0);
  }
  const slot = document.getElementById("access-bar-slot");
  if (slot) slot.innerHTML = accessBanner(t);
  if (!box) return;

  box.innerHTML = `
    <div class="plan-card">
      <div class="plan-head">
        <div>
          <p class="plan-name">${esc(t.planName)}</p>
          <p class="muted-note">${t.planPrice ? t.planPrice + " ₽ в месяц" : "бесплатно"}</p>
        </div>
        <p class="plan-count">${used} <span>из ${limit}</span></p>
      </div>
      <div class="xp-bar"><div class="xp-bar-fill${left === 0 ? " full" : ""}" style="width:${pct}%"></div></div>
      <p class="muted-note">${left ? `Свободно мест: ${left}` : "Мест не осталось — новые ученики не смогут подключиться"}</p>
      <div class="plan-actions">
        <button class="btn btn-primary btn-small" id="add-slot-btn">+ Место за ${planData.extraPrice} ₽/мес</button>
        <button class="btn btn-ghost btn-small" id="add-slot5-btn">+ 5 мест за ${planData.extraPrice * 5} ₽/мес</button>
      </div>
      <p class="reset-note" style="margin-top:16px">Оплата пока не подключена — место открывается сразу,
        счёт выставим отдельно. Расширение действует до конца месяца.</p>
    </div>
    <div class="plan-table">
      ${planData.plans.map(pl => `
        <div class="plan-row${pl.id === t.plan ? " current" : ""}">
          <span class="plan-row-name">${esc(pl.name)}</span>
          <span class="plan-row-lim">до ${pl.limit} учеников</span>
          <span class="plan-row-price">${pl.price ? pl.price + " ₽" : "бесплатно"}</span>
        </div>`).join("")}
    </div>`;

  const add = n => async () => {
    const res = await api("/api/tutor/add-slot", { token: token(), count: n });
    if (!res.ok) { alert(res.error || "Не получилось."); return; }
    planData.tutor = res.tutor;
    renderPlan();
  };
  const b1 = document.getElementById("add-slot-btn");
  const b5 = document.getElementById("add-slot5-btn");
  if (b1) b1.addEventListener("click", add(1));
  if (b5) b5.addEventListener("click", add(5));
}

async function loadPlan() {
  if (typeof token !== "function" || !token()) return;
  const res = await api("/api/tutor/plan", { token: token() });
  if (!res.ok) return;
  planData = res;
  renderPlan();
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-tab="plan"]').forEach(b => b.addEventListener("click", loadPlan));
  setTimeout(loadPlan, 1400);
});

// ---- триал и оплата ----

function accessBanner(t) {
  if (!t) return "";
  if (t.access === "paid") {
    const d = Math.floor(t.paidDaysLeft);
    return d <= 5
      ? `<div class="access-bar warn">Подписка заканчивается через ${d} дн. Продлите, чтобы не потерять доступ.</div>`
      : "";
  }
  if (t.access === "trial") {
    const h = Math.ceil(t.trialHoursLeft);
    const text = h > 24 ? `${Math.ceil(h / 24)} дн.` : `${h} ч.`;
    return `<div class="access-bar">Пробный период: осталось ${text}.
      Дальше нужна подписка — тариф «${esc(t.planName)}», ${t.planPrice} ₽/мес.</div>`;
  }
  return `<div class="access-bar stop">Пробный период закончился. Оформите подписку,
    чтобы вернуть доступ к панели. Ученики продолжают заниматься.</div>`;
}

function showPaywall(t) {
  const app = document.getElementById("app");
  const auth = document.getElementById("screen-auth");
  const wall = document.getElementById("screen-paywall");
  if (!wall) return;
  if (app) app.classList.add("hidden");
  if (auth) auth.classList.add("hidden");
  wall.classList.remove("hidden");
  const box = document.getElementById("paywall-plan");
  if (box && t) {
    box.innerHTML = `
      <p class="plan-name">${esc(t.planName)} — ${t.planPrice} ₽/мес</p>
      <p class="muted-note">до ${t.studentLimit} учеников · сейчас занимается ${t.studentCount}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const out = document.getElementById("paywall-logout");
  if (out) out.addEventListener("click", () => {
    localStorage.removeItem("savelyTutorToken");
    location.reload();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const out = document.getElementById("verify-logout");
  if (out) out.addEventListener("click", () => {
    localStorage.removeItem("savelyTutorToken");
    location.reload();
  });
});

// ---- первые шаги ----
// Репетитор после регистрации попадал в пустую панель и сам догадывался,
// что делать. Показываем три шага, пока они не пройдены.

function renderOnboarding() {
  const slot = document.getElementById("onboard-slot");
  if (!slot || typeof students === "undefined") return;

  const hasStudents = students.length > 0;
  const hasHomework = typeof tasks !== "undefined" && tasks.length > 0;
  const hasActive = students.some(s => (s.xpWeek || 0) > 0);

  if (hasStudents && hasHomework && hasActive) { slot.innerHTML = ""; return; }

  const step = (done, num, title, text, action) => `
    <div class="ob-step${done ? " done" : ""}">
      <span class="ob-num">${done ? "✓" : num}</span>
      <div>
        <p class="ob-title">${esc(title)}</p>
        <p class="ob-text">${esc(text)}</p>
        ${!done && action ? action : ""}
      </div>
    </div>`;

  slot.innerHTML = `
    <div class="onboard">
      <p class="ob-head">С чего начать</p>
      ${step(hasStudents, 1, "Позовите учеников",
        "Скопируйте ссылку и отправьте им в чат. Ученику не нужен пароль — он откроет ссылку и введёт имя.",
        `<button class="btn btn-primary btn-small" data-goto="invite">Взять ссылку</button>`)}
      ${step(hasHomework, 2, "Выдайте первую домашку",
        "Выберите слова по теме или напишите задание текстом. Можно задать текст для чтения вслух.",
        `<button class="btn btn-primary btn-small" data-goto="homework">Выдать домашку</button>`)}
      ${step(hasActive, 3, "Проверьте, как идут дела",
        "Когда ученики начнут заниматься, здесь появится их прогресс: слова, очки, кто пропал.", "")}
    </div>`;

  slot.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => {
    const t = document.querySelector(`.nav-btn[data-tab="${b.dataset.goto}"]`);
    if (t) t.click();
  }));
}
