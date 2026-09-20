// runMCQ хранит верный ответ ИНДЕКСОМ (correct: options.indexOf(текст)).
// Значит два одинаковых варианта на экране = одна кнопка «верная», вторая
// «неверная», хотя надписи не отличить. А если верного текста в списке нет,
// indexOf вернёт -1 — верного варианта нет вовсе.
// Проверяем банки, из которых собираются варианты.
const { w } = require("./harness-full.js");

console.log(w.eval(`(() => {
  const out = [];
  // 1. ГРАММАТИКА: options = shuffled(r.o), correct = indexOf(r.a)
  let noAnswer = 0, dupOpt = 0, ex1 = null, ex2 = null, total = 0;
  Object.entries(GRAMMAR).forEach(([topic, items]) => items.forEach(r => {
    total++;
    const o = r.o || [];
    if (!o.includes(r.a)) { noAnswer++; if (!ex1) ex1 = topic + ": «" + r.s + "» ответ «" + r.a + "», варианты " + JSON.stringify(o); }
    const dup = o.filter((x, i) => o.indexOf(x) !== i);
    if (dup.length) { dupOpt++; if (!ex2) ex2 = topic + ": «" + r.s + "» варианты " + JSON.stringify(o) + " дубль " + JSON.stringify(dup); }
  }));
  out.push("ГРАММАТИКА: заданий " + total + "; без верного варианта в списке — " + noAnswer + "; с одинаковыми вариантами — " + dupOpt);
  if (ex1) out.push("   нет верного: " + ex1);
  if (ex2) out.push("   дубль: " + ex2);

  // 2. СЛОВООБРАЗОВАНИЕ
  if (typeof WORD_FORMS !== "undefined") {
    let n = 0, bad = 0, e = null;
    const walk = (k, v) => {
      if (Array.isArray(v)) v.forEach(r => {
        if (r && typeof r === "object" && r.o) { n++; if (!r.o.includes(r.a)) { bad++; if (!e) e = k + ": " + JSON.stringify(r); } }
      });
      else if (v && typeof v === "object") Object.entries(v).forEach(([k2, v2]) => walk(k + "/" + k2, v2));
    };
    Object.entries(WORD_FORMS).forEach(([k, v]) => walk(k, v));
    out.push("СЛОВООБРАЗОВАНИЕ: " + n + " заданий; без верного варианта — " + bad + (e ? " (" + e + ")" : ""));
  }

  // 3. СИНОНИМЫ: options = [syn, ant, ...others]
  if (typeof SYNONYMS !== "undefined") {
    const same = SYNONYMS.filter(s => s.syn === s.ant);
    out.push("СИНОНИМЫ: пар " + SYNONYMS.length + "; syn === ant — " + same.length
      + (same.length ? " (" + same.slice(0,3).map(s => s.w).join(", ") + ")" : ""));
  }
  return out.join("\\n");
})()`));

// 4. Что делает runMCQ, если верного варианта в списке нет (correct === -1).
console.log("\n— runMCQ с correct = -1 (так собирается задание, где ответа нет в вариантах):");
const doc = w.document;
w.eval(`window.readGateMs = () => 0; openExercise("mcq");`);
const errs = [];
w.addEventListener("error", e => errs.push(String(e.error && e.error.message || e.message)));
w.eval(`
  window.__fin = [];
  const _f = exFinish; window.exFinish = function (c, t, n) { window.__fin.push([c, t]); return _f(c, t, n); };
  stage().innerHTML = "";
  runMCQ([{ sub: "тест", prompt: "cat", options: ["кот", "пёс", "дом"], correct: -1 }]);
`);
setTimeout(() => {
  const opts = [...doc.querySelectorAll(".mcq-option")];
  console.log("  вариантов на экране:", opts.length);
  let threw = null;
  try { opts[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true })); }
  catch (e) { threw = e.message; }
  console.log("  нажали «кот» (верного ответа в списке нет):");
  console.log("   исключение:", threw || errs[0] || "нет");
  console.log("   кнопка «Дальше» появилась:", !!doc.getElementById("mcq-next"));
  console.log("   подход закрыт:", w.eval("JSON.stringify(window.__fin)"));
  console.log("   что осталось на экране:", doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ").trim().slice(0, 120));

  // 5. Два одинаковых варианта: верный только первый по счёту.
  console.log("\n— runMCQ с двумя ОДИНАКОВЫМИ вариантами:");
  w.eval(`stage().innerHTML = "";
    window.__xp = 0; const _a = award; window.award = function(n){ window.__xp += n; return _a(n); };
    runMCQ([{ sub: "тест", prompt: "run", options: ["бежать", "бежать", "спать"], correct: 0 }]);`);
  setTimeout(() => {
    const os = [...doc.querySelectorAll(".mcq-option")];
    console.log("  на экране:", os.map(b => b.textContent).join(" | "));
    os[1].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    console.log("  нажали ВТОРУЮ кнопку «бежать» →",
      os[1].className.includes("wrong") ? "НЕВЕРНО" : "верно",
      "· очков за раунд:", w.eval("window.__xp"));
    console.log("  в разборе ответов записано:", w.eval("JSON.stringify(exLog.slice(-1))"));
    process.exit(0);
  }, 30);
}, 30);
