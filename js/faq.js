// Страница «Вопросы и ответы». Логики немного: переключатель аудитории,
// раскрытие карточек и прямые ссылки на конкретный вопрос.
//
// Прямые ссылки — главное, ради чего тут JS: репетитор отвечает ученику
// не пересказом, а адресом вида faq.html#folders — страница сама покажет
// нужную аудиторию и раскроет нужный ответ. Ровно такие пересказы
// («зайди в тренировки, там строка…») мы до этого писали руками в чатах.

(function () {
  "use strict";

  const secStudent = document.getElementById("fq-student");
  const secTutor   = document.getElementById("fq-tutor");
  const btnStudent = document.getElementById("fq-role-student");
  const btnTutor   = document.getElementById("fq-role-tutor");
  const bubble     = document.getElementById("fq-bubble");
  const cat        = document.getElementById("fq-cat");

  // Реплика и поза кота меняются вместе с аудиторией: ученикам — «ты» и
  // довольная морда, репетиторам — «вы» и морда задумчивая. Пузырь
  // переигрывает свою анимацию появления, иначе подмену текста не видно.
  const ROLE = {
    student: { bubble: "Спрашивай. Я тут всё знаю — я тут живу.", pose: "hello" },
    tutor:   { bubble: "Про панель тоже отвечу. Спокойно и по делу — как вы любите.", pose: "think" }
  };

  function setRole(role, opts) {
    const tutor = role === "tutor";
    secStudent.hidden = tutor;
    secTutor.hidden = !tutor;
    btnStudent.classList.toggle("active", !tutor);
    btnTutor.classList.toggle("active", tutor);
    btnStudent.toggleAttribute("aria-current", !tutor);
    btnTutor.toggleAttribute("aria-current", tutor);

    bubble.textContent = ROLE[role].bubble;
    bubble.style.animation = "none";
    void bubble.offsetWidth;              // перезапуск CSS-анимации
    bubble.style.animation = "";
    if (window.setCatPose) setCatPose(cat, ROLE[role].pose);

    // Каскад подъёма переигрываем и на переключении: активная секция
    // «раздаётся» по одной карточке, как колода.
    const sec = tutor ? secTutor : secStudent;
    sec.classList.remove("fq-anim");
    void sec.offsetWidth;
    sec.classList.add("fq-anim");

    // Адрес честный: #tutor можно переслать, и человек попадёт на свою
    // половину. Ученическая — по умолчанию, ей якорь не нужен.
    if (!opts || !opts.keepHash)
      history.replaceState(null, "", tutor ? "#tutor" : location.pathname);
  }

  btnStudent.addEventListener("click", () => setRole("student"));
  btnTutor.addEventListener("click", () => setRole("tutor"));

  function toggleCard(card, open) {
    const on = open !== undefined ? open : !card.classList.contains("open");
    card.classList.toggle("open", on);
    card.querySelector(".fq-q").setAttribute("aria-expanded", on ? "true" : "false");
  }

  document.querySelectorAll(".fq-q").forEach(btn => {
    btn.addEventListener("click", () => toggleCard(btn.closest(".fq")));
  });

  // Пришли по ссылке на конкретный вопрос: включаем его аудиторию,
  // раскрываем карточку и подводим к ней. Просто #tutor — вторая вкладка.
  const hash = decodeURIComponent(location.hash.slice(1));
  if (hash === "tutor") {
    setRole("tutor", { keepHash: true });
  } else if (hash) {
    const card = document.getElementById(hash);
    if (card && card.classList.contains("fq")) {
      setRole(secTutor.contains(card) ? "tutor" : "student", { keepHash: true });
      toggleCard(card, true);
      // Ждём конца каскада, иначе прокрутка целится в ещё едущую карточку.
      setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "center" }), 550);
    }
  }
})();
