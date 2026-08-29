// Интерфейс на двух языках — русском и английском.
//
// Просьба совладельца: ученик сам выбирает язык интерфейса, «как со сменой
// фона». Кнопка EN/РУ живёт в шапке рядом с темой, выбор — в localStorage.
//
// КАК УСТРОЕНО. Не переписываем каждую строку кода на t("ключ") — в проекте
// без сборщика это тысячи правок и вечный источник рассинхрона. Вместо
// этого русский остаётся языком исходников, а при включённом английском
// готовая страница ПЕРЕВОДИТСЯ: проход по текстовым узлам и атрибутам со
// словарём «русская строка → английская» плюс несколько шаблонов для строк
// с числами («Верно 3 из 6»). MutationObserver переводит и то, что
// дорисовывается на ходу. Строка, которой нет в словаре, остаётся русской —
// это мягкая деградация, а не поломка.
//
// ЧТО НЕ ПЕРЕВОДИТСЯ НАМЕРЕННО:
//   - реплики кота в чате (#chat-box): это персонаж, русскоговорящий
//     репетитор, и его текст — содержимое, а не интерфейс;
//   - переводы слов и примеров: русский перевод — учебный материал;
//   - сообщения репетитора и названия домашек: их писал живой человек.
//
// Панель репетитора и админка остаются русскими: язык выбирает ученик.

const LANG_KEY = "savelyLang";

function uiLang() {
  try { return localStorage.getItem(LANG_KEY) === "en" ? "en" : "ru"; }
  catch (e) { return "ru"; }
}

/* ==========================================================================
   Словарь. Ключ — точная русская строка (после схлопывания пробелов).
   ========================================================================== */
