#!/usr/bin/env python3
"""Отбраковка фраз и запись js/phrases.js.

Тот же порядок, что у слов: build_phrases.py решает «нашёл ли я данные»,
этот скрипт — «можно ли это показывать ребёнку». Правила отбраковки примеров
берутся из merge_words.py, чтобы список был один на весь проект: заведёшь
второй — через месяц они разойдутся, и в одном наборе будет проходить то,
что в другом уже запрещено.

К словам добавлены две проверки, которых там быть не могло:

  * ПОСЛОВНАЯ проверка самой фразы. «bite the bullet» — три безобидных слова
    и одно запрещённое; проверка слова целиком его не увидит.
  * REJECT_PHRASE — идиома опасна ЗНАЧЕНИЕМ, а не словами: «kick the bucket»
    состоит из безупречной лексики. Такие ловятся только списком.

Запуск:
    python3 tools/merge_phrases.py            # показать, что будет сделано
    python3 tools/merge_phrases.py --apply    # записать js/phrases.js
"""

import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import merge_words
from wordpipe import phrases as phrases_mod

ROOT = Path(__file__).resolve().parent.parent
NEW = ROOT / "tools/out/phrases-new.json"
TARGET = ROOT / "js/phrases.js"
REPORT = ROOT / "tools/out/phrases-rejected.json"

KINDS = [("phrasal", "phrasal"), ("idioms", "idiom"), ("colloc", "colloc")]
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
FIELDS = ["w", "t", "ex", "exr", "def", "cat", "level", "kind", "parts", "literal"]

# Фразы, которые не берём по ЗНАЧЕНИЮ, а не по словам. Пословный фильтр их не
# видит: «kick the bucket» (умереть), «hit the bottle» (запить), «bite the dust»
# — это безупречная лексика и совершенно недетский смысл. Сейчас словарь пуст,
# потому что список-семя уже отобран руками; место оставлено под то, что
# всплывёт при вычитке или при следующем пополнении.
REJECT_PHRASE = {}

# Обратная сторона: пословный фильтр иногда срабатывает на безобидной фразе,
# потому что слово опасно в одиночку, а в составе выражения — нет. Тот же
# приём, что HOMOGRAPH_ALLOW в filters.py, только на уровне фразы. Каждое
# исключение — с обоснованием: без него через месяц непонятно, почему оно тут.
ALLOW_PHRASE = {
    "beat around the bush":
        "beat в чёрном списке как «бить», но здесь это «ходить вокруг да около» — "
        "стандартная школьная идиома B2 без всякого насилия",
}

# Пример негодный, но фраза нужная: карточка живёт и без примера, часть
# упражнений его просто не предложит. Каждая строка — результат вычитки
# глазами; автоматика этого поймать не могла, потому что предложение
# грамматически верное и слова в нём безобидные.
DROP_EXAMPLE = {
    # не то значение фразы
    "check out":  "«I'm checking out. / Я ухожу» — про уход вообще, а не про выписку из гостиницы",
    "go over":    "«Go over there. / Вон отсюда!» — буквальное «иди туда» да ещё и грубо",
    "look up":    "«Look up. / Посмотрите наверх» — буквально задрать голову, а не искать в словаре",
    "hold up":    "«Hold up. / Держись» — ни одно из двух наших значений",
    "call on":    "«He called on me. / Он пришёл ко мне в гости» — значение «заглянуть», у нас другое",
    "brush aside": "«He got brushed aside. / Его оттолкнули» — физически отодвинули, а не отмахнулись",
    "iron out":   "пример про глажку шарфа — буквальное значение",
    "a walk in the park": "«Я прогулялся по парку» — буквальная прогулка, а не «плёвое дело»",
    "the writing on the wall": "«прочитать надпись на стене» — буквально",
    "draw the line": "«Надо нарисовать где-нибудь линию» — буквально",
    "gain confidence": "«gained the confidence of everyone / завоевал доверие» — это другое значение",

    # регулярное выражение поймало не фразу, а случайное совпадение слов
    "rope in":    "«Put the rope in the box» — здесь rope и in не связаны",
    "hinge on":   "«One of the hinges on that door is broken» — здесь hinges и on не связаны",
    "egg on":     "«I have egg on my face» — другая идиома",
    "you name it": "«Why'd you name it that?» — здесь name it не оборот",

    # перевод примера негоден
    "the early bird catches the worm": "«У праздного ноги в сырости» — поговорка не та и непонятная",
    "get cold feet": "«He's getting cold feet. / Он бледнеет» — перевод неверен",

    # содержание не для детской карточки
    "put down":   "«Put down the knife. / Положи нож» — нож в примере ребёнку не нужен",
    "put up":     "«Put up your dukes. / Готовьтесь к бою» — приглашение подраться",
    "try out":    "«I wanna try out horse meat» — конина, да ещё и разговорное wanna",
    "pose a threat": "пример про кибертерроризм и международную безопасность",
    "cause a problem": "пример про приток иностранных рабочих — тема не школьная",
    "do exercise": "предложение длинное и на самом деле про еду после тренировки",
}


def own_words(phrase):
    return phrases_mod.own_words(phrase)


def bad_example(rec):
    """Правила примеров из merge_words, но «своим» считается любое слово фразы.

    У слова исключение было одно (само слово), у фразы их несколько, и
    совпадение бывает многословным. Правило про лозунги ищет «down with» — и
    выбрасывало совершенно нормальный пример к фразе come down with. Поэтому
    сравниваем не строку целиком, а множество слов: если всё, что нашлось,
    входит в саму фразу, это не чужая лексика, а она сама.
    """
    ex = rec.get("ex") or ""
    if not ex:
        return None
    mine = own_words(rec["w"])
    for rx, why in merge_words.REJECT_EXAMPLE:
        hit = rx.search(ex)
        if not hit:
            continue
        if set(re.findall(r"[a-z']+", hit.group(0).lower())) <= mine:
            continue
        return why
    return None


