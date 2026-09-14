#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Приложение-аутентификатор репетитора как запасной ключ: привязка,
сброс пароля по коду, анти-replay, отвязка только с паролем, нейтральная
ошибка для чужой почты. Гоняем настоящие хендлеры на временной базе.

Запуск: python3 tools/dom-tests/test-tutor-totp.py
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

t = db.create_tutor("Т", "t@e.com", "startpass123")
db.conn().execute("UPDATE tutors SET email_verified=1 WHERE id=?", (t["id"],))
db.conn().commit()
tok = lambda: db.get_tutor_by_id(t["id"])["token"]

print("\n1. Без привязки сброс по коду невозможен, totpActive=false")
ok(db.tutor_public(db.get_tutor_by_id(t["id"]))["totpActive"] is False, "totpActive=false до привязки")
r = Api.tutor_totp_reset(None, {"email": "t@e.com", "code": "123456", "newPassword": "newpass9999"})
ok(not r.get("ok") and r.get("error") == "Код не подошёл.", "сброс отклонён: %s" % r.get("error"))

print("\n2. setup выдаёт секрет и otpauth с почтой; до confirm — не активно")
r = Api.tutor_totp_setup(None, {"token": tok()})
ok(r.get("ok") and r.get("secret") and "otpauth://totp/wordcat.ru:t%40e.com" in r.get("otpauth", ""),
   "секрет + otpauth: %s" % r.get("otpauth", "")[:60])
secret = r["secret"]
ok(not db.get_tutor_by_id(t["id"])["totp_active"], "ещё не активно")
r = Api.tutor_totp_reset(None, {"email": "t@e.com", "code": db.totp_now(secret), "newPassword": "newpass9999"})
ok(not r.get("ok"), "pending-секрет НЕ даёт сбросить пароль (до confirm)")

print("\n3. confirm неверным кодом — отказ; верным — привязано")
r = Api.tutor_totp_confirm(None, {"token": tok(), "code": "000000"})
ok(not r.get("ok"), "неверный код не привязывает")
r = Api.tutor_totp_confirm(None, {"token": tok(), "code": db.totp_now(secret)})
ok(r.get("ok") and r["tutor"]["totpActive"] is True, "верный код -> totpActive=true")

print("\n4. Забыл пароль: сброс по коду из приложения")
db.conn().execute("UPDATE tutors SET totp_used_step=0 WHERE id=?", (t["id"],)); db.conn().commit()  # свежий шаг
old_token = tok()
r = Api.tutor_totp_reset(None, {"email": "T@E.COM", "code": db.totp_now(secret), "newPassword": "brandnew4567"})
ok(r.get("ok") and r.get("token") and r.get("recoveryCode"), "пароль сброшен, выдан токен и новый recovery")
ok(r.get("token") != old_token, "старый токен ротирован")
ok(db.check_password("brandnew4567", *[db.get_tutor_by_id(t["id"])[k] for k in ("pass_hash", "pass_salt")]),
   "новый пароль реально работает")
ok(db.get_tutor_by_id(t["id"])["totp_active"] == 1, "привязка пережила смену пароля")

print("\n5. Анти-replay: тот же код второй раз не сбрасывает")
same = db.totp_now(secret)
db.conn().execute("UPDATE tutors SET totp_used_step=0 WHERE id=?", (t["id"],)); db.conn().commit()
r1 = Api.tutor_totp_reset(None, {"email": "t@e.com", "code": same, "newPassword": "again12345"})
r2 = Api.tutor_totp_reset(None, {"email": "t@e.com", "code": same, "newPassword": "again67890"})
ok(r1.get("ok") and not r2.get("ok"), "первый прошёл, повтор отклонён")

print("\n6. Чужая почта — та же нейтральная ошибка (не выдаём, есть ли клиент)")
r = Api.tutor_totp_reset(None, {"email": "nobody@e.com", "code": "123456", "newPassword": "xxxxxxxx1"})
ok(r.get("error") == "Код не подошёл.", "нейтрально: %s" % r.get("error"))

print("\n7. Отвязка — только с текущим паролем")
r = Api.tutor_totp_disable(None, {"token": tok(), "password": "wrong"})
ok(not r.get("ok") and db.get_tutor_by_id(t["id"])["totp_active"] == 1, "без пароля не отвязать")
r = Api.tutor_totp_disable(None, {"token": tok(), "password": "again12345"})
ok(r.get("ok") and r["tutor"]["totpActive"] is False, "с паролем отвязано")
ok(db.get_tutor_by_id(t["id"])["totp_secret"] is None, "секрет стёрт")

print("\n8. Без токена / без подтверждённой почты — setup закрыт")
r = Api.tutor_totp_setup(None, {"token": "nope"})
ok(r.get("error") == "unauthorized", "чужой токен -> unauthorized")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "приложение-ключ репетитора работает"))
sys.exit(1 if fails else 0)
