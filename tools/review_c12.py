#!/usr/bin/env python3
"""Триаж качества словаря C1/C2 — НИЧЕГО не меняет, только читает и пишет отчёт.

Зачем. Методист (Ирина, 17–18.09.2026) пожаловалась на слова уровня C1/C2:
«конвейер, лонжитюд, департментал», «Dialysis structural medical procedure…».
Разбор таких слов руками по всему уровню не поднять — C1/C2 это больше
половины словаря. Скрипт выставляет каждому слову «скор подозрительности»
по простым эвристикам и раскладывает слова по убыванию скора: методист
смотрит топ, а не шесть тысяч строк.

Запуск:

    python3 tools/review_c12.py [--strict 5] [--soft 3] [--top 50]

Читает:
  * js/words.js — источник истины; если его нет, разрезанные
    js/words-C1.js / js/words-C2.js (их пишет tools/split-words.py);
  * js/verbs.js — глаголы во всех школьных формах (для «пример-обрывок»);
  * js/images.js (WORD_ART) и js/word-photos.js (WORD_PHOTOS) — есть ли
    у слова эмодзи-метафора или фотография.

Пишет: tools/out/c12-review.md. Словарь не трогает.
"""

import argparse
import datetime
import os
import re
import sys

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
OUT_MD = os.path.join(TOOLS_DIR, "out", "c12-review.md")

# --- разбор js-объявлений -------------------------------------------------

# Уровневые массивы в js/words.js: "  C1: [". В разрезанных файлах уровень
# берём из имени файла (words-C1.js), там другой заголовок.
LEVEL_RE = re.compile(r"^\s{2}([A-C][12]):\s*\[", re.M)
# Записи — плоские объекты без вложенных скобок, поэтому \{[^{}]*\} надёжен.
REC_RE = re.compile(r"\{[^{}]*\}", re.S)
FIELD_RE = r'%s:\s*"((?:[^"\\]|\\.)*)"'

CYR = re.compile(r"[а-яёА-ЯЁ]")
LAT = re.compile(r"[A-Za-z]")
TOK_RE = re.compile(r"[a-z']+")


def unescape(s):
    # JS-экранирование внутри двойных кавычек: нам нужен читаемый текст,
    # а не точное обратное преобразование.
    return s.replace('\\"', '"').replace("\\'", "'").replace("\\\\", "\\")


def parse_fields(block):
    rec = {}
    for key in ("w", "t", "ex", "exr", "def", "cat"):
        m = re.search(FIELD_RE % key, block)
        rec[key] = unescape(m.group(1)) if m else ""
    return rec


def parse_records(chunk):
    # Пустые скобки {} из заголовка разрезанных файлов
    # («window.WORDS || {}») дают запись-пустышку — отсекаем по полю w.
    return [rec for rec in (parse_fields(b.group(0)) for b in REC_RE.finditer(chunk))
            if rec["w"]]


def load_words():
    """Возвращает {уровень: [записи]} из js/words.js или разрезанных файлов."""
    whole = os.path.join(PROJECT_DIR, "js", "words.js")
    if os.path.exists(whole):
        with open(whole, "r", encoding="utf-8") as fh:
            source = fh.read()
        bounds = [(m.group(1), m.start()) for m in LEVEL_RE.finditer(source)]
        bounds.append(("__end__", len(source)))
        levels = {}
        for i in range(len(bounds) - 1):
            level, start = bounds[i]
            chunk = source[start:bounds[i + 1][1]]
            levels[level] = parse_records(chunk)
        return levels, "js/words.js"
    levels = {}
    for level in ("A1", "A2", "B1", "B2", "C1", "C2"):
        path = os.path.join(PROJECT_DIR, "js", "words-%s.js" % level)
        if not os.path.exists(path):
            continue
        with open(path, "r", encoding="utf-8") as fh:
            levels[level] = parse_records(fh.read())
    if not levels:
        raise RuntimeError("не найден ни js/words.js, ни js/words-*.js")
    return levels, "js/words-*.js"


