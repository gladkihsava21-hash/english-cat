#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Озвучка (/api/tts): выбор голоса по письменности, кэш, пустой файл в
кэше — промах, а не вечный b"", сбой SpeechKit — tts_failed без 500 и с
возвратом суточной попытки. Гоняем настоящий Api.tts на временной базе,
сам SpeechKit подменён.

Запуск: python3 tools/dom-tests/test-tts-cache.py
"""
import os, sys, tempfile, glob, urllib.error, datetime
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
d = tempfile.mkdtemp()
os.environ["SAVELY_DB"] = os.path.join(d, "s.db")
import db, server
db.init()
server.tts_available = lambda: True
Api = server.Api

fails = 0
def ok(c, what):
    global fails
    print(("  ok  " if c else "  FAIL ") + what)
    if not c: fails += 1

# репетитор с оплатой + ученик
t = db.create_tutor("Т", "t@e.com", "parolische123")
paid = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)).isoformat()
db.conn().execute("UPDATE tutors SET email_verified=1, paid_until=? WHERE id=?", (paid, t["id"]))
db.conn().commit()
stu = db.create_student(t["id"], "Ваня")
stok = db.get_student_by_id(stu["id"])["token"]
assert db.tutor_active(t["id"]), "фикстура: репетитор должен быть активен"

calls = []
def fake_tts(text):
    calls.append(text)
    return b"ID3" + text.encode("utf-8")
server.alice_tts = fake_tts

print("\n1. Голос по письменности: латиница -> john, кириллица -> alena")
ok(server.tts_voice_for("world") == "john", "world -> john")
ok(server.tts_voice_for("привет") == "alena", "привет -> alena")
ok(server.tts_voice_for("кот cat") == "alena", "смешанный текст -> alena")

print("\n2. Первый запрос — синтез и файл в кэше; второй — из кэша без синтеза")
r = Api.tts(None, {"token": stok, "text": "world"})
ok(r.get("_raw") == b"ID3world" and r.get("_type") == "audio/mpeg", "mp3 отдан")
cache = server._tts_cache_dir()
files = glob.glob(os.path.join(cache, "*.mp3"))
ok(len(files) == 1 and not glob.glob(os.path.join(cache, "*.tmp")), "один файл в кэше, временных нет")
r = Api.tts(None, {"token": stok, "text": "world"})
ok(r.get("_raw") == b"ID3world" and len(calls) == 1, "повтор — из кэша, синтез не вызван")

print("\n3. Пустой файл в кэше — промах: пересинтез и файл починен")
open(files[0], "wb").close()
r = Api.tts(None, {"token": stok, "text": "world"})
ok(r.get("_raw") == b"ID3world" and len(calls) == 2, "пересинтезировано")
ok(os.path.getsize(files[0]) > 0, "файл кэша снова непустой")

print("\n4. Ключ кэша зависит от голоса: то же слово кириллицей — другой файл")
Api.tts(None, {"token": stok, "text": "мир"})
ok(len(glob.glob(os.path.join(cache, "*.mp3"))) == 2, "два файла")

print("\n5. Сбой SpeechKit (HTTPError по голосу) -> tts_failed, не 500; попытка возвращена")
def boom(text):
    raise urllib.error.HTTPError("https://tts", 400, "bad voice", {}, None)
server.alice_tts = boom
Api.TTS_DAILY = 2
db.conn().execute("DELETE FROM rate_hits"); db.conn().commit()
r1 = Api.tts(None, {"token": stok, "text": "apple"})
r2 = Api.tts(None, {"token": stok, "text": "pear"})
r3 = Api.tts(None, {"token": stok, "text": "plum"})
ok(r1.get("error") == "tts_failed" and r2.get("error") == "tts_failed" and r3.get("error") == "tts_failed",
   "три сбоя подряд — все tts_failed (лимит 2 не съеден): %s %s %s" % (r1.get("error"), r2.get("error"), r3.get("error")))
n = db.conn().execute("SELECT COUNT(*) AS n FROM rate_hits WHERE k LIKE 'tts-day|%'").fetchone()["n"]
ok(n == 0, "отметки лимита возвращены: %d" % n)
err = db.conn().execute("SELECT COUNT(*) AS n FROM errors").fetchone()["n"]
ok(err >= 1, "сбой записан в errors (%d)" % err)
ok(not glob.glob(os.path.join(cache, "*.tmp")), "временных файлов после сбоя нет")

print("\n6. Кривой ответ провайдера (ValueError) — тоже tts_failed")
def bad_json(text):
    raise ValueError("not json")
server.alice_tts = bad_json
r = Api.tts(None, {"token": stok, "text": "grape"})
ok(r.get("error") == "tts_failed", "ValueError -> tts_failed")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "озвучка: голос, кэш и сбои держатся"))
sys.exit(1 if fails else 0)
