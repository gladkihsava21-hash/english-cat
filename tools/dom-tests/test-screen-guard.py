#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Демонстрация экрана по запросу (волна 3): роли сигналов.

Запрос (screen-req) — только ученик; ответ (screen-answer) и стоп
(screen-stop) — только репетитор; «screen on» от ученика — только со
свежим разрешением (окно 120 с, одноразовое). Репетитор стартует свою
демку без запросов.

Запуск: python3 tools/dom-tests/test-screen-guard.py
"""
import os, sys, tempfile, datetime
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
os.environ["SAVELY_DB"] = os.path.join(tempfile.mkdtemp(), "s.db")
import db, server
db.init()
Api = server.Api

fails = 0
def ok(c, what):
    global fails
    print(("  ok  " if c else "  FAIL ") + what)
    if not c: fails += 1

t = db.create_tutor("Т", "t@e.com", "startpass123")
# звонок — часть урока: нужен и подтверждённый ящик, и живой доступ
trial_end = (datetime.datetime.now(datetime.timezone.utc)
             + datetime.timedelta(days=30)).isoformat(timespec="seconds")
db.conn().execute("UPDATE tutors SET email_verified=1, trial_ends_at=? WHERE id=?",
                  (trial_end, t["id"]))
stu = db.create_student(t["id"], "Ира")
db.conn().commit()
b = db.create_board(t["id"], "Урок")
db.set_board_shared(b["id"], t["id"], True, stu["id"])
db.conn().commit()
bid = b["id"]
TT, SS = t["token"], stu["token"]

def send(tok, kind, data):
    return Api.call_send(None, {"token": tok, "boardId": bid, "kind": kind, "data": data})

print("\n1. Роли сигналов: запрос — ученик, ответ и стоп — репетитор")
ok(send(SS, "screen-req", {}).get("ok"), "запрос от ученика принят")
ok(send(TT, "screen-req", {}).get("error") == "forbidden",
   "запрос от репетитора отклонён (ему не нужен)")
ok(send(SS, "screen-answer", {"allow": True}).get("error") == "forbidden",
   "ученик не может approve сам себе")
ok(send(SS, "screen-stop", {}).get("error") == "forbidden",
   "стоп чужой демки учеником отклонён")
ok(send(TT, "screen-stop", {}).get("ok"), "стоп от репетитора принят")

print("\n2. «screen on» от ученика — только со свежим разрешением")
ok(send(SS, "screen", {"on": True}).get("error") == "forbidden",
   "без разрешения — forbidden")
ok(send(TT, "screen-answer", {"allow": True}).get("ok"),
   "репетитор разрешил")
ok(send(SS, "screen", {"on": True}).get("ok"),
   "с разрешением показ стартовал")
ok(send(SS, "screen", {"on": True}).get("error") == "forbidden",
   "разрешение одноразовое: второй показ — снова forbidden")
# отказ не даёт окна
ok(send(TT, "screen-answer", {"allow": False}).get("ok"), "репетитор отклонил")
ok(send(SS, "screen", {"on": True}).get("error") == "forbidden",
   "после отказа показ не стартует")
# гашение безвредно всегда
ok(send(SS, "screen", {"on": False}).get("ok"), "гашение от ученика разрешено")

print("\n3. Репетитору показ — без всяких разрешений")
ok(send(TT, "screen", {"on": True}).get("ok"), "репетитор стартует сразу")
msgs = db.call_poll(bid, "s" + str(stu["id"]), 0)
ok(any(m.get("kind") == "screen" for m in msgs),
   "сигнал репетитора доехал до ученика")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
