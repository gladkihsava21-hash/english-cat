/* ===== Мой профиль: то, чем ученик управляет сам =====
 *
 * ПОЧЕМУ ЗДЕСЬ НЕТ ПАРОЛЯ. У ученика его нет ни в базе, ни в схеме — и это
 * решение, а не пробел. Вход устроен иначе: репетитор даёт ссылку с кодом
 * приглашения, ученик вписывает имя и получает ЛИЧНЫЙ КОД вида ABCD-2345.
 * Код и есть пара «логин + пароль» в одном: один секрет, который можно
 * показать, скопировать и заменить. Ученику 10-15 лет; второй секрет он
 * забудет к третьему занятию и придёт с этим к репетитору — то есть цена
 * пароля тут не в безопасности, а в чужом рабочем времени.
 *
 * И отдельно: показать СОХРАНЁННЫЙ пароль нельзя в принципе — в базе лежит
 * хеш, а не пароль. Так что «увидеть свой пароль» — это всегда либо «увидеть
 * то, что ты сейчас набрал» (глазок у поля, он есть в util.js), либо новый
 * секрет взамен старого. Здесь второе, и называется оно «сменить код».
 *
 * Экран рисуется из ответа сервера (/api/student/profile). Локальное
 * состояние — только запасной вариант на случай, когда сервера нет:
 * страница обязана открываться и без него.
 */

// Последний ответ сервера. Пока его нет, рисуем по localStorage —
// пустой экран на месте профиля выглядит поломкой.
let accountData = null;

/* ---------- вход в раздел ---------- */

/** Кнопка «профиль» в шапке.
 *
 * Добавляем из скрипта, а не в разметку: нижнее меню на телефоне и так
 * несёт пять пунктов, шестой сожмёт подписи до нечитаемого, а профиль —
 * не то, куда ходят каждое занятие. Его место рядом с «выйти»: оба про
 * аккаунт, а не про учёбу.
 *
 * data-nav подхватывает общий обработчик навигации в app.js — своего
 * слушателя на клик здесь не нужно. */
function mountAccountEntry() {
  const chip = document.querySelector(".user-chip");
  if (!chip || document.getElementById("account-btn")) return;
  const btn = document.createElement("button");
  btn.id = "account-btn";
  btn.type = "button";
  btn.className = "link-btn";
  btn.dataset.nav = "account";
  btn.title = "Имя, личный код, уровень";
  btn.textContent = "профиль";
  chip.insertBefore(btn, document.getElementById("logout-btn"));
}

document.addEventListener("DOMContentLoaded", mountAccountEntry);

/* ---------- данные ---------- */

/** Профиль по локальному состоянию: сервер недоступен или ещё не ответил. */
function accountFallback() {
  return {
    name: (state.user && state.user.name) || "",
    restoreCode: state.restoreCode || "",
    codeChangedAt: null,
    level: state.level || "",
    levelSetAt: null,
    vocab: state.vocabEstimate || 0,
    words: (state.dictionary || []).length,
    xp: state.xp || 0,
    createdAt: null,
    tutorName: localStorage.getItem("savelyTutorName") || "",
  };
}

async function loadAccount() {
  const token = typeof studentToken === "function" ? studentToken() : "";
  if (!token) return;                       // занимается без репетитора
  try {
    const res = await api("/api/student/profile", { token });
    if (!res.ok) {
      // unknown_student = аккаунт удалён (например, с другого устройства
      // или репетитором). Молчать нельзя: человек будет считать, что всё
      // на месте, пока не потеряет прогресс окончательно.
      accountData = null;
      paintAccount(res.error === "unknown_student"
        ? "Этот аккаунт больше не существует. Возможно, его удалили — попроси у репетитора новую ссылку."
        : res.error);
      return;
    }
    accountData = res.profile;
    // Сервер здесь — источник правды. Если код перевыпустили с другого
    // устройства (или там же сменили имя), локальная копия устарела, а её
    // показывает окно выхода — то есть человек уходил бы, записав мёртвый
    // код. Догоняем молча: это не событие, о котором надо сообщать.
    let changed = false;
    if (res.profile.restoreCode && state.restoreCode !== res.profile.restoreCode) {
      state.restoreCode = res.profile.restoreCode;
      changed = true;
    }
    if (res.profile.name && (!state.user || state.user.name !== res.profile.name)) {
      state.user = state.user || { name: res.profile.name, email: "" };
      state.user.name = res.profile.name;
      changed = true;
    }
    if (changed) {
      saveStateQuiet();
      if (typeof updateChrome === "function") updateChrome();
    }
    paintAccount();
  } catch (e) {
    // Офлайн — оставляем нарисованное по локальным данным, но говорим
    // об этом: иначе непонятно, почему кнопки не работают.
    paintAccount("Связи с сервером нет — показываю то, что сохранено на этом устройстве.");
  }
}