const I18N_EN = {
  // --- шапка и навигация ---
  "Главная": "Home",
  "Словарь": "Dictionary",
  "Тренировки": "Practice",
  "Награды": "Awards",
  "Чат": "Chat",
  "с Савелием": "with Savely",
  "Мой словарь": "My dictionary",
  "Разделы сайта": "Site sections",
  "К содержимому": "Skip to content",
  "профиль": "profile",
  "выйти": "log out",
  "Мой профиль": "My profile",
  "Савелий": "Savely",
  "Савелий — кот-репетитор английского": "Savely — the English tutor cat",

  // --- приветствие и тест ---
  "английские слова, которые не выветрятся": "English words that stick",
  "Я Савелий. Английский знаю лучше тебя — но это поправимо.": "I'm Savely. My English is better than yours — for now.",
  "Ответь на 36 слов — пойму твой уровень и дальше дам ровно то, что ты потянешь. И сам помню, когда какое слово пора повторить, — зайдёшь, а они уже ждут.":
    "Answer 36 words — I'll figure out your level and give you exactly what you can handle. I also remember when each word is due for review: come back and they'll be waiting.",
  "Регистрация": "Sign up",
  "Я ученик": "I'm a student",
  "Я репетитор": "I'm a tutor",
  "Вход": "Log in",
  "Имя": "Name",
  "Как тебя зовут?": "What's your name?",
  "Необязательно. Нужен только чтобы вернуть доступ, если потеряешь свой код.": "Optional. Only needed to restore access if you lose your code.",
  "Согласен на обработку своих данных —": "I agree to the processing of my data —",
  "что храним и зачем": "what we store and why",
  ". Если тебе меньше 14, отметить должен родитель.": ". If you are under 14, a parent must tick this.",
  "Создать аккаунт": "Create account",
  "Уже занимался на другом устройстве?": "Already practised on another device?",
  "Войти по коду": "Log in with a code",
  "Вход по личному коду": "Log in with your personal code",
  "Код показан на главной странице на том устройстве, где ты уже занимался.": "The code is shown on the home screen of the device where you practised before.",
  "← обычная регистрация": "← back to sign-up",
  "Поехали, 36 слов": "Let's go — 36 words",
  "Тест на уровень: 36 слов": "Level test: 36 words",
  "▶ Тест": "▶ Test",
  "посчитаем, сколько слов ты уже знаешь": "let's count how many words you already know",
  "Знаешь это слово?": "Do you know this word?",
  "Знаю": "I know it",
  "Не знаю": "I don't",
  "честно — не подглядывать": "be honest — no peeking",
  ", от простых к сложным. «Знаю» — это когда помнишь перевод, а не когда где-то видел. Соврёшь — получишь слова не по зубам, и мучиться будешь ты, а не я.":
    ", from easy to hard. \"I know it\" means you remember the meaning, not that it looks familiar. Cheat and you'll get words you can't chew — and it's you who'll suffer, not me.",
  "36 слов": "36 words",
  "Твой уровень": "Your level",
  "Словарный запас": "Vocabulary size",
  "слов (примерно)": "words (approx.)",
  "К подбору слов": "Pick my words",
  "К подбору слов →": "Pick my words →",
  "Слова для тебя": "Words for you",
  "(подобраны под твой уровень)": "(picked for your level)",
  "другие слова": "other words",
  "В словарь": "Add to dictionary",
  "+ В словарь": "+ Add to dictionary",
  "в словаре": "in dictionary",
  "Забрать первые слова": "Grab my first words",
  "Это демо: заниматься можно сколько угодно, но прогресс живёт только в этом браузере. Репетитор его не увидит.":
    "This is a demo: practise as much as you like, but progress lives only in this browser. A tutor won't see it.",

  // --- главная ---
  "Слово дня": "Word of the day",
  "Задание от репетитора": "Task from your tutor",
  "Начинаем": "Getting started",
  "Прямо сейчас": "Right now",
  "На сегодня всё": "Done for today",
  "Первое занятие — 5 минут": "First lesson — 5 minutes",
  "Поехали →": "Let's go →",
  "Взяться за домашку": "Start the homework",
  "Открыть задание": "Open the task",
  "Пройти ещё раз": "Try again",
  "Пройти по-честному": "Do it properly",
  "другое занятие": "something else",
  "сначала посмотреть слова": "see the words first",
  "добавить новых слов": "add new words",
  "Цель дня закрыта": "Daily goal reached",
  "Блиц на минуту": "One-minute blitz",
  "Позаниматься 5 минут": "Practise for 5 minutes",
  "Савелий выбрал те, что начали забываться. Пять минут — и они снова твои.": "Savely picked the ones you're starting to forget. Five minutes and they're yours again.",
  "Цель на сегодня": "Today's goal",
  "изменить цель": "change goal",
  "Слова": "Words",
  "выучено": "learned",
  "ждут тебя": "waiting for you",
  "Звание": "Rank",
  "Твой прогресс": "Your progress",
  "Дней подряд": "Day streak",
  "Очки": "Points",
  "Пройдено слов": "Words covered",
  "Рейтинг за неделю": "This week's leaderboard",
  "Сфоткать домашку": "Snap your homework",
  "Домашка в тетради? Сфоткай — фото сразу попадёт к твоему репетитору на проверку.": "Homework in your notebook? Snap a photo — it goes straight to your tutor for checking.",
  "Домашка от репетитора": "Homework from your tutor",
  "Сделать домашку": "Do the homework",
  "Ещё не сделано": "Not done yet",
  "Прочитай вслух:": "Read aloud:",
  "Начать чтение": "Start reading",
  "Прочитать ещё раз": "Read again",
  "Стоп — я закончил": "Stop — I'm done",
  "Сделай задание в тетради и пришли фото — кнопка «Сфоткать домашку» ниже.": "Do the task in your notebook and send a photo — the button is below.",
  "Прочитай текст вслух — результат уйдёт репетитору.": "Read the text aloud — the result goes to your tutor.",
  "Викторина": "Quiz",
  "Впиши слово": "Fill in the word",
  "Соедини пары": "Match the pairs",
  "Задание": "Task",

  // --- словарь ---
  "Поиск по словарю": "Search the dictionary",
  "Поиск по словарю…": "Search the dictionary…",
  "все": "all",
  "новые": "new",
  "учу": "learning",
  "Папки": "Folders",
  "новая папка": "new folder",
  "+ Создать": "+ Create",
  "Название новой папки": "New folder name",
  "В какую папку?": "Which folder?",
  "+ Фразовые глаголы, идиомы, сочетания": "+ Phrasal verbs, idioms, collocations",
  "Фразовые глаголы": "Phrasal verbs",
  "Идиомы": "Idioms",
  "Сочетания": "Collocations",
  "Выражения": "Phrases",
  "слово по-английски": "word in English",
  "Слово по-английски": "Word in English",
  "перевод": "translation",
  "Перевод на русский": "Russian translation",
  "+ Добавить": "+ Add",
  "Отобрать слова на тренировку": "Pick words to practise",
  "Готово": "Done",
  "Тренировать отмеченные": "Practise the marked ones",
  "снять отметки": "clear marks",
  "Произношение": "Pronunciation",
  "Здесь будут слова, которые ты забрал себе: с переводом, примером и озвучкой. Начинать с нуля не придётся — я уже подобрал первые.":
    "Your saved words will live here — with translation, example and audio. You won't start from zero: I've already picked the first ones.",
  "это ненадолго": "won't take long",

  // --- тренировки ---
  "Слова какого уровня предлагать:": "Which level of words to suggest:",
  "Влияет на рекомендации, слова в упражнениях и подсказки кота.": "Affects recommendations, words in exercises and the cat's suggestions.",
  "Что тренируем": "What to practise",
  "Тренируем:": "Practising:",
  "весь словарь": "whole dictionary",
  "отмеченные слова": "marked words",
  "снять отбор": "clear selection",
  "Без группы": "No group",
  "По словам": "Words",
  "На слух": "Listening",
  "Письмо и речь": "Writing and speech",
  "Подготовка к ОГЭ": "Exam prep (OGE)",
  "Игры": "Games",
  "Фразовые глаголы (phrasal verbs), идиомы (idioms) и устойчивые сочетания (collocations) — то, что не переводится по словам.":
    "Phrasal verbs, idioms and collocations — the things you can't translate word by word.",
  "В этом браузере нет английской озвучки — открой сайт в Chrome или Safari, и раздел заработает.":
    "This browser has no English speech engine — open the site in Chrome or Safari and this section will work.",
  "нужна озвучка — см. подсказку выше": "needs audio — see the note above",

  // упражнения: названия
  "Карточки": "Flashcards",
  "Слово и картинка": "Word and picture",
  "Сопоставление": "Matching",
  "Выбор варианта": "Multiple choice",
  "Ввод слова": "Type the word",
  "Собери слово": "Unscramble",
  "Определения": "Definitions",
  "Аудирование": "Listening",
  "Диктант": "Dictation",
  "Перевод фразы": "Translate a sentence",
  "Свои предложения": "Your own sentences",
  "Слово в контексте": "Word in context",
  "Синонимы": "Synonyms",
  "Не буквально": "Not literally",
  "Собери выражение": "Build the phrase",
  "Что с чем": "What goes with what",
  "Найди лишнее": "Odd one out",
  "Блиц": "Blitz",
  "Категории": "Categories",
  "Поиск слов": "Word search",
  "Кроссворд": "Crossword",
  "Словообразование": "Word formation",
  "Грамматика": "Grammar",
  "Задание репетитора": "Tutor's task",
  // упражнения: подписи
  "Слово ↔ перевод, с озвучкой": "Word ↔ meaning, with audio",
  "Выбери слово по картинке": "Pick the word for the picture",
  "Соедини слово и перевод": "Match word and meaning",
  "Выбери правильный перевод": "Pick the right meaning",
  "Впиши слово по переводу": "Type the word for the meaning",
  "Составь слово из букв": "Build the word from letters",
  "Слово ↔ определение (англ.)": "Word ↔ definition (EN)",
  "Услышь и выбери слово": "Listen and pick the word",
  "Услышь и напиши фразу": "Listen and type the phrase",
  "Переведи предложение на англ.": "Translate into English",
  "Составь фразы с новыми словами": "Make sentences with new words",
  "Где слово использовано верно?": "Where is the word used correctly?",
  "Синонимы и антонимы": "Synonyms and antonyms",
  "Соедини слова, которые ходят парой": "Match the words that go together",
  "Что значит на самом деле": "What it really means",
  "Составь фразу из слов": "Build the phrase from words",
  "Какое слово подходит": "Which word fits",
  "Какое слово не из той темы?": "Which word is from another topic?",
  "Сколько слов успеешь за минуту?": "How many words in a minute?",
  "Разложи слова по темам": "Sort words by topic",
  "Найди слова в сетке букв": "Find words in the letter grid",
  "Отгадай слова по переводам": "Guess words by their meanings",
  "Поставь слово в нужную форму — как в ОГЭ": "Put the word in the right form — exam style",
  "Времена, артикли, предлоги — с разбором": "Tenses, articles, prepositions — with explanations",
  "Вопросы, которые составил ваш репетитор": "Questions written by your tutor",

  // --- ход упражнения ---
  "Проверить": "Check",
  "Дальше →": "Next →",
  "Закончить": "Finish",
  "Подсказка": "Hint",
  "К тренировкам": "Back to practice",
  "← Тренировки": "← Practice",
  "← На главную": "← Home",
  "На главную": "Home",
  "Ещё раз": "Once more",
  "Готово!": "Done!",
  "Слишком быстро": "Too fast",
  "Какое слово лишнее?": "Which word is the odd one out?",
  "Лишнее — слово из другой темы.": "The odd one is from a different topic.",
  "Нажми первую и последнюю букву слова. Найди:": "Tap the first and last letter of a word. Find:",
  "Нажми элемент слева, потом его пару справа": "Tap an item on the left, then its match on the right",
  "Выбери тему — по ней и будут задания.": "Pick a topic — the tasks will follow it.",
  "Мур-р-р, идеально! 😻": "Purr-fect! 😻",
  "Отлично идём, мяу! 😸": "Great pace, meow! 😸",
  "Неплохо, но повторим ещё. 🐾": "Not bad — let's review again. 🐾",
  "Ничего, повторение — мать учения! 😿": "It's fine — repetition is the mother of learning! 😿",
  "Разбор ответов": "Answer review",
  "Эти слова ещё не твои — забрать в словарь?": "These words aren't yours yet — add them to your dictionary?",
  "Выражения из этого подхода — в словарь?": "Add this round's phrases to your dictionary?",
  "Лягут в свою папку — «Фразовые глаголы», «Идиомы» или «Сочетания». Полный список — в словаре, кнопка «+ Фразовые глаголы, идиомы, сочетания».":
    "Each goes to its own folder — Phrasal verbs, Idioms or Collocations. The full list lives in the dictionary under \"+ Phrasal verbs, idioms, collocations\".",
  "Задание от репетитора. Ошибся — прочитай разбор, если он есть.": "A task from your tutor. Got one wrong? Read the explanation if there is one.",
  "Ошибся — прочитай разбор целиком, он короткий.": "Got one wrong? Read the short explanation.",
  "Как в экзамене: слева предложение, справа исходное слово заглавными.": "Exam style: sentence on the left, the base word in capitals on the right.",
  "Задание от репетитора: впиши, что пропущено.": "A task from your tutor: fill in what's missing.",
  "форма слова": "word form",
  "ответ": "answer",
  "Верно, мяу!": "Correct, meow!",
  "Нечего тренировать — словарь пуст! Сначала добавь слова.": "Nothing to practise — the dictionary is empty! Add some words first.",
  "Тренировка окончена!": "Training finished!",
  "Всё верно, мяу! Кроссворд собран.": "All correct, meow! Crossword complete.",

  // --- карточки ---
  "Карточки со словами": "Word flashcards",
  "Карточка со словом. Нажми, чтобы перевернуть": "Word card. Tap to flip",
  "нажми на карточку, чтобы перевернуть": "tap the card to flip it",
  "Помню": "I remember",
  "Забыл": "Forgot",
  "Готово, мяу!": "Done, meow!",
  "Тренировать →": "Practise →",

  // --- чат (рамка, не реплики) ---
  "Переписка с Савелием": "Chat with Savely",
  "кот-репетитор · онлайн": "tutor cat · online",
  "кот-репетитор · отвечает по правилам": "tutor cat · rule-based replies",
  "Напиши или скажи Савелию…": "Type or say something to Savely…",
  "Сообщение Савелию": "Message to Savely",
  "Отправить сообщение": "Send message",
  "Дай новое слово": "Give me a new word",
  "Проверь меня": "Test me",
  "Как мои успехи?": "How am I doing?",
  "Сказать голосом": "Say it with your voice",
  "Голосовой чат": "Voice chat",
  "Настройки голоса": "Voice settings",
  "Русский голос": "Russian voice",
  "Английский голос": "English voice",
  "Скорость": "Speed",
  "Что озвучивать": "What to voice",
  "всю реплику": "the whole reply",
  "только английские слова": "English words only",
  "Язык распознавания": "Recognition language",

  // --- награды ---
  "Все награды →": "All awards →",
  "Получено:": "Earned:",
  "Первая добыча": "First catch",
  "Первый урок": "First lesson",
  "Знай себя": "Know yourself",
  "Десяточка": "Perfect ten",
  "Полсотни": "Fifty",
  "Книжный кот": "Book cat",
  "Ходячий словарь": "Walking dictionary",
  "Запасливый": "The collector",
  "Разогрев": "Warm-up",
  "Неделя без пропусков": "A week, no gaps",
  "Железная лапа": "Iron paw",
  "Постоянный клиент": "Regular",
  "Первая сотня": "First hundred",
  "Тысячник": "One thousand",
  "Звёздный кот": "Star cat",
  "Без единой ошибки": "Not a single mistake",
  "Меткий глаз": "Sharp eye",
  "Безупречный": "Flawless",
  "Втянулся": "Hooked",
  "Сотня подходов": "Hundred rounds",
  "Универсал": "All-rounder",
  "Разогнался": "Speeding up",
  "Молния": "Lightning",
  "Сверхзвук": "Supersonic",
  "Домашку сдал": "Homework done",
  "Отличник": "Straight-A cat",
  "Разговорился": "Chatterbox",
  "Душа компании": "Life of the party",
  "Ранняя пташка": "Early bird",
  "Ночной охотник": "Night hunter",
  "План выполнен": "Goal met",
  "Дисциплина": "Discipline",
  "Добавить первое слово в словарь": "Add your first word to the dictionary",
  "Пройти любую тренировку": "Finish any exercise",
  "Пройти тест на словарный запас": "Take the vocabulary test",
  "Выучить 10 слов": "Learn 10 words",
  "Выучить 50 слов": "Learn 50 words",
  "Выучить 150 слов": "Learn 150 words",
  "Выучить 300 слов": "Learn 300 words",
  "Собрать 50 слов в словаре": "Collect 50 words in your dictionary",
  "Заниматься 3 дня подряд": "Practise 3 days in a row",
  "Заниматься 7 дней подряд": "Practise 7 days in a row",
  "Заниматься 30 дней подряд": "Practise 30 days in a row",
  "Заниматься в 20 разных дней": "Practise on 20 different days",
  "Набрать 100 очков": "Score 100 points",
  "Набрать 1000 очков": "Score 1,000 points",
  "Набрать 5000 очков": "Score 5,000 points",
  "Пройти тренировку идеально": "Finish an exercise with a perfect score",
  "10 идеальных тренировок": "10 perfect rounds",
  "50 идеальных тренировок": "50 perfect rounds",
  "Пройти 25 тренировок": "Finish 25 rounds",
  "Пройти 100 тренировок": "Finish 100 rounds",
  "Попробовать 15 видов тренировок": "Try 15 kinds of exercises",
  "Набрать 100 очков в блице": "Score 100 in blitz",
  "Набрать 300 очков в блице": "Score 300 in blitz",
  "Набрать 500 очков в блице": "Score 500 in blitz",
  "Выполнить домашку полностью": "Finish a homework completely",
  "Выполнить 10 домашек": "Finish 10 homeworks",
  "Написать Савелию 10 сообщений": "Send Savely 10 messages",
  "Написать Савелию 100 сообщений": "Send Savely 100 messages",
  "Позаниматься до 8 утра": "Practise before 8 a.m.",
  "Позаниматься после 23:00": "Practise after 11 p.m.",
  "Выполнить дневную цель": "Hit the daily goal",
  "Выполнить дневную цель 10 раз": "Hit the daily goal 10 times",

  // --- профиль и выход ---
  "Твой код": "Your code",
  "Скопировать код": "Copy the code",
  "Перенести прогресс": "Move my progress",
  "Выйти из аккаунта": "Log out",
  "Выйти — прогресс останется у Савелия": "Log out — Savely keeps your progress",
  "Остаться": "Stay",
  "Выйти": "Log out",
  "Я записал код — без него не вернуться": "I've saved the code — I can't return without it",
  "стереть прогресс с этого устройства": "erase progress on this device",
  "Прогресс сохранён у Савелия — словарь, очки и расписание повторений никуда не денутся. Чтобы вернуться на этом или любом другом устройстве, нужен твой личный код:":
    "Your progress is safe with Savely — dictionary, points and review schedule stay put. To come back on this or any other device you'll need your personal code:",
  "Ты занимаешься без репетитора, и прогресс живёт только в этом браузере — на сервер он не уходит. Если выйти, вернуть его будет нечем.":
    "You practise without a tutor, so progress lives only in this browser — it isn't sent to a server. If you log out there's no way to bring it back.",

  // --- уровни и звания ---
  "Начинающий": "Beginner",
  "Элементарный": "Elementary",
  "Средний": "Intermediate",
  "Выше среднего": "Upper-intermediate",
  "Продвинутый": "Advanced",
  "Свободное владение": "Proficient",
  "Котёнок": "Kitten",
  "Юный кот": "Young cat",
  "Кот-ученик": "Student cat",
  "Умный кот": "Clever cat",
  "Кот-знаток": "Expert cat",
  "Кот-профессор": "Professor cat",
  "Кот-полиглот": "Polyglot cat",

  // --- темы слов ---
  "Еда": "Food", "Дом": "Home", "Вещи": "Things", "Места": "Places",
  "Природа": "Nature", "Время": "Time", "Качества": "Qualities",
  "Чувства": "Feelings", "Люди": "People", "Действия": "Actions",
  "Дорога и отдых": "Travel", "Общение": "Communication",
  "Мышление": "Thinking", "Характер": "Character", "Изменения": "Change",
  "Деньги и работа": "Money and work", "Общество": "Society",
  "Слова-связки": "Linking words", "Семья": "Family", "Животные": "Animals",
  "Школа": "School", "Тело": "Body", "Одежда": "Clothes", "Погода": "Weather",
  "Город": "City", "Здоровье": "Health", "Творчество": "Arts",
  "Спорт": "Sport", "Техника": "Tech", "Работа": "Work",

  // --- подвал ---
  "Кот нарисован на основе": "The cat is based on",
  ", лицензия CC-BY 4.0. Фотографии к словам —": ", CC-BY 4.0 licence. Word photos —",
  "Wikimedia Commons, авторы и лицензии": "Wikimedia Commons, authors and licences",
  "Что мы храним и зачем": "What we store and why",
  "Условия подписки": "Subscription terms",
  "Вопрос, счёт или «что-то сломалось» —": "Questions, billing or \"something broke\" —",
};

