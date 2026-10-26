#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Фото- и аудирование-домашки (волна hw-media): загрузка вложений
репетитором, TTS-текст → аудио, создание домашек kind=photo|listening,
видимость для ученика, отдача файлов и текстовые ответы аудирования.

Запуск: python3 tools/dom-tests/test-hw-media.py
"""
import base64
import datetime
import json
import os
import shutil
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
os.environ["SAVELY_DB"] = os.path.join(tempfile.mkdtemp(prefix="hwmedia-"), "savely.db")

import db
import server

db.init()
Api = server.Api
# TTS «доступен», но наружу не ходим: проверяем сборку вложения, а не голос.
server.alice_ready = lambda: True
server.alice_tts = lambda text: b"ID3" + b"\x00" * 128

fails = 0
def ok(cond, what):
    global fails
    print(("  ok  " if cond else "  FAIL ") + what)
    if not cond:
        fails += 1

# --- тестовые участники -------------------------------------------------
t1 = db.create_tutor("Алина", "alina-media@e.com", "startpass123")
t2 = db.create_tutor("Борис", "boris-media@e.com", "startpass123")
db.conn().execute("UPDATE tutors SET email_verified=1 WHERE id IN (?,?)",
                  (t1["id"], t2["id"]))
# Свежий репетитор без триала/оплаты — «expired», и verified_tutor не пускает
# даже к загрузке файлов. Даём триал, как в test-ai-plans: проверяем фичу,
# а не платёжный гейт.
trial = (datetime.datetime.now(datetime.timezone.utc)
         + datetime.timedelta(days=30)).isoformat(timespec="seconds")
db.conn().execute("UPDATE tutors SET trial_ends_at=? WHERE id IN (?,?)",
                  (trial, t1["id"], t2["id"]))
db.conn().commit()
TTUT, TTUT2 = t1["token"], t2["token"]
st = db.create_student(t1["id"], "Петя")
STOK = st["token"]

def call(method, params):
    return getattr(Api, method)(None, params)

def data_url(mime, blob):
    return "data:%s;base64,%s" % (mime, base64.b64encode(blob).decode())

# Бинарники от 100 байт: ниже этого порога загрузка режется как мусор.
PNG = data_url("image/png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 200)
GIF = data_url("image/gif", b"GIF89a" + b"\x00" * 200)
MP3 = data_url("audio/mpeg", b"ID3" + b"\x00" * 200)

print("\n1. upload-asset: форматы, лимиты, права")
r = call("tutor_upload_asset", {"token": TTUT, "kind": "image", "image": PNG,
                                "name": "zadaniye.png"})
ok(r.get("ok"), "png-фото загружено")
asset_img = (r.get("asset") or {}).get("path")
ok(bool(asset_img), "путь фото возвращён")
ok((r.get("asset") or {}).get("type") == "image", "тип вложения — image")

r = call("tutor_upload_asset", {"token": TTUT, "kind": "image", "image": GIF})
ok(not r.get("ok"), "gif отклонён (только jpeg/png/webp)")

r = call("tutor_upload_asset", {"token": TTUT, "kind": "audio", "image": MP3})
ok(r.get("ok"), "mp3 загружен")
asset_audio = (r.get("asset") or {}).get("path")

big = data_url("audio/mpeg", b"x" * (10 * 1024 * 1024 + 1))
r = call("tutor_upload_asset", {"token": TTUT, "kind": "audio", "image": big})
ok(not r.get("ok"), "аудио больше 10 МБ отклонено")

r = call("tutor_upload_asset", {"token": TTUT2, "kind": "image", "image": PNG})
ok(r.get("ok"), "другой репетитор тоже загружает (файлы общие, имена случайные)")

r = call("tutor_upload_asset", {"token": "bad-token", "kind": "image", "image": PNG})
ok(not r.get("ok"), "чужой токен не загружает")

print("\n2. tts-asset: текст → аудио-вложение")
r = call("tutor_tts_asset", {"token": TTUT, "text": "Hello, Petya!"})
ok(r.get("ok"), "TTS собрал аудио-вложение")
asset_tts = (r.get("asset") or {}).get("path")
ok(bool(asset_tts), "путь TTS-файла возвращён")
r = call("tutor_tts_asset", {"token": TTUT, "text": "   "})
ok(not r.get("ok"), "пустой текст не озвучивается")

print("\n3. Фото-домашка: валидация и создание")
r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Фото", "kind": "photo",
                                   "taskText": "Сфотографируй тетрадь",
                                   "assets": []})
ok(not r.get("ok"), "фото-домашка без фото отклонена")

r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Фото", "kind": "photo", "taskText": "",
                                   "assets": [{"type": "image", "path": asset_img,
                                               "name": "a.png"}]})
ok(not r.get("ok"), "фото-домашка без текста задания отклонена")

assets4 = [{"type": "image", "path": asset_img, "name": "p%d.png" % i}
           for i in range(4)]
r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Фото упр.", "kind": "photo",
                                   "taskText": "Сделай упр. 3–5 на фото",
                                   "assets": assets4})
ok(r.get("ok"), "фото-домашка с 4 фото создана")
hw_photo = r.get("id")
ok(bool(hw_photo), "id фото-домашки получен")

r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Фото5", "kind": "photo", "taskText": "x",
                                   "assets": assets4 + [{"type": "image",
                                                         "path": asset_img,
                                                         "name": "p5.png"}]})
# Пять фото прислать можно, но в домашку попадут первые четыре — чистилка
# режет лишнее, а не ругается: форма и так не даёт прикрепить больше.
row5 = db.conn().execute("SELECT assets FROM homework ORDER BY id DESC LIMIT 1").fetchone()
ok(r.get("ok") and len(json.loads(row5["assets"])) == 4,
   "пятое фото молча отрезано, осталось 4")

r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "ФотоX", "kind": "photo", "taskText": "x",
                                   "assets": [{"type": "image",
                                               "path": "../savely.db", "name": "e"}]})
ok(not r.get("ok"), "path traversal в assets отклонён (файла нет в папке вложений)")

print("\n4. Аудирование: валидация и создание")
r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Аудио", "kind": "listening",
                                   "assets": [{"type": "audio", "path": asset_audio,
                                               "name": "a.mp3"}],
                                   "questions": []})
ok(not r.get("ok"), "аудирование без вопросов отклонено")

r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Аудио", "kind": "listening",
                                   "assets": [],
                                   "questions": [{"q": "Что сказал диктор?", "a": ""}]})
ok(not r.get("ok"), "аудирование без аудио отклонено")

qs = [{"q": "Кто говорит?", "a": "cat"}, {"q": "  ", "a": "x"},
      {"q": "Что он сказал?", "a": ""}]
r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Диктант", "kind": "listening",
                                   "assets": [{"type": "audio", "path": asset_tts,
                                               "name": "tts.mp3"}],
                                   "questions": qs})
ok(r.get("ok"), "аудирование создано (пустой вопрос отброшен)")
hw_listen = r.get("id")
hw_row = db.conn().execute("SELECT kind, payload FROM homework WHERE id=?",
                           (hw_listen,)).fetchone()
ok(hw_row["kind"] == "listening", "kind=listening сохранён")
payload = json.loads(hw_row["payload"] or "[]")
ok(len(payload) == 2, "пустой вопрос отфильтрован, осталось 2")
ok(payload[0]["a"] == "cat", "правильный ответ сохранён для автопроверки")

print("\n5. Ученик видит тип, вложения и вопросы")
r = call("student_sync", {"token": STOK, "state": {}})
hws = r.get("homework") or []
ph = [h for h in hws if h.get("id") == hw_photo]
li = [h for h in hws if h.get("id") == hw_listen]
ok(ph and ph[0].get("kind") == "photo", "ученик видит kind=photo")
ok(ph and len(ph[0].get("assets") or []) == 4, "ученик видит 4 фото")
ok(ph and ph[0].get("taskText") == "Сделай упр. 3–5 на фото",
   "ученик видит текст задания")
ok(li and li[0].get("kind") == "listening", "ученик видит kind=listening")
ok(li and len(li[0].get("payload") or []) == 2, "ученик видит 2 вопроса")
ok(li and (li[0].get("assets") or [{}])[0].get("type") == "audio",
   "у аудирования есть аудио-вложение")

print("\n6. Отдача файлов /api/asset")
r = call("asset_fetch", {"token": STOK, "name": asset_img})
ok(bool(r.get("_raw")) and (r.get("_type") or "").startswith("image/"),
   "ученик получает фото с mime")
ok(r.get("_cache") == 86400, "кэш-заголовок выставлен")
r = call("asset_fetch", {"token": TTUT, "name": asset_tts})
ok((r.get("_type") or "") == "audio/mpeg", "репетитор получает аудио")
r = call("asset_fetch", {"token": "bad-token", "name": asset_img})
ok(not r.get("_raw"), "без токена файл не отдаётся")
r = call("asset_fetch", {"token": STOK, "name": "../savely.db"})
ok(not r.get("_raw"), "traversal в asset не отдаётся")

print("\n7. Ответы аудирования: ученик → сервер → репетитор")
answers = ["cat", "meow"]
db.sync_student(STOK, {"taskResults": {
    str(hw_listen): {"correct": 1, "total": 2, "at": "2026-09-26 10:00:00",
                     "tries": 1, "answers": answers}}})
r = call("student_sync", {"token": STOK, "state": {}})
tr = (r.get("taskResults") or {}).get(str(hw_listen)) or {}
ok(tr.get("answers") == answers, "answers пережили синхронизацию")
r = call("tutor_student_detail", {"token": TTUT, "studentId": st["id"]})
res = None
for h in ((r.get("student") or {}).get("homework") or []):
    if h.get("id") == hw_listen:
        res = h.get("result") or {}
ok(res and res.get("correct") == 1, "репетитор видит автосчёт correct=1")
ok(res and res.get("answers") == answers, "репетитор видит ответы ученика")

print("\n8. Обратная совместимость kind")
r = call("tutor_homework_create", {"token": TTUT, "studentId": st["id"],
                                   "title": "Слова",
                                   "words": [{"w": "cat"}, {"w": "dog"}]})
ok(r.get("ok"), "обычная домашка со словами создаётся")
row_w = db.conn().execute("SELECT * FROM homework WHERE id=?",
                          (r.get("id"),)).fetchone()
ok(db.homework_kind(row_w) == "words", "домашка со словами и пустым kind — words")
ok(db.homework_kind({"kind": "listening", "words": "[]", "game": "",
                     "taskset_id": None})
   == "listening", "явный kind=listening главнее вычисления")

print("---")
if fails:
    print("FAILED:", fails)
    sys.exit(1)
print("ALL OK")