/** Вызывается из show() в app.js. */
function renderAccount() {
  paintAccount();     // сразу, из локального состояния
  loadAccount();      // и обновляем настоящими данными
}

/* ---------- отрисовка ---------- */

/** Дата по-человечески: «12 августа 2026».
 *  Хвост «г.» убираем: он у нас всегда встаёт перед точкой предложения
 *  и даёт «12 августа 2026 г..» — две точки подряд. */
function acDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
          .replace(/\s*г\.?\s*$/, "");
}

function paintAccount(note) {
  const box = document.getElementById("ac-body");
  const lead = document.getElementById("ac-lead");
  if (!box) return;
  const p = accountData || accountFallback();
  // «Есть репетитор» = есть токен. Не «сервер уже ответил»: пока ответ
  // в пути, экран рисуется по локальным данным, и если считать это
  // отсутствием репетитора, ученик на секунду увидит «кода нет» —
  // а потом код появится. Мигание на таком экране читается как сбой.
  const online = !!(typeof studentToken === "function" && studentToken());

  lead.textContent = note || (online
    ? "Здесь твоё имя, личный код для входа и уровень. Пароля у тебя нет — вместо него код."
    : "Ты занимаешься без репетитора: прогресс живёт только в этом браузере, личного кода нет.");
  lead.classList.toggle("ac-lead-warn", !!note);

  box.innerHTML = [
    acNameCard(p, online),
    acCodeCard(p, online),
    acLevelCard(p),
    acTutorCard(p, online),
    acDangerCard(p, online),
  ].join("");

  if (typeof paintIcons === "function") paintIcons(box);
  wireAccount(online);
}

/* Имя. Единственное, что ученик может испортить репетитору: в панели
   ученики стоят списком по именам, и «ыыы» вместо «Ваня» — это чужая
   потерянная минута. Поэтому подпись честно говорит, кто это увидит. */
function acNameCard(p, online) {
  return `
    <section class="card ac-card">
      <h3 class="ac-h">${iconInline("personal", 18)} Имя</h3>
      <p class="ac-note">Так тебя зовут на сайте${online
        ? " — и так тебя видит репетитор у себя в списке"
        : ""}. Можно поменять в любой момент.</p>
      <form class="ac-row" id="ac-name-form">
        <label class="visually-hidden" for="ac-name">Твоё имя</label>
        <input type="text" id="ac-name" maxlength="40" autocomplete="off"
               placeholder="Как тебя зовут?" value="${esc(p.name)}">
        <button type="submit" class="btn btn-primary btn-small">Сохранить</button>
      </form>
      <p class="type-feedback" id="ac-name-msg" role="status"></p>
    </section>`;
}

/* Личный код. Главная карточка экрана: это и есть «логин и пароль»,
   про которые спрашивают. */
