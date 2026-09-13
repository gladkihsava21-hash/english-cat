#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Вход в админку: пароль + TOTP, миграция старого plaintext в хеш,
глобальный неспуфимый замок. Гоняем настоящие db.admin_login и primitive.

Запуск: python3 tools/dom-tests/test-admin-totp.py
"""
import os, sys, tempfile, json

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
d = tempfile.mkdtemp()
os.environ["SAVELY_DB"] = os.path.join(d, "s.db")
# старый файл с паролем открытым текстом — проверим миграцию
open(os.path.join(d, "admin.txt"), "w", encoding="utf-8").write("s3cretPAROL")

import db
db.init()

fails = 0
def ok(c, what):
    global fails
    print(("  ok  " if c else "  FAIL ") + what)
    if not c: fails += 1

cfg_path = os.path.join(d, "admin.json")

print("\n1. Первый вход: верный пароль, кода ещё нет -> просят привязать TOTP")
r = db.admin_login("s3cretPAROL", None, "1.2.3.4")
ok(r.get("needEnroll") and r.get("secret") and r.get("otpauth"), "needEnroll + секрет + otpauth: %s" % {k: r.get(k) for k in ("needEnroll","needCode","ok")})
secret = r.get("secret")
ok("otpauth://totp/wordcat.ru:admin" in (r.get("otpauth") or ""), "otpauth-URL корректный")

print("\n2. Неверный пароль -> отказ, TOTP не показывают")
r = db.admin_login("wrong", None, "1.2.3.4")
ok(not r.get("ok") and not r.get("needEnroll") and "пароль" in r.get("error","").lower(), "«Неверный пароль»")

print("\n3. Привязка: верный пароль + правильный код -> вход, миграция в хеш")
code = db.totp_now(secret)
r = db.admin_login("s3cretPAROL", code, "1.2.3.4")
ok(r.get("ok") and r.get("token"), "выдан токен: %s" % (str(r)[:60]))
cfg = json.load(open(cfg_path, encoding="utf-8"))
ok(cfg.get("pass_hash") and cfg.get("pass_salt"), "пароль теперь ХЕШ, не открытый текст")
ok(cfg.get("pass_hash") != "s3cretPAROL", "в конфиге нет открытого пароля")
ok(cfg.get("totp_active") is True, "TOTP активирован")
ok(db.admin_check(r["token"]), "токен проходит admin_check")

print("\n4. Второй вход: пароль без кода -> needCode")
r = db.admin_login("s3cretPAROL", None, "9.9.9.9")
ok(r.get("needCode") and not r.get("ok"), "просят код")

print("\n5. Пароль + НЕВЕРНЫЙ код -> отказ")
r = db.admin_login("s3cretPAROL", "000000", "9.9.9.9")
ok(not r.get("ok"), "неверный код не пускает")

print("\n6. Пароль + верный код -> вход")
r = db.admin_login("s3cretPAROL", db.totp_now(secret), "9.9.9.9")
ok(r.get("ok") and r.get("token"), "вошли с кодом")

print("\n7. TOTP-код принимается в окне ±1 шаг (расхождение часов)")
import time
future = db.totp_now(secret, t=time.time() + 30)   # следующий шаг
ok(db.totp_verify(secret, future, window=1), "код следующего шага принят")
ok(not db.totp_verify(secret, "123456", window=1) or future == "123456", "случайный код отклонён")

print("\n8. Глобальный замок: неверные пароли с РАЗНЫХ адресов всё равно копятся")
db.admin_fail_clear()
for i in range(db.ADMIN_FAIL_LIMIT):
    db.admin_login("wrong", None, "spoof-%d" % i)   # каждый раз новый who
r = db.admin_login("s3cretPAROL", db.totp_now(secret), "spoof-new")
ok(not r.get("ok") and "закрыт" in r.get("error","").lower(),
   "после %d неудач с РАЗНЫХ who вход закрыт (спуф не помогает): %s" % (db.ADMIN_FAIL_LIMIT, r.get("error")))
db.admin_fail_clear()
r = db.admin_login("s3cretPAROL", db.totp_now(secret), "x")
ok(r.get("ok"), "после снятия замка вход снова работает")

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "админка: пароль+TOTP+глобальный замок держатся"))
sys.exit(1 if fails else 0)
