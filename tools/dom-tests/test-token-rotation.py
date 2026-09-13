#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ротация при смене пароля: старый recovery-код и старый токен ученика
после смены МЁРТВЫ. Закрывает «вечный чёрный ход» из аудита.

Запуск: python3 tools/dom-tests/test-token-rotation.py
"""
import os, sys, tempfile
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

# ---- репетитор ----
t = db.create_tutor("Т", "t@e.com", "startpass123")
db.conn().execute("UPDATE tutors SET email_verified=1 WHERE id=?", (t["id"],))
db.conn().commit()
old_recovery = db.get_tutor_by_id(t["id"])["recovery_code"]
old_token = db.get_tutor_by_id(t["id"])["token"]

print("\n1. Старый recovery-код работает для сброса ДО смены")
r = Api.tutor_password_reset(None, {"recoveryCode": old_recovery, "newPassword": "brandnew456"})
ok(r.get("ok") and r.get("token"), "сброс прошёл")
ok(r.get("recoveryCode") and r.get("recoveryCode") != old_recovery, "выдан НОВЫЙ recovery-код")
new_recovery = r.get("recoveryCode")
ok(r.get("token") != old_token, "токен ротирован")

print("\n2. Старый recovery-код БОЛЬШЕ НЕ работает (чёрный ход закрыт)")
r2 = Api.tutor_password_reset(None, {"recoveryCode": old_recovery, "newPassword": "another789"})
ok(not r2.get("ok") and "не подошёл" in r2.get("error", ""), "старый код отклонён: %s" % r2.get("error"))

print("\n3. Новый recovery-код работает")
r3 = Api.tutor_password_reset(None, {"recoveryCode": new_recovery, "newPassword": "third000pass"})
ok(r3.get("ok"), "новый код принят")

print("\n4. Смена пароля из панели тоже ротирует recovery и токен")
tok = db.get_tutor_by_id(t["id"])["token"]
rec_before = db.get_tutor_by_id(t["id"])["recovery_code"]
r4 = Api.tutor_password_change(None, {"token": tok, "oldPassword": "third000pass", "newPassword": "fourthPASS1"})
ok(r4.get("ok") and r4.get("token") != tok, "токен сменился")
ok(r4.get("recoveryCode") and r4.get("recoveryCode") != rec_before, "recovery сменился")

# ---- ученик ----
print("\n5. Смена пароля ученика ротирует его токен")
stu = db.create_student(t["id"], "Ваня")
db.set_student_email(stu["id"], "v@e.com")
stok_old = db.get_student_by_id(stu["id"])["token"]
new_tok = db.set_student_password(stu["id"], "pupilpass1")
ok(new_tok and new_tok != stok_old, "токен ученика ротирован")
ok(db.get_student_by_token(stok_old) is None, "старый токен ученика МЁРТВ")
ok(db.get_student_by_token(new_tok) is not None, "новый токен ученика живой")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "ротация recovery-кода и токенов держится"))
sys.exit(1 if fails else 0)
