/* Coachmarks первого входа: 4–6 плашек-подсказок по главным кнопкам
   первого экрана — и ученику, и репетитору. Показываем ОДИН раз: флаг
   снаружи (у ученика — в его состоянии savelyState, у репетитора — поле
   tutors.coach_seen в базе). Ничего не блокируем: плашка живая, работать
   можно прямо поверх неё, «Пропустить» закрывает всю серию сразу.
   Библиотек нет — одна функция на обе страницы. */
function runCoachmarks(steps, onDone) {
  if (!steps || !steps.length) { if (onDone) onDone(); return; }
  let i = 0;
  const wrap = document.createElement("div");
  wrap.className = "coach-wrap";
  document.body.appendChild(wrap);
  const clearMarks = () =>
    document.querySelectorAll(".coach-target")
      .forEach(t => t.classList.remove("coach-target"));
  const show = () => {
    const step = steps[i];
    const target = step.sel && document.querySelector(step.sel);
    wrap.innerHTML = `
      <div class="coach-card" role="dialog" aria-label="Подсказка ${i + 1} из ${steps.length}">
        <p class="coach-text"></p>
        <div class="coach-row">
          <span class="coach-count">${i + 1}/${steps.length}</span>
          <button type="button" class="coach-skip">Пропустить</button>
          <button type="button" class="coach-next">${i + 1 === steps.length ? "Понятно" : "Дальше"}</button>
        </div>
      </div>`;
    wrap.querySelector(".coach-text").textContent = step.text;
    const card = wrap.querySelector(".coach-card");
    card.style.left = card.style.top = card.style.bottom = card.style.transform = "";
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < innerHeight) {
        target.classList.add("coach-target");
        const w = Math.min(300, innerWidth - 16);
        card.style.width = w + "px";
        const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        let y = r.bottom + 10;
        if (y + 150 > innerHeight) y = Math.max(8, r.top - 150 - 10);
        card.style.left = Math.round(x) + "px";
        card.style.top = Math.round(y) + "px";
      } else {
        // кнопка за краем экрана (например, «Урок» без репетитора) —
        // плашка внизу по центру, серию не рвём
        card.style.left = "50%";
        card.style.bottom = "16px";
        card.style.transform = "translateX(-50%)";
      }
    } else {
      card.style.left = "50%";
      card.style.bottom = "16px";
      card.style.transform = "translateX(-50%)";
    }
    wrap.querySelector(".coach-next").addEventListener("click", () => {
      clearMarks();
      i++;
      if (i >= steps.length) { wrap.remove(); if (onDone) onDone(); }
      else show();
    });
    wrap.querySelector(".coach-skip").addEventListener("click", () => {
      clearMarks();
      wrap.remove();
      if (onDone) onDone();
    });
  };
  show();
}
window.runCoachmarks = runCoachmarks;
