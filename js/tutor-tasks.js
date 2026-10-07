// Свои задания репетитора — конструктор.
//
// Три вида, и это сознательно мало: викторина с вариантами (грамматика,
// лексика), «впиши слово» с пропуском (словообразование, формы глагола),
// «соедини пары» (термин — значение, начало — конец фразы). Всё это уже
// умеют общие блоки упражнений на стороне ученика — набор только кормит
// их своими данными. Картинок и своих типов заданий нет намеренно.
//
// Устройство: список наборов + редактор одного набора. Источник правды
// в редакторе — объект tsEditing; поля формы пишут в него по вводу, а
// добавление/удаление вопроса перерисовывает список из него. Так ничего
// набранного не теряется при перерисовке.
//
// Всё, что вводит репетитор, уходит ученику. Проверяет и режет сервер
// (db.clean_taskset_items); здесь только удобство и подсказки.

let tasksets = [];
let tsEditing = null;   // { id|null, title, kind, items }
let tsLoaded = false;

const TS_KINDS = [
  { id: "quiz",  name: "Викторина",
    desc: "Вопрос и варианты ответа, один верный. Можно с пропуском ___ в вопросе и разбором ошибки." },
  { id: "gap",   name: "Впиши слово",
    desc: "Предложение с пропуском ___, ученик вводит ответ. Подсказка заглавными — как в ОГЭ." },
  { id: "pairs", name: "Соедини пары",
    desc: "Две колонки: слово — перевод, начало — конец, термин — определение. От трёх пар." },
];

const TS_KIND_NAME = Object.fromEntries(TS_KINDS.map(k => [k.id, k.name]));

// Форматы вставки списком: одна строка — одно задание, поля через
// вертикальную черту или табуляцию (из Excel), разбор — после «//».
const TS_PASTE_HELP = {
  quiz:  "Вопрос | правильный ответ | неверный | неверный // разбор ошибки\n"
       + "Look! The cat ___ on the laptop. | is sitting | sits | sit // «Look!» — действие прямо сейчас",
  gap:   "Предложение с ___ | ответ | ПОДСКАЗКА // разбор\n"
       + "My sister is a ___ at school. | teacher | TEACH // teach + -er = тот, кто учит",
  pairs: "слева | справа\n"
       + "cat | кошка\ngive up | сдаваться",
};

async function loadTasksets() {
  if (typeof token !== "function" || !token()) return;
  let res;
  try { res = await api("/api/tutor/tasksets", { token: token() }); }
  catch (e) { return; }
  if (!res || !res.ok) return;
  tasksets = res.sets || [];
  tsLoaded = true;
  renderTasksetList();
  fillTasksetSelect();
}

// ---- список ----

function tsWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function tsCount(set) {
  const n = set.count || (set.items || []).length;
  return set.kind === "pairs"
    ? `${n} ${plural(n, "пара", "пары", "пар")}`
    : `${n} ${plural(n, "вопрос", "вопроса", "вопросов")}`;
}

function renderTasksetList() {
  const box = document.getElementById("ts-list");
  const empty = document.getElementById("ts-empty");
  if (!box) return;
  empty.classList.toggle("hidden", tasksets.length > 0 || !!tsEditing);
  box.innerHTML = tasksets.map(set => `
    <div class="card ts-card" data-set="${set.id}">
      <div class="ts-card-main">
        <div>
          <p class="ts-title">${esc(set.title)}</p>
          <p class="muted-small">${esc(TS_KIND_NAME[set.kind] || set.kind)} · ${esc(tsCount(set))}
            ${set.updatedAt ? ` · изменён ${esc(tsWhen(set.updatedAt))}` : ""}</p>
        </div>
        <div class="ts-card-actions">
          <button class="btn btn-primary btn-small" data-ts-assign="${set.id}">Выдать</button>
          <button class="btn btn-ghost btn-small" data-ts-edit="${set.id}">Изменить</button>
          <button class="link-btn ts-del" data-ts-del="${set.id}">удалить</button>
        </div>
      </div>
      <p class="ts-preview">${esc(tsPreviewLine(set))}</p>
    </div>`).join("");

  box.querySelectorAll("[data-ts-edit]").forEach(b => b.addEventListener("click", () => {
    const set = tasksets.find(x => x.id === Number(b.dataset.tsEdit));
    if (set) openTasksetEditor(set);
  }));
  box.querySelectorAll("[data-ts-assign]").forEach(b => b.addEventListener("click", () => {
    assignTaskset(Number(b.dataset.tsAssign));
  }));
  // Удаление в два нажатия — как у ученика в списке; системных диалогов
  // в продукте нет.
  box.querySelectorAll("[data-ts-del]").forEach(b => {
    let armed = false, timer = null;
    b.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        b.textContent = "точно удалить? нажмите ещё раз";
        b.classList.add("danger");
        timer = setTimeout(() => { armed = false; b.textContent = "удалить"; b.classList.remove("danger"); }, 4000);
        return;
      }
      clearTimeout(timer);
      await api("/api/tutor/taskset/delete", { token: token(), id: Number(b.dataset.tsDel) });
      loadTasksets();
    });
  });
}

