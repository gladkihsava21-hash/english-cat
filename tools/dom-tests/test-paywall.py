#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Заслон оплаты: expired-репетитор и его ученик не достают платных функций,
оплаченный — достаёт. Гоняем НАСТОЯЩИЕ хендлеры server.Api на временной базе.

Проверяет батч 2 безопасности. Запуск:
    python3 tools/dom-tests/test-paywall.py
"""
import os, sys, tempfile, datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
db_path = os.path.join(tempfile.mkdtemp(), "paywall.db")
os.environ["SAVELY_DB"] = db_path

import db, server
db.init()
Api = server.Api
# ИИ «доступен» — иначе tts/chat выходят на ai_off раньше заслона оплаты.
server.ai_available = lambda: True
server.tts_available = lambda: True
# ask_claude/озвучку наружу не пускаем: на expired заслон срабатывает ДО них,
# а на оплате нам важно лишь, что заслон НЕ мешает (сам ответ не проверяем).
server.ask_claude = lambda p: "мяу (заглушка)"
if hasattr(server, "synth_word"):
    server.synth_word = lambda *a, **k: (b"MP3", "audio/mpeg")

fails = 0
def ok(cond, what):
    global fails
    print(("  ok  " if cond else "  FAIL ") + what)
    if not cond: fails += 1

def is_pause(res):
    # Пауза приходит двумя видами: ошибкой с «паузе»/«не открыл доступ», либо
    # у чата — мягкой репликой кота limitReached с «на паузе».
    txt = str(res.get("error", "")) + " " + str(res.get("reply", ""))
    return isinstance(res, dict) and ("на паузе" in txt or "паузе" in str(res.get("error","")))

# ---- сетап: репетитор + ученик + доска ----
t = db.create_tutor("Тест", "t@example.com", "parolische123")
db.conn().execute("UPDATE tutors SET email_verified=1 WHERE id=?", (t["id"],))
db.conn().commit()
stu = db.create_student(t["id"], "Ваня")
board = db.create_board(t["id"], "Урок")
db.set_lesson_url(t["id"], "https://meet.example.com/room")
ttok = db.get_tutor_by_id(t["id"])["token"]
stok = db.get_student_by_id(stu["id"])["token"]

def set_access(state):
    """paid | trial | expired — двигаем даты в базе."""
    now = datetime.datetime.now(datetime.timezone.utc)
    if state == "paid":
        pu = (now + datetime.timedelta(days=10)).isoformat(); te = None
    elif state == "trial":
        pu = None; te = (now + datetime.timedelta(days=2)).isoformat()
    else:  # expired
        pu = (now - datetime.timedelta(days=1)).isoformat()
        te = (now - datetime.timedelta(days=1)).isoformat()
    db.conn().execute("UPDATE tutors SET paid_until=?, trial_ends_at=? WHERE id=?",
                      (pu, te, t["id"]))
    db.conn().commit()

# набор платных вызовов от лица репетитора и ученика
def calls():
    return {
        "board_sync(репетитор)":  Api.board_sync(None, {"token": ttok, "boardId": board["id"], "since": 0}),
        "board_sync(ученик)":     Api.board_sync(None, {"token": stok, "boardId": board["id"], "since": 0}),
        "lesson_open":            Api.tutor_lesson_open(None, {"token": ttok, "on": True}),
        "lesson_set":             Api.tutor_lesson_set(None, {"token": ttok, "url": "https://meet.example.com/x"}),
        "notify_set":             Api.tutor_notify_set(None, {"token": ttok, "work": True}),
        "call_send":              Api.call_send(None, {"token": ttok, "boardId": board["id"], "kind": "ping", "data": {}}),
        "tts(ученик)":            Api.tts(None, {"token": stok, "word": "cat"}),
        "chat(ученик)":           Api.chat(None, {"token": stok, "message": "hi", "_ip": "1.1.1.1"}),
    }

print("\n1. Репетитор ОПЛАЧЕН — платные функции работают")
set_access("paid")
for name, res in calls().items():
    ok(not is_pause(res), "%s не на паузе (%s)" % (name, str(res)[:60]))

print("\n2. Триал — тоже работают (триал это доступ)")
set_access("trial")
for name, res in calls().items():
    ok(not is_pause(res), "%s не на паузе" % name)

print("\n3. Репетитор EXPIRED — всё платное на паузе")
set_access("expired")
res = calls()
ok(is_pause(res["board_sync(репетитор)"]), "доска закрыта репетитору")
ok(is_pause(res["board_sync(ученик)"]),   "доска закрыта ученику")
ok(is_pause(res["lesson_open"]),          "нельзя позвать на урок")
ok(is_pause(res["lesson_set"]),           "нельзя сменить ссылку урока")
ok(is_pause(res["notify_set"]),           "нельзя трогать письма")
ok(res["call_send"].get("error") == "unauthorized", "звонок закрыт (_call_party -> unauthorized)")
ok(res["tts(ученик)"].get("error") == "paused", "озвучка на паузе -> браузерный синтез")
ok(is_pause(res["chat(ученик)"]), "чат на паузе (реплика кота, без Claude)")

print("\n4. EXPIRED: ученик не привязывается к неоплатившему")
solo = db.create_student_standalone("Соло")
join = Api.student_join(None, {"code": db.get_tutor_by_id(t["id"])["invite_code"], "name": "Петя"})
ok(is_pause(join) or "не открыл доступ" in str(join.get("error", "")), "join отклонён: %s" % str(join)[:70])

print("\n5. Снова ОПЛАЧЕН — доступ вернулся")
set_access("paid")
ok(not is_pause(Api.board_sync(None, {"token": ttok, "boardId": board["id"], "since": 0})), "доска снова открыта")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "заслон оплаты держится на всех ручках"))
sys.exit(1 if fails else 0)
