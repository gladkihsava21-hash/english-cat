"""Сборка одной фразы: определение, пример, проверка перевода, контентный фильтр.

Отличия от pipeline.py (там одно слово) — три, и все важные.

  1. ПОИСК ПРИМЕРА. Tatoeba ищет по подстроке, и запрос из двух слов даёт
     мусор («give» + «up» где угодно). Поэтому сначала спрашиваем точную
     фразу в кавычках — Tatoeba понимает такой запрос и отдаёт предложения,
     где фраза стоит целиком. Если ничего не нашлось, идём без кавычек и
     проверяем предложение своим регулярным выражением: у фразового глагола
     дополнение может стоять ВНУТРИ («turn the light off»), у коллокации —
     прилагательное («make an important decision»).

  2. ФИЛЬТР ЗАГОЛОВКА ПОСЛОВНЫЙ. acceptable_headword() из filters.py проверяет
     слово целиком, а «bite the bullet» — это три слова, и опасно из них одно.
     Проверяем каждое.

  3. ПЕРЕВОД НЕ БЕРЁМ У МАШИНЫ, А СВЕРЯЕМ. Русский перевод фразы приходит из
     phrasedata.py (написан руками). Wiktionary используется как независимая
     проверка: совпал — хорошо, разошёлся — строчка уходит в отчёт на глаза.
     Причина в том, что у фразового глагола перевод зависит от значения, а
     значений у него обычно 3–6, и робот выбирает первое.
"""

import re
import urllib.parse

from . import filters, tatoeba, wiktionary

QUOTED_URL = "https://tatoeba.org/en/api_v0/search?from=eng&to=rus&query=%s&limit=%d"

# Слоты-заполнители в словарной форме фразы. В живом предложении на их месте
# стоит любое местоимение или имя, поэтому в регулярном выражении они широкие.
SLOTS = {
    "someone": r"(?:\w+|\w+\s+\w+)",
    "someone's": r"(?:\w+'s|my|your|his|her|its|our|their)",
    "somebody": r"(?:\w+|\w+\s+\w+)",
    "one's": r"(?:\w+'s|my|your|his|her|its|our|their)",
    "your": r"(?:my|your|his|her|its|our|their|the)",
    "yourself": r"(?:myself|yourself|himself|herself|itself|ourselves|themselves)",
    "my": r"(?:my|your|his|her|its|our|their|the)",
    "you": r"(?:i|you|he|she|we|they|\w+)",
}

ARTICLES = {"a", "an", "the"}
DETERMINERS = "a|an|the|my|your|his|her|its|our|their|this|that"

# Между частями разделяемого фразового глагола влезает дополнение
# («turn the light off», «put your coat on»). Три слова — потолок: дальше
# начинаются случайные совпадения.
MAX_GAP_WORDS = 3

