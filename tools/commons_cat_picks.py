#!/usr/bin/env python3
"""Четвёртый источник: лучший JPEG из категории Commons (P373).

Для слов, чей смысл уже подтверждён (совпали подписи Викиданных), но
лид-картинка забракована фильтрами (svg, старина, панорама, мелкая):
у сущности почти всегда есть P373 — категория на Викискладе, где лежат
десятки нормальных фотографий. Берём оттуда кандидатов: JPEG, не мельче
500px, без «diagram/map/logo…» в имени, сортировка по размеру; лицензию
и прочее дальше проверит build_images.py.

Пишет tools/wordpipe/picks_auto3.py: слово -> ("file:<имя>", ...) — до
трёх кандидатов на слово, приоритет ниже всех остальных списков.

Запуск:  python3 tools/commons_cat_picks.py
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wordpipe import existing, http_cache, picks  # noqa: E402
from expand_picks import norm_tokens, sets_match, translations_tokens  # noqa: E402
from wikidata_picks import BAD_TYPES, sparql  # noqa: E402

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
OUT_DIR = os.path.join(TOOLS_DIR, "out")
AUTO3_PATH = os.path.join(TOOLS_DIR, "wordpipe", "picks_auto3.py")

COMMONS = "https://commons.wikimedia.org/w/api.php"
UA = ("english-cat-images/0.4 (educational vocabulary site for schoolchildren; "
      "picks best jpeg from P373 category, does not hotlink)")

QUERY = """SELECT ?w ?item ?ru ?cat
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=",") AS ?types)
WHERE {
  VALUES ?w { %s }
  ?item rdfs:label ?w .
  ?item wdt:P373 ?cat .
  ?item rdfs:label ?ru . FILTER(LANG(?ru) = "ru")
  OPTIONAL { ?item wdt:P31 ?type }
}
GROUP BY ?w ?item ?ru ?cat
"""

BAD_NAME = re.compile(
    r"diagram|map|chart|logo|coat.of.arms|flag|icon|scheme|svg|plan\b|"
    r"karte|collage|montage|screenshot|banner|emblem", re.I)


def category_files(fetcher, cat):
    """Файлы категории с размерами и mime — один запрос на категорию."""
    q = urllib.parse.urlencode({
        "action": "query", "format": "json",
        "generator": "categorymembers",
        "gcmtitle": "Category:" + cat, "gcmtype": "file", "gcmlimit": 50,
        "prop": "imageinfo", "iiprop": "size|mime",
    })
    res = fetcher.get(COMMONS + "?" + q, "commons-cat", key=cat, min_interval=0.3)
    if not res.ok:
        return []
    out = []
    for p in (json.loads(res.body).get("query", {}).get("pages", {}) or {}).values():
        ii = (p.get("imageinfo") or [{}])[0]
        name = p.get("title", "").replace("File:", "")
        if ii.get("mime") != "image/jpeg" or BAD_NAME.search(name):
            continue
        w, h = ii.get("width") or 0, ii.get("height") or 0
        if w < 500 or h < 400 or not (0.5 <= w / max(h, 1) <= 2.2):
            continue
        out.append((w * h, name))
    out.sort(reverse=True)
    return [n for _, n in out[:3]]


def main():
    base = existing.load(WORDS_JS)
    manifest = json.load(open(os.path.join(PROJECT_DIR, "img", "words", "manifest.json")))
    skip = set(manifest["words"]) | set(picks.NO_PHOTO) | set(picks.REVIEW)
    todo = sorted(w for w in base.words
                  if w not in skip and re.fullmatch(r"[a-z][a-z-]+", w))
    print("Слов без фото: %d — ищем категории" % len(todo))

    cats, rows = {}, []
    for i in range(0, len(todo), 200):
        chunk = todo[i:i + 200]
        values = " ".join('"%s"@en' % w for w in chunk)
        data = sparql(QUERY % values, "cat-%s-%d" % (chunk[0], len(chunk)))
        rows += data["results"]["bindings"]
        time.sleep(2)
    for r in rows:
        w = r["w"]["value"]
        if w in cats:
            continue
        types = set((r.get("types", {}).get("value") or "").split(","))
        if types & BAD_TYPES:
            continue
        if not sets_match(norm_tokens(r["ru"]["value"]),
                          translations_tokens(base.words[w]["t"])):
            continue
        cats[w] = r["cat"]["value"]
    print("Категории со смысловым совпадением: %d" % len(cats))

    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=UA)
    accepted = {}
    for i, (w, cat) in enumerate(sorted(cats.items()), 1):
        files = category_files(fetcher, cat)
        if files:
            accepted[w] = tuple("file:" + f for f in files)
        if i % 50 == 0:
            print("  %d/%d категорий, набрано %d" % (i, len(cats), len(accepted)))

    with open(AUTO3_PATH, "w", encoding="utf-8") as fh:
        fh.write('"""Сгенерировано tools/commons_cat_picks.py — руками не править.\n\n'
                 "Слово -> до трёх крупнейших JPEG из категории Commons (P373)\n"
                 "сущности, прошедшей смысловую проверку по русской подписи.\n"
                 'Приоритет ниже всех остальных списков."""\n\n')
        fh.write("AUTO_PICKS3 = {\n")
        for w in sorted(accepted):
            fh.write("    %r: %r,\n" % (w, accepted[w]))
        fh.write("}\n")
    print("Принято %d слов → %s" % (len(accepted), AUTO3_PATH))


if __name__ == "__main__":
    main()
