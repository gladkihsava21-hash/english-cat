#!/usr/bin/env python3
"""Третий источник фотографий: Викиданные (P18) со смысловой проверкой.

Первая версия ходила в wbsearchentities по слову — анонимный лимит
на этот эндпоинт кончается за минуты (сплошные 429). Поэтому SPARQL:
один запрос отдаёт сущности сразу для 200 слов — точное совпадение
английской подписи, русская подпись, картинка P18 и типы P31.

Смысловая проверка та же, что в expand_picks: русская подпись должна
совпасть по основе с переводом из базы. Люди (Q5), дизамбиги, имена,
фильмы и прочее — мимо, что бы ни совпало.

Пишет tools/wordpipe/picks_auto2.py: слово -> ("file:<имя файла>",) —
лицензию и качество файла проверит обычный build_images.py.

Запуск:  python3 tools/wikidata_picks.py
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wordpipe import existing, picks  # noqa: E402
from expand_picks import norm_tokens, sets_match, translations_tokens  # noqa: E402

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
OUT_DIR = os.path.join(TOOLS_DIR, "out")
CACHE = os.path.join(TOOLS_DIR, "cache", "wd-sparql")
AUTO2_PATH = os.path.join(TOOLS_DIR, "wordpipe", "picks_auto2.py")

WDQS = "https://query.wikidata.org/sparql"
UA = ("english-cat-images/0.3 (educational vocabulary site for schoolchildren; "
      "batched sparql label lookup, does not hotlink)")

BAD_TYPES = {
    "Q5",         # человек — personality rights
    "Q4167410",   # дизамбиг
    "Q101352",    # фамилия
    "Q202444", "Q12308941", "Q11879590",   # имена
    "Q13442814",  # научная статья
    "Q7725634",   # литературное произведение
    "Q11424",     # фильм
    "Q482994", "Q134556", "Q105543609",    # альбом, сингл, музыкальное произведение
    "Q4167836",   # категория
    "Q16521",     # таксон — берём отдельно, см. ниже
}
# Таксоны (виды животных/растений) — как раз то, что нужно: у них
# отличные фото. Q16521 в BAD_TYPES не смущает: помечаем отдельно.
BAD_TYPES.discard("Q16521")

QUERY = """SELECT ?w ?item ?ru ?img
  (GROUP_CONCAT(DISTINCT STRAFTER(STR(?type), "entity/"); separator=",") AS ?types)
WHERE {
  VALUES ?w { %s }
  ?item rdfs:label ?w .
  ?item wdt:P18 ?img .
  ?item rdfs:label ?ru . FILTER(LANG(?ru) = "ru")
  OPTIONAL { ?item wdt:P31 ?type }
}
GROUP BY ?w ?item ?ru ?img
"""


def sparql(query, key):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, re.sub(r"[^a-z0-9]+", "_", key)[:60] + ".json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    body = urllib.parse.urlencode({"query": query, "format": "json"}).encode()
    req = urllib.request.Request(WDQS, data=body, headers={
        "User-Agent": UA, "Accept": "application/sparql-results+json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.loads(r.read().decode("utf-8"))
            json.dump(data, open(path, "w", encoding="utf-8"))
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(15 * (attempt + 1))
                continue
            raise
    raise RuntimeError("WDQS не отвечает: " + key)


def main():
    base = existing.load(WORDS_JS)
    manifest = json.load(open(os.path.join(PROJECT_DIR, "img", "words", "manifest.json")))
    skip = set(manifest["words"]) | set(picks.NO_PHOTO) | set(picks.REVIEW)
    todo = sorted(w for w in base.words
                  if w not in skip and re.fullmatch(r"[a-z][a-z-]+", w))
    print("Слов без фото к поиску: %d" % len(todo))

    rows = []
    for i in range(0, len(todo), 200):
        chunk = todo[i:i + 200]
        values = " ".join('"%s"@en' % w for w in chunk)
        data = sparql(QUERY % values, "batch-%s-%d" % (chunk[0], len(chunk)))
        got = data["results"]["bindings"]
        rows += got
        print("  %d/%d слов, строк %d" % (min(i + 200, len(todo)), len(todo), len(rows)))
        time.sleep(2)

    by_word = {}
    for r in rows:
        by_word.setdefault(r["w"]["value"], []).append(r)

    accepted, log = {}, []
    for w in todo:
        tr = translations_tokens(base.words[w]["t"])
        for r in by_word.get(w, []):
            types = set((r.get("types", {}).get("value") or "").split(","))
            if types & BAD_TYPES:
                continue
            ru = r["ru"]["value"]
            if not sets_match(norm_tokens(ru), tr):
                continue
            img = urllib.parse.unquote(
                r["img"]["value"].split("/Special:FilePath/")[-1]).replace("_", " ")
            accepted[w] = ("file:" + img,)
            log.append((w, r["item"]["value"].rsplit("/", 1)[-1], ru, img))
            break

    with open(AUTO2_PATH, "w", encoding="utf-8") as fh:
        fh.write('"""Сгенерировано tools/wikidata_picks.py — руками не править.\n\n'
                 "Слово -> файл P18 сущности Викиданных, у которой английская\n"
                 "подпись равна слову, а русская совпала по основе с переводом\n"
                 'из базы. Приоритет ниже picks_auto и ручного PICKS."""\n\n')
        fh.write("AUTO_PICKS2 = {\n")
        for w in sorted(accepted):
            fh.write("    %r: (%r,),\n" % (w, accepted[w][0]))
        fh.write("}\n")

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "wikidata-report.md"), "w", encoding="utf-8") as fh:
        fh.write("# Викиданные P18\n\nПринято: %d из %d\n\n" % (len(accepted), len(todo)))
        for w, qid, ru, img in sorted(log):
            fh.write("- %s → %s «%s» → %s\n" % (w, qid, ru, img))
    print("Принято %d слов → %s" % (len(accepted), AUTO2_PATH))


if __name__ == "__main__":
    main()