# Неправильные глаголы. Без них половина примеров теряется молча: Tatoeba
# отдаёт «She gave up smoking», а суффиксный генератор форм из tatoeba.py
# знает только give/gives/gived/giving — и предложение отбрасывается как
# «фразы нет в предложении». На фразах это заметнее, чем на словах: у фразы
# подходящих предложений и так единицы.
IRREGULAR = {}
for _base, _forms in {
    "be": "am is are was were been being",
    "bear": "bore borne bears bearing",
    "beat": "beat beaten beats beating",
    "bend": "bent bends bending",
    "bite": "bit bitten bites biting",
    "blow": "blew blown blows blowing",
    "break": "broke broken breaks breaking",
    "bring": "brought brings bringing",
    "build": "built builds building",
    "burn": "burnt burned burns burning",
    "buy": "bought buys buying",
    "catch": "caught catches catching",
    "come": "came comes coming",
    "cost": "cost costs costing",
    "cut": "cut cuts cutting",
    "deal": "dealt deals dealing",
    "do": "did done does doing",
    "draw": "drew drawn draws drawing",
    "drive": "drove driven drives driving",
    "eat": "ate eaten eats eating",
    "fall": "fell fallen falls falling",
    "feed": "fed feeds feeding",
    "feel": "felt feels feeling",
    "find": "found finds finding",
    "fly": "flew flown flies flying",
    "forget": "forgot forgotten forgets forgetting",
    "get": "got gotten gets getting",
    "give": "gave given gives giving",
    "go": "went gone goes going",
    "grow": "grew grown grows growing",
    "hang": "hung hangs hanging",
    "have": "had has having",
    "hear": "heard hears hearing",
    "hide": "hid hidden hides hiding",
    "hit": "hit hits hitting",
    "hold": "held holds holding",
    "keep": "kept keeps keeping",
    "know": "knew known knows knowing",
    "lay": "laid lays laying",
    "lead": "led leads leading",
    "learn": "learnt learned learns learning",
    "leave": "left leaves leaving",
    "lend": "lent lends lending",
    "let": "let lets letting",
    "lie": "lay lain lies lying",
    "lose": "lost loses losing",
    "make": "made makes making",
    "mean": "meant means meaning",
    "meet": "met meets meeting",
    "pay": "paid pays paying",
    "put": "put puts putting",
    "read": "read reads reading",
    "ride": "rode ridden rides riding",
    "ring": "rang rung rings ringing",
    "rise": "rose risen rises rising",
    "run": "ran runs running",
    "say": "said says saying",
    "see": "saw seen sees seeing",
    "sell": "sold sells selling",
    "send": "sent sends sending",
    "set": "set sets setting",
    "shake": "shook shaken shakes shaking",
    "shed": "shed sheds shedding",
    "sit": "sat sits sitting",
    "sleep": "slept sleeps sleeping",
    "speak": "spoke spoken speaks speaking",
    "spell": "spelt spelled spells spelling",
    "spend": "spent spends spending",
    "spill": "spilt spilled spills spilling",
    "stand": "stood stands standing",
    "stick": "stuck sticks sticking",
    "strike": "struck strikes striking",
    "sweep": "swept sweeps sweeping",
    "swim": "swam swum swims swimming",
    "take": "took taken takes taking",
    "teach": "taught teaches teaching",
    "tell": "told tells telling",
    "think": "thought thinks thinking",
    "throw": "threw thrown throws throwing",
    "understand": "understood understands understanding",
    "wake": "woke woken wakes waking",
    "wear": "wore worn wears wearing",
    "win": "won wins winning",
    "wind": "wound winds winding",
    "write": "wrote written writes writing",
}.items():
    IRREGULAR[_base] = set(_forms.split()) | {_base}


def parts(phrase):
    """Куски для упражнения «собери фразу»."""
    return phrase.split()


def _word_forms(word):
    """Формы глагола, которые считаем той же фразой."""
    return tatoeba.inflections(word) | IRREGULAR.get(word, set())


def _alt(forms):
    return "(?:%s)" % "|".join(re.escape(f) for f in sorted(forms, key=len, reverse=True))


def phrase_regex(phrase, loose=True):
    """Регулярное выражение, узнающее фразу в живом предложении.

    loose=False — фраза стоит слово в слово (меняться может только форма
    первого слова). loose=True — допускаются три отклонения, все обычные для
    живой речи:
        артикль сменился или пропал  — take a photo / took photos;
        существительное во мн. числе — take notes / make decisions;
        внутрь встало дополнение     — turn off / turn the light off.
    """
    tokens = phrase.lower().split()
    last_index = len(tokens) - 1

    chunks = []
    for i, tok in enumerate(tokens):
        if i and last_index and tok in ARTICLES and loose:
            # Артикль не требуем вовсе: он либо сменится на притяжательное
            # местоимение, либо исчезнет во множественном числе. Его место
            # займёт зазор между соседями.
            continue
        if tok in SLOTS:
            chunks.append(SLOTS[tok])
        elif i == 0 and tok in ARTICLES:
            chunks.append("(?:a|an|the)")
        elif i == 0:
            chunks.append(_alt(_word_forms(tok)))
        elif i == last_index and loose:
            chunks.append(_alt({tok, tok + "s", tok + "es"}))
        else:
            chunks.append(re.escape(tok))

    # Зазор тем меньше, чем длиннее фраза: у двусловного фразового глагола
    # дополнение внутри — норма, а у длинной идиомы всякая вставка означает,
    # что мы поймали не её, а случайное совпадение слов.
    if not loose:
        gap = r"\s+"
    elif len(chunks) <= 2:
        gap = r"(?:\s+[\w']+){0,%d}\s+" % MAX_GAP_WORDS
    elif len(chunks) == 3:
        gap = r"(?:\s+[\w']+){0,2}\s+"
    else:
        gap = r"(?:\s+[\w']+){0,1}\s+"
    return re.compile(r"\b" + gap.join(chunks) + r"\b", re.I)


