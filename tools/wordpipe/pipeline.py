"""Сборка одного слова и прогон всего списка.

Три исхода на слово:

  accepted — собраны ВСЕ шесть полей и пройдены проверки качества;
  review   — слово нормальное, но данных не хватает или есть риск ошибки
             (многозначность, перевод не совпал со значением). Уходит в
             manual-review со всем, что успели собрать, и с причиной;
  skipped  — это вообще не словарная единица (нет английской статьи, форма
             другого слова, имя собственное, недетская лексика). Тоже
             записывается с причиной, но чинить там нечего.

Ничего не досочиняем: если поля нет — оно пустое и слово в review.
"""

import threading
from concurrent.futures import ThreadPoolExecutor

from . import filters, tatoeba, wiktionary


class Config:
    def __init__(self, **kw):
        self.wiktionary_delay = kw.get("wiktionary_delay", 0.4)
        self.tatoeba_delay = kw.get("tatoeba_delay", 1.2)
        self.workers = kw.get("workers", 4)
        self.max_senses = kw.get("max_senses", 4)
        self.min_gloss_score = kw.get("min_gloss_score", 0.2)
        # при таком совпадении пояснения и определения перевод считаем доказанным
        self.strong_gloss_score = kw.get("strong_gloss_score", 0.5)
        self.min_cat_confidence = kw.get("min_cat_confidence", 0.45)
        # strict_pos: любые две части речи считать признаком омонимии.
        # По умолчанию выключено — harvest (сущ./глаг.) и reliable (прил./сущ.)
        # это одно и то же понятие, а вот train (3 этимологии) — нет.
        self.strict_pos = kw.get("strict_pos", False)


class Outcome:
    def __init__(self, word, status, record=None, reasons=None, partial=None, rank=None, level=None):
        self.word = word
        self.status = status              # accepted | review | skipped
        self.record = record
        self.reasons = reasons or []
        self.partial = partial or {}
        self.rank = rank
        self.level = level


