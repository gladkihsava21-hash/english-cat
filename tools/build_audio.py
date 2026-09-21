#!/usr/bin/env python3
"""Озвучка слов записями живых носителей с Wikimedia Commons.

Зачем. Кнопка звука сейчас говорит браузерным синтезом: на айфоне сносно,
на дешёвом андроиде — робот. На Commons лежат десятки тысяч записей
произношений под свободными лицензиями (PD/CC0/CC BY/CC BY-SA) — это
живые люди, и это можно брать легально с указанием автора, ровно как
мы уже делаем с фотографиями (tools/build_images.py).

Откуда файлы. Имена на Commons каноничны: «File:En-us-<слово>.ogg» —
американское произношение, «File:En-<слово>.ogg» — без пометки (чаще
тоже US), «File:En-uk-<слово>.ogg» — британское. Берём в этом порядке:
транскрипции у нас американские (CMU), значит и голос по умолчанию
американский; британский — только когда другого нет: живой человек
лучше синтеза, а расхождения на школьной лексике невелики.

Лицензии. Фильтр тот же, что у фотографий, — wikimedia.license_ok():
только PD / CC0 / CC BY / CC BY-SA, файлы с ограничениями и «не
указано» отсеиваются. Автор и лицензия каждой записи — в манифесте,
сводная атрибуция — на credits.html (генерит build_images.py).

Что на выходе.
    audio/words/<слово>.mp3        моно, ~40 кбит/с, тишина по краям
                                   срезана, громкость выровнена
    audio/words/manifest.json      слово -> файл, вариант, автор, лицензия
    js/word-audio.js               список слов с записью (как word-photos)

Расширение: индекс kaikki.org (--kaikki). Трёх канонических имён мало —
у Commons куда больше записей: Lingua Libre («File:LL-Q1860 (eng)-
<диктор>-<слово>.wav»), en-au/en-ca/en-gb, варианты с суффиксом части
речи. Индекс word -> [{audio, tags, mp3_url, ogg_url}] строится из дампа
Викисловаря kaikki.org скриптом tools/kaikki_sounds.py (там же команда
скачивания дампа) и по умолчанию ищется в tools/cache/kaikki_sounds.json
(gitignored). Индексу НЕ верим в лицензии и URL: лицензия по-прежнему
проверяется через extmetadata (индекс мог устареть — файл переименовали,
лицензию сменили), качаем по url из imageinfo. Приоритет кандидатов:
En-us > En > En-uk > LL-Q1860 (eng) > en-gb/ca/au > прочее; внутри
одной ступени запись без суффикса «-noun/-verb» раньше.

Запуск:
    python3 tools/build_audio.py                # весь словарь
    python3 tools/build_audio.py --limit 50     # смоук: до 50 новых слов
    python3 tools/build_audio.py --kaikki       # кандидаты из индекса
    python3 tools/build_audio.py --kaikki /tmp/native-audio/kaikki_sounds.json
    python3 tools/build_audio.py --offline      # только перегенерить
                                                # манифест/js из готового

Прогон возобновляемый: существование файлов на Commons и метаданные
кэшируются (tools/cache/), готовые mp3 не переделываются. Полный
первый прогон — часы, дальше — минуты.
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time
import hashlib
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wordpipe import http_cache, imaging, wikimedia  # noqa: E402

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(TOOLS_DIR)
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
RESOLVE_CACHE = os.path.join(CACHE_DIR, "audio-resolve.json")
OUT_DIR = os.path.join(ROOT, "audio", "words")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")
WORD_AUDIO_JS = os.path.join(ROOT, "js", "word-audio.js")
WORDS_JS = os.path.join(ROOT, "js", "words.js")
UA = "wordcat-audio/1.0 (https://wordcat.ru; support@wordcat.ru)"
API = "https://commons.wikimedia.org/w/api.php"

# Порядок = приоритет. us первым: транскрипции в js/ipa.js американские.
VARIANTS = [("us", "En-us-%s.ogg"), ("", "En-%s.ogg"), ("uk", "En-uk-%s.ogg")]

KAIKKI_INDEX = os.path.join(CACHE_DIR, "kaikki_sounds.json")

# Суффикс части речи в имени файла («en-us-minute-noun.ogg»,
# «LL-…-abstract (noun).wav»): та же запись слова, но внутри одной
# ступени приоритета идёт после «чистого» имени.
_POS_SUFFIX_RE = re.compile(r"[- ]\(?(?:noun|verb|adjective|adverb)\)?$")
_KAIKKI_REGION_RE = re.compile(r"^en-(?:gb|ca|au)[- ]")


def kaikki_priority(fname, word):
    """(ступень, штраф за суффикс части речи) — меньше = приоритетнее.

    Ступени: En-us > En > En-uk > Lingua Libre (только английская,
    Q1860) > en-gb/ca/au > прочее. Точное сравнение с «en-<слово>»
    отсекает региональные имена вида «en-scotland-…» от generic-ступени.
    """
    low = fname.lower()
    stem = low.rsplit(".", 1)[0]
    m = _POS_SUFFIX_RE.search(stem)
    core = stem[:m.start()] if m else stem
    pos = 1 if m else 0
    if core == "en-us-" + word:
        return (0, pos)
    if core == "en-" + word:
        return (1, pos)
    if core == "en-uk-" + word:
        return (2, pos)
    if low.startswith("ll-q1860 (eng)-"):
        return (3, pos)
    if _KAIKKI_REGION_RE.match(core):
        return (4, pos)
    return (5, pos)


def kaikki_variant(fname, tags):
    """Вариант произношения для манифеста (us/en/uk/au/ca)."""
    low = fname.lower()
    if low.startswith("en-us"):
        return "us"
    if low.startswith(("en-uk", "en-gb")):
        return "uk"
    if low.startswith("en-au"):
        return "au"
    if low.startswith("en-ca"):
        return "ca"
    t = " ".join(tags).lower()
    if "australia" in t:
        return "au"
    if "canada" in t:
        return "ca"
    if re.search(r"\buk\b|england|british|london|received-pronunciation", t):
        return "uk"
    if re.search(r"\bus\b|american", t):
        return "us"
    return "en"


def load_kaikki_index(path):
    """Индекс kaikki -> {word: [(variant, filename), ...] по приоритету}.

    Записи Lingua Libre не на английском (LL-Q… не «(eng)») выкидываем:
    это произношение слова на другом языке. Всё остальное оставляем —
    лицензия отсеет лишнее на этапе extmetadata.
    """
    raw = load_json(path, None)
    if raw is None:
        sys.exit("нет индекса %s — собери его: python3 tools/kaikki_sounds.py "
                 "<дамп kaikki.org> %s (см. docstring kaikki_sounds.py)"
                 % (path, KAIKKI_INDEX))
    out = {}
    for word, entries in raw.items():
        cands = []
        seen = set()
        for e in entries:
            fname = (e.get("audio") or "").strip()
            low = fname.lower()
            if not fname or fname in seen:
                continue
            if low.startswith("ll-") and not low.startswith("ll-q1860 (eng)-"):
                continue
            seen.add(fname)
            cands.append((kaikki_priority(fname, word),
                          kaikki_variant(fname, e.get("tags") or []), fname))
        cands.sort(key=lambda c: c[0])
        if cands:
            out[word] = [(variant, fname) for _, variant, fname in cands]
    return out

FFMPEG = os.path.expanduser("~/.local/bin/ffmpeg")
FFPROBE = os.path.expanduser("~/.local/bin/ffprobe")
if not os.path.exists(FFMPEG):
    FFMPEG, FFPROBE = "ffmpeg", "ffprobe"


def all_words():
    """Все слова словаря. Источник правды — js/words.js, как у фото."""
    text = open(WORDS_JS, encoding="utf-8").read()
    words = re.findall(r'\bw:\s*"([^"]{1,30})"', text)
    out = []
    seen = set()
    for w in words:
        w = w.strip().lower()
        # апострофы и пробелы легальны (don't, ice cream); прочую
        # экзотику не ищем — таких записей на Commons всё равно нет
        if not re.fullmatch(r"[a-z][a-z' -]*[a-z]", w):
            continue
        if w not in seen:
            seen.add(w)
            out.append(w)
    return out


def safe_name(word):
    """Имя mp3: только [a-z0-9-_]. Так же считает js/word-audio.js."""
    return re.sub(r"[^a-z0-9-]+", "_", word)


# ---------------------------------------------------------------- resolve

def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return default


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1, sort_keys=True)
    os.replace(tmp, path)


def resolve_existing(fetcher, words, resolved):
    """Каким словам какие варианты записей есть на Commons.

    Пачками по 50 заголовков на запрос — 11 тысяч слов это ~700 быстрых
    запросов метаданных, а не 34 тысячи поштучных. Результат копится в
    tools/cache/audio-resolve.json: слово -> список вариантов ("us"...),
    пустой список = записей нет, переспрашивать не нужно.
    """
    todo = [w for w in words if w not in resolved]
    if not todo:
        return
    print("проверяю наличие на Commons: %d слов" % len(todo))
    failed = set()   # слова из пачек, которые НЕ ответили (сеть, SSL)
    for vi, (variant, pattern) in enumerate(VARIANTS):
        # вариант дальше по списку нужен только словам, которым ещё не
        # нашлось более приоритетного — но список храним ПОЛНЫЙ по
        # каждому слову, чтобы можно было отступить при плохой лицензии
        batch_words = todo
        for i in range(0, len(batch_words), 50):
            chunk = batch_words[i:i + 50]
            titles = "|".join("File:" + pattern % w for w in chunk)
            url = (API + "?action=query&format=json&titles="
                   + urllib.parse.quote(titles, safe=""))
            res = fetcher.get(url, "commons-exist",
                              key="ex-%s-%s" % (variant or "en",
                                   hashlib.sha1(titles.encode()).hexdigest()[:12]),
                              min_interval=0.35)
            if not res.ok:
                failed.update(chunk)
                print("  ! пачка не ответила (%s), пропускаю" % res.error)
                continue
            try:
                data = json.loads(res.body)["query"]
            except (ValueError, KeyError):
                failed.update(chunk)
                continue
            # API нормализует «file:x» -> «File:X»; вернём как слали
            back = {n["to"]: n["from"] for n in data.get("normalized", [])}
            prefix = "File:" + pattern.split("%s")[0]
            suffix = ".ogg"
            for page in data.get("pages", {}).values():
                title = back.get(page.get("title"), page.get("title", ""))
                stem = title[len(prefix):-len(suffix)] if title.startswith(prefix) else ""
                word = stem.lower()
                if not word:
                    continue
                hits = resolved.setdefault(word, [])
                if "missing" not in page and variant not in hits:
                    hits.append(variant)
            if (i // 50) % 20 == 0:
                save_json(RESOLVE_CACHE, resolved)
                sys.stdout.write("  %s: %d/%d\r" % (variant or "en", i + 50, len(batch_words)))
                sys.stdout.flush()
        print("  вариант %-3s готов" % (variant or "en"))
        save_json(RESOLVE_CACHE, resolved)
    # Слова, не встретившиеся ни в одном ответе, помечаем пустыми — но
    # только те, чьи пачки реально ОТВЕТИЛИ. Сетевой сбой не равен «записи
    # нет»: слово из упавшей пачки выкидываем из кэша целиком, чтобы
    # следующий запуск переспросил все его варианты заново. Без этого
    # ночной обрыв SSL молча похоронил бы озвучку у тысяч слов.
    for w in todo:
        if w in failed:
            resolved.pop(w, None)
        else:
            resolved.setdefault(w, [])
    save_json(RESOLVE_CACHE, resolved)
    if failed:
        print("  сетевые сбои: %d слов переспросим в следующий запуск" % len(failed))


# ------------------------------------------------------------------ meta

def batch_meta(fetcher, filenames):
    """extmetadata+url для пачки файлов: имя -> imageinfo."""
    out = {}
    for i in range(0, len(filenames), 50):
        chunk = filenames[i:i + 50]
        titles = "|".join("File:" + f for f in chunk)
        url = (API + "?action=query&format=json&prop=imageinfo"
               "&iiprop=url%7Cextmetadata%7Csize%7Cmime&titles="
               + urllib.parse.quote(titles, safe=""))
        res = fetcher.get(url, "commons-meta",
                          key="mt-%s" % hashlib.sha1(titles.encode()).hexdigest()[:12],
                          min_interval=0.4)
        if not res.ok:
            continue
        try:
            data = json.loads(res.body)["query"]
        except (ValueError, KeyError):
            continue
        back = {n["to"]: n["from"] for n in data.get("normalized", [])}
        for page in data.get("pages", {}).values():
            title = back.get(page.get("title"), page.get("title", ""))
            name = title[5:] if title.startswith("File:") else title
            info = (page.get("imageinfo") or [None])[0]
            if info:
                out[name] = info
    return out


# --------------------------------------------------------------- convert

def convert(raw_path, out_path):
    """ogg -> mp3: моно, тишина по краям долой, громкость к -18 LUFS.

    Записи на Commons разнобойные: у кого-то пол-секунды тишины в
    начале, у кого-то громкость вполовину ниже. Кнопка звука должна
    отвечать мгновенно и одинаково громко — иначе это «не работает».
    """
    cmd = [FFMPEG, "-hide_banner",
           "-loglevel", "error", "-y", "-i", raw_path,
           "-af",
           "silenceremove=start_periods=1:start_threshold=-45dB,"
           "areverse,silenceremove=start_periods=1:start_threshold=-45dB,"
           "areverse,loudnorm=I=-18:TP=-2",
           "-ac", "1", "-ar", "24000", "-codec:a", "libmp3lame", "-b:a", "40k",
           out_path]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=60)
    except (subprocess.SubprocessError, OSError) as exc:
        return "ffmpeg: %s" % exc
    # здравый смысл: произношение слова короче 6 секунд и длиннее 0.15
    try:
        probe = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", out_path],
            check=True, capture_output=True, text=True, timeout=30)
        dur = float(probe.stdout.strip())
    except (subprocess.SubprocessError, OSError, ValueError):
        return "ffprobe не смог прочитать результат"
    if not 0.15 <= dur <= 6.0:
        os.unlink(out_path)
        return "подозрительная длительность %.2fс" % dur
    return None


# ------------------------------------------------------------------ emit

def write_word_audio_js(manifest):
    """Значение — ревизия файла (manifest[w]["rev"], по умолчанию 1).
    Клиент добавляет к URL ?r=<rev>: nginx Timeweb отдаёт статику с
    кэшем на год, и замена синтеза живой записью под тем же именем без
    ревизии не доехала бы до учеников год."""
    words = sorted(manifest)
    lines, line = [], "  "
    for w in words:
        piece = '"%s": %d, ' % (w, int(manifest[w].get("rev") or 1))
        if len(line) + len(piece) > 98:
            lines.append(line.rstrip())
            line = "  "
        line += piece
    if line.strip():
        lines.append(line.rstrip())
    body = "\n".join(lines).rstrip(", \n")
    text = (
        "// Сгенерировано tools/build_audio.py — руками не править.\n"
        "// Слова, на которые есть запись живого носителя: файл всегда\n"
        "// audio/words/<слово>.mp3, где не-[a-z0-9-] заменены на «_»\n"
        "// (та же замена в speakNative в js/exercises.js).\n"
        "// Авторы и лицензии — audio/words/manifest.json и credits.html.\n"
        "// Значение — ревизия файла: speakNative добавляет ?r=<ревизия> к URL.\n"
        "const WORD_AUDIO = {\n" + body + "\n};\n")
    with open(WORD_AUDIO_JS, "w", encoding="utf-8") as fh:
        fh.write(text)


def prune(manifest):
    """Файлы без записи в манифесте — мусор прошлых прогонов."""
    keep = {safe_name(w) + ".mp3" for w in manifest}
    removed = 0
    for name in os.listdir(OUT_DIR):
        if name.endswith(".mp3") and name not in keep:
            os.unlink(os.path.join(OUT_DIR, name))
            removed += 1
    return removed


# ------------------------------------------------------------------ main

def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0,
                    help="не больше N новых скачиваний (смоук)")
    ap.add_argument("--offline", action="store_true",
                    help="без сети: перегенерить js/манифест из готового")
    ap.add_argument("--words", default="",
                    help="смоук: только эти слова, через запятую")
    ap.add_argument("--kaikki", nargs="?", const=KAIKKI_INDEX, default=None,
                    metavar="JSON",
                    help="кандидаты из индекса kaikki.org (по умолчанию "
                         "tools/cache/kaikki_sounds.json) вместо трёх "
                         "канонических имён; лицензии всё равно с Commons API")
    args = ap.parse_args(argv)

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = load_json(MANIFEST, {})
    words = all_words()
    if args.words:
        want = {w.strip().lower() for w in args.words.split(",") if w.strip()}
        words = [w for w in words if w in want]
    print("слов в словаре: %d, уже озвучено: %d" % (len(words), len(manifest)))

    if not args.offline:
        fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=UA)
        # Кандидаты: слово -> [(вариант, имя файла на Commons)] в порядке
        # приоритета. Классика — три канонических имени, существование
        # проверено API; с --kaikki — записи из индекса дампа kaikki.org,
        # существование выяснится само на этапе метаданных.
        if args.kaikki:
            index = load_kaikki_index(args.kaikki)
            cand = {w: index[w] for w in words if w in index}
        else:
            resolved = load_json(RESOLVE_CACHE, {})
            resolve_existing(fetcher, words, resolved)
            patterns = dict(VARIANTS)
            cand = {w: [(v, patterns[v] % w) for v in resolved[w]]
                    for w in words if resolved.get(w)}

        # Синтез (build_audio_synth.py) — временная затычка: появилась
        # живая запись на Commons — она главнее и перекрывает synthetic.
        todo = [w for w in words
                if (w not in manifest or manifest[w].get("synthetic"))
                and cand.get(w)]
        print("есть запись на Commons, ещё не скачано: %d" % len(todo))
        if args.limit:
            todo = todo[:args.limit]

        # метаданные пачками: лицензия решается до единого скачивания
        need_meta = [fname for w in todo for _, fname in cand[w]]
        metas = batch_meta(fetcher, need_meta)

        stats = {"done": 0, "license": 0, "broken": 0, "fetch": 0}
        rejects = []
        for n, w in enumerate(todo, 1):
            got = None
            for variant, fname in cand[w]:
                info = metas.get(fname)
                if not info:
                    continue
                ok, why = wikimedia.license_ok(info)
                if not ok:
                    rejects.append("%s: %s" % (fname, why))
                    continue
                got = (variant, fname, info)
                break
            if not got:
                stats["license"] += 1
                continue
            variant, fname, info = got
            raw, err = imaging.fetch_file(
                fetcher, info["url"], CACHE_DIR,
                key="audio-%s" % fname, min_interval=0.9)
            if raw is None:
                # Сервер осаживает (429/503) или сеть моргнула. Пауза и одна
                # повторная попытка: без неё одна плохая минута похоронила
                # 2170 слов подряд — при живом сервере и живых файлах.
                if stats["fetch"] < 3 or stats["fetch"] % 200 == 0:
                    print("  ! %s: %s" % (fname, err))
                time.sleep(30)
                raw, err = imaging.fetch_file(
                    fetcher, info["url"], CACHE_DIR,
                    key="audio-%s" % fname, min_interval=0.9)
            if raw is None:
                stats["fetch"] += 1
                continue
            raw_path = os.path.join(CACHE_DIR, "audio-tmp." + fname.rsplit(".", 1)[-1])
            with open(raw_path, "wb") as fh:
                fh.write(raw)
            out_path = os.path.join(OUT_DIR, safe_name(w) + ".mp3")
            err = convert(raw_path, out_path)
            os.unlink(raw_path)
            if err:
                rejects.append("%s: %s" % (fname, err))
                stats["broken"] += 1
                continue
            meta = info.get("extmetadata") or {}
            # Живая запись поверх синтеза: имя файла то же, ревизия выше —
            # иначе браузеры с годовым кэшем nginx ещё год слышали бы синтез.
            prev = manifest.get(w) or {}
            manifest[w] = {
                "file": safe_name(w) + ".mp3",
                "rev": int(prev.get("rev") or 1) + (1 if prev else 0),
                "variant": variant or "en",
                "commons_file": fname,
                "author": wikimedia.author_of(info),
                "license": wikimedia._strip_html(
                    (meta.get("LicenseShortName") or {}).get("value")) or "см. источник",
                "license_url": wikimedia._strip_html(
                    (meta.get("LicenseUrl") or {}).get("value")),
                "source": info.get("descriptionurl")
                          or "https://commons.wikimedia.org/wiki/File:" + fname,
            }
            stats["done"] += 1
            if n % 25 == 0:
                save_json(MANIFEST, manifest)
                print("  %d/%d (+%d)" % (n, len(todo), stats["done"]))
        save_json(MANIFEST, manifest)
        print("новых: %d, лицензия/нет метаданных: %d, битых: %d, "
              "не скачалось: %d" % (stats["done"], stats["license"],
                                    stats["broken"], stats["fetch"]))
        if rejects:
            rej_path = os.path.join(TOOLS_DIR, "out", "audio-rejects.txt")
            os.makedirs(os.path.dirname(rej_path), exist_ok=True)
            with open(rej_path, "w", encoding="utf-8") as fh:
                fh.write("\n".join(rejects) + "\n")
            print("отказы: %s (%d)" % (rej_path, len(rejects)))

    removed = prune(manifest)
    if removed:
        print("удалено осиротевших mp3: %d" % removed)
    write_word_audio_js(manifest)
    total_bytes = sum(
        os.path.getsize(os.path.join(OUT_DIR, f))
        for f in os.listdir(OUT_DIR) if f.endswith(".mp3"))
    by_var = {}
    for m in manifest.values():
        by_var[m["variant"]] = by_var.get(m["variant"], 0) + 1
    print("итого озвучено: %d (us %d, en %d, uk %d), %.1f МБ, %s"
          % (len(manifest), by_var.get("us", 0), by_var.get("en", 0),
             by_var.get("uk", 0), total_bytes / 1e6,
             datetime.datetime.now().strftime("%H:%M")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