def phrase_in(phrase, sentence, loose=True):
    return phrase_regex(phrase, loose).search(sentence or "") is not None


def own_words(phrase):
    """Слова самой фразы: их нельзя блокировать в примере — иначе у фразы
    «play with fire» примера не найдётся никогда."""
    return {w.strip("'s") for w in re.findall(r"[a-z']+", phrase.lower())}


def blocked_tokens(phrase):
    """Слова фразы, которых не должно быть в детском словаре.

    Возвращает список (слово, причина). Пустой список = фраза проходит.
    «bite the bullet» отсеивается здесь: bullet в HEADWORD_BLOCK.
    """
    bad = []
    for tok in re.findall(r"[a-z]+", phrase.lower()):
        if tok in filters.HEADWORD_BLOCK:
            bad.append(tok)
            continue
        for suffix in ("s", "es", "ed", "ing", "d"):
            if tok.endswith(suffix) and tok[: -len(suffix)] in filters.HEADWORD_BLOCK:
                bad.append(tok)
                break
    return bad


def guard_for(phrase):
    """Фильтр примеров, из которого исключены слова самой фразы."""
    return filters.SentenceGuard(phrase.split()[0], own_words(phrase))


# Русские основы из filters.SENTENCE_BLOCK_RU сравниваются там по ПОДСТРОКЕ.
# На словах это терпимо, на фразах — нет: у фразы годных предложений единицы,
# и каждое ложное срабатывание стоит карточке примера. Замеры по кэшу Tatoeba:
#     раб    → «работала», «работа»        98 предложений
#     рак    → «завтракает», «практика»    52
#     ад     → «гладить», «награда»        23
#     ром    → «компромисса»               16
#     пыта   → «пытаюсь»                    6
#     вор    → «говорить»                   4
# Поэтому здесь тот же СПИСОК основ, но сравнение — с начала слова и с
# ограничением на длину окончания. Список правил не трогаем: он общий с
# build_words.py, и разъезжаться им нельзя.
MAX_RU_ENDING = 4

# Слова, которые проходят и это правило, оставаясь безобидными. Список
# короткий и пополняется по факту: держать его в голове нельзя, а искать
# причину «почему у фразы нет примера» через месяц — долго.
RU_INNOCENT = tuple("""
работ рабоч адрес адвокат адмирал ворот ворон воробь район ранее богат
куриц курин виноват виноград команд комар комод черта черты чертеж
пытает пытаешь пытаюсь пытают пытал пыталась пытался ромашк ракушк
""".split())


def ru_blocked(guard, ru):
    """Русская половина детского фильтра, но по началу слова."""
    low = (ru or "").lower().replace("ё", "е")
    words = re.findall(r"[а-я]+", low)
    for word in words:
        if word.startswith(RU_INNOCENT):
            continue
        for stem in guard.ru_stems:
            stem = stem.replace("ё", "е")
            if word.startswith(stem) and len(word) - len(stem) <= MAX_RU_ENDING:
                return "не для детей (в переводе): %s" % stem
    return None


def _pairs_from(payload):
    for item in (payload or {}).get("results") or []:
        en = item.get("text")
        for group in item.get("translations") or []:
            for tr in group or []:
                if (tr.get("lang") or "rus") != "rus":
                    continue
                if tr.get("text"):
                    yield en, tr["text"]


_RU_TAIL = re.compile(r"\s*\([^)]*\)")


