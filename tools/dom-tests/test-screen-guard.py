#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Демонстрация экрана — только репетитору (волна 2): сервер отклоняет
сигнал «screen on» от ученика в обход интерфейса, «screen off» и
репетиторский показ пропускает.

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
T, S = "t" + str(t["id"]), "s" + str(stu["id"])

print("\n1. «screen on» от ученика отклонён, от репетитора — проходит")
r = Api.call_send(None, {"token": stu["token"], "boardId": bid,
                         "kind": "screen", "data": {"on": True}})
ok(r.get("error") == "forbidden" and not r.get("ok"),
   "ученику — forbidden: %s" % r)
r = Api.call_send(None, {"token": t["token"], "boardId": bid,
                         "kind": "screen", "data": {"on": True}})
ok(r.get("ok"), "репетитору показ разрешён")
# дошло ли до второй стороны: сообщение лежит в очереди ученика
msgs = db.call_poll(bid, S, 0)
ok(any(m.get("kind") == "screen" for m in msgs),
   "сигнал репетитора доехал до ученика")

print("\n2. «screen off» от ученика пропускаем (гашение безвредно)")
r = Api.call_send(None, {"token": stu["token"], "boardId": bid,
                         "kind": "screen", "data": {"on": False}})
ok(r.get("ok"), "гашение от ученика разрешено")
# и пустой data.on тоже не считается показом
r = Api.call_send(None, {"token": stu["token"], "boardId": bid,
                         "kind": "screen", "data": {}})
ok(r.get("ok"), "screen без on — не показ, пропускаем")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
