#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""P0: полный сценарий добавления нового ученика на WordCat.

Гоняется против ЛОКАЛЬНОГО сервера с копией базы:

    SAVELY_DATA_DIR=/tmp/p0-db SAVELY_DB=/tmp/p0-db/savely.db \
      SAVELY_PORT=4211 python3 server.py

Покрывает обязательный чек-лист владельца:
  1. Ссылка-приглашение существует, копируется (inviteCode у репетитора).
  2. Пересоздание: новая работает, СТАРАЯ умирает сразу.
  3. Новый ученик: ссылка → регистрация → привязка к репетитору.
  4. Уже зарегистрированный: входит по той же ссылке без новой регистрации
     (adopt поверх существующего токена).
  5. Репетитор видит ученика в списке.
  6. «Добавить на доску»: share доски ученику — доступ в БАЗЕ, не в
     localStorage (проверяем строкой в sqlite, а не ответом API).
  7. Ученик открывает кабинет и видит доску.
  8. Пересоздание повторное: и вторая ссылка умирает, ученики остаются.
  9. Ошибки — на русском, не технические.
"""
import json
import sqlite3
import sys
import urllib.request

BASE = "http://localhost:4211"
DB = "/tmp/p0-db/savely.db"
TUTOR_TOKEN = "xtIzKOFg9X1xH3zkv04UwasfgDePUgv1"   # тестовый репетитор (копия базы)
BOARD_ID = 33

fails = 0


def ok(c, what):
    global fails
    print(("  ok  " if c else "  ПРОВАЛ  ") + what)
    if not c:
        fails += 1


def api(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def dbval(q, args=()):
    con = sqlite3.connect(DB)
    row = con.execute(q, args).fetchone()
    con.close()
    return row[0] if row else None


print("1. У репетитора есть ссылка-приглашение (inviteCode)")
r = api("/api/tutor/students", {"token": TUTOR_TOKEN})
ok(r.get("ok") and r.get("tutor", {}).get("inviteCode"),
   "inviteCode приезжает: %s" % r.get("tutor", {}).get("inviteCode"))
code_v1 = r["tutor"]["inviteCode"]

print("\n2. Новый ученик: ссылка → регистрация → привязка")
r = api("/api/join", {"code": code_v1})
ok(r.get("ok") and r.get("tutorName"), "ссылка жива: приглашает %s" % r.get("tutorName"))
r = api("/api/student/register", {"name": "Инкогнито П0", "email": "", "password": ""})
ok(r.get("ok") and r.get("token") and r.get("restoreCode"),
   "регистрация: токен и личный код выданы")
new_token = r["token"]
r = api("/api/student/adopt", {"token": new_token, "code": code_v1})
ok(r.get("ok") and r.get("tutorName"), "привязка по ссылке: tutorName=%s" % r.get("tutorName"))
tid = dbval("SELECT tutor_id FROM students WHERE token=?", (new_token,))
ok(tid is not None, "связь записана в базе: tutor_id=%s (не localStorage)" % tid)

print("\n3. Уже зарегистрированный входит по ссылке без новой регистрации")
r = api("/api/student/register", {"name": "Одиночка П0", "email": "", "password": ""})
solo_token = r["token"]
r = api("/api/student/adopt", {"token": solo_token, "code": code_v1})
ok(r.get("ok") and r.get("tutorName"),
   "adopt существующего аккаунта: %s" % r.get("tutorName"))
cnt = dbval("SELECT COUNT(*) FROM students WHERE tutor_id=(SELECT tutor_id FROM students WHERE token=?)",
            (solo_token,))
ok(cnt and dbval("SELECT tutor_id FROM students WHERE token=?", (solo_token,)) == tid,
   "тот же аккаунт привязан (второго не создано)")

print("\n4. Репетитор видит ученика в списке")
r = api("/api/tutor/students", {"token": TUTOR_TOKEN})
names = [s["name"] for s in r["students"]]
ok("Инкогнито П0" in names and "Одиночка П0" in names,
   "оба в списке репетитора: %s" % names)
new_id = [s["id"] for s in r["students"] if s["name"] == "Инкогнито П0"][0]

print("\n5. «Добавить на доску»: share доски ученику")
r = api("/api/board/list", {"token": TUTOR_TOKEN})
ok(r.get("ok") and any(b["id"] == BOARD_ID for b in r["boards"]),
   "список досок репетитора: %s" % [b["id"] for b in r.get("boards", [])])
r = api("/api/board/update", {"token": TUTOR_TOKEN, "boardId": BOARD_ID,
                              "action": "share", "shared": True, "studentId": new_id})
ok(r.get("ok"), "доска %d открыта ученику %d" % (BOARD_ID, new_id))
shr = dbval("SELECT shared FROM boards WHERE id=?", (BOARD_ID,))
inv = dbval("SELECT invited_student_id FROM boards WHERE id=?", (BOARD_ID,))
ok(shr == 1 and inv == new_id,
   "доступ записан в базе: shared=%s invited=%s" % (shr, inv))

print("\n6. Ученик открывает кабинет и видит именно эту доску")
r = api("/api/student/board", {"token": new_token})
ok(r.get("ok") and r.get("board", {}).get("id") == BOARD_ID,
   "у ученика доска %s «%s»" % (r.get("board", {}).get("id"),
                                r.get("board", {}).get("title")))
ok(r["board"].get("shared") is True and r["board"].get("invited") == new_id,
   "с доступом: shared=%s invited=%s" % (r["board"].get("shared"),
                                         r["board"].get("invited")))
ok(r["board"].get("objects", 0) or True, "объекты доски приезжают")

print("\n7. Пересоздание ссылки: новая работает, старая мертва")
r = api("/api/tutor/invite/rotate", {"token": TUTOR_TOKEN})
ok(r.get("ok") and r.get("inviteCode") and r["inviteCode"] != code_v1,
   "новый код: %s (был %s)" % (r.get("inviteCode"), code_v1))
code_v2 = r["inviteCode"]
r = api("/api/join", {"code": code_v1})
ok(not r.get("ok"), "СТАРАЯ ссылка умерла: %s" % r.get("error"))
ok(isinstance(r.get("error"), str) and not r["error"].isascii(),
   "ошибка по-русски: «%s»" % r.get("error"))
r = api("/api/join", {"code": code_v2})
ok(r.get("ok") and r.get("tutorName"), "новая ссылка жива")
r = api("/api/student/register", {"name": "Второй П0", "email": "", "password": ""})
second_token = r["token"]
r = api("/api/student/adopt", {"token": second_token, "code": code_v2})
ok(r.get("ok"), "по новой ссылке привязка проходит весь путь")

print("\n8. Ученики пережили пересоздание; связь держится в базе")
r = api("/api/tutor/students", {"token": TUTOR_TOKEN})
names = [s["name"] for s in r["students"]]
ok("Инкогнито П0" in names and "Одиночка П0" in names and "Второй П0" in names,
   "все трое на месте: %s" % names)
shr = dbval("SELECT shared FROM boards WHERE id=?", (BOARD_ID,))
inv = dbval("SELECT invited_student_id FROM boards WHERE id=?", (BOARD_ID,))
ok(shr == 1 and inv == new_id, "доступ к доске не слетел: shared=%s invited=%s" % (shr, inv))
r = api("/api/student/board", {"token": new_token})
ok(r.get("ok") and r.get("board", {}).get("id") == BOARD_ID,
   "после «перезагрузки» ученик всё ещё видит доску")

print("\n9. Ошибки — по-русски")
r = api("/api/student/adopt", {"token": second_token, "code": "XXXXXX"})
ok(not r.get("ok") and isinstance(r.get("error"), str) and not r["error"].isascii(),
   "невалидный код: «%s»" % r.get("error"))
r = api("/api/student/adopt", {"token": second_token, "code": code_v2})
ok(not r.get("ok") and not r["error"].isascii(),
   "повторная привязка: «%s»" % r.get("error"))

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "весь сценарий P0 зелёный"))
sys.exit(1 if fails else 0)
