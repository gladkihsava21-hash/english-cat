/* Разделы панели: скользящая подсветка, появление раздела, счётчики.
 *
 * Почему это отдельный файл, а не пара строк в tutor.js. Переключение
 * вкладок там уже написано и работает — трогать его ради оформления
 * значило бы рисковать рабочей вещью. Здесь только надстройка: тот же
 * обработчик нажатия срабатывает своим чередом, а этот файл слушает
 * результат и двигает подсветку.
 *
 * Движение тут не украшение. Десять разделов в строке, часть за краем
 * экрана: подсветка, которая ЕДЕТ, показывает, откуда и куда переехали,
 * а прокрутка сама подтягивает выбранный пункт в видимую часть. Без
 * этого нажатие на «Подписку» выглядит как «ничего не произошло» —
 * пункт остаётся за краем.
 */

(function () {
  const strip = document.getElementById("nav-strip");
  const marker = document.getElementById("nav-marker");
  if (!strip || !marker) return;

  const buttons = () => [...strip.querySelectorAll(".nav-btn")];

  /** Переставить подсветку под активный пункт.
   *  Считаем от смещения внутри полосы, а не от координат окна: полоса
   *  прокручивается, и оконные координаты «уезжают» вместе с ней. */
  function moveMarker(instant) {
    const active = strip.querySelector(".nav-btn.active");
    if (!active) { marker.classList.remove("ready"); return; }
    if (instant) marker.style.transition = "none";
    marker.style.width = active.offsetWidth + "px";
    marker.style.transform = `translateX(${active.offsetLeft}px)`;
    marker.classList.add("ready");
    if (instant) {
      // Возвращаем плавность в следующем кадре: иначе первое же нажатие
      // после загрузки тоже окажется мгновенным.
      requestAnimationFrame(() => { marker.style.transition = ""; });
    }
  }

  /** Подтянуть пункт в видимую часть строки. */
  function revealActive() {
    const active = strip.querySelector(".nav-btn.active");
    if (!active) return;
    const left = active.offsetLeft, right = left + active.offsetWidth;
    const viewL = strip.scrollLeft, viewR = viewL + strip.clientWidth;
    const pad = 24;                       // чтобы пункт не липнул к краю
    let to = null;
    if (left - pad < viewL) to = Math.max(0, left - pad);
    else if (right + pad > viewR) to = right + pad - strip.clientWidth;
    if (to === null) return;
    tweenScroll(to);
  }

  /** Плавная прокрутка полосы своими руками.
   *
   *  Ни CSS-правило scroll-behavior: smooth, ни scrollTo({behavior:"smooth"})
   *  здесь положиться нельзя: в части браузеров и встроенных webview они
   *  молча не делают ничего — проверено, полоса оставалась на нуле, и
   *  выбранный раздел так и не показывался из-за края. Прямое присвоение
   *  scrollLeft работает везде, поэтому анимируем сами: двадцать кадров
   *  с замедлением к концу. */
  let tween = null;
  function tweenScroll(to) {
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = strip.scrollLeft;
    if (calm || Math.abs(to - from) < 2) { strip.scrollLeft = to; return; }
    cancelAnimationFrame(tween);
    const t0 = performance.now(), dur = 320;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      strip.scrollLeft = from + (to - from) * ease;
      if (p < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }

  /** Показать раздел с коротким подъёмом. Класс снимаем по окончании —
   *  иначе повторное открытие того же раздела не проигрывает анимацию. */
  function animateSection() {
    const sec = [...document.querySelectorAll("main > section")]
      .find(s => !s.classList.contains("hidden"));
    if (!sec) return;
    sec.classList.remove("tab-enter");
    void sec.offsetWidth;                 // перезапуск анимации
    sec.classList.add("tab-enter");
    sec.addEventListener("animationend", () => sec.classList.remove("tab-enter"),
                         { once: true });
  }

  // Нажатие обрабатывает tutor.js — мы идём следом и двигаем оформление.
  // Порядок гарантирован: наш слушатель добавлен позже, а .active к этому
  // моменту уже переставлен.
  strip.addEventListener("click", e => {
    if (!e.target.closest(".nav-btn")) return;
    moveMarker();
    revealActive();
    animateSection();
  });

  // Клавиатура: стрелками между разделами. Панель — рабочее место,
  // и репетитор, который не любит мышь, не должен зависеть от неё.
  strip.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const list = buttons();
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = list[e.key === "ArrowRight" ? Math.min(i + 1, list.length - 1)
                                             : Math.max(i - 1, 0)];
    next.focus();
    next.click();
  });

  /* Счётчики (ученики, фото тетрадей) обновляет tutor.js в разное время.
   * Следим за содержимым и подпрыгиваем, когда число ИЗМЕНИЛОСЬ: это
   * единственный способ показать «пришло новое фото», не отвлекая
   * всплывашкой посреди урока. */
  strip.querySelectorAll(".badge").forEach(badge => {
    let last = badge.textContent;
    new MutationObserver(() => {
      const now = badge.textContent;
      if (now === last) return;
      // Ноль → ноль при первой загрузке не считается новостью
      if (last !== "" && now !== last && now !== "0") {
        badge.classList.remove("pop");
        void badge.offsetWidth;
        badge.classList.add("pop");
      }
      last = now;
      // Ширина пункта поменялась вместе с числом — подсветку подвинем
      moveMarker();
    }).observe(badge, { childList: true, characterData: true, subtree: true });
  });

  /* Раздел в адресе: /tutor.html#boards открывает «Доски» сразу.
   *
   * Нужно не для красоты: панель — рабочее место, и на неё кидают ссылки
   * («открой доски», «посмотри фото тетрадей»). Раньше любая ссылка вела
   * на «Учеников», и человек искал нужный раздел глазами. Заодно адрес
   * теперь можно положить в закладки. */
  function openFromHash() {
    const want = (location.hash || "").replace("#", "");
    if (!want) return;
    const btn = strip.querySelector(`.nav-btn[data-tab="${CSS.escape(want)}"]`);
    if (btn && !btn.classList.contains("active")) btn.click();
  }
  strip.addEventListener("click", e => {
    const btn = e.target.closest(".nav-btn");
    // replaceState, а не hash напрямую: иначе каждый переход между
    // разделами копится в истории и «назад» из панели не выводит.
    if (btn) history.replaceState(null, "", "#" + btn.dataset.tab);
  });
  addEventListener("hashchange", openFromHash);
  openFromHash();

  // Ширина кнопок зависит от шрифта: до его загрузки подсветка встанет
  // не по размеру. Меряем после готовности шрифтов и на каждом ресайзе.
  /* Пересчёт после того, как раскладка устоялась.
   *
   * Открытие раздела по адресу происходит сразу при загрузке — а тогда
   * шрифты ещё не подставлены, кнопки другой ширины, и полоса прокрутки
   * вообще может считать, что прокручивать нечего. Из-за этого раздел
   * из хвоста списка оставался за краем экрана. Поэтому и подсветку,
   * и прокрутку доводим ещё раз, когда всё измерено по-настоящему. */
  const settle = () => { moveMarker(true); revealActive(); };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
  addEventListener("resize", () => moveMarker(true));
  addEventListener("load", settle);
  settle();
})();
