#!/usr/bin/env python3
"""Пятый и шестой источники: фотостоки по API-ключам владельца —
Pixabay и Pexels (fallback: Pexels пробуем там, где Pixabay пуст).

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
from expand_picks import ru_guess  # noqa: E402

# Стокам — только предметные категории. Действия/чувства/общение возят
# мусор и каламбуры («download» → погрузчик): проверено первым прогоном,
# из 484 таких плиток не выжила почти ни одна.
STOCK_CATS = {
    "food", "animals", "objects", "home", "clothes", "nature", "places",
    "city", "travel", "school", "tech", "weather", "sports", "money",
    "family", "body", "health", "time",
}

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


def read_key(name, required=True):
    path = os.path.join(PROJECT_DIR, "savely-data", name + ".conf")
    try:
        for line in open(path, encoding="utf-8"):
            if "=" in line:
                k, v = line.split("=", 1)
                if k.strip() == "api_key":
                    return v.strip()
    except OSError:
        pass
    if required:
        raise SystemExit("В savely-data/%s.conf нет api_key" % name)
    return ""


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


def pexels_search(fetcher, key, query):
    """Pexels: поиск по русскому запросу (locale=ru-RU), авторизация
    заголовком. Хиты приводим к форме Pixabay, чтобы отбор был один."""
    q = urllib.parse.urlencode({
        "query": query, "locale": "ru-RU", "per_page": 9,
    })
    res = fetcher.get("https://api.pexels.com/v1/search?" + q, "pexels",
                      key=query, min_interval=1.2,
                      headers={"Authorization": key})
    if not res.ok:
        return []
    out = []
    for p in json.loads(res.body).get("photos", []):
        out.append({
            "id": p.get("id"),
            "imageWidth": p.get("width"), "imageHeight": p.get("height"),
            "tags": p.get("alt") or "",
            "largeImageURL": (p.get("src") or {}).get("large2x")
                             or (p.get("src") or {}).get("original"),
            "pageURL": p.get("url"),
            "user": p.get("photographer") or "Pexels",
            "_provider": "pexels",
        })
    return out


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
    px_key = read_key("pixabay", required=False)
    pe_key = read_key("pexels", required=False)
    if not px_key and not pe_key:
        raise SystemExit("Нет ни одного ключа стока в savely-data/*.conf")
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
        if meta.get("cat") not in STOCK_CATS and w not in RETRY:
            continue
        g = ru_guess(meta["t"])
        if g:
            todo.append((w, g))
    if only:
        wanted = {x.strip() for x in only.split(",")}
        todo = [(w, g) for w, g in todo if w in wanted]
    print("К поиску на стоках: %d слов (Pixabay%s)" % (
        len(todo), " + Pexels" if pe_key else ""))

    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=UA)
    added, skipped = 0, []
    for i, (w, query) in enumerate(todo, 1):
        # Кандидаты пробуются ДО ПЕРВОГО СКАЧАННОГО: сорвалось скачивание
        # или конвертация у Pixabay — идём в Pexels, а не в skipped.
        raw, hit, provider = None, None, ""
        sources = []
        if px_key:
            sources.append(("pixabay", lambda: pixabay_search(fetcher, px_key, query)))
        if pe_key:
            sources.append(("pexels", lambda: pexels_search(fetcher, pe_key, query)))
        for prov, search in sources:
            cand = pick_hit(search(), query)
            if not cand or not cand.get("largeImageURL"):
                continue
            raw, err = imaging.fetch_file(fetcher, cand["largeImageURL"], CACHE_DIR,
                                          key="%s-%s" % (prov, cand["id"]),
                                          min_interval=0.9)
            if raw is not None:
                hit, provider = cand, prov
                break
        if raw is None:
            skipped.append(w)
            continue
        dest = os.path.join(IMG_DIR, "%s.webp" % w)
        size, quality = imaging.to_webp(raw, dest)
        if size is None:
            skipped.append(w)
            continue
        pretty = "Pexels" if provider == "pexels" else "Pixabay"
        stock[w] = {
            "file": "%s.webp" % w,
            "author": hit.get("user") or pretty,
            "license": ("Pexels License" if provider == "pexels"
                        else "Pixabay Content License"),
            "license_url": ("https://www.pexels.com/license/"
                            if provider == "pexels"
                            else "https://pixabay.com/service/license-summary/"),
            "source": hit.get("pageURL"),
            "article": "%s: %s" % (pretty, query),
            "article_url": hit.get("pageURL"),
            "commons_file": "%s-%s" % (provider, hit.get("id")),
            "bytes": size, "quality": quality,
        }
        added += 1
        if i % 25 == 0:
            print("  %d/%d, взято %d" % (i, len(todo), added))

    payload = {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "note": ("Плитки с фотостоков по API-ключам владельца: Pixabay "
                 "Content License и Pexels License — атрибуция не "
                 "обязательна, но авторы указаны в credits.html."),
        "words": dict(sorted(stock.items())),
    }
    with open(STOCK_MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("Готово: +%d плиток, всего в сток-манифесте %d; без находки %d"
          % (added, len(stock), len(skipped)))


if __name__ == "__main__":
    main()
