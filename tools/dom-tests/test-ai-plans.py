#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Тарификация ИИ (пакет владельца): лимит чата 10/день бесплатным и
безлимит платным, проверка фото только за платный тариф, разбор недели —
ленивый, кеш 7 дней, только платным.

Запуск: python3 tools/dom-tests/test-ai-plans.py
"""
import os, sys, tempfile, datetime, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
os.environ["SAVELY_DB"] = os.path.join(tempfile.mkdtemp(), "ai-plans.db")

import db, server
db.init()
Api = server.Api
# ИИ «доступен», но наружу не ходим: проверяем гейты, а не ответы модели.
server.ai_available = lambda: True
server.ask_claude = lambda p: "мяу (заглушка)"

fails = 0
def ok(cond, what):
    global fails
    print(("  ok  " if cond else "  FAIL ") + what)
    if not cond: fails += 1

def mk_tutor(email, paid_days=None, trial_days=None):
    t = db.create_tutor("Т", email, "startpass123")
    sets = ["email_verified=1"]
    params = []
    if paid_days is not None:
        end = (datetime.datetime.now(datetime.timezone.utc)
               + datetime.timedelta(days=paid_days)).isoformat(timespec="seconds")
        sets.append("paid_until=?"); params.append(end)
    if trial_days is not None:
        end = (datetime.datetime.now(datetime.timezone.utc)
               + datetime.timedelta(days=trial_days)).isoformat(timespec="seconds")
        sets.append("trial_ends_at=?"); params.append(end)
    params.append(t["id"])
    db.conn().execute("UPDATE tutors SET " + ", ".join(sets) + " WHERE id=?", params)
    db.conn().commit()
    return t

FREE = mk_tutor("free@e.com", trial_days=30)          # триал — «бесплатный»
PAID = mk_tutor("paid@e.com", paid_days=30)           # платный
FREE_STU = db.create_student(FREE["id"], "Ира")
PAID_STU = db.create_student(PAID["id"], "Петя")
db.conn().commit()

def chat(tok, msg="мяу?"):
    return Api.chat(None, {"token": tok, "text": msg, "history": []})

print("\n1. Чат: ученику бесплатного репетитора — 10 сообщений в день")
for i in range(10):
    r = chat(FREE_STU["token"], "мяу %d" % i)
ok(not r.get("limitReached"), "первые 10 проходят")
r = chat(FREE_STU["token"], "одиннадцатое")
ok(r.get("limitReached") and "устал мурчать" in r.get("reply", ""),
   "11-е — заглушка «устал мурчать»: %s" % r.get("reply", "")[:60])

print("\n2. Чат: ученику платного — без дневного потолка")
last = None
for i in range(12):
    last = chat(PAID_STU["token"], "мяу %d" % i)
ok(not last.get("limitReached"), "12 подряд — без ограничений (дневной потолок не для платных)")

print("\n3. Счётчик дня — в базе и со сбросом по окну")
rows = db.conn().execute(
    "SELECT COUNT(*) c FROM rate_hits WHERE k=?",
    ("chat-day|%d" % FREE_STU["id"],)).fetchone()
ok(rows["c"] == 10, "в rate_hits ровно 10 записей ученика: %s" % rows["c"])
db.conn().execute("DELETE FROM rate_hits WHERE k=?",
                  ("chat-day|%d" % FREE_STU["id"],))
db.conn().commit()
r = chat(FREE_STU["token"], "наутро")
ok(not r.get("limitReached"), "после сброса окна — снова можно")

print("\n4. Проверка фото: бесплатному — заслон тарифа, платному — можно")
st_free = db.check_state(FREE_STU["id"])
ok(st_free["limit"] == 0, "у бесплатного лимит проверок 0: %s" % st_free)
allowed, quota, why = db.use_check(FREE_STU["id"])
ok(not allowed and "платном тарифе" in (why or ""),
   "заглушка с тарифом: %s" % (why or "")[:70])
st_paid = db.check_state(PAID_STU["id"])
ok(st_paid["limit"] == db.CHECK_PACKS[-1]["limit"],
   "у платного — потолок большого пакета: %s" % st_paid["limit"])
allowed, quota, why = db.use_check(PAID_STU["id"])
ok(allowed, "платному проверка списывается")

print("\n5. checks_free из старых времён — игнорируется")
db.conn().execute("UPDATE tutors SET checks_free=1 WHERE id=?", (FREE["id"],))
db.conn().commit()
st = db.check_state(FREE_STU["id"])
ok(st["limit"] == 0, "checks_free=1 больше ничего не даёт: limit=%s" % st["limit"])

print("\n6. Разбор недели: агрегаты, генерация, кеш, только платным")
# словарь ученика с забытым словом и активностью
db.conn().execute(
    "UPDATE students SET dictionary=?, activity=? WHERE id=?",
    (json.dumps([{"w": "cat", "t": "кот", "forgot": 3, "knew": 1, "status": "learning"},
                 {"w": "dog", "t": "пёс", "forgot": 0, "knew": 5, "status": "learned"}]),
     json.dumps({datetime.date.today().isoformat(): 42}), PAID_STU["id"]))
db.conn().commit()
data = db.digest_data(PAID_STU["id"])
ok(data and data["weak"] and data["weak"][0]["w"] == "cat",
   "агрегаты: топ забытых — cat: %s" % (data and data.get("weak")))
dg = server.build_weekly_digest(PAID_STU["id"])
ok(dg and "cat" in dg["text"], "разбор сгенерирован с слабым словом: %s" % dg["text"][:80])
dg2 = db.digest_get_fresh(PAID_STU["id"])
ok(dg2 and dg2["text"] == dg["text"], "кеш вернул тот же разбор")
row = db.conn().execute(
    "SELECT built_at FROM weekly_digest WHERE student_id=?",
    (PAID_STU["id"],)).fetchone()
ok(row and row["built_at"] > 0, "кеш лежит в таблице weekly_digest")

print("\n7. Разбор в карточке: платному — едет, бесплатному — нет")
r = Api.tutor_student_detail(None, {"token": PAID["token"], "studentId": PAID_STU["id"]})
ok(r.get("ok") and r["student"].get("weekDigest"),
   "у платного в карточке есть weekDigest")
r = Api.tutor_student_detail(None, {"token": FREE["token"], "studentId": FREE_STU["id"]})
ok(r.get("ok") and "weekDigest" not in r["student"],
   "у бесплатного разбора в карточке нет")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
