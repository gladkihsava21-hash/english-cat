// Регрессионный стенд для js/grammarcheck.js без браузера: модуль чистый,
// DOM ему не нужен, поэтому jsdom здесь излишен. Грузим словарь, глаголы
// и сам модуль одним скриптом — const-объявления видят друг друга.
//
// Четыре блока:
//   1. Кейсы методиста — обязаны ловиться.
//   2. Хитрые КОРРЕКТНЫЕ предложения — проверка обязана молчать
//      (главный принцип файла: лучше промолчать, чем соврать).
//   3. Реальные ошибки школьника — какие ловятся, какие пропускаются
//      (пропуск не провал, но он здесь зафиксирован явно).
//   4. Мусор на входе — модуль не должен падать.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const src = ["js/words.js", "js/verbs.js", "js/grammarcheck.js"]
  .map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
const { grammarCheck } = new Function(src + "\nreturn { grammarCheck };")();

let fails = 0;
const ok = (cond, what) => { console.log((cond ? "  ✓ " : "  ✗ ") + what); if (!cond) fails++; };

// К какому правилу относится замечание — по тексту «почему».
function ruleOf(n) {
  const s = n.why;
  if (/заглавной буквы/.test(s)) return "01";
  if (/Местоимение «я»/.test(s)) return "02";
  if (/В конце предложения/.test(s)) return "03";
  if (/Перед гласным звуком|Перед согласным звуком/.test(s)) return "04";
  if (/После he \/ she \/ it/.test(s)) return "05";
  if (/Окончание -s бывает только/.test(s)) return "06";
  if (/частица to не нужна|начальной форме, без -s/.test(s)) return "07";
  if (/неправильная форма/.test(s)) return "08a";
  if (/Опечатка/.test(s)) return "08b";
  if (/отрицание одно/.test(s)) return "09";
  if (/написано дважды/.test(s)) return "10";
  if (/единственном числе \(«/.test(s)) return "11";
  if (/не считают по штукам|можно посчитать/.test(s)) return "12";
  if (/неисчисляемое, глагол/.test(s)) return "13";
  if (/единственном числе — глагол/.test(s)) return "14";
  if (/нет сказуемого/.test(s)) return "15";
  return "02б";
}

console.log("\n1. Кейсы методиста — обязаны ловиться");
const METHODIST = [
  ["Dialysis structural medical procedure to clean your kidney from toxic chemicals.", "15"],
  ["My brother a good student at school.", "15"],
];
METHODIST.forEach(([text, rule]) => {
  const notes = grammarCheck(text);
  ok(notes.some(n => ruleOf(n) === rule),
     `${rule}: «${text.slice(0, 50)}…» → ${JSON.stringify(notes.map(n => ruleOf(n) + ":" + n.bad))}`);
});

console.log("\n2. Хитрые корректные предложения — проверка молчит");
const TRICKY_OK = [
  // present perfect
  "I have never been to London.",
  "She has just finished her homework.",
  "Have you ever eaten sushi?",
  "They have lived here since 2015.",
  // пассив
  "The house was built in 1990.",
  "English is spoken all over the world.",
  "The letter was written by my sister.",
  // вопросы с инверсией
  "Do you like coffee?",
  "Where does your brother live?",
  "What are you doing tomorrow?",
  "Did she call you yesterday?",
  "Is there any milk left?",
  // модальные
  "You should see a doctor.",
  "She can swim very well.",
  "We must not be late.",
  "Could you open the window, please?",
  "It might rain tonight.",
  // there is/are
  "There is a cat on the roof.",
  "There are many people in the park.",
  // герундий-подлежащее
  "Swimming is good for your health.",
  "Reading books helps you learn.",
  "Playing football is fun.",
  // инфинитив цели
  "I went to the shop to buy some bread.",
  "She studies hard to pass the exam.",
  // сослагательное
  "If I were you, I would apologize.",
  "If it were warmer, we would go swimming.",
  // сложноподчинённые
  "When I was a child, I lived in the country.",
  "Although it was raining, we went for a walk.",
  "I think that she is right.",
  "The book which I bought yesterday is interesting.",
  // причастные обороты
  "Walking down the street, I met an old friend.",
  "The girl sitting next to me is my cousin.",
  // used to
  "I used to play tennis when I was young.",
  "Did you use to live here?",
  "He didn't use to like coffee.",
  // have got
  "I have got a new bike.",
  "She has got two brothers.",
  "Have you got a pen?",
  // сокращения
  "I don't understand this rule.",
  "It's a beautiful day.",
  "He isn't at home now.",
  "They've already left.",
  "We're going to the cinema tonight.",
  // неправильные глаголы во всех формах
  "I went to school by bus yesterday.",
  "She wrote a letter to her friend.",
  "They have eaten all the cake.",
  "He took the bus to work this morning.",
  "I have known him for ten years.",
  // прочие ловушки
  "My brother plays football every Sunday.",
  "The news was really good.",
  "This information is very useful.",
  "He put his bag on the table and left.",
  "I read a lot of books last year.",
  "The man who lives next door is a doctor.",
  "She is good at maths and physics.",
  "There were a lot of people at the concert.",
  // омонимы-слова словаря (cant/wont/wan/whit — C1–C2) и составные
  // подлежащие: раньше были ложными срабатываниями корпуса
  "A wonted custom is hard to change.",
  "He is wont to sing in the shower.",
  "Her wan face worried us.",
  "He was not a whit tired.",
  "The old traders used a cant phrase.",
  "Scientists studied E. coli in the lab.",
  "The wolf and the dog share one genus.",
  "The cat and my dog play together.",
  "Books, tea and rain are a perfect trinity.",
  "A broker helped my aunt find a flat.",
  "My teacher helps my sister cook dinner.",
];
TRICKY_OK.forEach(text => {
  const notes = grammarCheck(text);
  ok(notes.length === 0,
     notes.length ? `ЛОЖНОЕ: «${text}» → ${JSON.stringify(notes)}` : `молчит: «${text}»`);
});

console.log("\n3. Реальные ошибки школьника");
// [текст, правило или null]. null — известный пропуск, зафиксирован явно.
const REAL_ERRORS = [
  ["He go to school every day.", "05"],
  ["She like apples.", "05"],
  ["It rain a lot in autumn.", "05"],
  ["She do her homework every day.", "05"],
  ["My sister cook very well.", "14"],
  ["My mother work in a bank.", "14"],
  ["I goes to the gym on Mondays.", "06"],
  ["They likes pizza very much.", "06"],
  ["We wants to help you.", "06"],
  ["He can sings well.", "07"],
  ["She must to go home now.", "07"],
  ["I goed to school yesterday.", "08a"],
  ["She teached me English last year.", "08a"],
  ["My freind lives in Moscow.", "08b"],
  ["I dont know the answer.", "08b"],
  ["I don't know nothing about it.", "09"],
  ["He never said nothing to me.", "09"],
  ["I like the the red car.", "10"],
  ["I saw an house in the forest.", "04"],
  ["She has a orange in her bag.", "04"],
  ["Much people came to the party.", "12"],
  ["I have many money in my pocket.", "12"],
  ["This information are very useful.", "13"],
  ["The news are really bad today.", "13"],
  ["Yesterday she were at home.", "02б"],
  ["They was late for school.", "02б"],
  ["I am agree with you.", "02б"],
  ["It depends of the weather.", "02б"],
  ["I listen music every evening.", "02б"],
  ["I very like this song.", "02б"],
  // Омонимы в контексте опечатки — правило 8б. «I cant imagine» —
  // НЕ в списке тишины выше нарочно: это опечатка can't в модальном
  // контексте (задание формулировало «I cant go» как ловимый случай),
  // а не словарное cant.
  ["I cant go to school today.", "08b"],
  ["I cant imagine anything.", "08b"],
  ["She wont come to the party.", "08b"],
  ["I wan a new bike.", "08b"],
  ["I go whit my friend to school.", "08b"],
  // Известные пропуски (правила таких конструкций не покрывают — это
  // осознанная цена принципа «лучше промолчать»).
  ["He don't like coffee.", null],           // he + don't: правила нет
  ["There is many people here.", null],      // there is + мн.ч.: правила нет
  ["Anna go to school every day.", null],    // имя собственное: правило 5 молчит нарочно
];
let caught = 0, missed = 0;
REAL_ERRORS.forEach(([text, rule]) => {
  const notes = grammarCheck(text);
  if (rule === null) {
    const got = notes.length > 0;
    console.log((got ? "  (поймано сверх ожидания) " : "  (пропуск, известно) ")
      + `«${text}»` + (got ? ` → ${JSON.stringify(notes.map(n => ruleOf(n) + ":" + n.bad))}` : ""));
    missed++;
    return;
  }
  const hit = notes.some(n => ruleOf(n) === rule);
  if (hit) caught++;
  ok(hit, `${rule}: «${text}»` + (hit ? "" : ` → не поймано, замечания: ${JSON.stringify(notes)}`));
});
console.log(`  Итого по списку обязательных: ${caught}/${REAL_ERRORS.filter(x => x[1]).length}`);

// «It rain» — ровно один диагноз: правило 15 не должно дублировать
// неверное «нет сказуемого» рядом с верным «it rains» от правила 5.
{
  const rainNotes = grammarCheck("It rain a lot in autumn.");
  ok(rainNotes.some(n => ruleOf(n) === "05") && !rainNotes.some(n => ruleOf(n) === "15"),
     "«It rain»: одно замечание, и это правило 05 → "
     + JSON.stringify(rainNotes.map(n => ruleOf(n) + ":" + n.bad)));
}

console.log("\n4. Мусор на входе — модуль не падает");
const GARBAGE = [
  ["пустая строка", ""],
  ["пробелы", "   \n\t  "],
  ["одно слово", "Hello"],
  ["одна буква", "I"],
  ["эмодзи", "😀😀😀 🐱🐱"],
  ["кириллица", "Привет, как дела?"],
  ["смесь", "Hello мир! 😀 test123."],
  ["знаки препинания", "!!!???...,,,"],
  ["HTML-инъекция", "<script>alert(1)</script>"],
  ["HTML в тексте", "It's <b>very</b> good."],
  ["числа", "1234567890"],
  ["не строка (null)", null],
  ["не строка (undefined)", undefined],
  ["не строка (число)", 42],
  ["повторы", "a a a a a a a a a a a a"],
];
GARBAGE.forEach(([what, input]) => {
  try {
    const notes = grammarCheck(input);
    ok(Array.isArray(notes), `${what}: массив из ${notes.length} замечаний`);
  } catch (e) {
    ok(false, `${what}: ПАДЕНИЕ — ${e.message}`);
  }
});
try {
  const long = ("The quick brown fox jumps over the lazy dog. ".repeat(500)).trim();
  const t0 = Date.now();
  grammarCheck(long);
  ok(true, `длинная строка (${long.length} симв.): ${Date.now() - t0} мс`);
} catch (e) {
  ok(false, `длинная строка: ПАДЕНИЕ — ${e.message}`);
}

console.log("\n" + (fails ? `ПРОВАЛЕНО: ${fails}` : "grammarcheck.js: кейсы методиста, тишина на верных фразах, ошибки и мусор — всё как ожидалось"));
process.exit(fails ? 1 : 0);