function acCodeCard(p, online) {
  // Судим по САМОМУ КОДУ, а не по связи с сервером: код хранится и
  // локально, и показать его в самолёте — ровно тот случай, ради
  // которого человек сюда и зашёл. Перевыпуск без сервера не сделать,
  // поэтому кнопки «сменить» офлайн просто нет.
  if (!p.restoreCode) {
    return `
      <section class="card ac-card">
        <h3 class="ac-h">${iconInline("lock", 18)} Личный код</h3>
        <p class="ac-note">Кода нет: он выдаётся, когда заходишь по ссылке
          репетитора. Сейчас твой прогресс лежит только в этом браузере —
          на другом устройстве его не открыть.</p>
      </section>`;
  }
  const changed = acDate(p.codeChangedAt);
  return `
    <section class="card ac-card">
      <h3 class="ac-h">${iconInline("lock", 18)} Личный код</h3>
      <p class="ac-note">Это твой вход — и логин, и пароль сразу. Введи его
        на другом телефоне или компьютере, и весь словарь окажется там же.
        Больше запоминать нечего: пароля у тебя нет.</p>
      <p class="ac-code"><span id="ac-code-value">${esc(p.restoreCode)}</span></p>
      <div class="ac-actions">
        <button type="button" class="btn btn-ghost btn-small" id="ac-copy">Скопировать</button>
        ${online ? `<button type="button" class="btn btn-ghost btn-small" id="ac-reissue">Сменить код</button>` : ""}
      </div>
      <p class="ac-warn">${iconInline("lock", 15)} Никому не показывай: у кого код — тот войдёт как ты
        и увидит твой словарь.</p>
      ${changed ? `<p class="ac-note ac-dim">Последний раз менял ${esc(changed)}.</p>` : ""}

      <div class="ac-confirm hidden" id="ac-reissue-box">
        <p class="ac-confirm-head">Старый код перестанет работать сразу.</p>
        <p class="ac-note">Если он записан в тетради или ты диктовал его кому-то —
          записи придётся заменить на новый. На этом устройстве ты останешься
          в аккаунте: выходить и заново входить не нужно.</p>
        <label class="ack-row">
          <input type="checkbox" id="ac-reissue-ack">
          <span>Понял: старый код больше не подойдёт</span>
        </label>
        <div class="ac-actions">
          <button type="button" class="btn btn-ghost btn-small" id="ac-reissue-cancel">Отмена</button>
          <button type="button" class="btn btn-primary btn-small" id="ac-reissue-go" disabled>Выдать новый код</button>
        </div>
      </div>
      <p class="type-feedback" id="ac-code-msg" role="status"></p>
    </section>`;
}

/* Уровень и дата. Дата здесь не украшение: уровень полугодовой давности
   описывает уже не этого человека, и по ней видно, когда пора пересдать. */
function acLevelCard(p) {
  const name = (typeof LEVEL_NAMES === "object" && LEVEL_NAMES[p.level]) || "";
  const when = acDate(p.levelSetAt);
  // Дату знает только сервер, поэтому «не записано» говорим лишь тогда,
  // когда он ОТВЕТИЛ и даты действительно нет. Сказать это же, пока ответ
  // в пути или сервера нет вовсе, — соврать человеку, который прошёл тест
  // минуту назад. Молчание тут честнее выдумки.
  const dateLine = when ? `Определён ${esc(when)}. `
    : (accountData ? "Когда его определили — не записано: ты проходил тест раньше, чем я научился запоминать дату. " : "");
  return `
    <section class="card ac-card">
      <h3 class="ac-h">${iconInline("target", 18)} Уровень</h3>
      ${p.level
        ? `<p class="ac-level"><b>${esc(p.level)}</b>${name ? ` <span>${esc(name)}</span>` : ""}</p>
           <p class="ac-note">${dateLine}По нему я подбираю слова: не те, что ты уже знаешь, и не те, на которых сломаешься.</p>`
        : `<p class="ac-level"><b>—</b></p>
           <p class="ac-note">Уровень ещё не определён. Тест — 36 слов, пара минут.</p>`}
      <button type="button" class="btn btn-ghost btn-small" data-nav="test">
        ${p.level ? "Пройти тест заново" : "Пройти тест"}</button>
      ${p.level ? `<p class="ac-note ac-dim">Прошлый результат не потеряется — словарь и очки останутся на месте.</p>` : ""}
    </section>`;
}

