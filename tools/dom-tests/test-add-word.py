#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Добавление слов в словарь с доски: /api/tutor/add-word и
/api/student/add-word.

Права: репетитор — только своему ученику (не своему — not_found),
ученик — только себе (чужой токен — unauthorized). Дубли не плодим:
повтор — успех с exists, новая папка докидывается в существующую запись.

Запуск: python3 tools/dom-tests/test-add-word.py
"""
import os, sys, tempfile, json
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
# verified_tutor требует и подтверждённую почту, и живой доступ: новому
# тестовому репетитору даём и то, и другое (иначе need_payment).
import datetime
trial_end = (datetime.datetime.now(datetime.timezone.utc)
             + datetime.timedelta(days=30)).isoformat(timespec="seconds")
db.conn().execute("UPDATE tutors SET email_verified=1, trial_ends_at=? WHERE id IN (?, ?)",
                  (trial_end, t["id"], t2["id"]))
stu = db.create_student(t["id"], "Ира")
db.conn().commit()
TOK, TOK2, STOK = t["token"], t2["token"], stu["token"]

def dictionary(sid):
    return json.loads(db.get_student_by_id(sid)["dictionary"] or "[]")

print("\n1. Репетитор добавляет слово своему ученику")
r = Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"],
                              "w": "cat", "t": "кот", "ex": "A cat sleeps.",
                              "folders": ["Животные"]})
ok(r.get("ok") and not r.get("exists"), "слово добавлено")
d = dictionary(stu["id"])
ok(len(d) == 1 and d[0]["w"] == "cat" and d[0]["folders"] == ["Животные"],
   "в словаре запись с папкой: %s" % d)
ok(r["word"]["ex"] == "A cat sleeps.", "пример сохранён")

print("\n2. Повтор — не дубль, папка докидывается")
r = Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"],
                              "w": "cat", "t": "кот", "folders": ["Дом"]})
ok(r.get("ok") and r.get("exists"), "повтор распознан (exists)")
d = dictionary(stu["id"])
ok(len(d) == 1 and set(d[0]["folders"]) == {"Животные", "Дом"},
   "запись одна, папки смержились: %s" % d[0]["folders"])

print("\n3. Права: чужому ученику — not_found, ученик — только себе")
r = Api.tutor_add_word(None, {"token": TOK2, "studentId": stu["id"], "w": "dog", "t": "пёс"})
ok(not r.get("ok") and r.get("error") == "not_found", "чужой репетитор отклонён")
r = Api.tutor_add_word(None, {"token": "нет-такого", "studentId": stu["id"], "w": "dog", "t": "пёс"})
ok(not r.get("ok"), "без токена отклонён")
r = Api.student_add_word(None, {"token": "нет-такого", "w": "dog", "t": "пёс"})
ok(not r.get("ok") and r.get("error") == "unauthorized", "ученик с чужим токеном отклонён")
r = Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"], "w": "", "t": ""})
ok(not r.get("ok") and r.get("error") == "no_word", "пустое слово отклонено")

print("\n4. Ученик добавляет себе (с доски)")
r = Api.student_add_word(None, {"token": STOK, "w": "sun", "t": "солнце",
                                "folders": ["Небо"]})
ok(r.get("ok") and not r.get("exists"), "ученик добавил себе")
d = dictionary(stu["id"])
ok(any(x["w"] == "sun" and x["folders"] == ["Небо"] for x in d),
   "в словаре появилось sun с папкой: %s" % d)
r = Api.student_add_word(None, {"token": STOK, "w": "sun", "t": "солнце"})
ok(r.get("ok") and r.get("exists"), "и у ученика повтор — не дубль")
ok(len(dictionary(stu["id"])) == 2, "всего две записи, дублей нет")

print("\n5. boardId: слово везётся на доску полем dictAdd")
b = db.create_board(t["id"], "Урок")
r = Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"],
                              "w": "moon", "t": "луна", "boardId": b["id"]})
ok(r.get("ok"), "слово с boardId принято")
sync = db.board_sync(b["id"], [], [], 0, "s" + str(stu["id"]))
ok(sync.get("dictAdd") and sync["dictAdd"]["w"] == "moon",
   "ученик на доске получил dictAdd: %s" % sync.get("dictAdd"))
sync = db.board_sync(b["id"], [], [], 0, "t" + str(t["id"]))
ok("dictAdd" not in sync, "репетитору dictAdd не отдаётся")
# чужой boardId репетитору не светит
b2 = db.create_board(t2["id"], "Чужой урок")
r = Api.tutor_add_word(None, {"token": TOK, "studentId": stu["id"],
                              "w": "star", "t": "звезда", "boardId": b2["id"]})
sync = db.board_sync(b2["id"], [], [], 0, "s" + str(stu["id"]))
ok("dictAdd" not in sync, "на чужую доску dictAdd не пишется")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