/** Первая строка набора — чтобы узнавать его в списке не только по названию. */
function tsPreviewLine(set) {
  const it = (set.items || [])[0];
  if (!it) return "";
  if (set.kind === "pairs") return `${it.l} — ${it.r}${set.items.length > 1 ? " · …" : ""}`;
  return it.q + (set.items.length > 1 ? " · …" : "");
}

// ---- выдать: переход в форму домашки с уже выбранным набором ----

function assignTaskset(id) {
  const tab = document.querySelector('.nav-btn[data-tab="homework"]');
  if (tab) tab.click();
  const tile = document.querySelector('.game-tile[data-game="custom"]');
  if (tile) tile.click();
  fillTasksetSelect();
  const sel = document.getElementById("hw-taskset");
  if (sel) sel.value = String(id);
  const set = tasksets.find(x => x.id === id);
  const title = document.getElementById("hw-title");
  if (set && title && !title.value.trim()) title.value = set.title;
  window.scrollTo(0, 0);
  const msg = document.getElementById("hw-msg");
  if (msg && set) {
    msg.className = "type-feedback";
    msg.textContent = `Набор «${set.title}» выбран — осталось указать, кому, и нажать «Выдать домашку».`;
  }
}

/** Список наборов в форме домашки (у плитки «Своё задание»). */
function fillTasksetSelect() {
  const sel = document.getElementById("hw-taskset");
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = tasksets.length
    ? tasksets.map(s => `<option value="${s.id}">${esc(s.title)} — ${esc(TS_KIND_NAME[s.kind] || s.kind)}, ${esc(tsCount(s))}</option>`).join("")
    : `<option value="">наборов пока нет — создайте на вкладке «Свои задания»</option>`;
  if (current && tasksets.some(s => String(s.id) === current)) sel.value = current;
}

// ---- редактор ----

function blankItem(kind) {
  if (kind === "quiz") return { q: "", options: ["", "", ""], correct: 0, why: "" };
  if (kind === "gap") return { q: "", hint: "", answer: "", alt: [], why: "" };
  return { l: "", r: "" };
}

function openTasksetEditor(set) {
  tsEditing = set
    ? { id: set.id, title: set.title, kind: set.kind,
        items: JSON.parse(JSON.stringify(set.items || [])) }
    : { id: null, title: "", kind: "quiz", items: [] };
  if (!tsEditing.items.length) tsEditing.items = [blankItem(tsEditing.kind)];
  renderTasksetEditor();
  const ed = document.getElementById("ts-editor");
  if (ed) {
    ed.scrollIntoView({ block: "start", behavior: "smooth" });
    const t = document.getElementById("ts-title");
    if (t && !t.value) t.focus();
  }
  renderTasksetList();
}

function closeTasksetEditor() {
  tsEditing = null;
  const ed = document.getElementById("ts-editor");
  if (ed) { ed.innerHTML = ""; ed.classList.add("hidden"); }
  renderTasksetList();
}

function itemsAreEmpty() {
  return (tsEditing.items || []).every(it =>
    !(it.q || it.answer || it.l || it.r || (it.options || []).some(Boolean)));
}

