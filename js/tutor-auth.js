// Смена и восстановление пароля репетитора.

function showRecoveryCode(code) {
  const modal = document.getElementById("recovery-modal");
  const val = document.getElementById("recovery-value");
  if (!modal || !val || !code) return;
  val.textContent = code;
  modal.classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  const $$ = id => document.getElementById(id);

  const okBtn = $$("recovery-ok");
  if (okBtn) okBtn.addEventListener("click", () => $$("recovery-modal").classList.add("hidden"));

  // переключение вход ↔ восстановление
  const authForm = $$("auth-form"), resetForm = $$("reset-form");
  const forgot = $$("forgot-btn"), back = $$("reset-back");
  if (forgot) forgot.addEventListener("click", () => {
    authForm.classList.add("hidden"); resetForm.classList.remove("hidden");
    document.querySelector(".tabs").classList.add("hidden");
  });
  if (back) back.addEventListener("click", () => {
    resetForm.classList.add("hidden"); authForm.classList.remove("hidden");
    document.querySelector(".tabs").classList.remove("hidden");
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

  // смена пароля из панели
  const passBtn = $$("pass-btn");
  if (passBtn) passBtn.addEventListener("click", async () => {
    const oldP = prompt("Текущий пароль:");
    if (!oldP) return;
    const newP = prompt("Новый пароль (от 8 символов):");
    if (!newP) return;
    const res = await api("/api/tutor/password", {
      token: token(), oldPassword: oldP, newPassword: newP,
    });
    if (!res.ok) { alert(res.error || "Не получилось сменить пароль."); return; }
    localStorage.setItem("savelyTutorToken", res.token);
    alert(res.note || "Пароль изменён.");
  });
});
