#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Настроить вход в админку (пароль + TOTP) заранее, с сервера.

Зачем. Если TOTP ещё не привязан, привязку делает первый, кто пройдёт
пароль через публичный /api/admin/login — то есть пароль остаётся
единственным барьером в это окно (ред-тим, находка F3). Этот скрипт
закрывает окно: заводит секрет TOTP прямо на сервере (totp_active=True),
и HTTP-привязка не открывается вовсе. Заодно переносит пароль из старого
admin.txt в хеш admin.json.

Запуск на сервере (файл лежит рядом с базой, вне public_html):

    ssh -t savely "python3 ~/kotsaveli/public_html/tools/admin-totp-setup.py"

Скрипт спросит пароль (если admin.txt ещё нет), покажет секрет и otpauth-
ссылку. Заведи их в Google Authenticator: «+» -> «Ввести ключ вручную» ->
имя «wordcat админка», ключ — показанный секрет. Проверь, что 6 цифр в
приложении совпадают с напечатанными, и всё.

Путь к базе можно передать первым аргументом (по умолчанию ищем рядом).
"""
import getpass
import io
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

# путь к базе: аргумент, или переменная, или дефолт рядом с кодом
if len(sys.argv) > 1:
    os.environ["SAVELY_DB"] = sys.argv[1]
elif not os.environ.get("SAVELY_DB"):
    # на бою база лежит в ../savely-data — попробуем угадать
    guess = os.path.join(os.path.dirname(ROOT), "savely-data", "savely.db")
    if os.path.exists(guess):
        os.environ["SAVELY_DB"] = guess

import db  # noqa: E402  (импорт после SAVELY_DB)

cfg_path = db._admin_cfg_path()
cfg = db._admin_load_cfg()

print("Конфиг админки: %s" % cfg_path)

# --- пароль ---
if cfg.get("pass_hash"):
    print("Пароль уже в хеше — оставляю как есть.")
elif db._admin_legacy_password():
    print("Переношу пароль из admin.txt в хеш…")
    h, salt = db.hash_password(db._admin_legacy_password())
    cfg["pass_hash"] = h
    cfg["pass_salt"] = salt
else:
    pw = getpass.getpass("Задай пароль админки (ввод не виден): ")
    if not pw or pw != getpass.getpass("Ещё раз: "):
        sys.exit("Пусто или не совпало — ничего не менял.")
    h, salt = db.hash_password(pw)
    cfg["pass_hash"] = h
    cfg["pass_salt"] = salt

# --- TOTP ---
if cfg.get("totp_active") and cfg.get("totp_secret"):
    ans = input("TOTP уже настроен. Перевыпустить секрет заново? (напиши YES) ")
    if ans.strip() != "YES":
        print("Оставляю прежний TOTP. Готово.")
        db._admin_save_cfg(cfg)
        sys.exit(0)

secret = db._new_totp_secret()
cfg["totp_secret"] = secret
cfg["totp_active"] = True
cfg["totp_used_step"] = 0
db._admin_save_cfg(cfg)

print("\n" + "=" * 56)
print("ГОТОВО. Заведи это в Google Authenticator (ручной ввод ключа):")
print("  Имя аккаунта:  wordcat админка")
print("  Ключ (секрет): %s" % secret)
print("  Тип: по времени (TOTP), 6 цифр, период 30 сек")
print()
print("Или отсканируй ссылку любым QR-приложением:")
print("  %s" % db._otpauth(secret))
print("=" * 56)
print("\nПроверь: код в приложении сейчас = %s (обновляется каждые 30 сек)."
      % db.totp_now(secret))
print("Если совпал — вход в админку теперь по паролю и этому коду.")
