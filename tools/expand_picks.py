#!/usr/bin/env python3
"""Автоматически расширить список слов с фотографиями (PICKS → AUTO_PICKS).

Ручной PICKS в picks.py покрывает ~130 слов, а конкретных слов в базе
порядка полутора тысяч. Совладелец прислал скрин, где в «Слово и картинка»
попало слово с эмодзи-заглушкой — владелец попросил «чтобы все были».

Что делает скрипт:
  1. Берёт из базы слова конкретных категорий (еда, животные, вещи, дом…) —
     абстракции и качества не берёт: их фотография не опознаёт.
  2. Пачками по 50 спрашивает англовику: есть ли статья с таким заголовком,
     не диcамбиг ли она, есть ли лид-изображение и русская интервики.
  3. СМЫСЛОВАЯ ПРОВЕРКА: русское название статьи должно пересекаться по
     словам с переводом из базы. Это отсекает «ruler → правитель», когда в
     базе «линейка»: у статьи-линейки интервики «Линейка», совпадение есть,
     а у правителя не было бы.
  4. Пишет tools/wordpipe/picks_auto.py (AUTO_PICKS) и отчёт в tools/out/.

Лицензии и качество картинок здесь НЕ проверяются — это делает
tools/build_images.py своим обычным конвейером (Commons, свободные
лицензии, вес, контактные листы для глаз).

Запуск:  python3 tools/expand_picks.py
"""

import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wordpipe import existing, http_cache, picks  # noqa: E402

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
OUT_DIR = os.path.join(TOOLS_DIR, "out")
AUTO_PATH = os.path.join(TOOLS_DIR, "wordpipe", "picks_auto.py")

UA = ("english-cat-images/0.2 "
      "(educational vocabulary site for schoolchildren; batch title lookup, "
      "does not hotlink)")

# Категории, где предмет можно опознать по фотографии. Качества, действия,
# чувства, связки и прочие абстракции не берём — по той же причине, по
# которой их нет в ручном PICKS (см. философию в picks.py).
CONCRETE_CATS = {
    "food", "animals", "objects", "home", "clothes", "nature", "places",
    "city", "travel", "school", "tech", "weather", "sports", "money",
    "family", "people", "work", "art", "health", "time", "body",
}

API = "https://en.wikipedia.org/w/api.php"


def norm_tokens(s):
    """русское название → множество ОСНОВ слов для сравнения смысла.

    Сравнивать целые слова нельзя: «Животные» ≠ «животное», «скорой» ≠
    «скорая» — падежи и число топили половину правильных совпадений.
    Основа = первые 6 букв (или всё слово, если короче): «животн»,
    «скор» — этого хватает, а «межлич»/«знаком» всё так же различимы."""
    s = (s or "").lower().replace("ё", "е")
    s = re.sub(r"\([^)]*\)", " ", s)
    return {t for t in re.split(r"[^а-яa-z]+", s) if len(t) >= 3}


def tokens_match(a, b):
    """Одна основа? Полное равенство («нож»=«нож») — да. Иначе общий
    префикс не короче 4 (для длинных слов 5): «помощи/помощь»,
    «скорой/скорая», «картошка/картофель» — да; «знак/значок»,
    «межличностные/знакомство» — нет."""
    if a == b:
        return True
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n >= (5 if min(len(a), len(b)) > 7 else 4)


def sets_match(ru, tr):
    return any(tokens_match(a, b) for a in ru for b in tr)


def translations_tokens(t):
    """Поле t из базы: «улица, дорога» → токены всех вариантов."""
    out = set()
    for part in re.split(r"[,;/]", t or ""):
        out |= norm_tokens(part)
    return out


