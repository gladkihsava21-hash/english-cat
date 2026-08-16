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
let TRIAL_DAYS = 5;   // запасное значение; настоящее приходит из /api/plans

(async function loadPrices() {
  try {
    const res = await fetch("/api/plans", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const data = await res.json();
    if (data && data.ok && Array.isArray(data.plans) && data.plans.length) {
      PLANS = data.plans;
      EXTRA_STUDENT_PRICE = data.extraPrice;
      if (data.trialDays) TRIAL_DAYS = data.trialDays;
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

/** Подсказка под полем «сколько у вас учеников».
 *  Одна сумма без объяснения читается как «а с учеников ещё сколько?» —
 *  поэтому цена всегда идёт вместе с тем, кто её платит и когда. */
function planHintText(count) {
  const n = Number(count) || 0;
  if (!n) return "";
  const plan = planFor(n);
  if (!plan || !plan.price) return "";

  const extra = Math.max(0, n - plan.limit);
  const price = extra
    ? `Тариф «${plan.name}» — ${plan.price} ₽ плюс ${extra} × ${EXTRA_STUDENT_PRICE} ₽ ` +
      `за места сверх лимита. Итого ${planCost(plan, n)} ₽ в месяц`
    : `Подходит тариф «${plan.name}» — ${plan.price} ₽ в месяц, до ${plan.limit} учеников`;

  return `${price}. Это вся сумма: ученики не платят ничего. ` +
         `Первые ${TRIAL_DAYS} ${plural(TRIAL_DAYS, "день", "дня", "дней")} бесплатно, счёт — после них.`;
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
    if (!res.ok) {
      err.textContent = res.error ||
        "Код не подошёл. Проверьте шесть цифр из письма или запросите новый.";
      return;
    }
    location.reload();
  });

  const resend = $$("verify-resend");
  if (resend) resend.addEventListener("click", async () => {
    const err = $$("verify-error"), note = $$("verify-note");
    err.textContent = ""; note.textContent = "Отправляем письмо…";
    const res = await api("/api/tutor/verify/send", { token: token() });
    if (!res.ok) {
      note.textContent = "";
      err.textContent = res.error ||
        "Письмо не ушло. Попробуйте через минуту или напишите в телеграм @KOTSAVELII.";
      return;
    }
    note.textContent = "Письмо отправлено. Проверьте почту и папку «Спам».";
  });
});

/** Показать экран подтверждения вместо панели.
 *
 *  mail — что сервер ответил про письмо: { sent, error }. Раньше этот
 *  ответ приходил и молча выбрасывался, а экран в любом случае писал
 *  «Отправили шесть цифр на такой-то адрес». Если письмо на самом деле
 *  не ушло (а такое бывает — почтовый ящик хостинга живёт своей жизнью),
 *  репетитор сидел и ждал код, которого нет, и никакой подсказки, что
 *  надо нажать «Отправить ещё раз», ему не давали. */
function showVerifyScreen(email, mail) {
  const scr = document.getElementById("screen-verify");
  const auth = document.getElementById("screen-auth");
  const app = document.getElementById("app");
  if (!scr) return;
  if (auth) auth.classList.add("hidden");
  if (app) app.classList.add("hidden");
  scr.classList.remove("hidden");
  const box = document.getElementById("verify-email");
  if (box) box.textContent = email || "";

  const lead = document.getElementById("verify-lead");
  const err = document.getElementById("verify-error");
  const failed = mail && mail.sent === false;
  if (lead) lead.classList.toggle("hidden", failed);
  if (err) {
    err.textContent = failed
      ? ((mail && mail.error) || "Письмо не ушло.")
        + " Нажмите «Отправить ещё раз» — кабинет уже создан, ничего не потеряется."
      : "";
  }
  const again = document.getElementById("verify-resend");
  if (again && failed) again.focus();
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
          <p class="muted-note">${t.planPrice ? t.planPrice + " ₽ в месяц" : "оплата не начисляется"}</p>
        </div>
        <p class="plan-count">${used} <span>из ${limit}</span></p>
      </div>
      <div class="xp-bar"><div class="xp-bar-fill${left === 0 ? " full" : ""}" style="width:${pct}%"></div></div>
      <p class="muted-note">${left ? `Свободно мест: ${left}` : "Мест не осталось — новый ученик не сможет подключиться по ссылке"}</p>
      <div class="plan-actions">
        <button class="btn btn-primary btn-small" id="add-slot-btn">Добавить место — ${planData.extraPrice} ₽/мес</button>
        <button class="btn btn-ghost btn-small" id="add-slot5-btn">Добавить 5 мест — ${planData.extraPrice * 5} ₽/мес</button>
      </div>
      <!-- Шаг подтверждения. Кнопки выше меняли сумму счёта одним
           нажатием, а условия были написаны НИЖЕ них — то есть человек
           узнавал, за что платит, уже заплатив. Для денег это не мелочь:
           случайное касание на телефоне стоило репетитору реальных
           рублей, и вернуть их можно было только через переписку. -->
      <div class="card slot-confirm hidden" id="slot-confirm" role="group"
           aria-labelledby="slot-confirm-title">
        <p class="plan-name" id="slot-confirm-title">Подтвердите доплату</p>
        <p class="muted-note" id="slot-confirm-text"></p>
        <div class="plan-actions">
          <button class="btn btn-primary btn-small" id="slot-yes">Да, добавить</button>
          <button class="btn btn-ghost btn-small" id="slot-no">Отмена</button>
        </div>
        <p class="type-feedback" id="slot-msg" role="status" aria-live="polite"></p>
      </div>
      <p class="reset-note" style="margin-top:16px">Место открывается сразу, счёт пришлём отдельно —
        автосписаний нет. Доплата считается до конца месяца.</p>
    </div>
    <div class="plan-table">
      ${planData.plans.map(pl => `
        <div class="plan-row${pl.id === t.plan ? " current" : ""}">
          <span class="plan-row-name">${esc(pl.name)}</span>
          <span class="plan-row-lim">до ${pl.limit} учеников</span>
          <span class="plan-row-price">${pl.price ? pl.price + " ₽/мес" : "—"}</span>
        </div>`).join("")}
    </div>
    <p class="reset-note">Подписку оплачивает репетитор — с учеников не берём ничего.
      Счёт и смена тарифа — в телеграме
      <a class="tg-link" href="https://t.me/KOTSAVELII" target="_blank" rel="noopener">@KOTSAVELII</a>.</p>`;

  // Имя box выше уже занято карточкой тарифа — здесь своё
  const confirmBox = document.getElementById("slot-confirm");
  const text = document.getElementById("slot-confirm-text");
  const msg = document.getElementById("slot-msg");

  /** Показать, во что обойдётся доплата, ДО того как её проведут. */
  const askFor = n => () => {
    const wordSlot = n === 1 ? "место" : "мест";
    const extraCost = planData.extraPrice * n;
    const now = t.planPrice || 0;
    text.textContent =
      `${n} ${wordSlot} сверх тарифа — плюс ${extraCost} ₽ в месяц. `
      + `Всего станет ${now + extraCost} ₽ в месяц вместо ${now} ₽. `
      + `Место открывается сразу, счёт пришлём отдельно — автосписаний нет, `
      + `доплата считается до конца месяца.`;
    msg.textContent = "";
    confirmBox.classList.remove("hidden");
    document.getElementById("slot-yes").focus();
    // Само действие вешаем здесь: так подтверждается ровно то количество,
    // которое человек только что увидел на экране, а не то, что осталось
    // от прошлого нажатия.
    document.getElementById("slot-yes").onclick = async () => {
      msg.className = "type-feedback";
      msg.textContent = "Добавляю…";
      let res;
      try { res = await api("/api/tutor/add-slot", { token: token(), count: n }); }
      catch (e) { res = null; }
      if (!res || !res.ok) {
        // Раньше здесь стоял системный alert() — окно операционной
        // системы посреди платного продукта, из которого не понять,
        // списались деньги или нет.
        msg.className = "type-feedback err";
        msg.textContent = (res && res.error)
          || "Место не добавилось, деньги не начислены. Обновите страницу и попробуйте ещё раз.";
        return;
      }
      planData.tutor = res.tutor;
      renderPlan();
    };
  };
  const cancel = document.getElementById("slot-no");
  if (cancel) cancel.addEventListener("click", () => {
    confirmBox.classList.add("hidden");
    document.getElementById("add-slot-btn").focus();
  });
  const b1 = document.getElementById("add-slot-btn");
  const b5 = document.getElementById("add-slot5-btn");
  if (b1) b1.addEventListener("click", askFor(1));
  if (b5) b5.addEventListener("click", askFor(5));
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
      ? `<div class="access-bar warn">Продлите подписку — оплаченных дней осталось ${d}.
         Напишите <a class="tg-link" href="https://t.me/KOTSAVELII" target="_blank" rel="noopener">@KOTSAVELII</a>, пришлём счёт.</div>`
      : "";
  }
  if (t.access === "trial") {
    // «3 дн..» — двойная точка от сокращения плюс точка предложения.
    // Висело на КАЖДОЙ странице панели весь триал, то есть было
    // самой читаемой строкой знакомства с продуктом. Плюс «дн.» рядом
    // с ценой в рублях выглядит экономией на человеке.
    const h = Math.ceil(t.trialHoursLeft);
    const d = Math.ceil(h / 24);
    const text = h > 24
      ? `${d} ${plural(d, "день", "дня", "дней")}`
      : `${h} ${plural(h, "час", "часа", "часов")}`;
    return `<div class="access-bar">Пробный период: осталось ${text}.
      Дальше — «${esc(t.planName)}», ${t.planPrice} ₽ в месяц; ученики не платят ничего.</div>`;
  }
  return `<div class="access-bar stop">Оформите подписку, чтобы вернуть панель —
    пробный период закончился. Ученики всё это время занимаются как обычно.</div>`;
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
      <p class="muted-note">до ${t.studentLimit} учеников · сейчас занимается ${t.studentCount}</p>
      <p class="muted-note">Это вся сумма: с учеников не берём ничего.</p>`;
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

// ---- пустое состояние вкладки «Фото тетрадей» ----
// Пустое состояние фотографий и подпись кнопки копирования переехали туда,
// где им место: в renderPhotos() из js/tutor-photos.js и в сам js/tutor.js.
// Здесь стояли два MutationObserver — они работали, но следить за чужой
// разметкой ради двух строк текста дороже, чем поправить источник.

// ---- первые шаги ----
// Репетитор после регистрации попадал в пустую панель и сам догадывался,
// что делать. Показываем шаги, пока они не пройдены — или пока человек
// сам не скажет «понятно, уберите».
//
// Это встроенный блок, а не окно-мастер поверх панели. Мастер надо
// закрыть, чтобы что-то сделать, и к третьему экрану его уже не читают;
// блок остаётся на месте, отмечает сделанное галочками и ведёт кнопкой
// прямо на нужную вкладку.

// Скрытие помним на устройстве и на конкретного репетитора: у двух
// кабинетов на одном ноутбуке подсказки независимы, а «скрыть» одного
// не должно прятать шаги другому.
function onboardHiddenKey() {
  return "savelyOnboardHidden:" + (typeof tutor !== "undefined" && tutor ? tutor.id : "");
}

function renderOnboarding() {
  const slot = document.getElementById("onboard-slot");
  if (!slot || typeof students === "undefined") return;

  const hasStudents = students.length > 0;
  const hasHomework = typeof tasks !== "undefined" && tasks.length > 0;
  const hasActive = students.some(s => (s.xpWeek || 0) > 0);

  if (hasStudents && hasHomework && hasActive) { slot.innerHTML = ""; return; }
  let hidden = false;
  try { hidden = localStorage.getItem(onboardHiddenKey()) === "1"; } catch (e) { /* приватный режим */ }
  if (hidden) { slot.innerHTML = ""; return; }

  const step = (done, num, title, text, action) => `
    <div class="ob-step${done ? " done" : ""}">
      <span class="ob-num">${done ? "✓" : num}</span>
      <div>
        <p class="ob-title">${esc(title)}</p>
        <p class="ob-text">${esc(text)}</p>
        ${!done && action ? action : ""}
      </div>
    </div>`;

  // Самый первый вход — ни одного ученика: здороваемся и объясняем в
  // одну строку, как это работает. Дальше заголовок короткий: человек
  // уже в курсе, шаги напоминают, что осталось.
  const name = typeof tutor !== "undefined" && tutor && tutor.name ? tutor.name : "";
  const head = hasStudents
    ? `<p class="ob-head">С чего начать</p>`
    : `<p class="ob-head">${name ? esc(name) + ", з" : "З"}дравствуйте! Панель готова.</p>
       <p class="ob-lead">Работает так: вы даёте ученикам ссылку, они занимаются на сайте,
         вы здесь видите, кто что выучил, и выдаёте домашку. Три шага — и всё заработает.</p>`;

  slot.innerHTML = `
    <div class="onboard">
      <div class="ob-top">
        <div>${head}</div>
        <button type="button" class="link-btn ob-hide" id="ob-hide">скрыть подсказки</button>
      </div>
      ${step(hasStudents, 1, "Позовите учеников",
        "Скопируйте ссылку и отправьте им в чат. Ученику не нужен ни пароль, ни оплата — он откроет ссылку и введёт имя.",
        `<button class="btn btn-primary btn-small" data-goto="invite">Взять ссылку</button>`)}
      ${step(hasHomework, 2, "Выдайте первую домашку",
        "Выберите слова по теме или напишите задание текстом. Можно задать текст для чтения вслух.",
        `<button class="btn btn-primary btn-small" data-goto="homework">Выдать домашку</button>`)}
      ${step(hasActive, 3, "Посмотрите, кто занимается",
        "Как только ученики начнут, здесь появятся их слова, очки и дата последнего захода — сразу видно, кто пропал и кто забросил повторения.", "")}
      <div class="ob-step ob-more">
        <span class="ob-num ob-num-soft">+</span>
        <div>
          <p class="ob-title">Дальше — по желанию</p>
          <p class="ob-text">Ссылка на свою видеокомнату — у учеников появится кнопка «На урок».
            Проверка тетрадей по фото. Письма о новых работах и о тех, кто пропал, — включены,
            отключаются в один щелчок.</p>
          <div class="ob-links">
            <button class="link-btn" data-goto="lesson">Видеоурок</button>
            <button class="link-btn" data-goto="checks">Проверка домашек</button>
            <button class="link-btn" data-goto="plan">Письма на почту</button>
          </div>
        </div>
      </div>
    </div>`;

  slot.querySelectorAll("[data-goto]").forEach(b => b.addEventListener("click", () => {
    const t = document.querySelector(`.nav-btn[data-tab="${b.dataset.goto}"]`);
    if (t) t.click();
  }));
  const hide = document.getElementById("ob-hide");
  if (hide) hide.addEventListener("click", () => {
    try { localStorage.setItem(onboardHiddenKey(), "1"); } catch (e) { /* приватный режим */ }
    slot.innerHTML = "";
  });
}
