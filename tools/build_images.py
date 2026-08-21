#!/usr/bin/env python3
"""Фотографии к словам вместо эмодзи: сбор, обрезка, лицензии.

Источник — лид-изображение статьи Википедии (REST API), лицензия и автор —
Commons API. Файлы скачиваются к себе и приводятся к квадратному WebP: хотлинк
на upload.wikimedia.org запрещён правилами Викимедиа.

Ничего в рабочем коде сайта не меняется. Результат:
    img/words/<слово>.webp     плитки
    img/words/manifest.json    слово -> файл, автор, лицензия, источник
    credits.html               страница атрибуции (требование CC BY)
    tools/out/images-report.md отчёт

Примеры:
    python3 tools/build_images.py                  # полный прогон
    python3 tools/build_images.py --only cat,dog   # точечно
    python3 tools/build_images.py --offline        # пересобрать из кэша
    python3 tools/build_images.py --contact-sheet  # лист для глазной проверки
"""

import argparse
import datetime
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from wordpipe import PROJECT_UA, existing, http_cache, imaging, picks, wikimedia

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
OUT_DIR = os.path.join(TOOLS_DIR, "out")
IMG_DIR = os.path.join(PROJECT_DIR, "img", "words")
CREDITS = os.path.join(PROJECT_DIR, "credits.html")

UA = ("english-cat-images/0.1 "
      "(https://github.com/savelikot/english-cat; educational vocabulary site "
      "for schoolchildren; downloads lead images once, does not hotlink)")


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--only", default="", help="через запятую: собрать только эти слова")
    p.add_argument("--offline", action="store_true", help="только кэш, в сеть не ходить")
    p.add_argument("--refresh", action="store_true", help="перекачать, игнорируя кэш")
    # 336 = 168 CSS-пикселей × 2 — ровно под retina. 168 это фото во
    # флешкарте, самая крупная плитка на сайте; на узких экранах она
    # 132, в упражнениях 132/108, в списках 46 и 34. Стояло 480
    # «на всякий случай» — на 40% больше байтов ни за что.
    p.add_argument("--size", type=int, default=imaging.TILE)
    p.add_argument("--quality", type=int, default=78, help="стартовое качество WebP")
    p.add_argument("--max-kb", type=int, default=40, help="потолок веса одной плитки")
    p.add_argument("--summary-delay", type=float, default=0.3)
    p.add_argument("--commons-delay", type=float, default=0.4)
    p.add_argument("--download-delay", type=float, default=0.5)
    p.add_argument("--contact-sheet", action="store_true",
                   help="собрать tools/out/contact-sheet-*.jpg для проверки глазами")
    p.add_argument("--drop", default="",
                   help="через запятую: удалить эти плитки и пересобрать манифест")
    return p.parse_args(argv)


# ---------------------------------------------------------------- сбор
def collect(args, words_meta):
    """Возвращает (manifest, rejected, stats)."""
    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=UA,
                                 offline=args.offline, refresh=args.refresh)
    todo = picks.picturable_words(words_meta)
    if args.only:
        wanted = {w.strip().lower() for w in args.only.split(",") if w.strip()}
        todo = [(w, t) for w, t in todo if w in wanted]

    ladder = tuple(q for q in imaging.QUALITY_LADDER if q <= args.quality) or (args.quality,)
    max_bytes = args.max_kb * 1024

    manifest, rejected = {}, []
    started = time.time()
    for i, (word, titles) in enumerate(todo, 1):
        cand, reasons = wikimedia.find(fetcher, word, titles,
                                       summary_delay=args.summary_delay,
                                       commons_delay=args.commons_delay)
        if cand is None:
            rejected.append({"word": word, "stage": "поиск", "reasons": reasons})
            _tick(i, len(todo), word, "нет картинки", started)
            continue

        url = wikimedia.download_url(cand.filename, width=max(1000, args.size * 2))
        raw, err = imaging.fetch_file(fetcher, url, CACHE_DIR,
                                      key=cand.filename,
                                      min_interval=args.download_delay)
        if raw is None:
            rejected.append({"word": word, "stage": "скачивание",
                             "reasons": ["%s: %s" % (cand.filename, err)]})
            _tick(i, len(todo), word, "не скачалось", started)
            continue

        dest = os.path.join(IMG_DIR, "%s.webp" % word)
        size, quality = imaging.to_webp(raw, dest, size=args.size,
                                        max_bytes=max_bytes, ladder=ladder)
        if size is None:
            rejected.append({"word": word, "stage": "обработка",
                             "reasons": ["%s: %s" % (cand.filename, quality)]})
            _tick(i, len(todo), word, "не обработалось", started)
            continue

        manifest[word] = {
            "file": "%s.webp" % word,
            "author": cand.author,
            "license": cand.license_short or cand.license,
            "license_url": cand.license_url,
            "source": cand.descriptionurl,
            "article": cand.article,
            "article_url": cand.article_url,
            "commons_file": cand.filename,
            "bytes": size,
            "quality": quality,
        }
        _tick(i, len(todo), word, "%.1f КБ q%d" % (size / 1024.0, quality), started)

    print()
    return manifest, rejected, fetcher.stats