function renderTasksetEditor() {
  const ed = document.getElementById("ts-editor");
  if (!ed || !tsEditing) return;
  ed.classList.remove("hidden");
  const kindLocked = !itemsAreEmpty();
  ed.innerHTML = `
    <div class="ts-ed-head">
      <h3>${tsEditing.id ? "Изменить набор" : "Новый набор"}</h3>
      <button type="button" class="link-btn" id="ts-cancel">закрыть без сохранения</button>
    </div>
    <label class="ts-field">
      <span>Название — по нему набор выдаётся и виден ученику</span>
      <input type="text" id="ts-title" maxlength="100" placeholder="Например: Present Perfect — 10 вопросов"
             value="${esc(tsEditing.title)}">
    </label>
    <div class="ts-field">
      <span>Вид задания${kindLocked ? " — у набора с вопросами вид не меняется; для другого вида создайте новый набор" : ""}</span>
      <div class="ts-kinds" role="radiogroup" aria-label="Вид задания">
        ${TS_KINDS.map(k => `
          <button type="button" class="ts-kind${tsEditing.kind === k.id ? " picked" : ""}" data-kind="${k.id}"
                  role="radio" aria-checked="${tsEditing.kind === k.id}" ${kindLocked && tsEditing.kind !== k.id ? "disabled" : ""}>
            <b>${esc(k.name)}</b><span>${esc(k.desc)}</span>
          </button>`).join("")}
      </div>
    </div>
    <div class="ts-items" id="ts-items"></div>
    <div class="ts-add-row">
      <button type="button" class="btn btn-ghost btn-small" id="ts-add">+ Добавить ${tsEditing.kind === "pairs" ? "пару" : "вопрос"}</button>
      <details class="ts-paste">
        <summary>Вставить списком</summary>
        <p class="muted-small">Одна строка — одно задание. Поля через вертикальную черту <code>|</code>
          или табуляцию (можно скопировать из таблицы). Разбор ошибки — после <code>//</code>.</p>
        <textarea id="ts-paste-text" rows="5" placeholder="${esc(TS_PASTE_HELP[tsEditing.kind])}"></textarea>
        <div class="quiz-buttons" style="justify-content:flex-start">
          <button type="button" class="btn btn-ghost btn-small" id="ts-paste-go">Добавить из списка</button>
          <span class="type-feedback" id="ts-paste-msg"></span>
        </div>
      </details>
    </div>
    <div class="ts-ed-foot">
      <button type="button" class="btn btn-primary" id="ts-save">Сохранить набор</button>
      <button type="button" class="btn btn-ghost" id="ts-cancel2">Отмена</button>
      <p class="type-feedback" id="ts-msg" role="status" aria-live="polite"></p>
    </div>`;

  document.getElementById("ts-title").addEventListener("input", e => { tsEditing.title = e.target.value; });
  ed.querySelectorAll(".ts-kind").forEach(b => b.addEventListener("click", () => {
    if (b.disabled) return;
    tsEditing.kind = b.dataset.kind;
    tsEditing.items = [blankItem(tsEditing.kind)];
    renderTasksetEditor();
  }));
  document.getElementById("ts-add").addEventListener("click", () => {
    tsEditing.items.push(blankItem(tsEditing.kind));
    renderTasksetItems();
    const last = document.querySelector("#ts-items .ts-item:last-child input, #ts-items .ts-item:last-child textarea");
    if (last) last.focus();
  });
  document.getElementById("ts-paste-go").addEventListener("click", pasteItems);
  document.getElementById("ts-cancel").addEventListener("click", closeTasksetEditor);
  document.getElementById("ts-cancel2").addEventListener("click", closeTasksetEditor);
  document.getElementById("ts-save").addEventListener("click", saveTaskset);
  renderTasksetItems();
}