def load_verb_forms():
    """js/verbs.js: const EN_VERBS = new Set(`…`) — формы через пробел."""
    path = os.path.join(PROJECT_DIR, "js", "verbs.js")
    verbs = set()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            source = fh.read()
        m = re.search(r"EN_VERBS\s*=\s*new Set\(`([^`]*)`", source, re.S)
        if m:
            verbs.update(m.group(1).split())
    # Служебные и самые частые — те, что js/grammarcheck.js держит рядом
    # (GC_COMMON_VERBS, aux из правила 15). js/verbs.js собирается из
    # переводов словаря и be/модальных в нём может не оказаться.
    verbs.update("""
        am is are was were be been being have has had having do does did doing
        done will would can could shall should may might must ought
        go goes went gone going get gets got getting make makes made making
        take takes took taken taking come comes came coming see sees saw seen
        seeing know knows knew known knowing think thinks thought thinking
        say says said saying tell tells told telling give gives gave given
        giving find finds found finding leave leaves left leaving feel feels
        felt feeling put puts putting mean means meant meaning keep keeps kept
        keeping let lets letting begin begins began begun beginning
    """.split())
    # Сокращения: токенизатор [a-z']+ не режет апостроф, поэтому "I'm a
    # witch" без этого списка выглядело предложением без глагола.
    verbs.update("""
        i'm you're we're they're he's she's it's that's there's what's who's
        where's here's life's
        i've you've we've they've i'll you'll we'll they'll he'll she'll it'll
        i'd you'd he'd she'd we'd they'd it'd let's ain't
        don't doesn't didn't isn't aren't wasn't weren't can't couldn't won't
        wouldn't shouldn't hasn't haven't hadn't mustn't
    """.split())
    # Частые глаголы, которых нет в js/verbs.js: он собран из переводов
    # словаря, а «miss» там переведён существительным («промах»), «separate»
    # — прилагательным. js/grammarcheck.js подстрахован GC_COMMON_VERBS,
    # здесь страховка — эти основы плюс сгенерированные формы.
    extra_stems = """
        miss fit escape lie lay separate sculpt abhor bore chase cheat clap
        count cover cross dance dress drop earn end fail fall feed fight fill
        fish fix fly follow fool form fry grab guess hang hate heat hide hit
        hold hop hug hunt hurry joke jump kick kiss knock laugh lick lift
        list load lock march mark mate melt mix nail name note pack park pass
        pat pause pick plan plant point pour pray press pull push race rain
        reach rest ride ring roll row rub sail shake shout sign sip sit ski
        slip smell smile smoke snow sound spin spot stand star stay step stir
        stretch strike sweep swim swing tap taste tear throw tie tip touch
        trip trust try type vote wait wash wave wear wipe wish worry yell
        plug pump listen balance fire finish squeak bounce float glow shine
        whisper roar scream splash crawl leap land march rain snow float
        please graze ban crow spin drip praise slow dye iron suit approach
        notice howl glue sand clear bump
    """.split()
    for stem in extra_stems:
        verbs.add(stem)
        verbs.add(stem + "s")
        verbs.add(stem + "ed")
        verbs.add(stem + "ing")
        verbs.add(stem + "es")
        if stem.endswith("e"):
            verbs.add(stem[:-1] + "ing")
            verbs.add(stem[:-1] + "ed")
    verbs.update("""
        lay lain lying lit lost rode ridden rang rung sank sunk sang sung
        shook shaken shot slid slid slit spoke spoken stole stolen swam swum
        swung spun taught tore torn threw thrown woke woken wore worn wrote
        written
    """.split())
    return verbs


def load_art():
    """Эмодзи-метафоры (WORD_ART в js/images.js) и фото (WORD_PHOTOS)."""
    art, photos = set(), set()
    path = os.path.join(PROJECT_DIR, "js", "images.js")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            source = fh.read()
        m = re.search(r"WORD_ART\s*=\s*\{(.*?)\n\};", source, re.S)
        if m:
            art.update(k.lower() for k in re.findall(r'"([^"]+)"\s*:', m.group(1)))
    path = os.path.join(PROJECT_DIR, "js", "word-photos.js")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            photos.update(k.lower() for k in re.findall(r'"([^"]+)"\s*:', fh.read()))
    return art, photos


# --- эвристики --------------------------------------------------------------