function acTutorCard(p, online) {
  return `
    <section class="card ac-card">
      <h3 class="ac-h">${iconInline("book", 18)} Репетитор</h3>
      ${online && p.tutorName
        ? `<p class="ac-strong">${esc(p.tutorName)}</p>
           <p class="ac-note">Видит твой прогресс, словарь и домашку — для этого
             ты и заходил по его ссылке. Отвязаться самому нельзя: об этом
             договариваются с репетитором, а не кнопкой.</p>`
        : `<p class="ac-note">Репетитора нет — ты занимаешься сам. Если он даст
             ссылку, прогресс поедет к нему в панель, а у тебя появится личный код.</p>`}
      ${online && p.createdAt ? `<p class="ac-note ac-dim">Занимаешься с ${esc(acDate(p.createdAt))}.</p>` : ""}
    </section>`;
}

/* Удаление. Честно — значит: перечислить, что именно исчезнет, сказать,
   что вернуть нельзя, и потребовать отдельного согласия. */
function acDangerCard(p, online) {
  return `
    <section class="card ac-card ac-card-danger">
      <h3 class="ac-h">${iconInline("trash", 18)} Удалить аккаунт</h3>
      <p class="ac-note">Исчезнет всё: словарь (${esc(String(p.words))} сл.),
        очки (${esc(String(p.xp))}), награды${online ? ", домашка и присланные фото" : ""}.
        ${online
          ? "Репетитор перестанет видеть тебя в списке. Вернуть это не сможет никто — ни я, ни репетитор."
          : "Прогресс лежит только в этом браузере, копии нигде нет — вернуть будет нечем."}</p>
      <button type="button" class="btn btn-ghost btn-small danger-btn" id="ac-del">Удалить аккаунт</button>

      <div class="ac-confirm hidden" id="ac-del-box">
        <p class="ac-confirm-head">Это навсегда.</p>
        <p class="ac-note">Если ты просто пересаживаешься с чужого устройства —
          не надо удалять: нажми «выйти» в шапке, прогресс останется у меня,
          и ты вернёшься по личному коду.</p>
        <label class="ack-row">
          <input type="checkbox" id="ac-del-ack">
          <span>Я понимаю: прогресс не вернуть</span>
        </label>
        <div class="ac-actions">
          <button type="button" class="btn btn-ghost btn-small" id="ac-del-cancel">Отмена</button>
          <button type="button" class="btn btn-primary btn-small danger-btn" id="ac-del-go" disabled>Удалить навсегда</button>
        </div>
      </div>
      <p class="type-feedback" id="ac-del-msg" role="status"></p>
    </section>`;
}

/* ---------- действия ---------- */

function acMsg(id, text, kind) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = "type-feedback" + (kind ? " " + kind : "");
  el.textContent = text || "";
}