function renderTasksetItems() {
  const box = document.getElementById("ts-items");
  if (!box || !tsEditing) return;
  const kind = tsEditing.kind;
  box.innerHTML = tsEditing.items.map((it, i) => {
    const num = `<span class="ts-num">${i + 1}</span>`;
    const del = `<button type="button" class="link-btn ts-item-del" data-del="${i}" aria-label="Удалить ${i + 1}">убрать</button>`;
    if (kind === "quiz") {
      return `
        <div class="ts-item" data-i="${i}">
          <div class="ts-item-head">${num}${del}</div>
          <input type="text" class="ts-q" data-f="q" placeholder="Вопрос — можно с пропуском ___" maxlength="300" value="${esc(it.q)}">
          <div class="ts-options">
            ${it.options.map((o, oi) => `
              <label class="ts-option${it.correct === oi ? " right" : ""}" title="Отметьте правильный">
                <input type="radio" name="ts-correct-${i}" data-correct="${oi}" ${it.correct === oi ? "checked" : ""}>
                <input type="text" data-opt="${oi}" placeholder="${it.correct === oi ? "правильный ответ" : "неверный вариант"}" maxlength="80" value="${esc(o)}">
                ${it.options.length > 2 ? `<button type="button" class="ts-opt-del" data-optdel="${oi}" aria-label="Убрать вариант">×</button>` : ""}
              </label>`).join("")}
            ${it.options.length < 6 ? `<button type="button" class="link-btn ts-opt-add" data-optadd="1">+ вариант</button>` : ""}
          </div>
          <input type="text" class="ts-why" data-f="why" placeholder="Разбор: почему так (покажется при ошибке, необязательно)" maxlength="300" value="${esc(it.why || "")}">
        </div>`;
    }
    if (kind === "gap") {
      return `
        <div class="ts-item" data-i="${i}">
          <div class="ts-item-head">${num}${del}</div>
          <input type="text" class="ts-q" data-f="q" placeholder="Предложение с пропуском ___ (три подчёркивания)" maxlength="300" value="${esc(it.q)}">
          <div class="ts-gap-row">
            <input type="text" data-f="hint" placeholder="ПОДСКАЗКА заглавными (TEACH), необязательно" maxlength="60" value="${esc(it.hint || "")}">
            <input type="text" data-f="answer" placeholder="ответ" maxlength="60" value="${esc(it.answer || "")}">
            <input type="text" data-f="alt" placeholder="ещё варианты через /" maxlength="200" value="${esc((it.alt || []).join(" / "))}">
          </div>
          <input type="text" class="ts-why" data-f="why" placeholder="Разбор: почему так (покажется при ошибке, необязательно)" maxlength="300" value="${esc(it.why || "")}">
        </div>`;
    }
    return `
      <div class="ts-item ts-item-pair" data-i="${i}">
        ${num}
        <input type="text" data-f="l" placeholder="слева" maxlength="80" value="${esc(it.l || "")}">
        <span class="ts-pair-dash">—</span>
        <input type="text" data-f="r" placeholder="справа" maxlength="80" value="${esc(it.r || "")}">
        ${del}
      </div>`;
  }).join("");

  // Поля пишут в модель по вводу; структурные изменения перерисовывают.
  box.querySelectorAll("[data-f]").forEach(inp => inp.addEventListener("input", () => {
    const it = tsEditing.items[Number(inp.closest(".ts-item").dataset.i)];
    const f = inp.dataset.f;
    if (f === "alt") it.alt = inp.value.split("/").map(x => x.trim()).filter(Boolean);
    else it[f] = inp.value;
  }));
  box.querySelectorAll("[data-opt]").forEach(inp => inp.addEventListener("input", () => {
    const it = tsEditing.items[Number(inp.closest(".ts-item").dataset.i)];
    it.options[Number(inp.dataset.opt)] = inp.value;
  }));
  box.querySelectorAll("[data-correct]").forEach(r => r.addEventListener("change", () => {
    const item = r.closest(".ts-item");
    const it = tsEditing.items[Number(item.dataset.i)];
    it.correct = Number(r.dataset.correct);
    item.querySelectorAll(".ts-option").forEach((l, oi) => {
      l.classList.toggle("right", oi === it.correct);
      const t = l.querySelector("[data-opt]");
      if (t) t.placeholder = oi === it.correct ? "правильный ответ" : "неверный вариант";
    });
  }));
  box.querySelectorAll("[data-optadd]").forEach(b => b.addEventListener("click", () => {
    tsEditing.items[Number(b.closest(".ts-item").dataset.i)].options.push("");
    renderTasksetItems();
  }));
  box.querySelectorAll("[data-optdel]").forEach(b => b.addEventListener("click", () => {
    const it = tsEditing.items[Number(b.closest(".ts-item").dataset.i)];
    const oi = Number(b.dataset.optdel);
    it.options.splice(oi, 1);
    if (it.correct >= it.options.length) it.correct = it.options.length - 1;
    else if (it.correct > oi) it.correct--;
    renderTasksetItems();
  }));
  box.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
    tsEditing.items.splice(Number(b.dataset.del), 1);
    if (!tsEditing.items.length) tsEditing.items.push(blankItem(kind));
    renderTasksetItems();
  }));
}

/** Разбор вставленного списка — см. TS_PASTE_HELP. Кривые строки не
 *  выбрасываем молча: говорим, какие пропущены и почему. */
