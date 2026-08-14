#!/usr/bin/env python3
"""Словарь из готового массива FreeDict + WikDict, а не по одному слову из API.

ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ СКРИПТ, А НЕ ДОРАБОТКА build_words.py

Тот ходит в Wiktionary REST по одному слову: 542 сетевых запроса на 200 слов,
2,5 часа на прогон, и добывает разом все шесть полей — перевод, пример,
перевод примера, определение. Качество высокое, скорость никакая.

Здесь другой размен, и он сознательный: берём ГОТОВЫЙ двуязычный массив на
62 181 слово (3,8 МБ одним файлом), получаем ровно два поля — слово и
перевод, — зато сразу и целиком. Примеров и определений тут нет.

Двух полей достаточно для половины упражнений: карточки, выбор варианта,
ввод слова, пары, собери слово, блиц. Остальным (диктант, пропуск в фразе,
перевод фразы, определения) пример нужен — такие слова эти упражнения
просто не предложат, а не сломаются.

Источник: FreeDict eng-rus, CC BY-SA 3.0, собран WikDict из Wiktionary
через DBnary. Лицензия совместима с тем, что уже указано в credits.html.

Запуск:
    python3 tools/build_from_freedict.py --tei путь/eng-rus.tei
    python3 tools/build_from_freedict.py --tei ... --apply
"""

import argparse
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from wordpipe import frequency  # noqa: E402
from wordpipe.filters import HEADWORD_BLOCK  # noqa: E402

NS = {"t": "http://www.tei-c.org/ns/1.0"}
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# Границы посчитаны по медианным рангам исходных 554 слов — те же, что
# в build_words.py. Держать их в двух местах нельзя, но импортировать
# ради шести чисел весь конвейер тоже незачем: они зафиксированы в отчёте.
BANDS = [("A1", 1445), ("A2", 2276), ("B1", 4180), ("B2", 11815), ("C1", 31746)]

# Части речи, которые вообще имеют смысл в словаре школьника. Суффиксы,
# имена собственные и служебные пометки выбрасываем: в первых четырёхстах
# записях файла их почти сплошь ('s-Hertogenbosch, -able, -archy).
POS_OK = {"n", "v", "adj", "adv"}

# Русский перевод в этом источнике идёт с ударениями (у́мра). Ученику они
# не нужны, а в упражнении «впиши перевод» ломают сравнение строк.
COMBINING_ACUTE = "́"

# Мусор в переводе. Два разных вида, и оба обязательны:
#   1. Пометки в скобках — «(разг.)», «(мед.)». Ученику не нужны.
#   2. ВИКИ-РАЗМЕТКА. Источник собран из Wiktionary, и часть переводов
#      приезжает как «[[сложный|сложная]] [[задача]]». Без разбора это
#      попадает прямо в карточку — так у challenge и вышло.
JUNK_RE = re.compile(r"\s*\((?:[^)]*)\)\s*")
# [[ссылка|показать]] -> показать, [[слово]] -> слово
WIKI_PIPE_RE = re.compile(r"\[\[[^\]|]*\|([^\]]*)\]\]")
WIKI_RE = re.compile(r"\[\[([^\]]*)\]\]")


def strip_stress(s):
    return unicodedata.normalize("NFC", s.replace(COMBINING_ACUTE, ""))


def clean_translation(quotes):
    """Из списка вариантов делаем одну человеческую строку."""
    out = []
    for q in quotes:
        q = strip_stress(q).strip()
        q = WIKI_PIPE_RE.sub(r"\1", q)
        q = WIKI_RE.sub(r"\1", q)
        q = JUNK_RE.sub(" ", q).strip(" ,;")
        q = re.sub(r"\s{2,}", " ", q)
        # Осталась разметка — значит разобрать не смогли, и лучше пропустить
        if "[" in q or "]" in q or "|" in q:
            continue
        # Отбрасываем то, что переводом не является
        if not q or len(q) > 40:
            continue
        if not re.search(r"[а-яё]", q, re.I):
            continue
        if q.lower() not in (x.lower() for x in out):
            out.append(q)
        if len(out) == 2:          # больше двух — это уже статья, а не карточка
            break
    return ", ".join(out)


def level_for(rank):
    if rank is None:
        return None
    for lvl, edge in BANDS:
        if rank <= edge:
            return lvl
    return "C2"


def parse_tei(path):
    print(f"читаю {path} …")
    tree = ET.parse(path)
    body = tree.getroot().find(".//t:body", NS)
    out = []
    for e in body.findall("t:entry", NS):
        orth_el = e.find(".//t:form/t:orth", NS)
        if orth_el is None:
            continue
        w = "".join(orth_el.itertext()).strip()
        pos_el = e.find(".//t:gramGrp/t:pos", NS)
        pos = "".join(pos_el.itertext()).strip() if pos_el is not None else ""
        quotes = ["".join(q.itertext()) for q in
                  e.findall(".//t:cit[@type='trans']/t:quote", NS)]
        out.append((w, pos, quotes))
    return out


def build(tei_path, limit):
    raw = parse_tei(tei_path)
    print(f"записей в файле: {len(raw)}")

    # Частотность берём тем же кэшем, что и основной конвейер: списки
    # уже скачаны, повторно в сеть не идём.
    from wordpipe.http_cache import Fetcher
    freq = frequency.load(Fetcher(ROOT / "tools/cache"))
    ranks = freq.ranks
    print(f"частотных рангов: {len(ranks)} ({'; '.join(freq.sources)})")

    stats = {"не та часть речи": 0, "не одно слово": 0, "нет частотности": 0,
             "перевод не собрался": 0, "в чёрном списке": 0}
    picked = []
    for w, pos, quotes in raw:
        if pos not in POS_OK:
            stats["не та часть речи"] += 1
            continue
        if not re.fullmatch(r"[a-z][a-z'-]{1,20}", w):
            stats["не одно слово"] += 1
            continue
        if w in HEADWORD_BLOCK:
            stats["в чёрном списке"] += 1
            continue
        rank = ranks.get(w)
        if rank is None:
            stats["нет частотности"] += 1
            continue
        t = clean_translation(quotes)
        if not t:
            stats["перевод не собрался"] += 1
            continue
        picked.append({"w": w, "t": t, "level": level_for(rank), "rank": rank})

    # Одно слово может прийти несколькими частями речи — оставляем частотнейшее
    best = {}
    for rec in picked:
        cur = best.get(rec["w"])
        if not cur or rec["rank"] < cur["rank"]:
            best[rec["w"]] = rec
    picked = sorted(best.values(), key=lambda r: r["rank"])[:limit]

    print("\nотсев:")
    for k, v in stats.items():
        print(f"  {k:24} {v}")
    return picked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tei", required=True)
    ap.add_argument("--limit", type=int, default=12000)
    ap.add_argument("--out", default="tools/out/freedict-words.json")
    args = ap.parse_args()

    words = build(args.tei, args.limit)
    by_level = {l: [] for l in LEVELS}
    for r in words:
        by_level[r["level"]].append({"w": r["w"], "t": r["t"]})

    print(f"\nотобрано: {len(words)}")
    for l in LEVELS:
        print(f"  {l}: {len(by_level[l])}")

    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "source": "FreeDict eng-rus 2025.11.23 (CC BY-SA 3.0, WikDict/Wiktionary via DBnary)",
        "words": by_level,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nзаписано: {out}")


if __name__ == "__main__":
    main()
