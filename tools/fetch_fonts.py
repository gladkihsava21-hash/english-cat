#!/usr/bin/env python3
"""Забрать шрифты у Google и положить к себе.

Зачем не <link> на fonts.googleapis.com. Тот файл стилей блокирует
отрисовку страницы, пока не скачается, и ради него браузер идёт на чужой
домен — отдельный поиск адреса, отдельное рукопожатие TLS. Замер
Lighthouse на телефоне: 819 мс до первой буквы на экране только из-за
этого. Плюс каждый визит ребёнка уходит в чужую аналитику.

Что делает скрипт:
  1. просит у Google css2 ровно те начертания, что нужны сайту;
  2. оставляет подмножества latin/latin-ext/cyrillic/cyrillic-ext
     (греческий и вьетнамский сайту не нужны никогда);
  3. качает файлы в css/fonts/;
  4. пересобирает css/fonts.css с локальными адресами.

Nunito и Inter — переменные шрифты: один файл на всю линейку жирности.
Поэтому в css/fonts.css стоит диапазон (font-weight: 200 1000), а не
семь одинаковых правил с разными числами, как отдаёт Google.

Запуск:
    python3 tools/fetch_fonts.py
"""

import json
import os
import re
import sys
import urllib.request

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
CSS_DIR = os.path.join(PROJECT_DIR, "css")
FONT_DIR = os.path.join(CSS_DIR, "fonts")

# Ровно то, что стоит в css/tokens.css. Меняете начертания там — правьте здесь.
GOOGLE_CSS = ("https://fonts.googleapis.com/css2"
              "?family=Nunito:wght@600;700;800"
              "&family=Inter:wght@400;500;600;700&display=swap")

# Без него Google отдаёт ttf вместо woff2: формат он выбирает по браузеру
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126 Safari/537.36")

KEEP = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"]

# Диапазон оси wght у каждого семейства. Ставим диапазон, а не одно число:
# файл переменный, браузер сам возьмёт нужную жирность.
WEIGHT_RANGE = {"Nunito": "200 1000", "Inter": "100 900"}

HEAD = """/* Шрифты лежат у нас, а не у Google. Файл собирает tools/fetch_fonts.py —
 * руками не править, при следующем запуске затрётся. Там же объяснено,
 * почему у себя, и что делать, если понадобится другое начертание.
 *
 * Оба шрифта под SIL Open Font License 1.1, размещать у себя она прямо
 * разрешает. Тексты лицензий: css/fonts/OFL.txt
 */
"""


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req, timeout=30).read()
    return data if binary else data.decode("utf-8")


def parse_faces(css):
    """(семейство, подмножество) -> (адрес файла, unicode-range).

    Google помечает каждый блок комментарием с названием подмножества —
    по нему и режем."""
    parts = re.split(r"/\*\s*([\w-]+)\s*\*/", css)
    faces = {}
    for i in range(1, len(parts), 2):
        subset, block = parts[i], parts[i + 1]
        if subset not in KEEP:
            continue
        fam = re.search(r"font-family:\s*'([^']+)'", block)
        url = re.search(r"url\((https://[^)]+)\)", block)
        rng = re.search(r"unicode-range:\s*([^;]+);", block)
        if not (fam and url and rng):
            continue
        # Один и тот же файл повторяется для каждой жирности — переменный
        # шрифт. Ключ без веса, поэтому лишние повторы схлопываются сами.
        faces[(fam.group(1), subset)] = (url.group(1), rng.group(1).strip())
    return faces


def main():
    os.makedirs(FONT_DIR, exist_ok=True)
    faces = parse_faces(get(GOOGLE_CSS))
    if not faces:
        print("Google не отдал ни одного подходящего @font-face — проверьте адрес")
        return 1

    rows, total = [], 0
    for (fam, subset), (url, rng) in sorted(faces.items()):
        name = "%s-%s.woff2" % (fam.lower(), subset)
        data = get(url, binary=True)
        with open(os.path.join(FONT_DIR, name), "wb") as fh:
            fh.write(data)
        total += len(data)
        rows.append((fam, subset, name, rng))
        print("  %-28s %6.1f КБ" % (name, len(data) / 1024))

    out = [HEAD]
    for fam in ["Nunito", "Inter"]:
        mine = [r for r in rows if r[0] == fam]
        if not mine:
            continue
        out.append("\n/* ---------- %s ---------- */" % fam)
        for _, subset, name, rng in sorted(mine, key=lambda r: KEEP.index(r[1])):
            out.append(
                "@font-face {\n"
                "  font-family: '%s';\n"
                "  font-style: normal;\n"
                "  font-weight: %s;\n"
                "  font-display: swap;\n"
                "  src: url(fonts/%s) format('woff2');\n"
                "  unicode-range: %s;\n"
                "}" % (fam, WEIGHT_RANGE.get(fam, "100 900"), name, rng))

    with open(os.path.join(CSS_DIR, "fonts.css"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(out) + "\n")

    print("\nГотово: %d файлов, %.0f КБ, css/fonts.css пересобран." % (len(rows), total / 1024.0))
    print("На страницу качаются только latin и cyrillic — остальное лежит про запас,")
    print("браузер берёт файл, только если встретит букву из его unicode-range.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