function pasteItems() {
  const ta = document.getElementById("ts-paste-text");
  const msg = document.getElementById("ts-paste-msg");
  const kind = tsEditing.kind;
  const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) { msg.textContent = "Список пуст."; return; }
  const added = [], skipped = [];
  lines.forEach((line, n) => {
    const [main, why = ""] = line.split("//").map(x => x.trim());
    const f = main.split(/\t|\|/).map(x => x.trim());
    if (kind === "quiz") {
      const [q, ...opts] = f;
      const options = opts.filter(Boolean);
      if (!q || options.length < 2) { skipped.push(n + 1); return; }
      added.push({ q, options: options.slice(0, 6), correct: 0, why });
    } else if (kind === "gap") {
      const [q, answer = "", hint = ""] = f;
      if (!q || !q.includes("___") || !answer) { skipped.push(n + 1); return; }
      const [main0, ...alts] = answer.split("/").map(x => x.trim()).filter(Boolean);
      added.push({ q, answer: main0, alt: alts, hint, why });
    } else {
      const [l, r] = f;
      if (!l || !r) { skipped.push(n + 1); return; }
      added.push({ l, r });
    }
  });
  if (added.length) {
    if (itemsAreEmpty()) tsEditing.items = [];
    tsEditing.items.push(...added);
    ta.value = "";
    renderTasksetItems();
  }
  msg.className = "type-feedback " + (added.length ? "ok" : "err");
  msg.textContent = (added.length ? `Добавлено: ${added.length}. ` : "Ничего не добавлено. ")
    + (skipped.length ? `Пропущены строки ${skipped.join(", ")} — не хватает полей.` : "");
}

async function saveTaskset() {
  const msg = document.getElementById("ts-msg");
  const btn = document.getElementById("ts-save");
  // Пустые заготовки не отправляем — иначе сервер честно ругнётся на «вопрос 3 пустой»
  const items = tsEditing.items.filter(it =>
    it.q || it.answer || it.l || it.r || (it.options || []).some(Boolean));
  btn.disabled = true;
  msg.className = "type-feedback";
  msg.textContent = "Сохраняю…";
  let res;
  try {
    res = await api("/api/tutor/taskset/save", {
      token: token(), id: tsEditing.id, title: tsEditing.title.trim(), kind: tsEditing.kind, items,
    });
  } catch (e) { res = null; }
  btn.disabled = false;
  if (!res || !res.ok) {
    msg.className = "type-feedback err";
    msg.textContent = (res && res.error) || "Не сохранилось — проверьте связь и попробуйте ещё раз.";
    return;
  }
  const wasNew = !tsEditing.id;
  closeTasksetEditor();
  await loadTasksets();
  const list = document.getElementById("ts-list");
  const card = list && list.querySelector(`[data-set="${res.set.id}"]`);
  if (card) {
    card.classList.add("ts-just-saved");
    setTimeout(() => card.classList.remove("ts-just-saved"), 1600);
  }
  // Подсказать следующий шаг: набор сам по себе ничего не делает,
  // пока не выдан.
  const note = document.createElement("p");
  note.className = "type-feedback ok ts-saved-note";
  note.textContent = wasNew
    ? `Набор «${res.set.title}» сохранён. Выдайте его ученикам кнопкой «Выдать» — или соберите ещё один.`
    : `Набор «${res.set.title}» обновлён. Уже выданные домашки покажут ученикам новую версию.`;
  const ed = document.getElementById("ts-editor");
  if (ed) ed.insertAdjacentElement("afterend", note);
  setTimeout(() => note.remove(), 6000);
}

// ---- подключение ----

document.addEventListener("DOMContentLoaded", () => {
  const n1 = document.getElementById("ts-new"), n2 = document.getElementById("ts-new-empty");
  if (n1) n1.addEventListener("click", () => openTasksetEditor(null));
  if (n2) n2.addEventListener("click", () => openTasksetEditor(null));
  // Вкладка открылась — грузим наборы (и при каждом открытии обновляем)
  document.querySelectorAll('.nav-btn[data-tab="tasksets"]').forEach(b =>
    b.addEventListener("click", loadTasksets));
  // Переходы «→ вкладка» из формы домашки и других мест панели.
  // Блок первых шагов вешает свои — там пропускаем, чтобы не сработало дважды.
  document.addEventListener("click", e => {
    const go = e.target.closest("[data-goto]");
    if (!go || go.closest("#onboard-slot")) return;
    const t = document.querySelector(`.nav-btn[data-tab="${go.dataset.goto}"]`);
    if (t) t.click();
  });
});
