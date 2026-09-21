/* Установка сайта как приложения (PWA → «программа для Windows/телефона»).
 *
 * Браузер сам предлагает установку только по своему расписанию и мелко.
 * Событие beforeinstallprompt — единственный способ позвать нормально:
 * перехватываем его и показываем свою карточку в профиле, а по клику
 * зовём системный диалог. Кто уже в приложении (standalone) или на
 * браузере без установки — карточку не видит вовсе: обещать то, чего
 * браузер не умеет, нельзя (правило из AGENTS.md).
 *
 * Отдельный файл, а не кусок app.js: тема самодостаточная, а app.js
 * и так крупнейший.
 */

const PWA_INSTALL = { prompt: null };

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();              // не браузерная мини-плашка, а наша карточка
  PWA_INSTALL.prompt = e;
  pwaInstallRefresh();
});

window.addEventListener("appinstalled", () => {
  PWA_INSTALL.prompt = null;
  pwaInstallRefresh();
});

/** Поставлены ли мы уже как приложение (свой значок, своё окно). */
function pwaInstalled() {
  return matchMedia("(display-mode: standalone)").matches
      || matchMedia("(display-mode: window-controls-overlay)").matches
      || navigator.standalone === true;   // iOS Safari
}

/** Показать/скрыть карточку установки, если профиль сейчас на экране. */
function pwaInstallRefresh() {
  const card = document.getElementById("ac-install-card");
  if (card) card.hidden = !PWA_INSTALL.prompt || pwaInstalled();
}

/** Карточка в «Мой профиль». Рисуется вместе с остальными карточками
 *  (paintAccount в account.js); пока браузер не дал событие — скрыта. */
function acInstallCard() {
  return `
    <section class="card ac-card" id="ac-install-card" hidden>
      <h3 class="ac-h">${iconInline("rocket", 18)} Приложение на этот компьютер</h3>
      <p class="ac-note">Савелий ставится как обычная программа: свой значок,
        своё окно, открывается без браузера — и работает без интернета,
        прогресс доедет при появлении сети.</p>
      <div class="ac-actions">
        <button type="button" class="btn btn-primary" id="ac-install-btn">Установить приложение</button>
      </div>
    </section>`;
}

function wireInstallCard() {
  const btn = document.getElementById("ac-install-btn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    const ev = PWA_INSTALL.prompt;
    if (!ev) return;
    PWA_INSTALL.prompt = null;      // событие одноразовое — при отказе карточка уйдёт
    await ev.prompt();
    pwaInstallRefresh();
  });
}
