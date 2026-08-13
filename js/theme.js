// Переключатель дня и ночи.
//
// Анимация — круг, расходящийся из самой кнопки: новая тема как будто
// разливается по экрану от места нажатия. Делается через View Transitions,
// потому что только он умеет показывать старый и новый кадр одновременно.
// Где API нет (Safari до 18, Firefox) — остаётся мягкое затухание, тема
// переключается ровно так же, просто скромнее.

const THEME_KEY = "savelyTheme";

function currentTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "night" || saved === "day") return saved;
  // не выбирали руками — идём за системой
  return matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  // цвет строки состояния браузера на телефоне — иначе вокруг тёмной
  // страницы остаётся светлая полоска и выглядит как брак
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = theme === "night" ? "#161B19" : "#F6F5F0";
  const btn = document.getElementById("theme-btn");
  if (btn) {
    btn.setAttribute("aria-pressed", theme === "night" ? "true" : "false");
    btn.setAttribute("aria-label", theme === "night" ? "Включить дневную тему"
                                                     : "Включить ночную тему");
  }
}

/** Радиус круга, который накроет весь экран из точки (x, y). */
function reachRadius(x, y) {
  return Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
}

function toggleTheme(ev) {
  const next = currentTheme() === "night" ? "day" : "night";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!document.startViewTransition || reduced) {
    applyTheme(next);
    return;
  }

  // точка, из которой пойдёт круг — центр кнопки
  const btn = ev && ev.currentTarget;
  const r = btn ? btn.getBoundingClientRect() : null;
  const x = r ? r.left + r.width / 2 : innerWidth - 40;
  const y = r ? r.top + r.height / 2 : 40;
  const end = reachRadius(x, y);

  const t = document.startViewTransition(() => applyTheme(next));
  t.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`,
                   `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 620, easing: "cubic-bezier(.22,.61,.36,1)",
        pseudoElement: "::view-transition-new(root)" }
    );
  });
}

/** Кнопка живёт в шапке. Иконка — солнце днём, луна ночью; меняются
 *  поворотом, а не подменой символа, иначе прыгает. */
function mountThemeButton() {
  if (document.getElementById("theme-btn")) return;
  const slot = document.querySelector(".user-chip") ||
               document.querySelector(".topbar-inner");
  if (!slot) return;

  const btn = document.createElement("button");
  btn.id = "theme-btn";
  btn.type = "button";
  btn.className = "theme-btn";
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" class="theme-icon" aria-hidden="true">
      <g class="ti-sun">
        <circle cx="12" cy="12" r="4.4"/>
        <path d="M12 2.6v2.4M12 19v2.4M2.6 12h2.4M19 12h2.4
                 M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/>
      </g>
      <path class="ti-moon" d="M20 14.2A8.4 8.4 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2z"/>
    </svg>`;
  btn.addEventListener("click", toggleTheme);
  slot.prepend(btn);
  applyTheme(currentTheme());
}

// Тему ставим как можно раньше — до отрисовки, иначе на долю секунды
// мигает светлый экран, и это заметнее любой анимации.
applyTheme(currentTheme());
document.addEventListener("DOMContentLoaded", mountThemeButton);

// Пока человек не выбрал руками, следуем за системой на лету
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
  if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? "night" : "day");
});
