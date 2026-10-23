#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Расписание уроков: /api/tutor/lessons, /api/tutor/lesson-add,
/api/tutor/lesson-del, /api/student/lessons.

Права: репетитор — только своим ученикам и свои уроки (чужой — not_found
или молча не отменяется), ученик — только свои. Валидация дат: далеко в
прошлом/будущем — отказ. Еженедельный урок ученику отдаётся ближайшим
показом (nextAt), разовый прошедший вчера — не отдаётся, сегодняшний —
отдаётся.

Запуск: python3 tools/dom-tests/test-lessons.py
"""
import os, sys, tempfile, time, datetime
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
# verified_tutor требует и подтверждённую почту, и живой доступ
trial_end = (datetime.datetime.now(datetime.timezone.utc)
             + datetime.timedelta(days=30)).isoformat(timespec="seconds")
db.conn().execute("UPDATE tutors SET email_verified=1, trial_ends_at=? WHERE id IN (?, ?)",
                  (trial_end, t["id"], t2["id"]))
stu = db.create_student(t["id"], "Ира")
stu2 = db.create_student(t2["id"], "Чужой")
db.conn().commit()
TOK, TOK2, STOK = t["token"], t2["token"], stu["token"]

NOW = time.time()
TOMORROW_17 = NOW + 86400
IN_TWO_HOURS = NOW + 7200

print("\n1. Репетитор добавляет урок своему ученику")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(TOMORROW_17), "durationMin": 45,
                                "title": "Разбор ошибок"})
ok(r.get("ok") and r["lesson"]["title"] == "Разбор ошибок", "урок создан: %s" % r)
ok(r["lesson"]["durationMin"] == 45, "длительность 45 сохранена")
LID = r["lesson"]["id"]

print("\n2. Список репетитора — с именем ученика")
r = Api.tutor_lessons(None, {"token": TOK})
ok(r.get("ok") and len(r["lessons"]) == 1
   and r["lessons"][0]["studentName"] == "Ира", "список с именем: %s" % r)

print("\n3. Права: чужой ученик и чужой токен")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu2["id"],
                                "startsAt": int(TOMORROW_17)})
ok(not r.get("ok") and r.get("error") == "not_found", "чужой ученик отклонён")
r = Api.tutor_lesson_add(None, {"token": "нет-такого", "studentId": stu["id"],
                                "startsAt": int(TOMORROW_17)})
ok(not r.get("ok"), "без токена отклонён")
r = Api.tutor_lessons(None, {"token": TOK2})
ok(r.get("ok") and r["lessons"] == [], "другой репетитор видит пусто")

print("\n4. Валидация дат и длительности")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(NOW - 3 * 86400)})
ok(not r.get("ok") and "дату" in r.get("error", "").lower(), "давнее прошлое отклонено")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(NOW + 3 * 366 * 86400)})
ok(not r.get("ok"), "дальше двух лет отклонено")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": "не-число"})
ok(not r.get("ok"), "не-дата отклонена")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(IN_TWO_HOURS), "durationMin": 37})
ok(r.get("ok") and r["lesson"]["durationMin"] == 60,
   "нестандартная длительность сведена к 60")

print("\n5. Ученик видит свои будущие, сегодняшние — и не видит вчерашние")
# вчерашний разовый прямо в базу (API такой не пропустит — и правильно)
db.create_lesson(t["id"], stu["id"], NOW - 90000, title="Вчерашний")
# сегодняшний, уже прошедший утром (если тест идёт ночью — через час после полуночи)
local = time.localtime()
midnight = time.mktime((local.tm_year, local.tm_mon, local.tm_mday, 0, 0, 0, 0, 0, -1))
db.create_lesson(t["id"], stu["id"], midnight + 3600, title="Утренний")
r = Api.student_lessons(None, {"token": STOK})
titles = [x["title"] for x in r.get("lessons", [])]
ok("Вчерашний" not in titles, "вчерашний не отдан: %s" % titles)
ok("Утренний" in titles and "Разбор ошибок" in titles,
   "сегодняшний и завтрашний отданы: %s" % titles)
ok(all("nextAt" in x for x in r["lessons"]), "у каждого посчитан nextAt")
r2 = Api.student_lessons(None, {"token": "нет-такого"})
ok(not r2.get("ok"), "ученик без токена отклонён")

print("\n6. Еженедельный урок: nextAt — ближайший показ")
week = 7 * 86400
past_weekly = NOW - 10 * 86400  # заведён давно, идёт каждую неделю
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(past_weekly), "repeatWeekly": True})
ok(r.get("ok") and r["lesson"]["repeatWeekly"], "еженедельный создан")
r = Api.student_lessons(None, {"token": STOK})
weekly = [x for x in r["lessons"] if x["repeatWeekly"]]
ok(len(weekly) == 1, "еженедельный отдан ученику")
nxt = weekly[0]["nextAt"]
ok(nxt >= midnight, "показ не раньше сегодня: nextAt=%s, midnight=%s" % (nxt, midnight))
ok(nxt < midnight + week, "показ в пределах недели: %s" % nxt)
ok((nxt - int(past_weekly)) % week == 0, "показ ровно по неделям от исходного")

print("\n7. Отмена: своя — отменяется, чужая — нет")
r = Api.tutor_lesson_del(None, {"token": TOK2, "id": LID})
ok(r.get("ok"), "чужой репетитор получил ok (молча)")
r = Api.tutor_lessons(None, {"token": TOK})
ok(len(r["lessons"]) == 5, "чужая отмена не сработала: уроков %d" % len(r["lessons"]))
r = Api.tutor_lesson_del(None, {"token": TOK, "id": LID})
ok(r.get("ok"), "своя отмена принята")
r = Api.tutor_lessons(None, {"token": TOK})
ok(len(r["lessons"]) == 4, "урок исчез из списка репетитора")
r = Api.student_lessons(None, {"token": STOK})
ok("Разбор ошибок" not in [x["title"] for x in r["lessons"]],
   "урок исчез и у ученика")

print("\n8. Карточка ученика несёт расписание (для панели)")
r = Api.tutor_student_detail(None, {"token": TOK, "studentId": stu["id"]})
card_titles = [x["title"] for x in r.get("lessons", [])]
ok(r.get("ok") and "lessons" in r and len(r["lessons"]) == 3
   and "Вчерашний" not in card_titles,
   "в карточке будущие+сегодняшние, прошлых нет: %s" % card_titles)

print("\n9. Доска привязывается только своя")
b = db.create_board(t["id"], "Урок пятницы")
b2 = db.create_board(t2["id"], "Чужая доска")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(TOMORROW_17), "boardId": b2["id"]})
ok(not r.get("ok") and r.get("error") == "Доска не найдена.", "чужая доска отклонена")
r = Api.tutor_lesson_add(None, {"token": TOK, "studentId": stu["id"],
                                "startsAt": int(TOMORROW_17), "boardId": b["id"]})
ok(r.get("ok") and r["lesson"]["boardId"] == b["id"], "своя доска привязана")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
