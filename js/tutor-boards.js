/* Вкладка «Доски» в панели репетитора: список, создание, доступ ученикам.
 *
 * Сама доска живёт на отдельной странице (board.html) — ей нужен весь
 * экран. Здесь только распорядитель: какие доски есть, какая открыта
 * ученикам, что переименовать и что удалить.
 */

(function () {
  const $ = id => document.getElementById(id);
  const listBox = () => $("boards-list");

  /** Дата по-человечески: «сегодня», «вчера», иначе число. */
  function when(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const days = Math.floor((Date.now() - d) / 864e5);
    if (days <= 0) return "сегодня";
    if (days === 1) return "вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }

  function render(boards) {
    const box = listBox();
    if (!box) return;
    if (!boards.length) {
      box.innerHTML = `<p class="muted-note">Досок пока нет. Нажмите «Новая доска» —
        и откроется чистый лист.</p>`;
      return;
    }
    box.innerHTML = boards.map(b => `
      <div class="card board-row" data-id="${b.id}">
        <div class="board-main">
          <p class="board-title">${esc(b.title)}
            ${b.shared ? `<span class="at-tag paid">открыта ученикам</span>` : ""}</p>
          <p class="muted-note">${b.objects} ${wordsOnBoard(b.objects)} ·
            изменена ${esc(when(b.updatedAt))}</p>
        </div>
        <div class="board-actions">
          <a class="btn btn-primary btn-small" href="board.html?id=${b.id}">Открыть</a>
          <button class="btn btn-ghost btn-small" data-share="${b.id}">
            ${b.shared ? "Закрыть доступ" : "Открыть ученику"}</button>
          <button class="btn btn-ghost btn-small" data-rename="${b.id}">Переименовать</button>
          <button class="btn btn-ghost btn-small danger" data-del="${b.id}">Удалить</button>
        </div>
        <div class="board-rename hidden">
          <input type="text" class="board-rename-input" maxlength="80" value="${esc(b.title)}">
          <button class="btn btn-primary btn-small" data-rename-ok="${b.id}">Сохранить</button>
        </div>
      </div>`).join("");
    wire(boards);
  }

  function wordsOnBoard(n) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return "объектов";
    if (b > 1 && b < 5) return "объекта";
    if (b === 1) return "объект";
    return "объектов";
  }

  async function call(body) {
    const res = await api("/api/board/update", { token: token(), ...body });
    if (!res.ok) { toastMsg(res.error || "Не получилось."); return null; }
    render(res.boards);
    return res;
  }

  function toastMsg(text) {
    // В панели нет своего тостера, а alert() запрещён — пишем в подпись
    const box = listBox();
    if (!box) return;
    const p = document.createElement("p");
    p.className = "muted-note";
    p.textContent = text;
    box.prepend(p);
    setTimeout(() => p.remove(), 4000);
  }

  function wire(boards) {
    const box = listBox();
    box.querySelectorAll("[data-share]").forEach(b => b.addEventListener("click", () => {
      const cur = boards.find(x => x.id === Number(b.dataset.share));
      call({ boardId: cur.id, action: "share", shared: !cur.shared });
    }));

    box.querySelectorAll("[data-rename]").forEach(b => b.addEventListener("click", () => {
      const row = b.closest(".board-row");
      row.querySelector(".board-rename").classList.toggle("hidden");
      row.querySelector(".board-rename-input").focus();
    }));
    box.querySelectorAll("[data-rename-ok]").forEach(b => b.addEventListener("click", () => {
      const row = b.closest(".board-row");
      call({ boardId: Number(b.dataset.renameOk), action: "rename",
             title: row.querySelector(".board-rename-input").value });
    }));

    // Удаление в два нажатия: доска — конспект урока, случайный клик
    // не должен её уносить.
    box.querySelectorAll("[data-del]").forEach(b => {
      let armed = false, timer = null;
      b.addEventListener("click", () => {
        if (!armed) {
          armed = true;
          b.textContent = "точно удалить?";
          timer = setTimeout(() => { armed = false; b.textContent = "Удалить"; }, 4000);
          return;
        }
        clearTimeout(timer);
        call({ boardId: Number(b.dataset.del), action: "delete" });
      });
    });
  }

  async function load() {
    const res = await api("/api/board/list", { token: token() });
    if (!res.ok) return;
    render(res.boards || []);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const newBtn = $("board-new");
    if (newBtn) newBtn.addEventListener("click", async () => {
      const today = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      const res = await api("/api/board/create", { token: token(), title: "Урок " + today });
      if (!res.ok) { toastMsg(res.error || "Не получилось."); return; }
      // Сразу открываем: создают доску, чтобы на ней работать
      location.href = "board.html?id=" + res.board.id;
    });

    document.querySelectorAll('.nav-btn[data-tab="boards"]').forEach(b =>
      b.addEventListener("click", load));
  });
})();