/* Шаблоны для строк с числами и вставками. Каждое правило — [regex, fn];
   fn получает совпадение и возвращает английскую строку. Хвост после
   шаблона переводится словарём ещё раз — так «Верно 3 из 6. Мур-р-р,
   идеально!» собирается из правила и обычной записи словаря. */
function i18nPlural(n, one, many) { return Number(n) === 1 ? one : many; }
const I18N_RX = [
  [/^Привет, (.+)! Мяу!$/, m => `Hi, ${m[1]}! Meow!`],
  [/^Уровень ([ABC][12]) · в словаре (\d+) сло(?:во|ва|в)$/, m => `Level ${m[1]} · ${m[2]} ${i18nPlural(m[2], "word", "words")} in your dictionary`],
  [/^Уровень ([ABC][12]) · (.+)$/, m => `Level ${m[1]} · ${trText(m[2]) || m[2]}`],
  [/^Верно (\d+) из (\d+)\.\s*(.*)$/, m => `Correct: ${m[1]} of ${m[2]}.` + (m[3] ? " " + (trText(m[3]) || m[3]) : "")],
  [/^Помнишь (\d+) из (\d+)(.*)$/, m => `You remembered ${m[1]} of ${m[2]}` + (m[3] ? (trText(m[3].trim()) ? " " + trText(m[3].trim()) : m[3]) : "")],
  [/^Повторить (\d+) сло(?:во|ва|в)$/, m => `Review ${m[1]} ${i18nPlural(m[1], "word", "words")}`],
  [/^(\d+) из (\d+) слов выучено(.*)$/, m => `${m[1]} of ${m[2]} words learned` + (m[3] ? m[3].replace("— готово, мяу! 🎉", "— done, meow! 🎉") : "")],
  [/^Осталось (\d+) сло(?:во|ва|в) из (\d+)\. Добавлю в словарь и открою карточки\.$/,
    m => `${m[1]} ${i18nPlural(m[1], "word", "words")} of ${m[2]} left. I'll add them to your dictionary and open the flashcards.`],
  [/^Сделано: (\d+) из (\d+)(.*)$/, m => `Done: ${m[1]} of ${m[2]}` + (m[3] ? m[3].replace("— всё верно, мяу! 🎉", "— all correct, meow! 🎉").replace("— можно улучшить", "— room to improve").replace(/· попыток: (\d+)/, "· attempts: $1") : "")],
  [/^Разбор ответов \((\d+) ошиб(?:ка|ки|ок) из (\d+)\)$/, m => `Answer review (${m[1]} ${i18nPlural(m[1], "mistake", "mistakes")} of ${m[2]})`],
  [/^Слова: (\d+)$/, m => `Words: ${m[1]}`],
  [/^Отмечено: $/, () => "Marked: "],
  [/^Отмечено: (\d+)$/, m => `Marked: ${m[1]}`],
  [/^Отобрано на тренировку: (\d+)$/, m => `Picked to practise: ${m[1]}`],
  [/^Отметь галочками слова, которые хочешь отработать, — потом «Тренировать отмеченные»\.$/,
    () => "Tick the words you want to drill, then press \"Practise the marked ones\"."],
  [/^Только отмеченные в словаре слова — (\d+) сло(?:во|ва|в)$/, m => `Only the words you marked — ${m[1]} ${i18nPlural(m[1], "word", "words")}`],
  [/^Тренируем твой словарь \((\d+) слов\) \+ слова уровня ([ABC][12])$/, m => `Practising your dictionary (${m[1]} words) + level ${m[2]} words`],
  [/^Словарь пуст — тренируем слова уровня ([ABC][12])$/, m => `Dictionary is empty — practising level ${m[1]} words`],
  [/^(\d+) слов уровня ([ABC][12]) — карточки с картинкой и звуком\. Завтра они сами ждут тебя на главной\.$/,
    m => `${m[1]} level-${m[2]} words — flashcards with pictures and audio. Tomorrow they'll be waiting for you on the home screen.`],
  [/^Повторять пока нечего — возьмём слова уровня ([ABC][12])\. До цели дня ещё (\d+) очков?\.?$/,
    m => `Nothing to review yet — let's take level ${m[1]} words. ${m[2]} points to today's goal.`],
  [/^как по тесту — ([ABC][12])$/, m => `as tested — ${m[1]}`],
  [/^([ABC][12]) — (.+)$/, m => I18N_EN[m[2]] ? `${m[1]} — ${I18N_EN[m[2]]}` : null],
  [/^По тесту у тебя ([ABC][12])\. Это влияет только на новые слова: словарь и повторения остаются твои\.$/,
    m => `Your tested level is ${m[1]}. This only affects new words: your dictionary and reviews stay yours.`],
  [/^(\d+) (задание|задания|заданий)$/, m => `${m[1]} ${i18nPlural(m[1], "task", "tasks")}`],
  [/^(\d+) (буква|буквы|букв)$/, m => `${m[1]} ${i18nPlural(m[1], "letter", "letters")}`],
  [/^· (\d+) (буква|буквы|букв)$/, m => `· ${m[1]} ${i18nPlural(m[1], "letter", "letters")}`],
  [/^до (\d{4}-\d{2}-\d{2})$/, m => `due ${m[1]}`],
  [/^(Викторина|Впиши слово|Соедини пары|Задание) · (\d+) (вопрос|вопроса|вопросов|пара|пары|пар)$/,
    m => `${I18N_EN[m[1]] || m[1]} · ${m[2]} ${/пар/.test(m[3]) ? i18nPlural(m[2], "pair", "pairs") : i18nPlural(m[2], "question", "questions")}`],
  [/^Прокликано \((\d+) из (\d+)\) — не засчитано\..*$/,
    m => `Clicked through (${m[1]} of ${m[2]}) — not counted. Take it slow and read the questions: your tutor sees both time and attempts.`],
  [/^Грамматика · выбери тему, 8 вопросов с разбором$/, () => "Grammar · pick a topic, 8 questions with explanations"],
  [/^Словообразование · 8 заданий формата ОГЭ$/, () => "Word formation · 8 exam-style tasks"],
  [/^неверных букв: (\d+)(.*)$/i, m => `Wrong letters: ${m[1]}` + (m[2] || "").replace(/пустых клеток: (\d+)/, "empty cells: $1")],
  [/^Пустых клеток: (\d+)\.$/, m => `Empty cells: ${m[1]}.`],
];