function wireAccount(online) {
  const $ = id => document.getElementById(id);

  // --- имя ---
  const nameForm = $("ac-name-form");
  if (nameForm) {
    nameForm.addEventListener("submit", async e => {
      e.preventDefault();
      const value = $("ac-name").value.trim();
      // Проверяем и на клиенте тоже: сервер всё равно проверит, но ответ
      // из сети приходит через полсекунды, а ошибку видно сразу.
      if (value.length < 2) {
        acMsg("ac-name-msg", "Напиши имя — хотя бы две буквы.", "err");
        return;
      }
      if (value.length > 40) {
        acMsg("ac-name-msg", "Слишком длинное имя — до 40 знаков.", "err");
        return;
      }
      if (!online) {
        // Без репетитора имя живёт только здесь — и это нормально.
        state.user = state.user || {};
        state.user.name = value;
        saveStateQuiet();
        if (typeof updateChrome === "function") updateChrome();
        acMsg("ac-name-msg", "Готово.", "ok");
        return;
      }
      acMsg("ac-name-msg", "Сохраняю…");
      try {
        const res = await api("/api/student/name", { token: studentToken(), name: value });
        if (!res.ok) { acMsg("ac-name-msg", res.error || "Не сохранилось.", "err"); return; }
        state.user = state.user || {};
        state.user.name = res.name;
        if (accountData) accountData.name = res.name;
        // saveStateQuiet, а не saveState: имя на сервер уходит этой же
        // ручкой, и обычное сохранение завело бы лишнюю синхронизацию.
        saveStateQuiet();
        if (typeof updateChrome === "function") updateChrome();
        acMsg("ac-name-msg", "Готово — репетитор увидит новое имя.", "ok");
      } catch (err) {
        acMsg("ac-name-msg", "Сервер не ответил. Попробуй ещё раз.", "err");
      }
    });
  }

  // --- копирование кода ---
  const copyBtn = $("ac-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      const value = $("ac-code-value").textContent;
      try {
        await navigator.clipboard.writeText(value);
        acMsg("ac-code-msg", "Код скопирован.", "ok");
      } catch (e) {
        // Буфер закрыт (нет https или отказали) — выделяем код,
        // чтобы его можно было скопировать руками.
        const r = document.createRange();
        r.selectNodeContents($("ac-code-value"));
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        acMsg("ac-code-msg", "Код выделен — скопируй его.", "ok");
      }
    });
  }

  // --- перевыпуск кода ---
  const reissue = $("ac-reissue");
  if (reissue) {
    const box = $("ac-reissue-box");
    reissue.addEventListener("click", () => {
      box.classList.toggle("hidden");
      $("ac-reissue-ack").checked = false;
      $("ac-reissue-go").disabled = true;
      acMsg("ac-code-msg", "");
    });
    $("ac-reissue-cancel").addEventListener("click", () => box.classList.add("hidden"));
    $("ac-reissue-ack").addEventListener("change", e => {
      $("ac-reissue-go").disabled = !e.target.checked;
    });
    $("ac-reissue-go").addEventListener("click", async () => {
      const go = $("ac-reissue-go");
      go.disabled = true;
      acMsg("ac-code-msg", "Меняю…");
      try {
        const res = await api("/api/student/code/new", { token: studentToken() });
        if (!res.ok) {
          acMsg("ac-code-msg", res.error || "Не получилось. Попробуй позже.", "err");
          go.disabled = false;
          return;
        }
        state.restoreCode = res.restoreCode;
        if (accountData) {
          accountData.restoreCode = res.restoreCode;
          accountData.codeChangedAt = new Date().toISOString();
        }
        saveStateQuiet();
        paintAccount();
        acMsg("ac-code-msg", "Новый код готов. Запиши его — старый больше не работает.", "ok");
      } catch (e) {
        acMsg("ac-code-msg", "Сервер не ответил — код остался прежним.", "err");
        go.disabled = false;
      }
    });
  }

  // --- удаление аккаунта ---
  const del = $("ac-del");
  if (del) {
    const box = $("ac-del-box");
    del.addEventListener("click", () => {
      box.classList.toggle("hidden");
      $("ac-del-ack").checked = false;
      $("ac-del-go").disabled = true;
      acMsg("ac-del-msg", "");
    });
    $("ac-del-cancel").addEventListener("click", () => box.classList.add("hidden"));
    $("ac-del-ack").addEventListener("change", e => {
      $("ac-del-go").disabled = !e.target.checked;
    });
    $("ac-del-go").addEventListener("click", async () => {
      $("ac-del-go").disabled = true;
      if (!online) {
        wipeAccountLocally();
        return;
      }
      acMsg("ac-del-msg", "Удаляю…");
      try {
        const res = await api("/api/student/delete", { token: studentToken(), confirm: true });
        if (!res.ok) {
          acMsg("ac-del-msg", res.error || "Не удалось удалить. Попробуй позже.", "err");
          $("ac-del-go").disabled = false;
          return;
        }
        wipeAccountLocally();
      } catch (e) {
        acMsg("ac-del-msg", "Сервер не ответил — аккаунт на месте.", "err");
        $("ac-del-go").disabled = false;
      }
    });
  }
}

/** Стираем следы аккаунта в браузере и уходим на стартовый экран.
 *  Отложенную привязку к репетитору убираем отдельно: без этого
 *  следующая же загрузка страницы создала бы ученика заново по
 *  сохранённому приглашению. */
function wipeAccountLocally() {
  localStorage.removeItem("savelyPendingJoin");
  if (typeof doLogout === "function") doLogout();   // он же остановит синхронизацию
  else location.reload();
}
