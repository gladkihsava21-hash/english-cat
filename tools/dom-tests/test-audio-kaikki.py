#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_audio.py --kaikki: приоритет кандидатов из индекса kaikki.org,
отказ по лицензии (FAL отклоняется, идём к следующему кандидату), замена
синтеза живой записью (synthetic снимается, ревизия растёт), скачивание
по url из imageinfo, а не по mp3_url из индекса. Сеть, ffmpeg и скачивание
замоканы; пути вывода перенаправлены во временный каталог.

Запуск: python3 tools/dom-tests/test-audio-kaikki.py
"""
import json
import os
import sys
import tempfile
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import build_audio
import kaikki_sounds

fails = 0
def ok(c, what):
    global fails
    print(("  ok  " if c else "  FAIL ") + what)
    if not c: fails += 1

tmp = tempfile.mkdtemp(prefix="audio-kaikki-")

print("\n1. Приоритет кандидатов: En-us > En > En-uk > LL(eng) > en-au > прочее")
index = {
    "thesaurus": [
        {"audio": "LL-Q1860 (eng)-Vealhurl-thesaurus.wav", "tags": ["Southern-England"]},
        {"audio": "en-au-thesaurus.ogg", "tags": ["Australia"]},
        {"audio": "En-uk-thesaurus.ogg"},
        {"audio": "En-thesaurus.ogg"},
        {"audio": "Troll.wav"},
        {"audio": "En-us-thesaurus.ogg"},
    ],
    "minute": [
        {"audio": "LL-Q7976 (mis)-X-minute.wav"},
        {"audio": "en-us-minute-noun.ogg"},
        {"audio": "en-us-minute.ogg"},
    ],
}
idx_path = os.path.join(tmp, "index.json")
with open(idx_path, "w", encoding="utf-8") as fh:
    json.dump(index, fh)
loaded = build_audio.load_kaikki_index(idx_path)
ok([f for _, f in loaded["thesaurus"]] == [
    "En-us-thesaurus.ogg", "En-thesaurus.ogg", "En-uk-thesaurus.ogg",
    "LL-Q1860 (eng)-Vealhurl-thesaurus.wav", "en-au-thesaurus.ogg", "Troll.wav"],
   "порядок ступеней: %s" % [f for _, f in loaded["thesaurus"]])
ok([f for _, f in loaded["minute"]] == ["en-us-minute.ogg", "en-us-minute-noun.ogg"],
   "суффикс -noun после чистого имени, LL не на английском выкинута: %s"
   % [f for _, f in loaded["minute"]])
ok([v for v, _ in loaded["thesaurus"]] == ["us", "en", "uk", "uk", "au", "en"],
   "варианты: %s" % [v for v, _ in loaded["thesaurus"]])
ok(build_audio.kaikki_variant("LL-Q1860 (eng)-Wodencafe-x.wav", ["US"]) == "us",
   "LL с тегом US -> us")

print("\n2. Прогон main(): лицензия решает, синтез заменяется живой записью")

def info(fname, lic, short, author="Test Author"):
    return {
        # url нарочно не совпадает с mp3_url индекса: качать надо отсюда
        "url": "https://upload.wikimedia.org/real/"
               + urllib.parse.quote(fname.replace(" ", "_"), safe="()"),
        "descriptionurl": "https://commons.wikimedia.org/wiki/File:" + fname,
        "extmetadata": {
            "License": {"value": lic},
            "LicenseShortName": {"value": short},
            "LicenseUrl": {"value": "https://example.org/" + lic},
            "Artist": {"value": author},
        },
    }

CC0 = lambda f: info(f, "cc0", "CC0")                       # noqa: E731
FAL = lambda f: info(f, "cc-by-nc-4.0", "CC BY-NC 4.0")     # noqa: E731

META = {
    # thesaurus: выбор по приоритету — En-us, хотя в индексе он последний
    "En-us-thesaurus.ogg": CC0("En-us-thesaurus.ogg"),
    "En-thesaurus.ogg": CC0("En-thesaurus.ogg"),
    "En-uk-thesaurus.ogg": CC0("En-uk-thesaurus.ogg"),
    "LL-Q1860 (eng)-Vealhurl-thesaurus.wav": CC0("LL-Q1860 (eng)-Vealhurl-thesaurus.wav"),
    "en-au-thesaurus.ogg": CC0("en-au-thesaurus.ogg"),
    "Troll.wav": CC0("Troll.wav"),
    # minute: приоритетный En-us под FAL -> откат на En-minute (CC0)
    "En-us-minute.ogg": FAL("En-us-minute.ogg"),
    "En-minute.ogg": CC0("En-minute.ogg"),
    # semantics: единственный кандидат CC BY-SA — замена синтеза
    "LL-Q1860 (eng)-Wodencafe-semantics.wav": info(
        "LL-Q1860 (eng)-Wodencafe-semantics.wav", "cc-by-sa-4.0", "CC BY-SA 4.0",
        author="Wodencafe"),
    # noun: все кандидаты под FAL -> слова в манифесте быть не должно
    "En-us-noun.ogg": FAL("En-us-noun.ogg"),
    "LL-Q1860 (eng)-Vealhurl-noun.wav": FAL("LL-Q1860 (eng)-Vealhurl-noun.wav"),
}

run_index = {
    "thesaurus": [
        {"audio": "LL-Q1860 (eng)-Vealhurl-thesaurus.wav", "tags": ["Southern-England"],
         "mp3_url": "https://upload.wikimedia.org/INDEX-thesaurus.mp3"},
        {"audio": "en-au-thesaurus.ogg", "tags": ["Australia"]},
        {"audio": "En-uk-thesaurus.ogg"},
        {"audio": "En-thesaurus.ogg"},
        {"audio": "Troll.wav"},
        {"audio": "En-us-thesaurus.ogg", "mp3_url": "https://upload.wikimedia.org/INDEX-us.mp3"},
    ],
    "minute": [
        {"audio": "En-us-minute.ogg"},
        {"audio": "En-minute.ogg"},
    ],
    "semantics": [
        {"audio": "LL-Q1860 (eng)-Wodencafe-semantics.wav", "tags": ["US"]},
    ],
    "noun": [
        {"audio": "En-us-noun.ogg"},
        {"audio": "LL-Q1860 (eng)-Vealhurl-noun.wav"},
    ],
}
run_idx_path = os.path.join(tmp, "run-index.json")
with open(run_idx_path, "w", encoding="utf-8") as fh:
    json.dump(run_index, fh)


class Res:
    def __init__(self, body):
        self.ok = True
        self.body = body
        self.error = None


class FakeFetcher:
    """Отвечает на batch_meta: pages с imageinfo из фикстур."""
    def get(self, url, source, key=None, min_interval=0):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        titles = q["titles"][0].split("|")
        pages = {}
        for i, t in enumerate(titles):
            name = t[5:] if t.startswith("File:") else t
            page = {"title": t}
            if name in META:
                page["imageinfo"] = [META[name]]
            else:
                page["missing"] = True
            pages[str(i)] = page
        return Res(json.dumps({"query": {"pages": pages}}))


downloads = []
def fake_fetch_file(fetcher, url, cache_dir, key, min_interval=0, timeout=0):
    downloads.append(url)
    return b"raw-audio", None

def fake_convert(raw_path, out_path):
    with open(out_path, "wb") as fh:
        fh.write(b"mp3")
    return None

# перенаправляем всё, чего коснётся прогон, во временный каталог
build_audio.TOOLS_DIR = tmp
build_audio.CACHE_DIR = os.path.join(tmp, "cache")
build_audio.OUT_DIR = os.path.join(tmp, "audio")
build_audio.MANIFEST = os.path.join(build_audio.OUT_DIR, "manifest.json")
build_audio.WORD_AUDIO_JS = os.path.join(tmp, "word-audio.js")
build_audio.RESOLVE_CACHE = os.path.join(tmp, "resolve.json")
os.makedirs(build_audio.CACHE_DIR, exist_ok=True)
os.makedirs(build_audio.OUT_DIR, exist_ok=True)
build_audio.http_cache.Fetcher = lambda *a, **k: FakeFetcher()
build_audio.imaging.fetch_file = fake_fetch_file
build_audio.convert = fake_convert

# semantics уже озвучен синтезом: живая запись должна его заменить
build_audio.save_json(build_audio.MANIFEST, {
    "semantics": {"file": "semantics.mp3", "rev": 1, "variant": "uk",
                  "synthetic": True, "voice": "en_GB-cori-high",
                  "author": "Piper TTS", "license": "Public domain",
                  "license_url": "", "source": "piper"},
})

rc = build_audio.main(["--kaikki", run_idx_path,
                       "--words", "thesaurus,minute,semantics,noun"])
ok(rc == 0, "main() отработал")
manifest = build_audio.load_json(build_audio.MANIFEST, {})

m = manifest.get("thesaurus") or {}
ok(m.get("commons_file") == "En-us-thesaurus.ogg" and m.get("variant") == "us",
   "thesaurus: выбран En-us несмотря на порядок в индексе")
ok(META["En-us-thesaurus.ogg"]["url"] in downloads
   and not any("INDEX-" in u for u in downloads),
   "скачивание по url из imageinfo, не по mp3_url индекса: %s" % downloads)

m = manifest.get("minute") or {}
ok(m.get("commons_file") == "En-minute.ogg",
   "minute: FAL отклонён, откат на En-minute (%s)" % m.get("commons_file"))

m = manifest.get("semantics") or {}
ok(bool(m) and not m.get("synthetic"),
   "semantics: флаг synthetic снят")
ok(m.get("rev") == 2, "semantics: ревизия поднята 1 -> %s" % m.get("rev"))
ok(m.get("author") == "Wodencafe" and m.get("license") == "CC BY-SA 4.0",
   "semantics: автор и лицензия из extmetadata")
ok(m.get("variant") == "us", "semantics: вариант из тега LL (US)")

ok("noun" not in manifest, "noun: все кандидаты под FAL — в манифест не попало")

js = open(build_audio.WORD_AUDIO_JS, encoding="utf-8").read()
ok('"semantics": 2' in js, "word-audio.js: ревизия 2 у semantics")
ok('"noun"' not in js, "word-audio.js: noun не попал в список")

print("\n3. kaikki_sounds.py: сборка индекса из дампа jsonl")
dump = os.path.join(tmp, "dump.jsonl")
with open(dump, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"word": "thesaurus", "sounds": [
        {"audio": "En-us-thesaurus.ogg", "tags": ["US"],
         "mp3_url": "m", "ogg_url": "o"}]}) + "\n")
    # омоним: то же слово второй строкой, дубль файла + новый файл
    fh.write(json.dumps({"word": "thesaurus", "sounds": [
        {"audio": "En-us-thesaurus.ogg"},
        {"audio": "En-thesaurus.ogg"}]}) + "\n")
    fh.write(json.dumps({"word": "minute", "sounds": [{"ipa": "/m/"}]}) + "\n")
    fh.write(json.dumps({"word": "zznotaword", "sounds": [
        {"audio": "En-zznotaword.ogg"}]}) + "\n")
    fh.write('{"word": "broken", "sounds": [}\n')
    fh.write(json.dumps({"word": "silent", "pos": "noun"}) + "\n")
out_idx = os.path.join(tmp, "built-index.json")
rc = kaikki_sounds.main([dump, out_idx])
built = build_audio.load_json(out_idx, {})
ok(rc == 0 and set(built) == {"thesaurus"},
   "только слова словаря и только записи с audio: %s" % sorted(built))
ok([e["audio"] for e in built.get("thesaurus", [])] ==
   ["En-us-thesaurus.ogg", "En-thesaurus.ogg"],
   "омонимы смержены, дубль файла схлопнут")
ok(built["thesaurus"][0]["tags"] == ["US"]
   and built["thesaurus"][0]["mp3_url"] == "m",
   "tags и url сохранены")

print("\n" + ("ПРОВАЛЕНО: %d" % fails
              if fails else "kaikki-индекс: приоритет, лицензии и замена синтеза держатся"))
sys.exit(1 if fails else 0)
