// Временный тест: «Неправильные глаголы» — второй круг, счётчик, зачёт.
const { w, errors } = require("./harness-full.js");
const doc = w.document;
const click = el => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const txt = () => doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim();

// счётчики зачёта
w.eval(`
  window.__fin = []; window.__stat = []; window.__award = 0;
  const _fin = exFinish, _stat = statUpdate, _aw = award;
  exFinish = function (c, t, n) { window.__fin.push([c, t, n]); return _fin.apply(null, arguments); };
  statUpdate = function (word, ok) { window.__stat.push([word, ok]); return _stat.apply(null, arguments); };
  award = function (n) { window.__award += n; return _aw.apply(null, arguments); };
  readGateMs = () => 0;
`);

// Открываем «Неправильные глаголы», берём группу «Все три одинаковые» (маленькая)
w.eval('openExercise("irregular")');
const groups = [...doc.querySelectorAll("#irr-groups .irr-group")];
console.log("групп:", groups.length, groups.map(b => b.textContent.replace(/\s+/g, " ").slice(0, 30)));
// самая маленькая, чтобы банк был предсказуем
click(groups.find(b => /Все три одинаковые/.test(b.textContent)));
click(doc.getElementById("irr-go"));

const round = () => {
  const verb = doc.querySelector("#ex-stage .quiz-word").textContent.trim();
  const label = doc.querySelector("#ex-stage .quiz-label").textContent.trim();
  const counter = doc.querySelector("#ex-stage .test-counter") ? doc.querySelector("#ex-stage .test-counter").textContent.trim() : "—";
  return { verb, label, counter };
};

// отвечаем ВСЕГДА неверно — по замыслу «ошибки возвращаются вторым кругом»
let seen = [];
for (let n = 0; n < 40; n++) {
  if (!doc.getElementById("irr-p")) break;         // подход закрылся
  const r = round();
  seen.push(`${n}: ${r.counter} · ${r.label} · ${r.verb}`);
  doc.getElementById("irr-p").value = "zzz";
  doc.getElementById("irr-pp").value = "zzz";
  click(doc.getElementById("irr-check"));
  const nx = doc.getElementById("irr-next");
  if (!nx) { seen.push("нет кнопки Дальше"); break; }
  click(nx);
}
console.log("\n--- ходы (всегда неверно) ---");
seen.forEach(s => console.log("  " + s));
console.log("exFinish вызван:", w.eval("JSON.stringify(window.__fin)"));
console.log("statUpdate:", w.eval("window.__stat.length"), "award:", w.eval("window.__award"));
console.log("ошибки страницы:", errors);