def build_word(word, ctx):
    """ctx: dict с fetcher, freq, categorizer, config."""
    cfg = ctx["config"]
    fetcher = ctx["fetcher"]
    rank = ctx["freq"].rank(word)
    level = ctx["freq"].level(word)
    partial = {"w": word, "rank": rank, "level": level}

    def skip(reason):
        return Outcome(word, "skipped", reasons=[reason], partial=partial, rank=rank, level=level)

    def review(reasons):
        return Outcome(word, "review", reasons=reasons, partial=partial, rank=rank, level=level)

    # 1. Вики-разметка: части речи, значения, русские переводы
    entry, err = wiktionary.load_entry(fetcher, word, cfg.wiktionary_delay)
    if err:
        return skip("Wiktionary: %s" % err)
    if not entry.has_english:
        return skip("нет английского раздела в Wiktionary")
    if entry.is_form_of:
        return skip("форма другого слова")
    if not entry.lexical_pos():
        return skip("не самостоятельное слово (%s)" % ", ".join(entry.pos_list[:3] or ["?"]))

    pos = wiktionary.pos_with_translations(entry)
    partial["pos"] = pos

    reasons = []
    majors = entry.major_pos()

    # 2. Определение по-английски
    payload, err = wiktionary.fetch_definition(fetcher, word, cfg.wiktionary_delay)
    if err:
        return skip("Wiktionary REST: %s" % err)
    definition, def_err = wiktionary.pick_definition(payload, pos)
    if not definition:
        return skip("определение: %s" % def_err)
    partial["def"] = definition["text"]
    if definition["pos"] and definition["pos"] != pos:
        pos = definition["pos"]
        partial["pos"] = pos

    # 3. Русский перевод, привязанный к КОНКРЕТНОМУ значению.
    #    Здесь ловится главная ошибка робота: у Wiktionary первый блок переводов
    #    часто не соответствует первому определению (train -> «шлейф платья»).
    pos_senses = entry.senses_for(pos)
    if not pos_senses:
        pos_senses = [s for s in entry.senses if s["ru"]]
        if pos_senses:
            reasons.append("перевод есть только для другой части речи (%s вместо %s)"
                           % ("/".join(sorted({s["pos"] for s in pos_senses}))[:30], pos))
    sense = None
    if not pos_senses:
        reasons.append("нет русского перевода в Wiktionary"
                       + (" (вынесен на отдельную страницу)" if entry.trans_see else ""))
    else:
        sense, score = wiktionary.match_sense(definition["text"], pos_senses)
        if sense is None or (len(pos_senses) > 1 and score < cfg.min_gloss_score):
            reasons.append("перевод не привязывается к значению — риск взять чужое")
            sense = None
            partial["t_variants"] = [{"gloss": s["gloss"], "ru": s["ru"][:3]} for s in pos_senses[:5]]
        else:
            partial["t"] = sense["ru"][0]
            partial["gloss_score"] = round(score, 2)
            if len(sense["ru"]) > 1:
                partial["t_alt"] = sense["ru"][1:4]

    # 4. Пример с переводом. Если значение уже выбрано — просим Tatoeba-отбор
    #    предпочесть предложение, чей русский перевод подтверждает именно его.
    blocklist = filters.sentence_blocklist(word, tatoeba.inflections(word))
    confirm = None
    if sense is not None:
        confirm = lambda ru, terms=tuple(sense["ru"]): any(wiktionary.mentions(t, ru) for t in terms)
    pair, pair_err = tatoeba.fetch_pair(fetcher, word, blocklist, cfg.tatoeba_delay, confirm=confirm)
    if pair:
        partial["ex"] = pair["ex"]
        partial["exr"] = pair["exr"]
    else:
        reasons.append("пример: %s" % pair_err)
        if definition.get("examples"):
            partial["ex_hint"] = definition["examples"][0]

    # 4b. Сходится ли карточка сама с собой.
    #     Живой перевод примера из Tatoeba — независимое подтверждение того, что
    #     мы взяли то самое значение. Если он подтверждает ДРУГОЕ значение, а у
    #     слова есть признаки омонимии — карточка развалится, и это в ручную.
    confirm = wiktionary.example_sense(pos_senses, sense, partial.get("exr"))
    partial["example_sense"] = confirm

    # Жёсткие признаки — разные слова, случайно совпавшие в написании
    # (train, bank, cut). Сильное совпадение пояснения с определением тут не
    # помогает: оно доказывает, что мы верно выбрали значение ВНУТРИ части речи,
    # но не то, что мы выбрали верную часть речи. Нужно подтверждение примером.
    hard_signals = []
    if entry.etymology_count > 1:
        hard_signals.append("%d разных этимологий" % entry.etymology_count)
    if len(majors) > 2 or (len(majors) > 1 and cfg.strict_pos):
        hard_signals.append("части речи: %s" % "/".join(majors))
    # Мягкий признак — одно слово со множеством оттенков значения.
    soft_signals = []
    if len(pos_senses) > cfg.max_senses:
        soft_signals.append("значений: %d" % len(pos_senses))

    strong_match = partial.get("gloss_score", 0) >= cfg.strong_gloss_score
    signals = hard_signals + (soft_signals if not strong_match else [])
    if sense is not None and signals and confirm != "chosen":
        if confirm == "other":
            reasons.append("пример иллюстрирует другое значение (%s)" % "; ".join(signals))
        else:
            reasons.append("многозначное слово, подтвердить перевод нечем (%s)" % "; ".join(signals))
    elif sense is not None and confirm == "other" and wiktionary.translations_diverge(pos_senses):
        reasons.append("перевод примера относится к другому значению")

    # 5. Категория
    cat, confidence, how = ctx["categorizer"].classify(
        word, definition["text"], pos, partial.get("ex", "")
    )
    if cat:
        partial["cat"] = cat
        partial["cat_source"] = how
    if not cat or confidence < cfg.min_cat_confidence:
        reasons.append("категория не определилась (%s)" % how)

    if reasons or "t" not in partial:
        return review(reasons or ["перевод не найден"])

    record = {
        "w": word,
        "t": partial["t"],
        "ex": partial["ex"],
        "exr": partial["exr"],
        "def": partial["def"],
        "cat": partial["cat"],
    }
    return Outcome(word, "accepted", record=record, partial=partial, rank=rank, level=level)


def run(words, ctx, progress=None):
    cfg = ctx["config"]
    results = []
    lock = threading.Lock()
    done = [0]

    def work(word):
        try:
            outcome = build_word(word, ctx)
        except Exception as exc:  # один кривой ответ не должен ронять прогон
            outcome = Outcome(word, "skipped", reasons=["внутренняя ошибка: %r" % exc])
        with lock:
            results.append(outcome)
            done[0] += 1
            if progress:
                progress(done[0], len(words), outcome)
        return outcome

    if cfg.workers <= 1:
        for w in words:
            work(w)
    else:
        with ThreadPoolExecutor(max_workers=cfg.workers) as pool:
            list(pool.map(work, words))

    order = {w: i for i, w in enumerate(words)}
    results.sort(key=lambda o: order.get(o.word, 1 << 30))
    return results
