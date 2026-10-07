#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Удаление слов из словаря ученика репетитором: /api/tutor/delete-word.

Права зеркалят add-word: репетитор — только своему ученику (чужому —
not_found), без подтверждённой почты — need_verify. Удаление
идемпотентно (повтор — missing), dictDel доезжает до онлайн-ученика
через опрос доски (иначе его снимок воскресил бы удалённое).

Запуск: python3 tools/dom-tests/test-delete-word.py
"""
import os, sys, tempfile, json, datetime
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
t2 = db.create_tutor("Ч", "ch@e.com", "startpass123")
trial_end = (datetime.datetime.now(datetime.timezone.utc)
             + datetime.timedelta(days=30)).isoformat(timespec="seconds")
db.conn().execute("UPDATE tutors SET email_verified=1, trial_ends_at=? WHERE id IN (?, ?)",
                  (trial_end, t["id"], t2["id"]))
stu = db.create_student(t["id"], "Ира")
stu2 = db.create_student(t2["id"], "Чужой")
db.conn().commit()
TOK, TOK2 = t["token"], t2["token"]

Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"],
                          "w": "cat", "t": "кот", "folders": ["Животные"]})
Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"],
                          "w": "dog", "t": "пёс", "folders": []})

def dictionary(sid):
    return json.loads(db.get_student_by_id(sid)["dictionary"] or "[]")

print("\n1. Репетитор удаляет слово своему ученику")
r = Api.tutor_delete_word(None, {"token": TOK, "studentId": stu["id"], "w": "cat"})
ok(r.get("ok") and not r.get("missing"), "слово удалено")
d = dictionary(stu["id"])
ok(len(d) == 1 and d[0]["w"] == "dog", "в словаре остался только dog: %s" % d)

print("\n2. Повторное удаление — missing, а не ошибка")
r = Api.tutor_delete_word(None, {"token": TOK, "studentId": stu["id"], "w": "cat"})
ok(r.get("ok") and r.get("missing"), "второе удаление честно говорит missing")
ok(len(dictionary(stu["id"])) == 1, "словарь не пострадал")

print("\n3. Права: чужому ученику — not_found, без почты — need_verify")
r = Api.tutor_delete_word(None, {"token": TOK, "studentId": stu2["id"], "w": "cat"})
ok(r.get("error") == "not_found", "чужой ученик отклонён: %s" % r.get("error"))
db.conn().execute("UPDATE tutors SET email_verified=0 WHERE id=?", (t["id"],))
db.conn().commit()
r = Api.tutor_delete_word(None, {"token": TOK, "studentId": stu["id"], "w": "dog"})
ok(r.get("error") == "need_verify", "без подтверждённой почты — need_verify")
db.conn().execute("UPDATE tutors SET email_verified=1 WHERE id=?", (t["id"],))
db.conn().commit()
ok(len(dictionary(stu["id"])) == 1, "слово на месте после отказов")

print("\n4. dictDel доезжает до онлайн-ученика через опрос доски")
b = db.create_board(t["id"], "Урок")
bid = b["id"]
r = Api.tutor_delete_word(None, {"token": TOK, "studentId": stu["id"],
                                 "w": "dog", "boardId": bid})
ok(r.get("ok"), "удаление с boardId прошло")
row = db.get_board(bid)
dd = json.loads(row["dict_del"] or "{}")
ok(dd.get("w") == "dog" and dd.get("studentId") == stu["id"],
   "на доске лежит уведомление: %s" % dd)
# ученик получает dictDel в синхронизации, репетитор — нет
r = db.board_sync(bid, [], [], 0, "s" + str(stu["id"]))
ok(r.get("dictDel", {}).get("w") == "dog", "ученик получил dictDel")
r = db.board_sync(bid, [], [], 0, "t" + str(t["id"]))
ok("dictDel" not in r, "репетитору его удаление не возвращается")
ok(not dictionary(stu["id"]), "словарь ученика пуст: %s" % dictionary(stu["id"]))

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
