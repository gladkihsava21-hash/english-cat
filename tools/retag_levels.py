#!/usr/bin/env python3
"""Уточнить уровни слов в js/words.js по CEFR-J Wordlist.

ЗАЧЕМ. Уровни при сборке раздавались по частотности (субтитры + книги),
и это систематически врёт про школьную лексику: «tidy» в кино и книгах
редок — и получил C1, хотя это A2; «cafeteria», «oven» уехали в B2–C1;
зато «senator» по частоте новостей стал B1. Репетитор это увидела с
первого взгляда (см. SESSION.md, задание совладельца, п. 1).

ЧТО ДЕЛАЕМ. Берём CEFR-J Wordlist Version 1.6 (Yukio Tono, Tokyo University
of Foreign Studies, https://cefr-j.org) — 7 800 слов с уровнями A1–B2,
составленных для учебников, а не по частоте. Разрешено использовать в
коммерческих целях со ссылкой на источник; ссылка стоит в credits.html.
Слово есть в списке — берём его уровень. Нет — оно точно не из школьной
базы A1–B2, и частота решает только между B2/C1/C2. Кураторские A1/A2
(первые 554 слова, размечены руками) вверх не двигаем: там уровень
осмысленный; вниз — если CEFR-J говорит A1.

ЗАОДНО ТЕМЫ. У CEFR-J для A1–B1 есть тематическая разметка (Food and drink,
Clothes, Objects and rooms…). Наши категории для импортированных слов
считались по ключевым словам определений и местами абсурдны («senate» —
дом, потому что «upper house»). Где у CEFR-J есть тема с понятным
соответствием — ставим нашу категорию по ней.

Запуск:
    python3 tools/retag_levels.py --xlsx "path/CEFR-J Wordlist Ver1.6.xlsx" --extract
        разбирает xlsx и пишет tools/wordpipe/cefrj.json (слово → уровень, тема)
    python3 tools/retag_levels.py
        перекладывает js/words.js по tools/wordpipe/cefrj.json + частотам
    python3 tools/retag_levels.py --dry
        только отчёт, файл не трогаем
"""

import argparse
import html
import json
import math
import os
import re
import sys
import zipfile
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_JS = os.path.join(ROOT, "js", "words.js")
CEFRJ_JSON = os.path.join(ROOT, "tools", "wordpipe", "cefrj.json")
FREQ_DIR = os.path.join(ROOT, "tools", "cache", "freq")

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
LV = {l: i for i, l in enumerate(LEVELS)}

# Тема CEFR-J → наша категория (js/levels.js CATEGORY_NAMES). Что не
# перечислено — не трогаем: «Hobbies and pastimes» или «Personal
# information» слишком разношёрстны, чтобы стать одной темой для «лишнего».
TOPIC_TO_CAT = {
    "Food and drink": "food",
    "Objects and rooms": "home",
    "Clothes": "clothes",
    "Ways of travelling": "travel",
    "Travel and services vocab": "travel",
    "Family life": "family",
    "Things in the town, shops and shopping": "city",
    "Shopping": "city",
    "Work and jobs": "work",
    "Education": "school",
    "Nationalities and countries": "places",
    # «Media» НЕ маппим: там webcam и TV рядом с газетой — для «лишнего»
    # такая тема даёт «webcam — это творчество». Books/Arts/Film — можно.
    "Books and literature": "art",
    "Arts": "art",
    "Film": "art",
    "News, lifestyles and current affairs": "society",
}

# Не в CEFR-J → по частоте, но только от B2 и выше: всё, что школьник
# встречает до B2, в списке есть.
FALLBACK_BANDS = [("B2", 4000), ("C1", 12000), ("C2", None)]


def extract(xlsx_path):
    """xlsx → cefrj.json без сторонних библиотек: xlsx это zip с XML."""
    z = zipfile.ZipFile(xlsx_path)
    ss = z.read("xl/sharedStrings.xml").decode("utf-8")
    strings = [html.unescape(re.sub(r"<[^>]+>", "", m))
               for m in re.findall(r"<si>(.*?)</si>", ss, flags=re.S)]
    wb = z.read("xl/workbook.xml").decode("utf-8")
    sheets = re.findall(r'<sheet [^>]*name="([^"]+)"', wb)
    idx = sheets.index("ALL") + 1
    x = z.read("xl/worksheets/sheet%d.xml" % idx).decode("utf-8")
    out = {}
    for row in re.findall(r"<row[^>]*>(.*?)</row>", x, flags=re.S)[1:]:
        cells = []
        for attrs, body in re.findall(r"<c ([^>]*)>(.*?)</c>", row, flags=re.S):
            v = re.search(r"<v>(.*?)</v>", body)
            val = v.group(1) if v else ""
            if 't="s"' in attrs and val:
                val = strings[int(val)]
            cells.append(val)
        if len(cells) < 3 or cells[2] not in LV:
            continue
        topic = cells[3] if len(cells) > 3 and cells[3] and not cells[3].isdigit() else ""
        for hw in cells[0].split("/"):     # «a.m./A.M./am/AM»
            hw = hw.strip().lower()
            if not hw:
                continue
            cur = out.get(hw)
            # у слова несколько частей речи — берём самый ранний уровень
            if cur is None or LV[cells[2]] < LV[cur["level"]]:
                out[hw] = {"level": cells[2], "topic": topic or (cur or {}).get("topic", "")}
            elif topic and not cur.get("topic"):
                cur["topic"] = topic
    with open(CEFRJ_JSON, "w", encoding="utf-8") as f:
        json.dump({"source": "CEFR-J Wordlist Version 1.6, Yukio Tono, TUFS, https://cefr-j.org",
                   "words": out}, f, ensure_ascii=False, indent=0, sort_keys=True)
    print("cefrj.json: %d слов" % len(out))


