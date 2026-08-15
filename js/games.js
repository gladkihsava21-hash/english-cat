/* ===== Игры =====
 *
 * Четыре игры в духе Wordwall, которых не было в js/exercises.js: колесо,
 * найди пару, лопни шар и открой коробку. Файл отдельный сознательно —
 * exercises.js правится параллельно, и общий файл кончился бы конфликтом.
 *
 * Ничего своего этот файл не изобретает: пул слов, экран результата,
 * прогресс, очки, интервальное повторение, реакция кота и озвучка берутся
 * из движка упражнений. Здесь только то, чего там нет, — драматургия.
 *
 * Зачем игры вообще, если двадцать два упражнения уже есть. Упражнение
 * спрашивает и записывает ответ; игра добавляет то, чего проверкой не
 * добыть: слово вслух (колесо), память на пару (найди пару), скорость
 * узнавания (шары) и любопытство «что в следующей» (коробки). Это
 * разные механизмы, а не разная обёртка одного и того же.
 *
 * Регистрация в общем движке — в самом низу файла.
 */

(function () {
  "use strict";

  /* ---------- Общее ---------- */

  /** «Меньше движения» проверяем ЖИВЫМ значением, а не снимком при загрузке:
   *  настройку могут включить прямо сейчас. Для игр это не украшение —
   *  у колеса и шаров движение и есть механика, и её приходится заменять
   *  целиком, а не притормаживать. */
  const still = () => (typeof noMotion === "function"
    ? noMotion()
    : matchMedia("(prefers-reduced-motion: reduce)").matches);

  const canSpeak = () => typeof TTS_OK !== "undefined" && TTS_OK;

  /** Экран «слов не хватает».
   *
   *  Заслон в openExercise ловит только пустой пул — а игре мало и трёх
   *  слов: «найди пару» из двух карточек не игра, а насмешка. Пустоту
   *  вместо поля показывать нельзя, поэтому каждая игра проверяет свой
   *  минимум сама и объясняет, чего именно не хватило. */
  function tooFewWords(need, have) {
    const folders = typeof trainingFolders === "function" ? trainingFolders() : [];
    const wordsOf = n => (typeof wordsWord === "function" ? wordsWord(n) : "слов");
    stage().innerHTML = `
      <div class="empty-state">
        <div class="cat-avatar cat-mid" data-cat="sleep"></div>
        <h2>Играть пока не из чего</h2>
        <p>Этой игре нужно хотя бы <b>${need}</b> ${wordsOf(need)}.
           Сейчас доступно: ${have}. ${folders.length
             ? `${folders.length === 1 ? "Тренируется только папка" : "Тренируются только папки"}
                «${esc(folders.join("», «"))}» — добавь туда слов или вернись
                ко всему словарю.`
             : "Добавь слова в словарь — и возвращайся."}</p>
        <div class="quiz-buttons">
          <button class="btn btn-ghost" data-nav="dictionary">В словарь</button>
          ${folders.length
            ? '<button class="btn btn-primary" id="game-all-words">Весь словарь</button>'
            : '<button class="btn btn-primary" data-nav="practice">К тренировкам</button>'}
        </div>
      </div>`;
    if (typeof paintCats === "function") paintCats(stage());
    const all = document.getElementById("game-all-words");
    if (all) {
      all.addEventListener("click", () => {
        state.trainFolders = [];
        saveState();
        openExercise(currentExId);
      });
    }
  }

  /** Кот подгоняет. Реплика идёт через savelySay — он сам следит, чтобы
   *  кот не тараторил чаще раза в шесть секунд. Если кота-соседа на экране
   *  нет (движение выключено, старый браузер), молча ничего не происходит. */
  function catSay(text) {
    if (typeof savelySay === "function") savelySay(text);
  }

  function react(mood) {
    if (typeof catReact === "function") catReact(mood);
  }

  /* =========================================================
   * 1. КОЛЕСО
   *
   * Единственная штука на сайте, которая ничего не проверяет. Выпало
   * слово — назови перевод ВСЛУХ и сам отметь «знал / не знал». Смысл
   * в том, что вслух и по-честному — это другой навык, чем выбрать
   * правильный вариант из четырёх, и никакой формой ввода он не ловится.
   *
   * Раз проверки нет, здесь можно то, что в упражнениях было бы хамством:
   * кот подгоняет. В экзамене торопить нельзя, в игре — ровно то, что надо.
   * ========================================================= */

  const WHEEL_MIN = 3;      // меньше трёх секторов — это уже не колесо
  const WHEEL_MAX = 8;      // больше восьми — надписи не читаются на телефоне
  const WHEEL_MS = 3600;    // длительность прокрутки

  /** Сектор i в SVG. Углы считаются по часовой стрелке от 12 часов —
   *  там же стоит указатель, поэтому арифметика остановки получается
   *  в одну строку. */
  function wheelSector(i, step, r, c) {
    const rad = a => ((a - 90) * Math.PI) / 180;
    const a0 = rad(i * step), a1 = rad((i + 1) * step);
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    return `M${c} ${c} L${x0.toFixed(2)} ${y0.toFixed(2)} `
         + `A${r} ${r} 0 ${step > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  }

  function wheelSvg(words) {
    const n = words.length, step = 360 / n, R = 100, C = 100;
    // Длина самого длинного слова задаёт кегль всем: разнокалиберные
    // надписи на секторах читаются как разная важность, которой тут нет.
    const longest = Math.max(...words.map(w => w.w.length));
    const fs = longest <= 6 ? 12 : longest <= 8 ? 10 : longest <= 11 ? 8.5 : 7.2;
    const parts = words.map((w, i) => {
      // Два тона через один. При нечётном числе секторов шов сходится
      // одинаковыми — последнему даём третий тон, иначе граница пропадает.
      const fill = (i === n - 1 && n % 2)
        ? "var(--surface)"
        : (i % 2 ? "var(--surface-alt)" : "var(--accent-soft)");
      const ang = i * step + step / 2 - 90;
      const tx = C + 0.60 * R * Math.cos((ang * Math.PI) / 180);
      const ty = C + 0.60 * R * Math.sin((ang * Math.PI) / 180);
      // Слева от вертикали радиальная надпись встаёт вверх ногами.
      // Доворачиваем её на 180°: якорь по центру, поэтому слово остаётся
      // на своём месте — меняется только сторона, с которой оно читается.
      const norm = ((ang + 180) % 360 + 360) % 360 - 180;
      const rot = (norm > 90 || norm < -90) ? norm + 180 : norm;
      const label = w.w.length > 14 ? w.w.slice(0, 13) + "…" : w.w;
      return `<path d="${wheelSector(i, step, R, C)}" style="fill:${fill}"/>`
           + `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs}"`
           + ` transform="rotate(${rot.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})"`
           + `>${esc(label)}</text>`;
    }).join("");
    // Колесо для зрячего — картинка; слово всё равно дублируется крупно
    // под ним, поэтому для скринридера SVG прячем целиком.
    return `<svg class="wheel-svg" viewBox="0 0 200 200" aria-hidden="true">
        <g class="wheel-sectors">${parts}</g>
        <circle class="wheel-rim" cx="100" cy="100" r="99.2"/>
      </svg>`;
  }

  function wheel() {
    const words = trainPool(WHEEL_MAX).slice(0, WHEEL_MAX);
    if (words.length < WHEEL_MIN) return tooFewWords(WHEEL_MIN, words.length);

    const total = words.length, step = 360 / total;
    const left = words.map((_, i) => i);   // индексы ещё не выпавших секторов
    let done = 0, known = 0, angle = 0, busy = false;

    stage().innerHTML = `
      <p class="muted-small ex-hint" id="wheel-hint">Выпавшее слово переводи
        <b>вслух</b> и отмечай честно. Проверять не буду, но я смотрю.</p>
      <p class="test-counter" id="wheel-count">0 / ${total}</p>
      <div class="card wheel-card">
        <div class="wheel-wrap">
          <span class="wheel-pin" aria-hidden="true"></span>
          <div class="wheel-turn" id="wheel-turn">${wheelSvg(words)}</div>
          <span class="wheel-hub" aria-hidden="true"></span>
        </div>
        <div class="wheel-panel" id="wheel-panel" aria-live="polite"></div>
      </div>`;

    const turn = document.getElementById("wheel-turn");
    const panel = document.getElementById("wheel-panel");
    const count = document.getElementById("wheel-count");

    const ready = () => {
      panel.innerHTML = `
        <button class="btn btn-primary btn-wide" id="wheel-go" type="button">
          ${done ? "Крутить ещё" : "Крутить колесо"}</button>`;
      const go = document.getElementById("wheel-go");
      go.addEventListener("click", spin);
      if (done) go.focus();     // с клавиатуры продолжаем без лишнего Tab
    };

    const landed = idx => {
      const w = words[idx];
      panel.innerHTML = `
        <p class="quiz-label">Выпало слово — скажи перевод вслух</p>
        <div class="quiz-word quiz-word-small" lang="en">${esc(w.w)}</div>
        <div class="quiz-buttons wheel-acts">
          ${canSpeak()
            ? `<button class="btn btn-ghost btn-small" id="wheel-say" type="button">
                 ${iconInline("sound", 16)} Послушать</button>`
            : ""}
          <button class="btn btn-ghost btn-small" id="wheel-show" type="button"
                  aria-label="Показать перевод">Перевод</button>
        </div>
        <p class="wheel-answer" id="wheel-answer" hidden>${esc(w.t)}</p>
        <div class="quiz-buttons">
          <button class="btn btn-ghost" id="wheel-no" type="button">Не знал</button>
          <button class="btn btn-primary" id="wheel-yes" type="button">Знал</button>
        </div>`;
      const say = document.getElementById("wheel-say");
      if (say) say.addEventListener("click", () => speak(w.w));
      document.getElementById("wheel-show").addEventListener("click", e => {
        document.getElementById("wheel-answer").hidden = false;
        e.currentTarget.disabled = true;
      });
      const mark = ok => {
        if (ok) { known++; award(6); }
        statUpdate(w.w, ok);
        react(ok ? "happy" : "oops");
        done++;
        count.textContent = `${done} / ${total}`;
        // Правило игры прочитано — дальше три строки текста только отжимают
        // «знал / не знал» под нижний край телефона. Убираем после ПЕРВОГО
        // ответа, а не после первого вращения: до ответа подсказка ещё
        // работает, ученик как раз в этот момент решает, что нажать.
        const hint = document.getElementById("wheel-hint");
        if (hint) hint.remove();
        if (!left.length) {
          setTimeout(() => exFinish(known, total,
            "Колесо ничего не проверяет — оно поднимает слово из памяти. "
            + "Честность тут только твоя."), 400);
          return;
        }
        ready();
      };
      document.getElementById("wheel-yes").addEventListener("click", () => mark(true));
      document.getElementById("wheel-no").addEventListener("click", () => mark(false));
      catSay(shuffled([
        "Ну? Перевод! 😼", "Вслух, я жду 🐾", "Не мычи — говори 😸",
      ])[0]);
    };

    const spin = () => {
      if (busy) return;
      busy = true;
      const idx = left.splice(Math.floor(Math.random() * left.length), 1)[0];
      // Доворот до сектора: указатель наверху, значит центр сектора должен
      // встать в 0°. Мелкий разброс внутри сектора — чтобы колесо не
      // останавливалось каждый раз в одинаковой позе.
      const center = idx * step + step / 2;
      const jitter = (Math.random() - 0.5) * step * 0.55;
      const delta = (((360 - center) - (angle % 360)) % 360 + 360) % 360;

      if (still()) {
        // Движение выключено — крутить нечего. Колесо просто уже стоит
        // на слове, и результат виден сразу. Это не «анимация покороче»,
        // а другая механика: ждать нечего.
        turn.style.transition = "none";
        angle += delta;
        turn.style.transform = `rotate(${angle}deg)`;
        busy = false;
        landed(idx);
        return;
      }
      angle += 360 * (4 + Math.floor(Math.random() * 3)) + delta + jitter;
      turn.style.transition = `transform ${WHEEL_MS}ms cubic-bezier(.16,.72,.18,1)`;
      turn.style.transform = `rotate(${angle}deg)`;
      panel.innerHTML = '<p class="quiz-label wheel-wait">Крутится…</p>';
      setTimeout(() => {
        if (!document.body.contains(turn)) return;   // ушли с экрана
        busy = false;
        landed(idx);
      }, WHEEL_MS + 60);
    };

    ready();
  }

  /* =========================================================
   * 2. НАЙДИ ПАРУ
   *
   * Закрытые карточки, за ними слово и перевод. Игра на память, а не
   * на словарь: слово тут надо не вспомнить, а удержать — где оно лежало.
   * Поэтому промах НЕ уходит в интервальное повторение: забыть, в каком
   * углу была карточка, — не то же самое, что забыть слово, и портить
   * этим расписание повторений нечестно. В зачёт SRS идёт только
   * сложившаяся пара.
   * ========================================================= */

  const MEM_PAIRS = 6;      // 12 карточек: 3×4 на телефоне, 4×3 на столе

  function memory() {
    const words = trainPool(MEM_PAIRS);
    if (words.length < MEM_PAIRS) return tooFewWords(MEM_PAIRS, words.length);

    const deck = shuffled(words.slice(0, MEM_PAIRS).flatMap((w, i) => ([
      { pair: i, text: w.w, en: true, word: w.w },
      { pair: i, text: w.t, en: false, word: w.w },
    ])));
    let opened = [], matched = 0, moves = 0, errors = 0, busy = false;

    stage().innerHTML = `
      <p class="muted-small ex-hint">Открывай по две карточки: слово и его
        перевод остаются открытыми.</p>
      <p class="test-counter" id="mem-count">Пар: 0 из ${MEM_PAIRS} · ходов: 0</p>
      <div class="mem-grid" id="mem-grid" aria-label="Поле игры «Найди пару»"></div>`;

    const grid = document.getElementById("mem-grid");
    const count = document.getElementById("mem-count");

    deck.forEach((card, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mem-card";
      b.dataset.i = i;
      b.setAttribute("aria-label", `Карточка ${i + 1}, закрыта`);
      b.innerHTML = `
        <span class="mem-inner">
          <span class="mem-face mem-back">${icon("paw", 26)}</span>
          <span class="mem-face mem-front"${card.en ? ' lang="en"' : ""}>${esc(card.text)}</span>
        </span>`;
      b.addEventListener("click", () => flip(i, b));
      grid.appendChild(b);
    });

    function flip(i, b) {
      if (busy || b.classList.contains("open") || b.classList.contains("done")) return;
      const card = deck[i];
      b.classList.add("open");
      b.setAttribute("aria-label", card.text);
      opened.push({ i, b, card });
      if (opened.length < 2) return;

      busy = true;
      moves++;
      const [a, c] = opened;
      const ok = a.card.pair === c.card.pair;
      count.textContent = `Пар: ${matched + (ok ? 1 : 0)} из ${MEM_PAIRS} · ходов: ${moves}`;

      if (ok) {
        matched++;
        award(8);
        statUpdate(a.card.word, true);
        [a, c].forEach(x => {
          x.b.classList.add("done");
          x.b.setAttribute("aria-disabled", "true");
          x.b.setAttribute("aria-label", x.card.text + " — пара найдена");
          // Значок, а не только заливка: зелёный «нашлась» и зелёный акцент
          // различаются на 1,07:1, а при дальтонизме сливаются вовсе.
          x.b.querySelector(".mem-front").insertAdjacentHTML("beforeend",
            `<span class="mem-mark">${icon("check", 15)}</span>`);
        });
        opened = [];
        busy = false;
        react("happy");
        if (matched === MEM_PAIRS) {
          setTimeout(() => exFinish(Math.max(0, MEM_PAIRS - errors), MEM_PAIRS,
            `Ходов: ${moves}. Идеально — ${MEM_PAIRS}.`), 600);
        }
        return;
      }

      errors++;
      [a, c].forEach(x => x.b.classList.add("bad"));
      // 900 мс — время ПРОЧИТАТЬ обе карточки, а не длительность анимации.
      // Поэтому «меньше движения» этот срок не трогает: иначе выключение
      // анимаций отняло бы саму возможность запомнить, где что лежит.
      setTimeout(() => {
        if (!document.body.contains(grid)) return;
        [a, c].forEach((x, k) => {
          x.b.classList.remove("open", "bad");
          x.b.setAttribute("aria-label", `Карточка ${x.i + 1}, закрыта`);
          if (!k) x.b.focus({ preventScroll: true });
        });
        opened = [];
        busy = false;
      }, 900);
    }
  }

  /* =========================================================
   * 3. ЛОПНИ ШАР
   *
   * Аркада на скорость узнавания: показан перевод, снизу медленно
   * поднимаются шары со словами, лопнуть надо подходящий. Единственное
   * место, где на решение есть предел времени, — и именно поэтому
   * у игры есть пауза: школьника зовут ужинать посреди раунда.
   *
   * При «меньше движения» шары НЕ поднимаются и не улетают: они просто
   * стоят рядом и ждут ответа. Игра теряет спешку, но остаётся играбельной,
   * а ослабленное движение здесь было бы хуже полного отсутствия —
   * ползущая мишень бьёт ровно по тем, кто эту настройку и включает.
   * ========================================================= */

  const BAL_ROUNDS = 8;
  const BAL_MIN = 4;        // шар-мишень плюс три чужих

  function balloons() {
    const pool = trainPool(BAL_ROUNDS + 6);
    if (pool.length < BAL_MIN) return tooFewWords(BAL_MIN, pool.length);

    const rounds = pool.slice(0, BAL_ROUNDS).map(w => {
      const others = shuffled(pool.filter(x => x.w !== w.w)).slice(0, 3).map(x => x.w);
      // На маленьком словаре чужих слов может не хватить — добираем из базы
      // уровня. Раунд из двух шаров превратил бы игру в подбрасывание монетки.
      const extra = typeof distractors === "function" ? distractors(w, 3, "w") : [];
      while (others.length < 3 && extra.length) {
        const cand = extra.pop();
        if (cand !== w.w && !others.includes(cand)) others.push(cand);
      }
      return { word: w, options: shuffled([w.w, ...others]) };
    });

    let i = 0, score = 0, paused = false;

    stage().innerHTML = `
      <p class="test-counter" id="bal-count"></p>
      <div class="card bal-card">
        <p class="quiz-label">Лопни шар с этим словом</p>
        <div class="quiz-word quiz-word-small" id="bal-ru"></div>
        <div class="bal-stage" id="bal-stage"></div>
        <div class="quiz-buttons bal-acts">
          <button class="btn btn-ghost btn-small" id="bal-pause" type="button"
                  aria-pressed="false">Пауза</button>
        </div>
        <p class="type-feedback" id="bal-fb" role="status" aria-live="polite"></p>
      </div>`;

    const box = document.getElementById("bal-stage");
    const fb = document.getElementById("bal-fb");
    const pauseBtn = document.getElementById("bal-pause");

    // При выключенном движении паузе нечего останавливать — кнопки нет.
    if (still()) pauseBtn.remove();
    else {
      pauseBtn.addEventListener("click", () => {
        paused = !paused;
        box.classList.toggle("paused", paused);
        pauseBtn.textContent = paused ? "Продолжить" : "Пауза";
        pauseBtn.setAttribute("aria-pressed", String(paused));
        fb.className = "type-feedback";
        fb.textContent = paused ? "Пауза. Шары ждут." : "";
      });
    }

    function next() {
      if (i >= rounds.length) {
        exFinish(score, rounds.length,
          "Считается только чистое попадание: мимо — раунд не в зачёт.");
        return;
      }
      const r = rounds[i];
      let wrong = 0, over = false;

      document.getElementById("bal-count").textContent = `${i + 1} / ${rounds.length}`;
      document.getElementById("bal-ru").textContent = r.word.t;
      fb.className = "type-feedback";
      fb.textContent = "";
      box.innerHTML = "";
      box.classList.toggle("bal-still", still());

      // Высота полёта считается по живому размеру поля: на телефоне и на
      // столе оно разное, а шар обязан уходить именно за верхний край.
      const rise = box.clientHeight + 140;
      // Дорожки — доли СВОБОДНОГО места, а не ширины поля. В процентах от
      // ширины крайний шар вылезал за правый край: на 320px поле 240, шар 78,
      // и 74% — это уже 178, то есть правая четверть слова обрезана.
      const lanes = shuffled([0, 0.34, 0.67, 1]);

      /** how: "hit" — шар лопнули, "escaped" — мишень ушла за верхний край.
       *  Раунд зачитывается только при чистом попадании, но сказать об этом
       *  надо разными словами: «улетело» после того, как ученик сам лопнул
       *  нужный шар, — это неправда, а неправду в подписи он замечает
       *  быстрее, чем взрослый думает. */
      const finishRound = (ok, how) => {
        if (over) return;
        over = true;
        if (ok) { score++; award(10); }
        statUpdate(r.word.w, ok);
        react(ok ? "happy" : "oops");
        fb.className = "type-feedback " + (ok ? "ok" : "err");
        fb.textContent = ok
          ? "Верно, мяу!"
          : how === "hit"
            ? `Это «${r.word.w}», но до него ты лопнул не тот.`
            : `Улетело. Это было «${r.word.w}».`;
        box.querySelectorAll(".bal").forEach(b => { b.disabled = true; });
        i++;
        setTimeout(() => { if (document.body.contains(box)) next(); }, ok ? 850 : 1500);
      };

      r.options.forEach((opt, k) => {
        const b = document.createElement("button");
        b.type = "button";
        // Длинное слово в 78-пиксельном шаре рвётся посреди себя
        // («responsibl / e»). Кегль ужимаем ему одному: сажать все шары
        // на самый мелкий ради «house» — терять читаемость там, где её
        // ничто не требовало.
        b.className = "bal" + (opt.length > 9 ? " bal-long" : "");
        b.innerHTML = `<span class="bal-body"><span class="bal-word" lang="en">${esc(opt)}</span></span>`;
        b.setAttribute("aria-label", opt);
        if (!still()) {
          b.style.setProperty("--rise", rise + "px");
          b.style.animationDuration = (8.5 + Math.random() * 2.5).toFixed(1) + "s";
          // Первый шар выходит с отрицательной задержкой — то есть он уже
          // в пути к началу раунда. Иначе поле первые полторы секунды
          // пустое, и раунд начинается с ожидания.
          b.style.animationDelay = (k * 1.05 - 1.1).toFixed(2) + "s";
          // Улетел мимо верхнего края. Если это была мишень — раунд проигран,
          // если чужой шар — просто убираем, чтобы не копились.
          b.addEventListener("animationend", () => {
            if (opt === r.word.w) finishRound(false, "escaped");
            else b.remove();
          });
        }
        b.addEventListener("click", () => {
          if (over || b.disabled) return;
          const hit = opt === r.word.w;
          b.classList.add(hit ? "pop" : "miss");
          b.disabled = true;
          if (hit) {
            // Чистое попадание — это попадание без промахов до него.
            finishRound(wrong === 0, "hit");
          } else {
            wrong++;
            fb.className = "type-feedback err";
            fb.textContent = "Не то слово.";
          }
          setTimeout(() => b.remove(), still() ? 0 : 260);
        });
        box.appendChild(b);
      });

      // Раскладка по дорожкам — после вставки: ширина шара приходит из
      // clamp(), то есть до отрисовки она неизвестна.
      if (!still()) {
        const balls = [...box.querySelectorAll(".bal")];
        const free = Math.max(0, box.clientWidth - balls[0].offsetWidth);
        balls.forEach((b, k) => { b.style.left = Math.round(lanes[k] * free) + "px"; });
      }

      if (paused) box.classList.add("paused");
    }

    next();
  }

  /* =========================================================
   * 4. ОТКРОЙ КОРОБКУ
   *
   * Сетка закрытых коробок, в каждой слово. Механика внутри — обычный
   * выбор перевода, и в этом весь фокус: список из девяти вопросов и
   * девять коробок отличаются не заданием, а тем, что во втором случае
   * ученик сам выбирает, куда лезть, и не знает, что там. Порядок,
   * которого он не знает заранее, держит внимание лучше, чем номер
   * вопроса в углу.
   * ========================================================= */

  const BOX_MAX = 9;
  const BOX_MIN = 4;

  function boxes() {
    const words = trainPool(BOX_MAX).slice(0, BOX_MAX);
    if (words.length < BOX_MIN) return tooFewWords(BOX_MIN, words.length);

    const total = words.length;
    const result = new Array(total).fill(null);   // null | true | false
    let opened = 0, score = 0;

    const drawGrid = focusIdx => {
      stage().innerHTML = `
        <p class="muted-small ex-hint">Выбирай коробку — что внутри, заранее
          не видно.</p>
        <p class="test-counter">Открыто ${opened} из ${total}</p>
        <div class="box-grid" id="box-grid" aria-label="Коробки со словами"></div>`;
      const grid = document.getElementById("box-grid");
      words.forEach((w, k) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "box-tile";
        if (result[k] !== null) b.classList.add(result[k] ? "ok" : "err");
        b.innerHTML = `<span class="box-ico">${icon("box", 30)}</span>
          <span class="box-num">${k + 1}</span>
          ${result[k] === null ? "" :
            `<span class="box-mark">${icon(result[k] ? "check" : "cross", 18)}</span>`}`;
        if (result[k] === null) {
          b.setAttribute("aria-label", `Коробка ${k + 1}, закрыта`);
          b.addEventListener("click", () => open(k, b));
        } else {
          b.disabled = true;
          // setAttribute экранирования не требует — esc() здесь превратил бы
          // «don't» в «don&#39;t» и ровно так его и прочитал бы скринридер.
          b.setAttribute("aria-label",
            `Коробка ${k + 1} — ${w.w}, ${result[k] ? "верно" : "неверно"}`);
        }
        grid.appendChild(b);
      });
      if (focusIdx != null) {
        const nextFree = result.findIndex((r, k) => r === null && k >= focusIdx);
        const target = grid.children[nextFree >= 0 ? nextFree : result.indexOf(null)];
        if (target && !target.disabled) target.focus({ preventScroll: true });
      }
    };

    const open = (k, tile) => {
      // Крышка приоткрывается — и только потом показывается вопрос.
      // Ради этой полусекунды игра и затевалась, но при выключенном
      // движении ждать нечего: карточка появляется сразу.
      const wait = still() ? 0 : 280;
      if (wait) tile.classList.add("opening");
      setTimeout(() => { if (document.body.contains(tile)) ask(k); }, wait);
    };

    const ask = k => {
      const w = words[k];
      const options = shuffled([w.t, ...distractors(w, 3, "t")]);
      stage().innerHTML = `
        <p class="test-counter">Коробка ${k + 1} · осталось ${total - opened - 1}</p>
        <div class="card word-quiz-card box-card">
          <p class="quiz-label">Что внутри — переведи</p>
          <div class="quiz-word quiz-word-small" lang="en">${esc(w.w)}</div>
          ${canSpeak()
            ? `<button class="btn btn-ghost btn-small" id="box-say" type="button">
                 ${iconInline("sound", 16)} Послушать</button>`
            : ""}
          <div class="mcq-options" id="box-options"></div>
        </div>`;
      const say = document.getElementById("box-say");
      if (say) say.addEventListener("click", () => speak(w.w));

      const list = document.getElementById("box-options");
      let answered = false;
      options.forEach(opt => {
        const b = document.createElement("button");
        b.className = "mcq-option";
        b.type = "button";
        b.textContent = opt;
        b.addEventListener("click", () => {
          if (answered) return;
          answered = true;
          const ok = opt === w.t;
          if (ok) { score++; award(10); }
          statUpdate(w.w, ok);
          react(ok ? "happy" : "oops");
          result[k] = ok;
          opened++;
          // Знак, а не только цвет: зелёный «верно» и шалфейный акцент
          // на глаз не различаются, а при дальтонизме сливаются вовсе.
          b.classList.add(ok ? "right" : "wrong");
          b.insertAdjacentHTML("beforeend",
            ` <span class="ans-mark">${icon(ok ? "check" : "cross", 17)}</span>`);
          b.setAttribute("aria-label", opt + (ok ? " — верно" : " — неверно"));
          Array.from(list.children).forEach(x => x.setAttribute("aria-disabled", "true"));

          const after = () => {
            if (opened >= total) { exFinish(score, total); return; }
            drawGrid(k);
          };
          if (ok) { setTimeout(() => { if (document.body.contains(list)) after(); }, 1000); return; }

          // Ошибка: правильный ответ висит, пока ученик сам не нажмёт
          // «Дальше». Сколько нужно на разбор, таймер знать не может.
          const right = Array.from(list.children).find(x => x.textContent.trim() === w.t);
          if (right) {
            right.classList.add("right");
            right.insertAdjacentHTML("beforeend",
              ` <span class="ans-mark">${icon("check", 17)}</span>`);
          }
          const row = document.createElement("div");
          row.className = "quiz-buttons";
          row.innerHTML = '<button type="button" class="btn btn-primary" id="box-next">'
            + (opened >= total ? "Итоги →" : "К коробкам →") + "</button>";
          list.insertAdjacentElement("afterend", row);
          const nx = row.querySelector("#box-next");
          nx.addEventListener("click", after);
          nx.focus();
        });
        list.appendChild(b);
      });
    };

    drawGrid();
  }

  /* ---------- Регистрация в общем движке ---------- */

  // Свои иконки. icons.js не трогаем — просто дописываем в общий набор
  // теми же правилами: 24×24, обводка 1.75, currentColor. Взять готовые
  // по смыслу нечего: колеса, шара и коробки в наборе не было, а ставить
  // вместо них «примерно похожую» — тот же эмодзи, только хуже.
  if (typeof ICONS !== "undefined") {
    Object.assign(ICONS, {
      wheel: '<circle cx="12" cy="12" r="8.6"/><path d="M12 3.4v17.2M3.4 12h17.2'
           + 'M6 6l12 12M18 6L6 18"/><circle cx="12" cy="12" r="1.6"/>',
      memory: '<rect x="2.6" y="4.4" width="8.6" height="12" rx="1.8"/>'
            + '<rect x="12.8" y="7.6" width="8.6" height="12" rx="1.8"/>'
            + '<path d="M5.4 8.6h3M15.6 11.8h3"/>',
      balloon: '<path d="M12 2.6c3.3 0 5.6 2.5 5.6 5.9 0 3.9-3.4 7.4-5.6 7.4'
             + 'S6.4 12.4 6.4 8.5c0-3.4 2.3-5.9 5.6-5.9z"/>'
             + '<path d="M10.8 15.9h2.4l-1.2 1.9z"/>'
             + '<path d="M12 17.8c1.6 1 .4 2.4 1.6 3.6"/>',
      box: '<path d="M4 10.4h16V20a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 20z"/>'
         + '<rect x="2.4" y="6.2" width="19.2" height="4.2" rx="1.2"/>'
         + '<path d="M12 6.2v15.2M8.4 6.2C6.6 6.2 6 3 8.4 3s3.6 3.2 3.6 3.2'
         + 'S13.2 3 15.6 3 17.4 6.2 15.6 6.2"/>',
    });
  }

  if (typeof EXERCISES !== "undefined" && typeof EX_RUNNERS !== "undefined") {
    EXERCISES.push(
      { id: "wheel", group: "games", icon: "wheel", name: "Колесо",
        desc: "Выпало слово — назови вслух" },
      { id: "memory", group: "games", icon: "memory", name: "Найди пару",
        desc: "Закрытые карточки: слово и перевод" },
      { id: "balloons", group: "games", icon: "balloon", name: "Лопни шар",
        desc: "Лопни шар с нужным словом" },
      { id: "boxes", group: "games", icon: "box", name: "Открой коробку",
        desc: "Что в коробке — узнаешь, когда откроешь" },
    );
    Object.assign(EX_RUNNERS, { wheel, memory, balloons, boxes });
  }
})();