def translation_confirmed(ours, exr):
    """Русский перевод примера подтверждает НАШ перевод фразы?

    Зачем. Точное совпадение фразы в предложении ещё не значит, что оно про
    нужное значение: «Wind up the clock» — это «заведи часы», а не «в итоге
    оказаться»; «Turn into this alley» — «сверни в переулок», а не
    «превратиться в». Отличить одно от другого можно только по переводу.

    Сравнение по первым четырём буквам: русский изменяется суффиксально, и
    «сдаваться» должно узнаваться в «Сдавайся». Более длинная основа этого
    уже не ловит, более короткая начинает совпадать со всем подряд.
    """
    if not ours or not exr:
        return False
    words = [w for w in re.findall(r"[а-яё]+", _RU_TAIL.sub("", ours).lower().replace("ё", "е"))
             if len(w) >= 4 and w not in _STOP_RU]
    if not words:
        return False
    stems = {w[:4] for w in words}
    for word in re.findall(r"[а-яё]+", exr.lower().replace("ё", "е")):
        if word[:4] in stems:
            return True
    return False


def _sentence_ok(phrase, en, ru, guard, loose, ours=None):
    """Пригодность пары. Повторяет требования tatoeba.score_sentence, но
    проверяет ФРАЗУ, а не слово."""
    en = (en or "").strip()
    ru = (ru or "").strip()
    if not en or not ru:
        return None, "нет перевода"
    if not (tatoeba.MIN_EN <= len(en) <= tatoeba.MAX_EN):
        return None, "длина английского предложения"
    if len(ru) > tatoeba.MAX_RU:
        return None, "длина русского перевода"
    if not tatoeba._CYR.search(ru):
        return None, "перевод не по-русски"
    if tatoeba._LAT.search(filters.TATOEBA_NAMES.sub("", ru)):
        return None, "латиница в переводе"
    if tatoeba._CYR.search(en):
        return None, "кириллица в английском"
    if not en[0].isupper() or not en.endswith((".", "!", "?")):
        return None, "предложение не целое"
    if en.count('"') % 2 or "..." in en:
        return None, "обрывок предложения"
    if not phrase_in(phrase, en, loose):
        return None, "фразы нет в предложении"
    # Английская половина фильтра — общая с построением слов, как есть.
    blocked = guard.check(en, "")
    if blocked:
        return None, blocked
    # Русская — тот же список основ, но по началу слова (см. ru_blocked).
    blocked = ru_blocked(guard, ru)
    if blocked:
        return None, blocked

    score = 0.0
    if translation_confirmed(ours, ru):
        # Решающий признак: перевод примера говорит о том же, что и перевод
        # фразы. Вес выше всех остальных вместе взятых — короткое красивое
        # предложение не про то значение хуже длинного, но про то.
        score += 8.0
    if phrase_in(phrase, en, loose=False):
        score += 3.0                                   # фраза слово в слово
    score += max(0.0, (70 - len(en)) / 30.0)           # короче — понятнее
    if not filters.TATOEBA_NAMES.search(en):
        score += 1.5                                   # без Тома и Мэри нагляднее
    if en.endswith("."):
        score += 0.5
    if len(re.findall(r"[а-яёА-ЯЁ]+", ru)) >= 2:
        score += 0.5
    return score, None


def fetch_example(fetcher, phrase, guard, min_interval, ours=None, limit=20):
    """Пример с переводом. Сначала точная фраза, потом свободный поиск.

    Возвращает (пара, причина). В паре есть поле confirmed: подтверждает ли
    русский перевод примера наш перевод фразы. Неподтверждённый пример не
    выбрасывается (иначе половина карточек останется без примера), но в
    отчёт попадает — вычитывать в первую очередь надо именно их.
    """
    attempts = [('"%s"' % phrase, False), (phrase, True)]
    last_reason = "нет предложений в Tatoeba"
    fallback = None
    for query, loose in attempts:
        url = QUOTED_URL % (urllib.parse.quote(query), limit)
        res = fetcher.get(url, "tatoeba", key="tatp:%s:%d" % (query, limit), min_interval=min_interval)
        if not res.ok:
            last_reason = "Tatoeba недоступна (%s)" % (res.error or res.status)
            continue
        payload = res.json()
        if not payload:
            last_reason = "Tatoeba вернула не JSON"
            continue
        best, best_score = None, -1.0
        for en, ru in _pairs_from(payload):
            score, reason = _sentence_ok(phrase, en, ru, guard, loose, ours)
            if score is None:
                last_reason = reason
                continue
            if score > best_score:
                best, best_score = {"ex": en.strip(), "exr": ru.strip(),
                                    "confirmed": translation_confirmed(ours, ru)}, score
        if best and best["confirmed"]:
            return best, None
        if best and fallback is None:
            fallback = best          # точный поиск не подтвердился — пробуем свободный
    if fallback:
        return fallback, None
    return None, last_reason


