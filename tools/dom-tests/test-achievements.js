// Экран «Награды»: разделы, все 32 награды на месте, у каждой свой значок.
// Дыра была дизайн-контрактная: 32 карточки одним потоком на 14 форм
// значков читались стеной одинаковых плиток.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
let fails = 0;
const ok = (cond, what) => { console.log((cond ? "  ✓ " : "  ✗ ") + what); if (!cond) fails++; };

w.eval(`state.achievements = []; renderAchievements();`);

console.log("\n1. Разделы");
const groups = [...doc.querySelectorAll("#ach-grid > .ach-group")];
const GROUPS = w.eval("ACH_GROUPS.map(g => g.title)");
ok(groups.length === GROUPS.length, `разделов ${groups.length}, в реестре ${GROUPS.length}`);
const titles = groups.map(g => g.querySelector("h3") && g.querySelector("h3").childNodes[0].textContent.trim());
ok(JSON.stringify(titles) === JSON.stringify(GROUPS), "порядок и названия: " + titles.join(" · "));
ok(groups.every(g => g.querySelector("h3")), "у каждого раздела заголовок h3 (ступень «секция»)");
ok(groups.every(g => g.querySelector(".ach-grid")), "у каждого раздела своя сетка");

console.log("\n2. Все 32 награды на месте, у каждой — значок");
const cards = [...doc.querySelectorAll("#ach-grid .ach-card")];
const IDS = w.eval("ACHIEVEMENTS.map(a => a.id)");
ok(cards.length === 32, `карточек ${cards.length} из 32`);
ok(w.eval(`new Set(ACHIEVEMENTS.map(a => a.id)).size`) === 32, "id наград не повторяются");
ok(cards.every(c => c.querySelector(".ach-icon > svg.ic")), "у каждой карточки svg-значок");
ok(cards.every(c => c.querySelector(".ach-icon .ach-lock")), "у закрытых — бейдж замка поверх СВОЕГО значка");
ok(cards.every(c => c.querySelector(".ach-name") && c.querySelector(".ach-desc")),
   "у каждой имя и условие текстом (смысл не одним цветом)");
ok(doc.getElementById("ach-count").textContent === "0 из 32",
   "счётчик: " + doc.getElementById("ach-count").textContent);

console.log("\n3. Значки: все существуют и все РАЗНЫЕ");
const icons = w.eval("ACHIEVEMENTS.map(a => a.icon)");
const missing = w.eval("ACHIEVEMENTS.filter(a => !ICONS[a.icon]).map(a => a.id + ':' + a.icon)");
ok(missing.length === 0, "нет ссылок на несуществующие значки" + (missing.length ? ": " + missing : ""));
ok(new Set(icons).size === 32, `форм значков ${new Set(icons).size} на 32 награды`);

console.log("\n4. Каждая награда знает свой раздел, разделы без пустых");
const badGroup = w.eval("ACHIEVEMENTS.filter(a => !ACH_GROUPS.some(g => g.id === a.group)).map(a => a.id)");
ok(badGroup.length === 0, "все group указывают на существующий раздел" + (badGroup.length ? ": " + badGroup : ""));
ok(w.eval("ACH_GROUPS.every(g => ACHIEVEMENTS.some(a => a.group === g.id))"), "пустых разделов нет");

console.log("\n5. Полученные: ступень классом, а не инлайновым цветом");
w.eval(`state.achievements = ["first-word", "words-50", "xp-5000", "streak-30"]; renderAchievements();`);
const done = [...doc.querySelectorAll("#ach-grid .ach-card.ach-done")];
ok(done.length === 4, `получено ${done.length} из 4 заявленных`);
ok(done.every(c => !c.querySelector(".ach-lock")), "у полученных замка нет");
ok(done.every(c => c.querySelector(".ach-got")), "у полученных подпись «получено»");
ok(done.every(c => !c.querySelector(".ach-icon").getAttribute("style")),
   "фон значка больше не приходит инлайном из JS");
const tierOf = id => w.eval(`ACHIEVEMENTS.find(a => a.id === ${JSON.stringify(id)}).tier`);
["first-word", "words-50", "xp-5000", "streak-30"].forEach(id => {
  const card = done.find(c => c.querySelector(".ach-name").textContent ===
    w.eval(`ACHIEVEMENTS.find(a => a.id === ${JSON.stringify(id)}).name`));
  ok(card && card.classList.contains("ach-tier-" + tierOf(id)),
     `${id}: класс ach-tier-${tierOf(id)}`);
});
ok(doc.getElementById("ach-count").textContent === "4 из 32",
   "счётчик: " + doc.getElementById("ach-count").textContent);
const firstGroupNote = doc.querySelector("#ach-grid .ach-group h3 .muted-small");
ok(firstGroupNote && /получено 1 из 3/.test(firstGroupNote.textContent),
   "у раздела свой счётчик: " + (firstGroupNote && firstGroupNote.textContent));

console.log("\n6. У закрытых — полоса прогресса и числитель");
w.eval(`state.achievements = []; state.counters = { exercises: 10 }; renderAchievements();`);
const ex25 = [...doc.querySelectorAll("#ach-grid .ach-card")].find(c => c.querySelector(".ach-name").textContent === "Втянулся");
ok(ex25 && /10 \/ 25/.test(ex25.querySelector(".ach-progress").textContent),
   "«Втянулся»: " + (ex25 && ex25.querySelector(".ach-progress").textContent));

console.log("\n7. Полоса на главной не пострадала");
let stripErr = null;
try { w.eval("renderAchStrip()"); } catch (e) { stripErr = e.message; }
ok(!stripErr, "renderAchStrip без исключений" + (stripErr ? ": " + stripErr : ""));
ok(doc.querySelectorAll("#dash-ach .sticker").length > 0, "наклейки на месте");
ok(doc.querySelector("#dash-ach .ach-next"), "подпись «Дальше: / Что можно взять сегодня:» на месте");

console.log("\n8. Ошибок обработчиков нет");
ok(errors.length === 0, "ошибок: " + (errors.join(" | ") || "нет"));

console.log("\n" + (fails ? `ПРОВАЛЕНО: ${fails}` : "Награды: разделы, 32 уникальных значка, ступени — всё на месте"));
process.exit(fails ? 1 : 0);