def _tick(done, total, word, note, started):
    elapsed = time.time() - started
    sys.stdout.write("\r  %3d/%d  %-14s %-22s  %4.0f c   " % (done, total, word, note, elapsed))
    sys.stdout.flush()


# ------------------------------------------------------------- выдача
def prune(img_dir, manifest):
    """Удалить плитки, которых больше нет в манифесте.

    Слово могло вылететь из выборки или не пройти фильтр качества со второго
    захода — файл при этом остаётся лежать и попадает в вес папки, а на сайте
    выглядит как «картинка есть, а в манифесте нет». Чистим.
    """
    keep = {m["file"] for m in manifest.values()}
    removed = []
    for name in sorted(os.listdir(img_dir)):
        if name.endswith(".webp") and name not in keep:
            os.remove(os.path.join(img_dir, name))
            removed.append(name[:-5])
    return removed


def write_manifest(path, manifest, tile=None):
    payload = {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "note": ("Файлы скачаны с Wikimedia Commons и приведены к квадратному WebP. "
                 "Лицензии: public domain / CC0 / CC BY / CC BY-SA. "
                 "Атрибуция — credits.html"),
        "size": tile or imaging.TILE,
        "count": len(manifest),
        "words": dict(sorted(manifest.items())),
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1, sort_keys=False)
        fh.write("\n")


def merge_stock(manifest):
    """Подмешать плитки с фотостоков (tools/stock_picks.py).

    Сток-манифест живёт отдельно: вики-конвейер пересобирает свой манифест
    с нуля и иначе выбрасывал бы стоковые плитки при prune. NO_PHOTO
    главнее: слово, забракованное глазами, не вернётся и со стока,
    пока запись не вычеркнут."""
    if not os.path.exists(os.path.join(IMG_DIR, "manifest-stock.json")):
        return manifest
    stock = json.load(open(os.path.join(IMG_DIR, "manifest-stock.json"),
                           encoding="utf-8")).get("words", {})
    for w, entry in stock.items():
        if w not in manifest and w not in picks.NO_PHOTO and w not in picks.REVIEW:
            manifest[w] = entry
    return manifest


def write_word_photos_js(path, manifest):
    """js/word-photos.js — список слов с фотографией для фронтенда.

    Раньше файл синхронизировали руками, и манифест с ним разъезжался
    (110 против 111). Теперь пишется из того же манифеста, что и всё
    остальное."""
    words = sorted(manifest)
    lines = []
    for i in range(0, len(words), 6):
        lines.append("  " + ", ".join('"%s": 1' % w for w in words[i:i + 6]))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("// Сгенерировано tools/build_images.py — руками не править.\n"
                 "// Только список слов, у которых есть фотография: имя файла всегда\n"
                 "// img/words/<слово>.webp. Значение не несёт смысла, важен сам ключ.\n"
                 "// Лицензии и авторы — img/words/manifest.json и credits.html.\n"
                 "const WORD_PHOTOS = {\n")
        fh.write(",\n".join(lines))
        fh.write("\n};\n")