def clean(payload):
    kept = {js_key: [] for js_key, _ in KINDS}
    dropped, fixed = [], []
    for js_key, kind in KINDS:
        for rec in payload["phrases"].get(kind, []):
            phrase = rec["w"]
            key = phrase.lower()

            if key in REJECT_PHRASE:
                dropped.append((phrase, kind, REJECT_PHRASE[key]))
                continue
            if key in merge_words.REJECT_WORD:
                dropped.append((phrase, kind, merge_words.REJECT_WORD[key]))
                continue
            blocked = phrases_mod.blocked_tokens(phrase)
            if blocked and key not in ALLOW_PHRASE:
                dropped.append((phrase, kind, "недетское слово во фразе: %s" % ", ".join(blocked)))
                continue
            if blocked:
                fixed.append((phrase, "оставлено вопреки фильтру", ALLOW_PHRASE[key]))

            rec = dict(rec)
            why = bad_example(rec)
            if why:
                fixed.append((phrase, "пример убран", why))
                rec.pop("ex", None)
                rec.pop("exr", None)
            if key in DROP_EXAMPLE:
                fixed.append((phrase, "пример убран", DROP_EXAMPLE[key]))
                rec.pop("ex", None)
                rec.pop("exr", None)

            if not rec.get("t") or not rec.get("def"):
                dropped.append((phrase, kind, "нет перевода или определения"))
                continue
            if rec.get("level") not in LEVELS:
                dropped.append((phrase, kind, "неизвестный уровень %r" % rec.get("level")))
                continue
            kept[js_key].append(rec)
    return kept, dropped, fixed


# --- запись ---------------------------------------------------------------

def js_value(value):
    if isinstance(value, list):
        return "[" + ", ".join(js_value(v) for v in value) + "]"
    # JSON-строка — валидный литерал JS; отдельно чиним разделители строк
    return (json.dumps(value, ensure_ascii=False)
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))


def render(rec):
    parts = []
    for field in FIELDS:
        value = rec.get(field)
        if value in (None, "", []):
            continue
        parts.append("%s: %s" % (field, js_value(value)))
    return "    { " + ", ".join(parts) + " },"


HEADER = """\
// База устойчивых выражений: фразовые глаголы, идиомы, коллокации.
// Сгенерировано tools/merge_phrases.py — руками не редактировать,
// правки вносить в tools/wordpipe/phrasedata.py и пересобирать.
//
// Схема записи повторяет js/words.js и добавляет своё:
//   w       — выражение              t     — русский перевод
//   ex/exr  — пример и его перевод    def   — определение по-английски
//   cat     — категория (как в words.js)
//   level   — CEFR A1..C2
//   kind    — phrasal | idiom | colloc
//   parts   — слова выражения по порядку, для упражнения «собери фразу»
//   literal — БУКВАЛЬНЫЙ перевод по словам (только phrasal и idiom).
//             Главная трудность ученика и лучший материал для упражнения:
//             give up — буквально «дать вверх», а на самом деле «сдаваться».
//
// Источники: en.wiktionary.org (CC BY-SA), tatoeba.org (CC BY 2.0 FR);
// переводы и буквальные переводы — свои, см. tools/wordpipe/phrasedata.py.
"""


def main():
    apply = "--apply" in sys.argv
    payload = json.loads(NEW.read_text(encoding="utf-8"))
    kept, dropped, fixed = clean(payload)

    print("ОТБРАКОВКА (%d)" % len(dropped))
    for phrase, kind, why in dropped:
        print("  − %-34s %-8s %s" % (phrase, kind, why))
    print("\nПРАВКИ (%d)" % len(fixed))
    for phrase, what, why in fixed:
        print("  ~ %-34s %s: %s" % (phrase, what, why))

    print("\nИТОГО")
    total = 0
    for js_key, _ in KINDS:
        rows = kept[js_key]
        total += len(rows)
        by_level = {lvl: sum(1 for r in rows if r["level"] == lvl) for lvl in LEVELS}
        with_ex = sum(1 for r in rows if r.get("ex"))
        print("  %-8s %3d  (пример у %d)  %s"
              % (js_key, len(rows), with_ex,
                 ", ".join("%s:%d" % (l, n) for l, n in by_level.items() if n)))
    print("  всего %d" % total)

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(
        {"dropped": [{"w": w, "kind": k, "why": why} for w, k, why in dropped],
         "fixed": [{"w": w, "what": a, "why": b} for w, a, b in fixed]},
        ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if not apply:
        print("\nЭто предпросмотр. Для записи: python3 tools/merge_phrases.py --apply")
        return

    if TARGET.exists():
        backup = TARGET.with_suffix(".js.bak-%s" % datetime.now().strftime("%Y%m%d-%H%M"))
        shutil.copy2(TARGET, backup)
        print("\nбэкап: %s" % backup.name)

    lines = [HEADER, "const PHRASES = {"]
    for js_key, _ in KINDS:
        lines.append("  %s: [" % js_key)
        for rec in kept[js_key]:
            lines.append(render(rec))
        lines.append("  ],")
    lines.append("};")
    lines.append("")
    TARGET.write_text("\n".join(lines), encoding="utf-8")
    print("записан %s" % TARGET.name)


if __name__ == "__main__":
    main()