def load_freq():
    """Объединённый ранг из кэша конвейера (см. tools/wordpipe/frequency.py).
    Кэша нет — все слова вне CEFR-J уходят в C2, и об этом говорим."""
    if not os.path.isdir(FREQ_DIR):
        return None
    lists = []
    for name in sorted(os.listdir(FREQ_DIR)):
        d = {}
        with open(os.path.join(FREQ_DIR, name), encoding="utf-8", errors="ignore") as fh:
            for i, line in enumerate(fh):
                p = line.split()
                if p and p[0].lower() not in d:
                    d[p[0].lower()] = i + 1
        lists.append(d)

    def rank(w):
        rs = [d[w] for d in lists if w in d]
        if not rs:
            return None
        return math.exp(sum(math.log(r) for r in rs) / len(rs))
    return rank


def new_level(word, old, cefr, rank):
    key = word.lower()
    hit = cefr.get(key)
    if hit:
        lvl = hit["level"]
        # кураторские A1/A2 вверх не двигаем
        if old in ("A1", "A2") and LV[lvl] > LV[old]:
            return old, "keep"
        return lvl, "cefrj"
    if old in ("A1", "A2"):
        return old, "keep"
    r = rank(key) if rank else None
    if r is None:
        return "C2", "freq"
    for name, upper in FALLBACK_BANDS:
        if upper is None or r <= upper:
            return name, "freq"
    return "C2", "freq"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", help="CEFR-J Wordlist .xlsx — разобрать в cefrj.json")
    ap.add_argument("--extract", action="store_true")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    if args.extract:
        if not args.xlsx:
            sys.exit("--extract требует --xlsx")
        extract(args.xlsx)
        return

    cefr = json.load(open(CEFRJ_JSON, encoding="utf-8"))["words"]
    rank = load_freq()
    if rank is None:
        print("!! tools/cache/freq пуст: слова вне CEFR-J уйдут в C2. "
              "Скачать частоты умеет tools/build_words.py.")

    src = open(WORDS_JS, encoding="utf-8").read()
    head, rest = src.split("const WORDS = {\n", 1)
    body, tail = rest.split("\n};", 1)
    level, records = None, []      # (line, level)
    for line in body.split("\n"):
        m = re.match(r"^  ([ABC][12]): \[$", line)
        if m:
            level = m.group(1)
            continue
        if line.strip() == "],":
            continue
        if line.strip():
            records.append((line, level))

    stats = Counter()
    moved = Counter()
    recat = 0
    by_level = {l: [] for l in LEVELS}
    for line, old in records:
        m = re.match(r'^(\s*\{ w: ")((?:[^"\\]|\\.)*)(".*)$', line)
        if not m:
            by_level[old].append(line)
            continue
        w = m.group(2)
        lvl, how = new_level(w, old, cefr, rank)
        stats[how] += 1
        if lvl != old:
            moved[(old, lvl)] += 1
        hit = cefr.get(w.lower())
        topic_cat = TOPIC_TO_CAT.get((hit or {}).get("topic", ""))
        if topic_cat:
            cur = re.search(r'cat: "([^"]*)"', line)
            if cur and cur.group(1) != topic_cat:
                line = line.replace('cat: "%s"' % cur.group(1), 'cat: "%s"' % topic_cat, 1)
                recat += 1
            elif not cur:
                line = re.sub(r" \},?$", lambda mm: ', cat: "%s"%s' % (topic_cat, mm.group(0)), line, count=1)
                recat += 1
        by_level[lvl].append(line)

    print("источник уровня:", dict(stats))
    print("категорий уточнено:", recat)
    print("по уровням:", {l: len(by_level[l]) for l in LEVELS})
    top_moves = moved.most_common(12)
    print("самые частые переносы:", top_moves)
    if args.dry:
        return
    out = [head + "const WORDS = {"]
    for l in LEVELS:
        out.append("  %s: [" % l)
        out.extend(by_level[l])
        out.append("  ],")
    out.append("};" + tail)
    with open(WORDS_JS, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("js/words.js переписан")


if __name__ == "__main__":
    main()