def esc(text):
    return (str(text or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def write_credits(path, manifest, words_meta):
    rows = []
    for word, m in sorted(manifest.items()):
        translation = (words_meta.get(word) or {}).get("t", "")
        lic = esc(m["license"])
        if m.get("license_url"):
            lic = '<a href="%s" rel="license noopener" target="_blank">%s</a>' % (
                esc(m["license_url"]), lic)
        rows.append(
            "    <tr>\n"
            "      <td class=\"cr-pic\"><img src=\"img/words/%s\" alt=\"%s\" "
            "width=\"64\" height=\"64\" loading=\"lazy\"></td>\n"
            "      <td class=\"cr-word\"><b>%s</b><span>%s</span></td>\n"
            "      <td>%s</td>\n"
            "      <td>%s</td>\n"
            "      <td><a href=\"%s\" rel=\"noopener\" target=\"_blank\">%s</a></td>\n"
            "    </tr>"
            % (esc(m["file"]), esc(word), esc(word), esc(translation),
               esc(m["author"]), lic, esc(m["source"]),
               "страница на Pixabay" if "pixabay" in (m["source"] or "")
               else "файл на Commons"))

    html = """<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Источники картинок — Савелий, кот-репетитор английского</title>
  <meta name="robots" content="noindex">
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/style.css">
  <style>
    /* Страница открывается отдельно от приложения, без savely.css и js/theme.js.
       Поэтому цвета берём напрямую из tokens.css: --paper и --ink переключаются
       в паре (в том числе по системной тёмной теме), а --bg из style.css —
       захардкоженный светлый, с ним текст в тёмной теме пропадает. */
    body { background: var(--paper); color: var(--ink); }
    .credits { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; color: var(--ink); }
    .credits h1 { margin: 0 0 8px; color: var(--ink); }
    .credits p { color: var(--ink-soft); line-height: 1.6; }
    .credits p b { color: var(--ink); }
    .credits table { width: 100%%; border-collapse: collapse; margin-top: 24px;
      font-size: var(--text-caption, 16px); }
    .credits th, .credits td { text-align: left; padding: 10px 12px; vertical-align: middle;
      border-bottom: var(--border-w, 1px) solid var(--line-soft, #E1E4DD); }
    .credits th { font-weight: 700; white-space: nowrap; color: var(--ink-soft); }
    .credits td { color: var(--ink-soft); }
    .cr-pic { width: 64px; }
    .cr-pic img { display: block; width: 64px; height: 64px; object-fit: cover; border-radius: 12px;
      background: var(--surface-alt); }
    .cr-word b { display: block; color: var(--ink); font-size: var(--text-body-sm, 18px); }
    .cr-word span { color: var(--ink-soft); }
    .credits a { color: var(--accent); }
    .credits a:hover { text-decoration: none; }
    @media (max-width: 640px) {
      .credits table, .credits thead, .credits tbody, .credits tr, .credits td, .credits th { display: block; }
      .credits thead { display: none; }
      .credits tr { border-bottom: var(--border-w, 1px) solid var(--line-soft, #E1E4DD); padding: 12px 0; }
      .credits td { border: 0; padding: 2px 0; }
      .cr-pic img { width: 88px; height: 88px; }
    }
  </style>
</head>
<body>
<main class="credits">
  <h1>Источники картинок</h1>
  <p>Фотографии на карточках слов взяты с
    <a href="https://commons.wikimedia.org/" rel="noopener" target="_blank">Wikimedia Commons</a>
    (свободные лицензии: public domain, CC0, CC BY, CC BY-SA) и с фотостока
    <a href="https://pixabay.com/" rel="noopener" target="_blank">Pixabay</a>
    (Pixabay Content License).
    Файлы скачаны и уменьшены до квадратной плитки (кадрирование по центру) —
    оригиналы доступны по ссылкам в таблице.</p>
  <p>Лицензии CC BY и CC BY-SA требуют указания автора — эта страница и есть такое указание.
    Если вы автор снимка и хотите изменить или убрать атрибуцию, напишите нам.</p>
  <p><b>Всего изображений: %d.</b> Обновлено: %s.</p>
  <table>
    <thead>
      <tr><th></th><th>Слово</th><th>Автор</th><th>Лицензия</th><th>Источник</th></tr>
    </thead>
    <tbody>
%s
    </tbody>
  </table>
</main>
</body>
</html>
""" % (len(manifest), datetime.datetime.now().strftime("%d.%m.%Y"), "\n".join(rows))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)


def contact_sheet(manifest, out_dir, per_row=8, cell=160, rows_per_sheet=6):
    """Лист-миниатюра со всеми плитками и подписями — чтобы проверить глазами."""
    from PIL import Image, ImageDraw
    words = sorted(manifest)
    per_sheet = per_row * rows_per_sheet
    made = []
    for sheet_no in range((len(words) + per_sheet - 1) // per_sheet):
        chunk = words[sheet_no * per_sheet:(sheet_no + 1) * per_sheet]
        rows = (len(chunk) + per_row - 1) // per_row
        canvas = Image.new("RGB", (per_row * cell, rows * (cell + 18)), (255, 255, 255))
        draw = ImageDraw.Draw(canvas)
        for idx, word in enumerate(chunk):
            path = os.path.join(IMG_DIR, manifest[word]["file"])
            if not os.path.exists(path):
                continue
            tile = Image.open(path).convert("RGB").resize((cell - 4, cell - 4), Image.LANCZOS)
            x, y = (idx % per_row) * cell, (idx // per_row) * (cell + 18)
            canvas.paste(tile, (x + 2, y + 2))
            draw.text((x + 4, y + cell), word, fill=(0, 0, 0))
        dest = os.path.join(out_dir, "contact-sheet-%d.jpg" % (sheet_no + 1))
        canvas.save(dest, "JPEG", quality=88)
        made.append(dest)
    return made


# План внедрения. Лежит здесь, а не в отдельном файле, чтобы отчёт был
# самодостаточным: собрал картинки — сразу видно, что дальше делать руками.
PLAN = """
## План внедрения

Ничего в рабочем коде сайта я не трогал: `js/images.js`, `js/app.js`,
`js/exercises.js`, `js/tutor.js` остались как были. Ниже — что именно поменять.

### 1. Отдать манифест фронтенду

Сайт грузит данные обычными `<script>`, сборки нет, поэтому `fetch` манифеста
добавит асинхронность там, где её сейчас нет. Проще сгенерировать соседний файл
`js/word-photos.js` с обычной константой:

```js
// сгенерировано tools/build_images.py, руками не править
const WORD_PHOTOS = { "cat": 1, "dog": 1, /* ... */ };
```

Значение не важно — важен сам факт наличия ключа, имя файла всегда
`img/words/<слово>.webp`. Подключить в `index.html` и `tutor.html` рядом с
`js/images.js`, до `js/app.js`.

### 2. Разделить «образ для показа» и «образ для сравнения»

`wordArt()` сейчас возвращает строку-эмодзи, и это используется двумя разными
способами: для вывода и для сравнения (`js/exercises.js:438` проверяет, что у
слова-ловушки образ отличается от правильного). Если заставить `wordArt()`
возвращать HTML, сравнение начнёт сличать теги — работать будет, но по
случайности. Поэтому две функции, а не одна:

```js
// js/images.js — БЕЗ изменений в поведении, старое имя остаётся строкой
function wordArt(word, category) {
  const key = String(word || "").toLowerCase().trim();
  return WORD_ART[key] || CATEGORY_ART[category] || "🐾";
}

// новое: готовая разметка плитки
function wordArtHTML(word, category) {
  const key = String(word || "").toLowerCase().trim();
  if (typeof WORD_PHOTOS !== "undefined" && WORD_PHOTOS[key]) {
    return `<img src="img/words/${encodeURIComponent(key)}.webp" alt=""
            width="480" height="480" loading="lazy" decoding="async">`;
  }
  return escapeHTML(wordArt(word, category));
}
```

`alt=""` — плитка декоративная, слово написано рядом текстом; озвучивать его
скринридеру второй раз не нужно. Там, где плитка стоит без подписи, нужен
`alt` со словом — и вот его уже обязательно экранировать.

### 3. Про экранирование

Слова приходят из своей же базы `js/words.js` (латиница, свои данные), так что
дыры сейчас нет. Но `wordArtHTML` возвращает именно HTML, поэтому:

* ключ в `src` прогонять через `encodeURIComponent` (выше уже сделано);
* эмодзи-ветку прогонять через экранирование — иначе функция «иногда HTML,
  иногда нет», и первая же категория с кавычкой в названии сломает вёрстку;
* `escapeHTML` в проекте нет — добавить в `js/util.js`:
  `const escapeHTML = s => String(s).replace(/[&<>"']/g, c =>
   ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));`

### 4. Где заменить вызовы

Шесть мест уже подставляют результат в шаблонную строку, то есть в `innerHTML`.
Там достаточно заменить имя функции:

| Файл и строка | Сейчас | Станет |
|---|---|---|
| `js/app.js:409` | `${wordArt(wd.w, wd.cat)}` | `${wordArtHTML(wd.w, wd.cat)}` |
| `js/app.js:771` | `${wordArt(rec.w, rec.cat)}` | `${wordArtHTML(rec.w, rec.cat)}` |
| `js/app.js:865` | `${wordArt(d.w, info0.cat)}` | `${wordArtHTML(d.w, info0.cat)}` |
| `js/tutor.js:739` | `${wordArt(w.w, w.cat)}` | `${wordArtHTML(w.w, w.cat)}` |
| `js/exercises.js:445,466,480` | `art: wordArt(p.w, p.cat)` | `art: wordArtHTML(p.w, p.cat)` |
| `js/exercises.js:248,376` | `>${r.art}<` | без изменений, `r.art` уже разметка |

`js/exercises.js:438` НЕ трогать: сравнение образов должно остаться на эмодзи.

### 5. Узкое место: `js/app.js:979`

```js
art.textContent = wordArt(item.w, info.cat);   // было
```

Через `textContent` тег `<img>` не вставить — браузер покажет literal `<img ...>`
текстом. Меняем на:

```js
art.innerHTML = wordArtHTML(item.w, info.cat);
```

Экранирование здесь закрыто пунктом 3: `wordArtHTML` сама возвращает
безопасную строку в обеих ветках. Присваивание `art.style.background` строкой
ниже трогать не надо.

Второе такое же место — `artBlock()` в `js/images.js:327`, там тоже
`div.textContent`. Функция сейчас ниоткуда не вызывается: либо поправить
заодно (`div.innerHTML = wordArtHTML(...)`), либо удалить как мёртвый код.

### 6. CSS

`.word-art` — это flex-контейнер с `font-size` под эмодзи. Картинку нужно
растянуть на всю плитку, в `css/style.css` после блока `.word-art`:

```css
.word-art img {
  width: 100%; height: 100%;
  object-fit: cover;          /* фото уже квадратное, но пусть будет */
  border-radius: inherit;     /* углы плитки: 24/20/13/10px по размеру */
  display: block;
}
```

Подложка `wordTint()` под фотографией не видна — это нормально, она остаётся
для слов, у которых картинки нет. `css/savely.css:800` с `!important` менять
не нужно.

### 7. Service worker

`sw.js` перечисляет файлы поимённо и версионируется вручную (`CACHE =
"savely-v17"`). Класть туда 110 картинок списком не надо — это 3 МБ в
предзагрузку на каждого ученика. Лучше добавить в `js/word-photos.js` версию,
поднять `CACHE` до `savely-v18` и докладывать картинки в кэш по факту запроса:

```js
// в обработчике fetch, перед сетевым запросом
if (url.pathname.includes("/img/words/")) {
  e.respondWith(caches.open(CACHE).then(c =>
    c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
      c.put(e.request, r.clone()); return r;
    }))));
  return;
}
```

Тогда офлайн работают те слова, которые ученик уже видел, а первый заход не
тянет три мегабайта.

### 8. Упражнение «Слово и картинка»

`PICTURABLE` в `js/images.js` — это ручной список из 200+ слов, собранный под
эмодзи. Теперь есть точный список тех, у кого настоящая фотография. Разумно
сузить:

```js
const named = (typeof WORD_PHOTOS !== "undefined")
  ? new Set(Object.keys(WORD_PHOTOS))
  : PICTURABLE;
```

Иначе в упражнение попадут слова вроде `deliberately`, у которых образ — эмодзи
👉, и по картинке их не угадать.

### 9. Проверить после внедрения

* карточка-флешка (`app.js:979`) — картинка на месте, не литеральный `<img`;
* словарь и «слово дня» — плитки 46 и 34 px, картинка не растянута;
* слово без фотографии (`hand`, `love`, `democracy`) — эмодзи как раньше;
* тёмная тема — у фотографии нет своей подложки, углы срезаны;
* `credits.html` открывается и картинки в нём видны.
"""


def write_report(path, manifest, rejected, words_meta, stats, seconds):
    total_words = len(words_meta)
    attempted = len(picks.PICKS)
    got = len(manifest)
    folder = imaging.folder_bytes(IMG_DIR)
    sizes = sorted((m["bytes"] for m in manifest.values()), reverse=True)
    heavy = [(w, m["bytes"]) for w, m in sorted(manifest.items(),
             key=lambda kv: -kv[1]["bytes"])[:5]]

    by_license = {}
    for m in manifest.values():
        by_license[m["license"]] = by_license.get(m["license"], 0) + 1

    lines = []
    add = lines.append
    add("# Фотографии к словам — отчёт\n")
    add("Собрано %s. Скрипт: `tools/build_images.py`.\n"
        % datetime.datetime.now().strftime("%d.%m.%Y %H:%M"))

    add("## Цифры\n")
    add("| | |")
    add("|---|---|")
    add("| Слов в базе `js/words.js` | %d |" % total_words)
    add("| Из них отобрано под фотографию | %d |" % attempted)
    add("| Картинок получено | **%d** |" % got)
    add("| Отброшено на сборке | %d |" % len(rejected))
    add("| Вынесено вам на решение | %d |" % len(picks.REVIEW))
    add("| Общий вес `img/words/` | %.0f КБ (%.1f МБ) |" % (folder / 1024.0, folder / 1048576.0))
    add("| Средняя плитка | %.1f КБ |" % ((sum(sizes) / float(len(sizes) or 1)) / 1024.0))
    add("| Самая тяжёлая | %.1f КБ |" % ((sizes[0] if sizes else 0) / 1024.0))
    add("| Запросов: сеть / кэш / ошибки | %d / %d / %d |"
        % (stats.get("network", 0), stats.get("cache_hits", 0), stats.get("errors", 0)))
    add("| Время прогона | %.0f с |\n" % seconds)

    add("Самые тяжёлые плитки: %s.\n"
        % ", ".join("%s %.1f КБ" % (w, b / 1024.0) for w, b in heavy))

    add("## Лицензии\n")
    add("Пропускались только public domain, CC0, CC BY и CC BY-SA. Всё остальное")
    add("(NC, ND, GFDL без парной CC, fair use, «лицензия не указана», файлы из")
    add("локальных разделов Википедии, а не с Commons) отбрасывалось автоматически.\n")
    add("| Лицензия | Картинок |")
    add("|---|---|")
    for lic, n in sorted(by_license.items(), key=lambda kv: -kv[1]):
        add("| %s | %d |" % (lic, n))
    add("")
    add("Автор, лицензия и ссылка на файл лежат в `img/words/manifest.json` для")
    add("каждого слова и продублированы человекочитаемо в `credits.html`.\n")

    if rejected:
        add("## Что не получилось (%d)\n" % len(rejected))
        add("Машинная причина отказа по каждому слову, оставшемуся в выборке.")
        add("Эти же слова разобраны по-человечески в следующем разделе.\n")
        add("| Слово | Этап | Причина |")
        add("|---|---|---|")
        for r in sorted(rejected, key=lambda r: r["word"]):
            reason = "; ".join(r["reasons"])[:180].replace("|", "/")
            add("| %s | %s | %s |" % (r["word"], r["stage"], reason))
        add("")

    add("## Отобраны, но фотографии не нашлось (%d)\n" % len(picks.NO_PHOTO))
    add("Слова были в выборке, но после просмотра глазами вылетели: у Википедии")
    add("по ним лид — не фотография предмета, а гравюра, схема, текст или логотип,")
    add("и запасные статьи дают то же самое. Этим словам остаётся эмодзи.\n")
    add("| Слово | Перевод | Почему |")
    add("|---|---|---|")
    for word, why in sorted(picks.NO_PHOTO.items()):
        t = (words_meta.get(word) or {}).get("t", "")
        add("| %s | %s | %s |" % (word, t, why))
    add("")

    add("## Спорные слова — нужно ваше решение (%d)\n" % len(picks.REVIEW))
    add("Эти слова я НЕ собирал: аудитория — школьники, часть младше 12, и у")
    add("лид-изображения по ним регулярно оказывается медицина, взрослое или")
    add("политически острое содержание. Сам решать не стал.\n")
    add("| Слово | Перевод | Что не так |")
    add("|---|---|---|")
    for word, why in sorted(picks.REVIEW.items()):
        t = (words_meta.get(word) or {}).get("t", "")
        add("| %s | %s | %s |" % (word, t, why))
    add("")

    watch = {w: why for w, why in picks.WATCH.items() if w in manifest}
    if watch:
        add("## Собрано, но просмотрите глазами (%d)\n" % len(watch))
        add("| Слово | На что смотреть |")
        add("|---|---|")
        for word, why in sorted(watch.items()):
            add("| %s | %s |" % (word, why))
        add("")

    add(PLAN.strip())
    add("")

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    return {"folder_bytes": folder, "by_license": by_license}


# --------------------------------------------------------------- main
def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    started = time.time()

    base = existing.load(WORDS_JS)
    words_meta = base.words
    print("База: %d слов. Под фотографию отобрано %d." % (len(words_meta), len(picks.PICKS)))

    os.makedirs(IMG_DIR, exist_ok=True)
    os.makedirs(OUT_DIR, exist_ok=True)

    manifest_path = os.path.join(IMG_DIR, "manifest.json")
    if args.drop:
        # снять уже собранные плитки, забракованные глазами
        old, prev_tile = {}, None
        if os.path.exists(manifest_path):
            prev = json.load(open(manifest_path, encoding="utf-8"))
            old, prev_tile = prev.get("words", {}), prev.get("size")
        for word in (w.strip().lower() for w in args.drop.split(",") if w.strip()):
            old.pop(word, None)
            path = os.path.join(IMG_DIR, "%s.webp" % word)
            if os.path.exists(path):
                os.remove(path)
                print("  снято: %s" % word)
        # --drop только удаляет плитки, размер оставшихся не трогает —
        # поэтому берём тот, что записан в манифесте, а не текущий args
        old = merge_stock(old)
        write_manifest(manifest_path, old, prev_tile)
        write_credits(CREDITS, old, words_meta)
        write_word_photos_js(os.path.join(PROJECT_DIR, "js", "word-photos.js"), old)
        print("Манифест и credits.html пересобраны: %d картинок." % len(old))
        return 0

    manifest, rejected, stats = collect(args, words_meta)

    if args.only and os.path.exists(manifest_path):
        # точечный прогон дополняет, а не затирает
        old = json.load(open(manifest_path, encoding="utf-8")).get("words", {})
        old.update(manifest)
        manifest = old
        manifest = merge_stock(manifest)
    else:
        # сток подмешивается ДО prune — иначе prune снесёт стоковые плитки,
        # которых нет в вики-манифесте
        manifest = merge_stock(manifest)
        dropped = prune(IMG_DIR, manifest)
        if dropped:
            print("Убраны устаревшие плитки: %s" % ", ".join(dropped))

    write_manifest(manifest_path, manifest, args.size)
    write_credits(CREDITS, manifest, words_meta)
    write_word_photos_js(os.path.join(PROJECT_DIR, "js", "word-photos.js"), manifest)
    elapsed = time.time() - started
    info = write_report(os.path.join(OUT_DIR, "images-report.md"),
                        manifest, rejected, words_meta, stats, elapsed)

    if args.contact_sheet:
        for path in contact_sheet(manifest, OUT_DIR):
            print("Лист для проверки: %s" % path)

    print("Готово за %.0f с: %d картинок, %.0f КБ в img/words/, отброшено %d."
          % (elapsed, len(manifest), info["folder_bytes"] / 1024.0, len(rejected)))
    print("Лицензии: %s" % ", ".join("%s×%d" % (k, v) for k, v in
                                     sorted(info["by_license"].items(), key=lambda kv: -kv[1])))
    print("Файлы: img/words/, credits.html, tools/out/images-report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