def api_batch(fetcher, titles):
    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "redirects": 1,
        "titles": "|".join(titles),
        "prop": "pageprops|langlinks|pageimages",
        "ppprop": "disambiguation",
        "lllang": "ru", "lllimit": "500",
        "piprop": "name", "pilimit": "50",
    })
    res = fetcher.get(API + "?" + q, "expand",
                      key=titles[0] + "|" + str(len(titles)), min_interval=0.3)
    if not res.ok:
        raise RuntimeError("вики ответила %s (%s)" % (res.status, res.error))
    return json.loads(res.body)


def main():
    base = existing.load(WORDS_JS)
    have = set(picks.PICKS) | set(picks.NO_PHOTO) | set(picks.REVIEW)
    todo = sorted(w for w, meta in base.words.items()
                  if meta.get("cat") in CONCRETE_CATS and w not in have)
    print("База: %d слов, конкретных без картинки: %d" % (len(base.words), len(todo)))

    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=UA)
    accepted, no_article, no_image, no_ru, sense_fail = {}, [], [], [], []

    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        data = api_batch(fetcher, chunk)
        q = data.get("query", {})
        # каким словом мы спросили → каким заголовком вики ответила
        alias = {}
        for m in q.get("normalized", []) + q.get("redirects", []):
            alias[m["to"]] = alias.get(m["from"], m["from"])
        by_title = {}
        for p in q.get("pages", {}).values():
            asked = alias.get(p.get("title"), p.get("title"))
            by_title[(asked or "").lower()] = p

        for w in chunk:
            p = by_title.get(w)
            if not p or "missing" in p or "invalid" in p:
                no_article.append(w)
                continue
            if "disambiguation" in (p.get("pageprops") or {}):
                no_article.append((w, "диcамбиг"))
                continue
            if not p.get("pageimage"):
                no_image.append(w)
                continue
            ru = next((l["*"] for l in p.get("langlinks", []) or []), "")
            if not ru:
                no_ru.append((w, p["title"]))
                continue
            if sets_match(norm_tokens(ru), translations_tokens(base.words[w]["t"])):
                accepted[w] = (p["title"],)
            else:
                sense_fail.append((w, p["title"], ru, base.words[w]["t"]))
        time.sleep(0.3)
        print("  %d/%d обработано, принято %d" % (min(i + 50, len(todo)), len(todo), len(accepted)))

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(AUTO_PATH, "w", encoding="utf-8") as fh:
        fh.write('"""Сгенерировано tools/expand_picks.py — руками не править.\n\n'
                 "Слово → заголовок статьи англовики. Каждое слово прошло смысловую\n"
                 "проверку: русская интервики статьи пересекается с переводом из базы.\n"
                 "Ручной PICKS в picks.py главнее; вычёркивать плохие фото — через\n"
                 'NO_PHOTO там же."""\n\n')
        fh.write("AUTO_PICKS = {\n")
        for w in sorted(accepted):
            fh.write("    %r: (%r,),\n" % (w, accepted[w][0]))
        fh.write("}\n")

    rep = os.path.join(OUT_DIR, "expand-report.md")
    with open(rep, "w", encoding="utf-8") as fh:
        fh.write("# Авторасширение списка фотографий\n\n")
        fh.write("Принято: %d, нет статьи: %d, нет картинки: %d, "
                 "нет русской интервики: %d, смысл не совпал: %d\n\n"
                 % (len(accepted), len(no_article), len(no_image),
                    len(no_ru), len(sense_fail)))
        fh.write("## Смысл не совпал (правильно отброшены ложные друзья?)\n\n")
        for w, title, ru, t in sense_fail:
            fh.write("- %s → статья «%s» (рус. «%s»), в базе «%s»\n" % (w, title, ru, t))
        fh.write("\n## Есть статья и картинка, но нет русской интервики (вручную?)\n\n")
        for w, title in no_ru:
            fh.write("- %s → %s\n" % (w, title))
    print("Принято %d слов → %s\nОтчёт: %s" % (len(accepted), AUTO_PATH, rep))


if __name__ == "__main__":
    main()