# Технические/медицинские/латинские хвосты. Список короткий осознанно:
# общие суффиксы (-tion, -ism, -ity) есть у половины взрослого английского,
# ими методиста не удивить — ловим то, что школьнику почти не нужно.
# Пара (суффикс, минимальная длина слова): без ограничения «-oma» ловил
# «aroma», а не только carcinoma/lymphoma.
TECH_SUFFIXES = (
    ("osis", 0), ("ectomy", 0), ("itis", 0), ("ology", 0), ("ologist", 0),
    ("ological", 0), ("itude", 0), ("esis", 0), ("oma", 6), ("opathy", 0),
    ("aemia", 0), ("emia", 0), ("arium", 0), ("iform", 0),
)

WEIGHT_TECH = 3        # технический/медицинский суффикс
WEIGHT_LONG_T = 2      # перевод длиннее 60 знаков — почти всегда калька из викисловаря
WEIGHT_LAT_T = 2       # латиница в переводе — перевод не переведён
WEIGHT_NO_EX = 2       # нет примера — карточка без контекста
WEIGHT_NO_VERB = 2     # пример без глагольной формы — обрывок определения
WEIGHT_LONG_W = 1      # слово длиннее 12 букв
WEIGHT_RARE = 1        # не встречается в примерах A1–B2 — вероятно, редкое

TRANSLATION_MAX = 60
WORD_LEN_MAX = 12

# Догадки по хвостам слов — упрощённый перенос правила 15 из
# js/grammarcheck.js: -ed/-ing не в конце фразы почти всегда глагол,
# точные формы из списка — в любом месте. Цель здесь не «поймать ошибку
# ученика», а «найти обрывок вида „A juxtaposition of old and new“»,
# поэтому незнакомые слова нас не останавливают (в grammarcheck — наоборот).
def example_has_verb(ex, verbs):
    toks = TOK_RE.findall(ex.lower().replace("’", "'"))
    short = len(toks) < 5
    for i, tok in enumerate(toks):
        if tok in verbs:
            return True
        # В коротких примерах («Mia sculpted clay.») глагол — обычно второе
        # слово, и ограничение «не в хвосте фразы» из правила 15 его режет;
        # для триажа важнее не завалить список ложными обрывками.
        early = i <= len(toks) - 3
        if (early or short) and len(tok) > 4 and (tok.endswith("ed") or tok.endswith("ing")):
            return True
    return False


def review_word(rec, level, verbs, lower_tokens):
    reasons = []
    score = 0
    w = rec["w"]
    wl = w.lower()
    if any(wl.endswith(sfx) and len(wl) >= max(min_len, len(sfx) + 1)
           for sfx, min_len in TECH_SUFFIXES):
        reasons.append("технический/медицинский суффикс")
        score += WEIGHT_TECH
    if len(w) > WORD_LEN_MAX:
        reasons.append("слово длиннее %d букв" % WORD_LEN_MAX)
        score += WEIGHT_LONG_W
    t = rec["t"]
    if len(t) > TRANSLATION_MAX:
        reasons.append("перевод длиннее %d знаков (%d)" % (TRANSLATION_MAX, len(t)))
        score += WEIGHT_LONG_T
    if LAT.search(t):
        reasons.append("латиница в переводе")
        score += WEIGHT_LAT_T
    if not rec["ex"].strip():
        reasons.append("нет примера")
        score += WEIGHT_NO_EX
    # Вопросы и восклицания не проверяем — как и правило 15 в grammarcheck.js:
    # «Where's my lantern?» законно обходится без глагола из нашего списка.
    elif not rec["ex"].rstrip().endswith(("?", "!")) \
            and not example_has_verb(rec["ex"], verbs):
        reasons.append("пример без глагола (обрывок?)")
        score += WEIGHT_NO_VERB
    # Редкость: слово ни в одной форме не встречается в примерах A1–B2.
    # Сигнал слабый (редкость сама по себе не порок), поэтому вес минимальный.
    forms = {wl, wl + "s", wl + "es", wl + "ed", wl + "d", wl + "ing"}
    if not (forms & lower_tokens):
        reasons.append("не встречается в примерах A1–B2")
        score += WEIGHT_RARE
    return score, reasons


# --- отчёт ------------------------------------------------------------------