# --- определение и сверка перевода ---------------------------------------

def fetch_definition(fetcher, phrase, min_interval, max_len=110):
    """Английское определение фразы из Wiktionary. Для коллокаций статьи чаще
    всего нет — тогда None, и берётся запасное из phrasedata."""
    payload, err = wiktionary.fetch_definition(fetcher, phrase, min_interval)
    if err:
        return None, err
    definition, why = wiktionary.pick_definition(payload, "Verb", min_len=10, max_len=max_len)
    if not definition:
        return None, why
    return definition["text"], None


def russian_variants(fetcher, phrase, min_interval):
    """Все русские переводы фразы из Wiktionary — для сверки с нашим."""
    entry, err = wiktionary.load_entry(fetcher, phrase, min_interval)
    if err or not entry:
        return [], err or "нет статьи"
    out = []
    for sense in entry.senses:
        for term in sense["ru"]:
            if term not in out:
                out.append(term)
    return out, None


_STOP_RU = {"что", "кто", "как", "это", "себя", "свой", "своё", "свои", "быть", "чей", "кого",
            "для", "или", "его", "её", "them", "the"}


def _stems(text):
    """Основы русских слов для грубого сравнения смыслов.

    Порог в 3 буквы, а не в 4: без него «раз в сто лет» и «раз в сто лет» не
    совпадали сами с собой — все значимые слова там короткие.
    """
    words = [w for w in re.findall(r"[а-яё]+", (text or "").lower().replace("ё", "е"))
             if len(w) >= 3 and w not in _STOP_RU]
    # Обрезаем до четырёх букв, а не «на два символа от конца»: иначе
    # «убирать» даёт основу «убира», а «убираться» — «убирать», и одно и то
    # же значение считается расхождением.
    return {w[:4] for w in words}


_STOP_EN = set("""a an the of to in on for with and or as at by from is are be been being it its
this that these those which who whom whose what not no any some one someone something
used usually especially often typically etc such into out up down over under about than
then so if when while can may might will would your yourself their his her you do does
did make made get got have has had""".split())

_EN_SUFFIX = ("ing", "es", "ed", "s")


def _en_stems(text):
    out = set()
    for word in re.findall(r"[a-z]+", (text or "").lower()):
        if len(word) < 3 or word in _STOP_EN:
            continue
        for suffix in _EN_SUFFIX:
            if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                word = word[: -len(suffix)]
                break
        out.add(word[:5])
    return out


def definition_agrees(ours, theirs):
    """Определение Wiktionary про то же значение, что и наше?

    Проверка нужна из-за многозначности: у «get up» Wiktionary первым отдаёт
    «to move in an upward direction» (это про подъём в гору), а нам нужно
    «встать с постели». Взять первое определение вслепую — получить карточку,
    где перевод и определение говорят о разном.
    """
    if not ours or not theirs:
        return None
    mine, alien = _en_stems(ours), _en_stems(theirs)
    if not mine or not alien:
        return None
    return bool(mine & alien)


def translation_agrees(ours, variants):
    """Есть ли среди переводов Wiktionary тот же смысл, что у нашего.

    Сравниваем по основам: «сдаваться» и «сдавать» — одно и то же, «взлетать»
    и «снимать» — разное. Это не доказательство правильности, а сигнал: где
    расходится, туда надо посмотреть глазами.
    """
    if not variants:
        return None
    ours_stems = _stems(ours)
    if not ours_stems:
        return None
    for variant in variants:
        if _stems(variant) & ours_stems:
            return True
    return False
