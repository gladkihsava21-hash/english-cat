#!/usr/bin/env python3
"""Индекс записей произношений Commons из дампа Викисловаря kaikki.org.

Зачем. build_audio.py без индекса проверяет у Commons API только три
канонических имени (En-us-<слово>.ogg и т.п.) — а записей больше:
Lingua Libre, en-au/en-ca/en-gb, суффиксы части речи. Этот скрипт
собирает локальный индекс word -> [{audio, tags, mp3_url, ogg_url}],
и build_audio.py --kaikki берёт кандидатов из него.

Как получить индекс (воспроизводимо):
    curl -L -o /tmp/kaikki-en.jsonl \\
        https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl
    python3 tools/kaikki_sounds.py /tmp/kaikki-en.jsonl
    # -> tools/cache/kaikki_sounds.json (gitignored)

Дамп — jsonl: строка = статья Викисловаря (у омонимов по строке на
значение, дубли имён файлов схлопываем). Записи произношений лежат в
sounds[].audio — имя файла на Commons без префикса «File:»; рядом
mp3_url/ogg_url — транскоды на upload.wikimedia.org.

Лицензий в дампе НЕТ, и полям индекса верить нельзя: он мог устареть
(файл переименовали, лицензию сменили). Поэтому build_audio.py лицензию
добирает сам через extmetadata, а качает по url из imageinfo, а не по
mp3_url из индекса.

По умолчанию оставляем только слова нашего словаря (js/words.js):
полный индекс английского Викисловаря в десятки раз больше и не нужен.
--all — всё подряд.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_audio  # noqa: E402  — all_words(), save_json(), CACHE_DIR


def build_index(dump_path, words=None):
    """word -> [записи sounds с именем файла на Commons], дедуп по имени."""
    index = {}
    with open(dump_path, encoding="utf-8") as fh:
        for line in fh:
            if '"sounds"' not in line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            word = (entry.get("word") or "").strip().lower()
            if not word or (words is not None and word not in words):
                continue
            for s in entry.get("sounds") or []:
                fname = (s.get("audio") or "").strip()
                if not fname:
                    continue
                bucket = index.setdefault(word, {})
                if fname in bucket:
                    continue
                bucket[fname] = {
                    "audio": fname,
                    "tags": s.get("tags") or [],
                    "mp3_url": s.get("mp3_url"),
                    "ogg_url": s.get("ogg_url"),
                }
    return {w: list(b.values()) for w, b in index.items()}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("dump", help="kaikki.org-dictionary-English.jsonl")
    ap.add_argument("out", nargs="?",
                    default=os.path.join(build_audio.CACHE_DIR,
                                         "kaikki_sounds.json"),
                    help="куда писать индекс (по умолчанию туда, где его "
                         "ищет build_audio.py --kaikki)")
    ap.add_argument("--all", action="store_true",
                    help="все слова дампа, не только наш словарь")
    a = ap.parse_args(argv)

    words = None if a.all else set(build_audio.all_words())
    index = build_index(a.dump, words)
    build_audio.save_json(a.out, index)
    total = sum(len(v) for v in index.values())
    print("слов с записями: %d, записей: %d -> %s" % (len(index), total, a.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