function trText(raw) {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;
  if (I18N_EN[t]) return I18N_EN[t];
  for (const [re, fn] of I18N_RX) {
    const m = t.match(re);
    if (m) {
      const out = fn(m);
      if (out) return out;
    }
  }
  return null;
}

/* ==========================================================================
   Проход по DOM. Текстовые узлы — перевод с сохранением крайних пробелов;
   атрибуты placeholder / aria-label / title / alt — по словарю.
   ========================================================================== */
const I18N_ATTRS = ["placeholder", "aria-label", "title", "alt", "data-chip"];

function i18nSkip(el) {
  // Реплики кота и живые тексты не трогаем; скрипты и стили — тем более
  return el.closest && el.closest("#chat-box, script, style, .w-ru, .d-ru");
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    const parent = root.parentElement;
    if (parent && i18nSkip(parent)) return;
    const out = trText(root.nodeValue || "");
    if (out) {
      const v = root.nodeValue;
      root.nodeValue = v.replace(v.trim(), out);
    }
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE || i18nSkip(root)) return;
  for (const a of I18N_ATTRS) {
    const v = root.getAttribute && root.getAttribute(a);
    if (v) {
      const out = trText(v);
      if (out) root.setAttribute(a, out);
    }
  }
  // childNodes копируем: перевод textContent меняет живой список
  [...root.childNodes].forEach(translateTree);
}

