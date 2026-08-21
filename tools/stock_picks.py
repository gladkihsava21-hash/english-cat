#!/usr/bin/env python3
"""Пятый источник: фотостоки по API-ключам владельца. Пока — Pixabay.

Ключ лежит в savely-data/pixabay.conf (вне гита). Ищем ПО РУССКОМУ
переводу слова (`lang=ru`) — как и с русской Википедией, смысл при этом
гарантирован построением: по запросу «жаба» сток не отдаст бейсбол.

Правила Pixabay учтены: кэш ответов (требуют >=24 часов — у нас вечный),
темп сильно ниже лимита 100/мин, скачивается largeImageURL один раз,
хотлинка нет. Лицензия — Pixabay Content License (свободное использование
без атрибуции; на credits.html всё равно указываем автора и источник).

Результат кладётся ОТДЕЛЬНО от вики-манифеста:
    img/words/<слово>.webp        плитка (как у всех)
    img/words/manifest-stock.json слово -> файл, автор, источник
build_images.py подмешивает stock-манифест при сборке; NO_PHOTO главнее.

Запуск:  python3 tools/stock_picks.py            # недостающие конкретные слова
         python3 tools/stock_picks.py --only bag,town
"""

import datetime
import json
import os
import re
import sys
import time
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wordpipe import existing, http_cache, imaging, picks  # noqa: E402
from expand_picks import CONCRETE_CATS, ru_guess  # noqa: E402

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
IMG_DIR = os.path.join(PROJECT_DIR, "img", "words")
STOCK_MANIFEST = os.path.join(IMG_DIR, "manifest-stock.json")

UA = ("english-cat-images/0.5 (educational vocabulary site for schoolchildren; "
      "cached pixabay api client, no hotlinking)")

# Слова из NO_PHOTO, где вики-фото было именно ПЛОХИМ (не «дубль» и не
# «читается другим словом») — стоку можно попробовать их спасти. После
# просмотра глазами удачные надо ВЫЧЕРКНУТЬ из NO_PHOTO.
RETRY = {
    "bag", "town", "teacher", "table", "wall", "computer", "oven", "lamp",
    "hedge", "diamond", "apartment", "boutique", "clinic", "clay", "arena",
    "cage", "nest", "pin", "powder", "recipe", "sidewalk", "teahouse",
    "vacuum", "month", "anniversary",
}


def read_key():
    path = os.path.join(PROJECT_DIR, "savely-data", "pixabay.conf")
    for line in open(path, encoding="utf-8"):
        if "=" in line:
            k, v = line.split("=", 1)
            if k.strip() == "api_key":
                return v.strip()
    raise SystemExit("В savely-data/pixabay.conf нет api_key")


def pixabay_search(fetcher, key, query):
    q = urllib.parse.urlencode({
        "key": key, "q": query, "lang": "ru", "image_type": "photo",
        "safesearch": "true", "per_page": 9, "orientation": "all",
    })
    res = fetcher.get("https://pixabay.com/api/?" + q, "pixabay",
                      key=query, min_interval=0.8)
    if not res.ok:
        return []
    return json.loads(res.body).get("hits", [])


def pick_hit(hits, query):
    """Пригодный кадр, лучше — с запросом прямо в тегах.

    Популярные снимки на стоке часто «эстетика» (по запросу «стол» —
    мокап с пустой рамкой НА столе); у кадра, где искомое — главный
    объект, слово обычно стоит в тегах."""
    def usable(h):
        w, hgt = h.get("imageWidth") or 0, h.get("imageHeight") or 0
        return w >= 640 and hgt >= 480 and 0.45 <= w / max(hgt, 1) <= 2.3
    stem = query.lower().replace("ё", "е")[:6]
    good = [h for h in hits if usable(h)]
    for h in good:
        tags = (h.get("tags") or "").lower().replace("ё", "е")
        if stem in tags:
            return h
    return good[0] if good else None


def main():
    only = ""
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    key = read_key()
    base = existing.load(WORDS_JS)
    manifest = json.load(open(os.path.join(IMG_DIR, "manifest.json")))
    stock = {}
    if os.path.exists(STOCK_MANIFEST):
        stock = json.load(open(STOCK_MANIFEST)).get("words", {})
    have = set(manifest["words"]) | set(stock)

    rejected_path = os.path.join(TOOLS_DIR, "wordpipe", "stock_rejected.txt")
    stock_rejected = set()
    if os.path.exists(rejected_path):
        stock_rejected = {l.strip() for l in open(rejected_path, encoding="utf-8")
                          if l.strip() and not l.startswith("#")}

    todo = []
    for w, meta in sorted(base.words.items()):
        if w in have or w in picks.REVIEW or w in stock_rejected:
            continue
        if w in picks.NO_PHOTO and w not in RETRY:
            continue
        if meta.get("cat") not in CONCRETE_CATS and w not in RETRY:
            continue
        g = ru_guess(meta["t"])
        if g:
            todo.append((w, g))
    if only:
        wanted = {x.strip() for x in only.split(",")}
        todo = [(w, g) for w, g in todo if w in wanted]
    print("К поиску на Pixabay: %d слов" % len(todo))

    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=UA)
    added, skipped = 0, []
    for i, (w, query) in enumerate(todo, 1):
        hit = pick_hit(pixabay_search(fetcher, key, query), query)
        if not hit:
            skipped.append(w)
            continue
        raw, err = imaging.fetch_file(fetcher, hit["largeImageURL"], CACHE_DIR,
                                      key="px-%d" % hit["id"], min_interval=0.9)
        if raw is None:
            skipped.append(w)
            continue
        dest = os.path.join(IMG_DIR, "%s.webp" % w)
        size, quality = imaging.to_webp(raw, dest)
        if size is None:
            skipped.append(w)
            continue
        stock[w] = {
            "file": "%s.webp" % w,
            "author": hit.get("user") or "Pixabay",
            "license": "Pixabay Content License",
            "license_url": "https://pixabay.com/service/license-summary/",
            "source": hit.get("pageURL"),
            "article": "Pixabay: %s" % query,
            "article_url": hit.get("pageURL"),
            "commons_file": "pixabay-%s" % hit.get("id"),
            "bytes": size, "quality": quality,
        }
        added += 1
        if i % 25 == 0:
            print("  %d/%d, взято %d" % (i, len(todo), added))

    payload = {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "note": ("Плитки с фотостоков по API-ключам владельца. "
                 "Pixabay Content License — атрибуция не обязательна, "
                 "но авторы указаны в credits.html."),
        "words": dict(sorted(stock.items())),
    }
    with open(STOCK_MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("Готово: +%d плиток, всего в сток-манифесте %d; без находки %d"
          % (added, len(stock), len(skipped)))


if __name__ == "__main__":
    main()
