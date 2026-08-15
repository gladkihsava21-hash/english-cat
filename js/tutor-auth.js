// Смена и восстановление пароля репетитора.

function showRecoveryCode(code) {
  const modal = document.getElementById("recovery-modal");
  const val = document.getElementById("recovery-value");
  if (!modal || !val || !code) return;
  val.textContent = code;
  openModal(modal);
}

document.addEventListener("DOMContentLoaded", () => {
  const $$ = id => document.getElementById(id);

  const okBtn = $$("recovery-ok");
  if (okBtn) okBtn.addEventListener("click", () => closeModal("recovery-modal"));

  // Три формы на одной карточке: вход, сброс по коду с почты и сброс
  // по коду восстановления. Показываем ровно одну.
  const authForm = $$("auth-form"), resetForm = $$("reset-form");
  const mailForm = $$("reset-mail-form");
  const tabs = document.querySelector(".tabs");
  const showForm = which => {
    [authForm, mailForm, resetForm].forEach(f => f && f.classList.add("hidden"));
    if (which) which.classList.remove("hidden");
    // Вкладки «Вход / Регистрация» относятся только к первой форме
    if (tabs) tabs.classList.toggle("hidden", which !== authForm);
  };

  // «Забыли пароль?» ведёт на почту, а не на код восстановления: код
  // показывается один раз при регистрации, и к моменту, когда он нужен,
  // его уже потеряли. Доступ к почте есть всегда.
  const forgot = $$("forgot-btn"), back = $$("reset-back");
  if (forgot) forgot.addEventListener("click", () => showForm(mailForm));
  if (back) back.addEventListener("click", () => showForm(authForm));
  if ($$("rm-back")) $$("rm-back").addEventListener("click", () => showForm(authForm));
  if ($$("rm-to-recovery")) $$("rm-to-recovery")
    .addEventListener("click", () => showForm(resetForm));

  // ----- сброс кодом с почты -----
  if (mailForm) mailForm.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $$("rm-msg"), btn = $$("rm-send");
    msg.className = "type-feedback";
    msg.textContent = "Отправляю…";
    btn.disabled = true;
    let res;
    try { res = await api("/api/tutor/reset/send", { email: $$("rm-email").value.trim() }); }
    catch (err) { res = null; }
    btn.disabled = false;
    if (!res || !res.ok) {
      msg.className = "type-feedback err";
      msg.textContent = (res && res.error) || "Не дозвонились до сервера. Попробуйте ещё раз.";
      return;
    }
    // Сервер отвечает одинаково и для существующей почты, и для чужой —
    // иначе форма превращается в проверялку «есть ли у вас такой клиент».
    // Текст поэтому тоже нейтральный.
    msg.className = "type-feedback ok";
    msg.textContent = "Если такая почта у нас есть — код уже в пути. Проверьте ящик и папку «Спам».";
    $$("rm-step2").classList.remove("hidden");
    $$("rm-code").focus();
  });

  if ($$("rm-apply")) $$("rm-apply").addEventListener("click", async () => {
    const msg = $$("rm-msg");
    msg.className = "type-feedback";
    msg.textContent = "Проверяю…";
    let res;
    try {
      res = await api("/api/tutor/reset/check", {
        email: $$("rm-email").value.trim(),
        code: $$("rm-code").value.trim(),
        password: $$("rm-pass").value,
      });
    } catch (err) { res = null; }
    if (!res || !res.ok) {
      msg.className = "type-feedback err";
      msg.textContent = (res && res.error) || "Не получилось. Попробуйте ещё раз.";
      return;
    }
    msg.className = "type-feedback ok";
    msg.textContent = "Пароль изменён. Входите с новым.";
    // Токен НЕ подставляем: смена пароля выдаёт новый на сервере, и войти
    // человек должен сам — так он сразу проверит, что пароль запомнил.
    $$("rm-step2").classList.add("hidden");
    setTimeout(() => { showForm(authForm); $$("t-email").value = $$("rm-email").value.trim(); }, 1200);
  });

  if (resetForm) resetForm.addEventListener("submit", async e => {
    e.preventDefault();
    const err = $$("reset-error");
    err.textContent = "";
    const res = await api("/api/tutor/password/reset", {
      recoveryCode: $$("r-code").value.trim().toUpperCase(),
      newPassword: $$("r-pass").value,
    });
    if (!res.ok) { err.textContent = res.error || "Не получилось."; return; }
    localStorage.setItem("savelyTutorToken", res.token);
    location.reload();
  });

  // Смена пароля из панели. Было два системных prompt() подряд и alert()
  // на результат — диалоги операционной системы посреди платного продукта.
  // Там нельзя ни увидеть, что набрал, ни понять требования к паролю,
  // ни отменить по-человечески: на телефоне это выглядит как сбой сайта.
  const passBtn = $$("pass-btn");
  const passModal = $$("pass-modal");
  if (passBtn && passModal) {
    // Возврат фокуса, Escape и ловушку табом теперь держит closeModal —
    // см. js/util.js. Здесь остаётся только чистка полей: пароль не должен
    // оставаться набранным в закрытом окне.
    const close = () => {
      $$("pw-old").value = ""; $$("pw-new").value = "";
      $$("pw-msg").textContent = "";
      closeModal(passModal);
    };
    passBtn.addEventListener("click", () => {
      openModal(passModal, { focus: "#pw-old" });
      if (typeof paintPassEyes === "function") paintPassEyes(passModal);
    });
    $$("pw-cancel").addEventListener("click", close);

    $$("pass-form").addEventListener("submit", async e => {
      e.preventDefault();
      const msg = $$("pw-msg");
      msg.className = "type-feedback";
      msg.textContent = "Меняю…";
      let res;
      try {
        res = await api("/api/tutor/password", {
          token: token(),
          oldPassword: $$("pw-old").value,
          newPassword: $$("pw-new").value,
        });
      } catch (err) { res = null; }
      if (!res || !res.ok) {
        msg.className = "type-feedback err";
        msg.textContent = (res && res.error) || "Не дозвонились до сервера. Попробуйте ещё раз.";
        return;
      }
      localStorage.setItem("savelyTutorToken", res.token);
      msg.className = "type-feedback ok";
      msg.textContent = res.note || "Пароль изменён.";
      setTimeout(close, 1400);
    });
  }
});