def md_escape(s):
    return s.replace("|", "\\|").replace("\n", " ")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--strict", type=int, default=5,
                    help="строгий порог скора (по умолчанию 5)")
    ap.add_argument("--soft", type=int, default=3,
                    help="мягкий порог скора (по умолчанию 3)")
    ap.add_argument("--top", type=int, default=50,
                    help="сколько строк в топе для глазомера (по умолчанию 50)")
    args = ap.parse_args()

    levels, source_desc = load_words()
    verbs = load_verb_forms()
    art, photos = load_art()

    # Токены примеров A1–B2 — база для эвристики редкости.
    lower_tokens = set()
    for level in ("A1", "A2", "B1", "B2"):
        for rec in levels.get(level, []):
            lower_tokens.update(t.strip("'") for t in TOK_RE.findall(rec["ex"].lower()))
    lower_tokens.discard("")

    reviewed = []
    for level in ("C1", "C2"):
        for rec in levels.get(level, []):
            score, reasons = review_word(rec, level, verbs, lower_tokens)
            reviewed.append((score, level, rec, reasons))
    reviewed.sort(key=lambda item: (-item[0], item[1], item[2]["w"]))

    total = len(reviewed)
    strict = [r for r in reviewed if r[0] >= args.strict]
    soft = [r for r in reviewed if r[0] >= args.soft]
    no_visual = [(lvl, rec) for lvl in ("C1", "C2") for rec in levels.get(lvl, [])
                 if rec["w"].lower() not in art and rec["w"].lower() not in photos]

    today = datetime.date.today().isoformat()
    out = []
    out.append("# Триаж качества словаря C1/C2")
    out.append("")
    out.append("Дата прогона: %s. Скрипт: `tools/review_c12.py` (только читает "
               "словарь; отчёт пересобирается командой "
               "`python3 tools/review_c12.py`)." % today)
    out.append("Источник слов: %s. Повод: жалоба методиста 17–18.09.2026 "
               "(«конвейер, лонжитюд, департментал», «надеюсь, это только на "
               "C1C2 такие слова»)." % source_desc)
    out.append("")
    out.append("## Сводка")
    out.append("")
    for lvl in ("C1", "C2"):
        recs = levels.get(lvl, [])
        with_ex = sum(1 for r in recs if r["ex"].strip())
        out.append("- %s: **%d** слов, с примером %d (%.0f%%)"
                   % (lvl, len(recs), with_ex, 100.0 * with_ex / max(1, len(recs))))
    out.append("- Всего C1+C2: **%d**" % total)
    out.append("- Подозрительных по строгому порогу (скор ≥ %d): **%d** (%.1f%%)"
               % (args.strict, len(strict), 100.0 * len(strict) / max(1, total)))
    out.append("- Подозрительных по мягкому порогу (скор ≥ %d): **%d** (%.1f%%)"
               % (args.soft, len(soft), 100.0 * len(soft) / max(1, total)))
    out.append("- Без фото и без эмодзи-метафоры: **%d** из %d (C1: %d, C2: %d)"
               % (len(no_visual), total,
                  sum(1 for l, _ in no_visual if l == "C1"),
                  sum(1 for l, _ in no_visual if l == "C2")))
    out.append("")
    out.append("Веса: технический суффикс +%d, длинный перевод +%d, латиница в "
               "переводе +%d, нет примера +%d, пример без глагола +%d, "
               "длинное слово +%d, редкое (нет в примерах A1–B2) +%d."
               % (WEIGHT_TECH, WEIGHT_LONG_T, WEIGHT_LAT_T, WEIGHT_NO_EX,
                  WEIGHT_NO_VERB, WEIGHT_LONG_W, WEIGHT_RARE))
    out.append("")

    def table(rows, limit=None):
        lines = ["| Скор | Слово | Уровень | Перевод | Причины | Пример |",
                 "|---:|---|---|---|---|---|"]
        for score, lvl, rec, reasons in (rows if limit is None else rows[:limit]):
            lines.append("| %d | **%s** | %s | %s | %s | %s |" % (
                score, md_escape(rec["w"]), lvl, md_escape(rec["t"]),
                md_escape("; ".join(reasons)),
                md_escape(rec["ex"]) if rec["ex"] else "—"))
        return lines

    out.append("## Топ-%d для быстрого глазомера" % args.top)
    out.append("")
    out.extend(table(reviewed, args.top))
    out.append("")

    out.append("## Все слова со скором ≥ %d (мягкий порог), по убыванию" % args.soft)
    out.append("")
    out.append("Слов со скором 1–%d здесь нет: это обычно «просто длинное» или "
               "«просто редкое» — смотреть их имеет смысл после разбора этого "
               "списка." % (args.soft - 1))
    out.append("")
    out.extend(table(soft))
    out.append("")

    out.append("## Слова без фото и без эмодзи-метафоры")
    out.append("")
    out.append("Претензия методиста была про понятность карточек. Фотография "
               "(js/word-photos.js) или эмодзи-метафора (WORD_ART в "
               "js/images.js) — единственная визуальная опора; без неё слово "
               "остаётся голым текстом. У абстрактных слов так задумано "
               "(«therefore нечем сфотографировать»), поэтому это не список "
               "дефектов, а список кандидатов на ручной подбор образа.")
    out.append("")
    for lvl in ("C1", "C2"):
        words = [rec["w"] for l, rec in no_visual if l == lvl]
        out.append("<details><summary>%s — %d слов</summary>" % (lvl, len(words)))
        out.append("")
        out.append(", ".join(sorted(words)))
        out.append("")
        out.append("</details>")
        out.append("")

    out.append("## Как часто ученик вообще видит C1/C2")
    out.append("")
    out.append(FREQUENCY_TEXT.strip())
    out.append("")

    os.makedirs(os.path.dirname(OUT_MD), exist_ok=True)
    with open(OUT_MD, "w", encoding="utf-8") as fh:
        fh.write("\n".join(out))

    print("Источник: %s" % source_desc)
    print("C1: %d, C2: %d, всего: %d" % (len(levels.get("C1", [])),
                                          len(levels.get("C2", [])), total))
    print("Подозрительных: строгий (≥%d): %d, мягкий (≥%d): %d"
          % (args.strict, len(strict), args.soft, len(soft)))
    print("Без фото и метафоры: %d" % len(no_visual))
    print("Отчёт: %s" % OUT_MD)
    print("\nТоп-10:")
    for score, lvl, rec, reasons in reviewed[:10]:
        print("  %d  %-22s %s  %s" % (score, rec["w"], lvl, "; ".join(reasons)))
    return 0