function mountLangButton() {
  if (document.getElementById("lang-btn")) return;
  // Кнопка нужна только на сайте ученика — язык выбирает ученик
  if (!document.getElementById("topbar")) return;
  const slot = document.querySelector(".user-chip") ||
               document.querySelector(".topbar-inner");
  if (!slot) return;
  const btn = document.createElement("button");
  btn.id = "lang-btn";
  btn.type = "button";
  btn.className = "lang-btn";
  const en = uiLang() === "en";
  btn.textContent = en ? "РУ" : "EN";
  btn.setAttribute("aria-label", en ? "Переключить интерфейс на русский" : "Switch the interface to English");
  btn.title = btn.getAttribute("aria-label");
  btn.addEventListener("click", () => {
    try { localStorage.setItem(LANG_KEY, en ? "ru" : "en"); } catch (e) {}
    // Перезагрузка, а не живая перекраска: перевод обратно на русский
    // потребовал бы помнить оригинал каждого узла, а свежая загрузка
    // даёт гарантированно целую страницу на выбранном языке.
    location.reload();
  });
  const theme = document.getElementById("theme-btn");
  if (theme) theme.insertAdjacentElement("afterend", btn);
  else slot.prepend(btn);
}

document.addEventListener("DOMContentLoaded", () => {
  mountLangButton();
  if (uiLang() !== "en") return;
  document.documentElement.lang = "en";
  translateTree(document.body);
  // Всё, что дорисовывается на ходу (экраны, карточки, упражнения),
  // переводится по мере появления. Наши правки текста внутри узлов
  // characterData-мутациями сюда не попадают — цикла нет.
  new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(translateTree);
  }).observe(document.body, { childList: true, subtree: true });
});
