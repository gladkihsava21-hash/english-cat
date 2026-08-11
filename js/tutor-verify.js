// Подтверждение почты, надёжность пароля и подбор тарифа при регистрации.

const PLANS = [
  { id: "trial",    limit: 5,  price: 0,    name: "Пробный" },
  { id: "start",    limit: 15, price: 690,  name: "Старт" },
  { id: "practice", limit: 30, price: 1290, name: "Практика" },
  { id: "school",   limit: 60, price: 1990, name: "Школа" },
];
const EXTRA_STUDENT_PRICE = 99;

function planFor(count) {
  const n = Number(count) || 0;
  return PLANS.find(p => n <= p.limit) || PLANS[PLANS.length - 1];
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