# Текст раздела про частоту показа. Это вывод по коду js/exercises.js
# (levelPool/trainPool) и js/app.js (studyLevel) на момент написания скрипта;
# если логика отбора изменится, текст надо перечитать, а не доверять.
FREQUENCY_TEXT = """
По коду (js/exercises.js `levelPool`/`trainPool`, js/app.js `studyLevel`):

* `studyLevel()` — уровень, по которому подбираются слова: выбранный учеником
  в тренировках (`trainLevel`), иначе результат теста (`state.level`), иначе A1.
* **«По словам» и «Игры» (`trainPool`)** — только словарь ученика: слова,
  которые он сам добавил. Слова уровня подмешиваются лишь когда своих не
  хватает на подход, а четверть уровневых — только при включённом
  `trainMixNew` (по умолчанию выключен). То есть «конвейер» из жалобы Ирины
  приходил в «Своих предложениях» из уровневого пула — после правки
  17–18.09 это упражнение на `trainPool`, и этот путь закрыт.
* **«На слух», «Выражения», «Письмо и речь» (`levelPool`)** — слова уровня
  ученика ПЛЮС один следующий уровень: B1-ученик видит B1+B2, B2-ученик —
  B2+**C1**, C1-ученик — C1+**C2**.
* Следствие: C1-слова доезжают до учеников уровней B2, C1 и C2; C2-слова —
  только до C1 и C2. Ученики A1–B1 через уровневые пулы C1/C2 не видят
  вообще.
* C1+C2 — это больше половины словаря (точные числа в сводке выше), но
  школьник, честно прошедший тест на B1, встречает их только в своём
  словаре — если сам их туда добавил. Основной риск — ученики, которым тест
  поставил B2/C1: их уровневые пулы состоят из C1/C2 заметной долей, и
  именно там качество карточек C1/C2 видно каждый день.
* Отдельно: уровень можно поставить вручную в тренировках и репетитором.
  Завышенный ручной уровень — второй путь, по которому школьник упирается
  в «лонжитюд».
"""


if __name__ == "__main__":
    sys.exit(main())
