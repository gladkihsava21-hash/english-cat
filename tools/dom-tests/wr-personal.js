// «Свои предложения» (personal). Что проверяем:
//  1) слово засчитывается ПОДСТРОКОЙ: «party» закрывает слово «art»,
//     «town» — «own», «friend» — «end». Ученик ни одного из них не писал;
//  2) подход всегда закрывается как «Верно 3 из 3» — даже когда сам
//     же экран пишет «по грамматике есть замечания»;
//  3) кнопка «Разбор от Савелия» уводит в чат, а show("chat") гасит
//     homeworkContext — результат по домашке репетитору НЕ уходит.
const { w } = require("./harness-full.js");
const doc = w.document;
const E = s => w.eval(s);
// Кнопки может не оказаться — и это бывает правильным поведением (подход
// не закрыт, потому что слова не засчитаны). Не падаем, а говорим об этом.
const click = sel => {
  const el = doc.querySelector(sel);
  if (el) el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  else console.log("   (на экране нет " + sel + ")");
};
const say = (t) => { doc.getElementById("pers-input").value = t; click("#pers-check"); };

const dict = ws => E(`state.dictionary = ${JSON.stringify(ws.map(x => ({ w: x, t: "перевод", added: Date.now() })))};
                      state.trainWords = ${JSON.stringify(ws)}; state.trainFolders = [];`);

// --- 1) подстрока вместо слова -------------------------------------------
console.log("1. Слово засчитано подстрокой другого слова");
dict(["art", "own", "end"]);
E(`openExercise("personal")`);
console.log("   задание:", doc.querySelector("#ex-stage .quiz-word").textContent.trim());
const before = JSON.parse(E(`JSON.stringify(state.dictionary.map(d => ({ w: d.w, checked: d.checked || 0, knew: d.knew || 0 })))`));
const text = "Yesterday I went to a party in a small town with my best friend.";
say(text);
console.log("   ученик написал:", text);
console.log("   ни «art», ни «own», ни «end» в тексте нет как слов");
console.log("   ответ программы:", doc.getElementById("pers-feedback").textContent.trim());
const after = JSON.parse(E(`JSON.stringify(state.dictionary.map(d => ({ w: d.w, checked: d.checked || 0, knew: d.knew || 0 })))`));
console.log("   до:  ", JSON.stringify(before));
console.log("   после:", JSON.stringify(after));
console.log("   кнопка «Дальше» появилась:", !!doc.getElementById("pers-next"));
click("#pers-next");
console.log("   итог подхода:", (doc.getElementById("ex-stage").textContent.match(/Верно \d+ из \d+/) || ["—"])[0]);

// --- 2) «идеально» при найденных ошибках ---------------------------------
console.log("\n2. «Верно 3 из 3» и «идеально» поверх грамматических замечаний");
dict(["cat", "dog", "run"]);
E(`openExercise("personal")`);
say("My cat and my dog run in the park every day becouse he like it.");
console.log("   ответ программы:", doc.getElementById("pers-feedback").textContent.trim());
const notes = [...doc.querySelectorAll(".gc-list li")].map(li => li.textContent.trim());
console.log("   замечания:", notes.join(" | ") || "(нет)");
click("#pers-next");
const fin = doc.getElementById("ex-stage").textContent.replace(/\s+/g, " ");
console.log("   экран «Готово»:", (fin.match(/Готово!\s*Верно \d+ из \d+\.\s*[^+]*/) || ["—"])[0].trim().slice(0, 90));

// --- 3) «Разбор от Савелия» и результат домашки --------------------------
console.log("\n3. Кнопка «Разбор от Савелия» и запись результата репетитору");
dict(["cat", "dog", "run"]);
E(`state.taskResults = {}; window.__sent = null;
   sendToSavely = t => { window.__sent = t; };
   initChat = function () {};`);
E(`openExercise("personal")`);
E(`homeworkContext = { id: 77, title: "Домашка на четверг" };`);
say("My cat and my dog run together in the big park every single day.");
console.log("   кнопка «Разбор от Савелия» на экране:", !!doc.getElementById("pers-ai"));
console.log("   homeworkContext до нажатия:", E(`JSON.stringify(homeworkContext)`));
click("#pers-ai");
console.log("   homeworkContext после:", E(`JSON.stringify(homeworkContext)`));
console.log("   записано репетитору:", E(`JSON.stringify(state.taskResults)`));

// а как это выглядит, если ученик нажал «Дальше →»
dict(["cat", "dog", "run"]);
E(`state.taskResults = {};`);
E(`openExercise("personal")`);
E(`homeworkContext = { id: 77, title: "Домашка на четверг" };`);
say("My cat and my dog run together in the big park every single day.");
click("#pers-next");
console.log("   для сравнения, через «Дальше →»:", E(`JSON.stringify(state.taskResults)`));

// --- 4) защита от прокликивания --------------------------------------
console.log("\n4. Учёт времени (rushed) в «Своих предложениях»");
dict(["cat", "dog", "run"]);
E(`openExercise("personal")`);
say("cat dog run a a a");
console.log("   ответ на список слов с добивкой до 6 слов:", doc.getElementById("pers-feedback").textContent.trim());
console.log("   exRound.answered:", E(`exRound.answered`), "→ exRoundRushed():", E(`exRoundRushed()`));
