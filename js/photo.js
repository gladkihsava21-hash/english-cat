// Проверка домашки по фото: ученик снимает тетрадь, Савелий разбирает,
// репетитор видит результат в своей панели.

let photoBusy = false;

/** Сжимаем перед отправкой: фото с телефона весит 3–8 МБ, а модели
 *  хватает 1100 пикселей по длинной стороне — почерк на тетрадном листе
 *  читается ровно так же, а картинка обходится на треть дешевле.
 *  Выше поднимать смысла нет: 1600 стоило 1,47 ₽ против 1,04 ₽ за снимок. */
function shrinkPhoto(file, maxSide = 1100) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad_image")); };
    img.src = url;
  });
}

function photoStatusText(p) {
  if (p.status === "done") return "";
  if (p.status === "no_ai") return "Савелий пока не умеет проверять сам — репетитор посмотрит лично.";
  if (p.status === "no_quota") return "Проверок на этот месяц не осталось — репетитор посмотрит лично.";
  if (p.status === "failed") return "Разобрать не получилось, но репетитор фото увидит.";
  return "Савелий смотрит…";
}

function renderPhotoResult(p) {
  if (p.status !== "done" || !p.result) {
    return `<p class="stat-note">${esc(photoStatusText(p))}</p>`;
  }
  const r = p.result;
  if (r.readable === false) {
    return `<div class="photo-verdict photo-unreadable">
      <p><b>Не разберу почерк 🙀</b></p>
      <p>${esc(r.summary || "Попробуй переснять при хорошем свете.")}</p>
    </div>`;
  }
  const mistakes = Array.isArray(r.mistakes) ? r.mistakes : [];
  return `<div class="photo-verdict">
    <p class="photo-summary">${esc(r.summary || "")}</p>
    ${r.praise ? `<p class="photo-praise">👏 ${esc(r.praise)}</p>` : ""}
    ${mistakes.length ? `
      <p class="photo-mistakes-head">Что поправить (${mistakes.length}):</p>
      <ul class="photo-mistakes">
        ${mistakes.map(m => `<li>
          <span class="m-wrong">${esc(m.wrong)}</span>
          <span class="m-arrow">→</span>
          <span class="m-right">${esc(m.right)}</span>
          ${m.why ? `<span class="m-why">${esc(m.why)}</span>` : ""}
        </li>`).join("")}
      </ul>` : `<p class="photo-praise">Ошибок не нашёл — чисто! 🎉</p>`}
  </div>`;
}

async function sendHomeworkPhoto(file, homeworkId) {
  if (photoBusy) return;
  if (!studentToken()) {
    alert("Фото можно отправить только если ты зашёл по ссылке репетитора.");
    return;
  }
  photoBusy = true;
  const box = document.getElementById("photo-box");
  if (box) box.innerHTML = `<div class="card"><p class="stat-note">Отправляю фото… 🐾</p></div>`;
  try {
    const image = await shrinkPhoto(file);
    const res = await api("/api/student/photo", {
      token: studentToken(),
      image,
      homeworkId: homeworkId || null,
      comment: "",
    });
    if (!res.ok) throw new Error(res.error || "fail");
    await loadMyPhotos();
    // Домашка ушла репетитору в любом случае — но если разбор не полагается,
    // ученик должен понимать, почему Савелий промолчал
    if (res.notice) {
      const note = document.createElement("div");
      note.className = "card";
      note.innerHTML = `<p class="stat-note">📬 Домашка отправлена репетитору.<br>${esc(res.notice)}</p>`;
      if (box) box.prepend(note);
    }
  } catch (e) {
    if (box) box.innerHTML = `<div class="card"><p class="stat-note">Не получилось отправить. Попробуй ещё раз.</p></div>`;
  } finally {
    photoBusy = false;
  }
}

async function loadMyPhotos() {
  const box = document.getElementById("photo-box");
  if (!box || !studentToken()) return;
  const res = await api("/api/student/photo/list", { token: studentToken() });
  const photos = (res && res.photos) || [];
  if (!photos.length) { box.innerHTML = ""; return; }
  box.innerHTML = photos.slice(0, 3).map(p => `
    <div class="card photo-card">
      <div class="hw-head">
        <span class="hw-label">📸 Домашка на проверке</span>
        <span class="hw-due">${esc((p.createdAt || "").slice(0, 10))}</span>
      </div>
      ${renderPhotoResult(p)}
    </div>`).join("");
}

function initPhotoHomework() {
  const input = document.getElementById("photo-input");
  const btn = document.getElementById("photo-btn");
  const cta = document.getElementById("photo-cta");
  if (!input || !btn) return;
  // кнопка нужна только тем, кто зашёл по ссылке репетитора:
  // остальным отправлять фото некому
  if (!studentToken()) return;
  if (cta) cta.classList.remove("hidden");
  btn.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (file) sendHomeworkPhoto(file, homeworkTasks[0] && homeworkTasks[0].id);
    input.value = "";
  });
  loadMyPhotos();
}

document.addEventListener("DOMContentLoaded", () => {
  if (typeof apiAlive === "function") {
    apiAlive().then(alive => { if (alive) initPhotoHomework(); });
  }
});
