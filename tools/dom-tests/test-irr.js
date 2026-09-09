const { w } = require("./harness.js");
const doc = w.document;
let fails = 0;
const ok = (cond, what) => { console.log((cond ? "  ✓ " : "  ✗ ") + what); if (!cond) fails++; };
const click = sel => { const el = doc.querySelector(sel); if (!el) throw new Error("нет элемента " + sel); el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); };
const txt = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

// словарь не нужен этому упражнению, но openExercise его ждёт — кладём заглушку
w.eval('window.WORDS = { A1: [{ w: "go", t: "идти" }], A2: [], B1: [], B2: [], C1: [], C2: [] };');

console.log("\n1. Экран выбора группы");
w.eval('openExercise("irregular")');
const groups = [...doc.querySelectorAll("#irr-groups .gr-topic")];
ok(groups.length === 6, "шесть кнопок (5 групп + «Все вперемешку»), а не " + groups.length);
ok(/Вторая и третья одинаковые/.test(txt()), "самая большая группа названа");
const counts = groups.map(b => b.querySelector(".gr-topic-count").textContent);
ok(counts.join(",") === "54,39,13,4,3,113", "счётчики: " + counts.join(","));

console.log("\n2. Таблица группы");
groups[3].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));   // «Первая и третья одинаковые»
const rows = [...doc.querySelectorAll(".irr-table tbody tr")].map(tr => [...tr.children].map(td => td.textContent));
ok(rows.length === 4, "четыре строки в таблице, а не " + rows.length);
ok(JSON.stringify(rows[0]) === JSON.stringify(["become","became","become","становиться"]), "первая строка: " + rows[0].join(" — "));
ok(!!doc.getElementById("irr-back") && !!doc.getElementById("irr-go"), "есть «К группам» и «Тренировать»");
click("#irr-back");
ok(!!doc.getElementById("irr-groups"), "«К группам» возвращает к списку групп");

console.log("\n3. Подход: верный ответ");
groups[3].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
click("#irr-go");
const verbs = [];
const cur = () => {
  const v = doc.querySelector("#ex-stage .quiz-word").textContent.trim();
  return w.eval("IRREGULAR_VERBS").find(r => r.v === v);
};
let r = cur();
verbs.push(r.v);
ok(!!doc.getElementById("irr-p") && !!doc.getElementById("irr-pp"), "два поля ввода");
ok(doc.querySelector("#ex-stage .irr-label").textContent.includes("Past Simple"), "подписи полей");
doc.getElementById("irr-p").value = r.p.toUpperCase() + "  ";     // регистр и пробелы не должны мешать
doc.getElementById("irr-pp").value = r.pp;
const xpBefore = w.eval("state.xp || 0");
click("#irr-check");
ok(/Верно/.test(doc.getElementById("irr-feedback").textContent), "верный ответ засчитан");
ok(w.eval("state.xp || 0") > xpBefore, "очки начислены");
ok(!!doc.getElementById("irr-next"), "кнопка «Дальше»");
ok(doc.getElementById("irr-check").disabled, "«Проверить» заблокирована после ответа");

console.log("\n4. Повторное нажатие «Проверить» ничего не добавляет");
const xpAfter = w.eval("state.xp || 0");
doc.getElementById("irr-check").disabled = false;             // как будто ученик пробился к кнопке
click("#irr-check");
ok(w.eval("state.xp || 0") === xpAfter, "очки за тот же ответ второй раз не начислены");

console.log("\n5. Русская раскладка и половина ответа");
click("#irr-next");
r = cur(); verbs.push(r.v);
doc.getElementById("irr-p").value = "прошёл";
doc.getElementById("irr-pp").value = "прошёл";
click("#irr-check");
ok(/русская раскладка/.test(doc.getElementById("irr-feedback").textContent), "про раскладку сказано: " + doc.getElementById("irr-feedback").textContent);
ok(!doc.getElementById("irr-next"), "подход не закрыт");
doc.getElementById("irr-p").value = "wrong";
doc.getElementById("irr-pp").value = "";
click("#irr-check");
ok(/обе формы/.test(doc.getElementById("irr-feedback").textContent), "просит дописать вторую форму");
ok(!doc.getElementById("irr-next"), "и это не ответ");

console.log("\n5б. Ошибка: правильные формы показаны, глагол вернётся");
doc.getElementById("irr-p").value = "wrong";
doc.getElementById("irr-pp").value = "wrong";
click("#irr-check");
const fb = doc.getElementById("irr-feedback").textContent;
ok(/Не так/.test(fb), "сказано, что неверно");
ok(txt().includes(`${r.v} — ${r.p} — ${r.pp}`), "показаны все три формы: " + `${r.v} — ${r.p} — ${r.pp}`);
ok(txt().includes("вернётся в конце подхода"), "обещан второй круг");
ok(doc.getElementById("irr-p").classList.contains("bad"), "неверное поле подсвечено");
const wrongVerb = r.v;

console.log("\n6. Пустой ответ не засчитывается");
click("#irr-next");
r = cur(); verbs.push(r.v);
click("#irr-check");
ok(!doc.getElementById("irr-next"), "по пустым полям подход не закрывается");
ok(doc.querySelector("#ex-stage .quiz-word").textContent.trim() === r.v, "остались на том же глаголе");

console.log("\n7. Второй круг и финал");
doc.getElementById("irr-p").value = r.p; doc.getElementById("irr-pp").value = r.pp;
click("#irr-check"); click("#irr-next");
r = cur(); verbs.push(r.v);
doc.getElementById("irr-p").value = r.p; doc.getElementById("irr-pp").value = r.pp;
click("#irr-check"); click("#irr-next");
ok(txt().includes("второй круг"), "после первого круга начались ошибки: " + txt().slice(0, 60));
ok(doc.querySelector("#ex-stage .quiz-word").textContent.trim() === wrongVerb, "вернулся именно тот глагол, где ошиблись");
r = cur();
doc.getElementById("irr-p").value = r.p; doc.getElementById("irr-pp").value = r.pp;
const xpBeforeRetry = w.eval("state.xp || 0");
click("#irr-check");
ok(w.eval("state.xp || 0") === xpBeforeRetry, "за второй круг очков не дают");
click("#irr-next");
ok(/Верно 3 из 4|3 из 4/.test(txt()) || /из 4/.test(txt()), "итог подхода из 4 глаголов: " + txt().slice(0, 90));

console.log("\n8. Все вперемешку — берётся 10 глаголов");
w.eval('openExercise("irregular")');
[...doc.querySelectorAll("#irr-groups .gr-topic")][5].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
click("#irr-go");
ok(doc.querySelector("#ex-stage .test-counter").textContent.trim() === "1 / 10", "счётчик: " + doc.querySelector("#ex-stage .test-counter").textContent.trim());

console.log("\n" + (fails ? "ПРОВАЛЕНО проверок: " + fails : "все проверки пройдены"));
process.exit(fails ? 1 : 0);
