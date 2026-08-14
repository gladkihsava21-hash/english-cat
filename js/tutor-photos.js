// Вкладка «Фото тетрадей» в панели репетитора.

let photoItems = [];

function readingHTML(p) {
  const r = p.result || {};
  const probs = r.problems || [];
  return `
    <p class="rd-score">${p.readingScore}% <span>прочитано верно</span></p>
    ${probs.length
      ? `<p class="photo-mistakes-head">Сбился на словах (${probs.length}):</p>
         <ul class="photo-mistakes">
           ${probs.map(x => `<li>
             <span class="m-wrong">${esc(x.word)}</span>
             ${x.type === "missed"
               ? `<span class="m-why">пропустил</span>`
               : `<span class="m-arrow">услышано:</span><span class="m-right">${esc(x.said || "—")}</span>`}
           </li>`).join("")}
         </ul>`
      : `<p class="photo-praise">Прочитано без ошибок.</p>`}`;
}

function photoVerdictHTML(p) {
  if (p.kind === "reading") return readingHTML(p);
  if (p.status === "no_ai") {
    return `<p class="muted-note">Автопроверка выключена — посмотрите работу сами.</p>`;
  }
  if (p.status === "failed") {
    return `<p class="muted-note">Разобрать автоматически не вышло.</p>`;
  }
  if (p.status !== "done" || !p.result) {
    return `<p class="muted-note">Савелий ещё смотрит…</p>`;
  }
  const r = p.result;
  if (r.readable === false) {
    return `<p class="muted-note">Почерк неразборчив: ${esc(r.summary || "")}</p>`;
  }
  const m = Array.isArray(r.mistakes) ? r.mistakes : [];
  return `
    ${r.verdict ? `<p class="photo-summary"><b>${esc(r.verdict)}</b></p>` : ""}
    <p>${esc(r.summary || "")}</p>
    ${m.length ? `
      <p class="photo-mistakes-head">Ошибки (${m.length}):</p>
      <ul class="photo-mistakes">
        ${m.map(x => `<li>
          <span class="m-wrong">${esc(x.wrong)}</span>
          <span class="m-arrow">→</span>
          <span class="m-right">${esc(x.right)}</span>
          ${x.why ? `<span class="m-why">${esc(x.why)}</span>` : ""}
        </li>`).join("")}
      </ul>` : `<p class="photo-praise">Ошибок не найдено.</p>`}`;
}

function renderPhotos() {
  const box = document.getElementById("photo-list");
  const counter = document.getElementById("photo-count");
  if (!box) return;
  if (counter) counter.textContent = photoItems.filter(p => !p.seen).length;

  // Пустое состояние — отдельный блок в разметке, а не строка внутри сетки:
  // голый текст в grid-контейнере выглядел так, будто рендер оборвался
  const empty = document.getElementById("photos-empty");
  if (empty) empty.classList.toggle("hidden", photoItems.length > 0);

  if (!photoItems.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = photoItems.map(p => `
    <div class="photo-item${p.seen ? "" : " unseen"}" data-photo="${p.id}">
      <div class="photo-item-head">
        <span class="photo-student">${esc(p.studentName)}</span>
        <span class="photo-kind">${p.kind === "reading" ? "🎤 чтение" : "📸 тетрадь"}</span>
        <span class="photo-when">${esc((p.createdAt || "").replace("T", " ").slice(0, 16))}</span>
        ${p.seen ? "" : `<span class="photo-new">новое</span>`}
      </div>
      ${p.comment ? `<p class="muted-note">${esc(p.comment)}</p>` : ""}
      ${p.kind === "reading" ? "" :
        `<button class="btn btn-ghost btn-small" data-show="${p.id}">Показать фото</button>`}
      <div class="photo-slot"></div>
      ${photoVerdictHTML(p)}
      <button class="btn btn-ghost btn-small" data-del="${p.id}">Удалить</button>
    </div>`).join("");

  box.querySelectorAll("[data-show]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const item = btn.closest(".photo-item");
      const slot = item.querySelector(".photo-slot");
      if (slot.dataset.loaded) { slot.innerHTML = ""; delete slot.dataset.loaded; return; }
      slot.innerHTML = `<p class="muted-note">Загружаю…</p>`;
      const res = await api("/api/photo", { token: token(), id: Number(btn.dataset.show) });
      if (res && res.ok) {
        slot.innerHTML = `<img class="photo-thumb" src="${res.image}" alt="Фото домашней работы">`;
        slot.dataset.loaded = "1";
        await api("/api/tutor/photo/seen", { token: token(), id: Number(btn.dataset.show) });
        const p = photoItems.find(x => x.id === Number(btn.dataset.show));
        if (p) { p.seen = true; item.classList.remove("unseen"); }
        const counter = document.getElementById("photo-count");
        if (counter) counter.textContent = photoItems.filter(x => !x.seen).length;
      } else {
        slot.innerHTML = `<p class="muted-note">Не удалось загрузить фото.</p>`;
      }
    });
  });

  // Удаление в два клика: диалоги confirm() блокируются во встроенных
  // браузерах, а стереть чужую работу случайно очень легко
  box.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.armed !== "1") {
        btn.dataset.armed = "1";
        btn.textContent = "Точно удалить?";
        setTimeout(() => {
          if (btn.dataset.armed === "1") { btn.dataset.armed = ""; btn.textContent = "Удалить"; }
        }, 4000);
        return;
      }
      await api("/api/tutor/photo/archive", { token: token(), id: Number(btn.dataset.del) });
      await loadPhotos();
    });
  });
}

async function loadPhotos() {
  if (typeof token !== "function" || !token()) return;
  const res = await api("/api/tutor/photos", { token: token() });
  photoItems = (res && res.photos) || [];
  renderPhotos();
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll('[data-tab="photos"]').forEach(b => {
    b.addEventListener("click", loadPhotos);
  });
  setTimeout(loadPhotos, 1200);
});
