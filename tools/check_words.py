#!/usr/bin/env python3
"""Проверка tools/out/words-new.js перед подключением к сайту.

Ничего не меняет — только читает и печатает отчёт. Запуск:

    python3 tools/check_words.py

Что проверяет:
  * файл разбирается тем же разбором, что и js/words.js;
  * у каждого слова заполнены все шесть полей;
  * категории только из тех, что уже есть в js/words.js;
  * нет дублей внутри файла и пересечений с существующей базой;
  * перевод по-русски, пример по-английски, слово реально есть в примере;
  * длины в разумных пределах.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from wordpipe import existing, tatoeba

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
NEW_JS = os.path.join(TOOLS_DIR, "out", "words-new.js")

RECORD_RE = re.compile(
    r'\{\s*w:\s*"((?:[^"\\]|\\.)*)"\s*,\s*t:\s*"((?:[^"\\]|\\.)*)"\s*,'
    r'\s*ex:\s*"((?:[^"\\]|\\.)*)"\s*,\s*exr:\s*"((?:[^"\\]|\\.)*)"\s*,'
    r'\s*def:\s*"((?:[^"\\]|\\.)*)"\s*,\s*cat:\s*"((?:[^"\\]|\\.)*)"\s*\}'
)
LEVEL_RE = re.compile(r"^\s{2}([A-C][12]):\s*\[", re.M)
CYR = re.compile(r"[а-яёА-ЯЁ]")
LAT = re.compile(r"[A-Za-z]")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else NEW_JS
    if not os.path.exists(path):
        print("нет файла %s — сначала запусти tools/build_words.py" % path)
        return 1

    base = existing.load(WORDS_JS)
    with open(path, "r", encoding="utf-8") as fh:
        source = fh.read()

    bounds = [(m.group(1), m.start()) for m in LEVEL_RE.finditer(source)]
    bounds.append(("__end__", len(source)))

    problems, counts, seen = [], {}, {}
    total = 0
    for i in range(len(bounds) - 1):
        level, start = bounds[i]
        chunk = source[start: bounds[i + 1][1]]
        records = RECORD_RE.findall(chunk)
        counts[level] = len(records)
        for w, t, ex, exr, definition, cat in records:
            total += 1
            where = "%s/%s" % (level, w)
            if not all([w, t, ex, exr, definition, cat]):
                problems.append("%s: пустое поле" % where)
            if cat not in base.categories:
                problems.append("%s: категория '%s' которой нет в js/words.js" % (where, cat))
            if w in base.words:
                problems.append("%s: слово уже есть в js/words.js" % where)
            if w in seen:
                problems.append("%s: дубль (уже был в %s)" % (where, seen[w]))
            seen[w] = level
            if not CYR.search(t):
                problems.append("%s: перевод не по-русски: %r" % (where, t))
            if LAT.search(t):
                problems.append("%s: латиница в переводе: %r" % (where, t))
            if not CYR.search(exr):
                problems.append("%s: перевод примера не по-русски" % where)
            if not LAT.search(ex):
                problems.append("%s: пример не по-английски" % where)
            if len(ex) > 90:
                problems.append("%s: пример длиннее 90 символов" % where)
            forms = tatoeba.inflections(w)
            if not (forms & set(re.findall(r"[a-z]+", ex.lower()))):
                problems.append("%s: слова нет в примере: %r" % (where, ex))
            if len(definition) > 140:
                problems.append("%s: определение длиннее 140 символов" % where)
            if re.search(r"[\[\]{}<>]|mw-parser", definition):
                problems.append("%s: разметка в определении" % where)

    print("Файл: %s" % path)
    print("Слов: %d — %s" % (total, ", ".join("%s:%d" % (l, n) for l, n in counts.items())))
    print("Существующая база: %d слов, %d категорий" % (len(base.words), len(base.categories)))
    if problems:
        print("\nНАЙДЕНО ПРОБЛЕМ: %d" % len(problems))
        for p in problems[:60]:
            print("  - %s" % p)
        if len(problems) > 60:
            print("  ... и ещё %d" % (len(problems) - 60))
        return 1
    print("\nПроблем не найдено — файл можно подключать.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
