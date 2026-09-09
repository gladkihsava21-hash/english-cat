#!/usr/bin/env python3
"""Записать пароль почтового ящика в mail.conf и тут же проверить вход.

Зачем отдельный скрипт. Пароль ящика меняется в панели хостинга, и после
этого его надо положить в savely-data/mail.conf — иначе репетитор не
получит код подтверждения на почту, а сайт об этом скажет только строчкой
в таблице errors. Руками это делается через редактор, и пароль оседает
то в истории команд, то в буфере обмена.

Здесь он не оседает нигде: getpass читает его с терминала без эха, в
argv и переменные окружения он не попадает, на экран не печатается.
Сразу после записи скрипт логинится на SMTP и говорит, принят пароль
или нет, — чтобы не узнавать об этом от репетитора через неделю.

Запуск на сервере (файл лежит рядом с базой, вне public_html):

    ssh -t savely "python3 ~/kotsaveli/savely-data/set-mail-password.py"

Путь к mail.conf можно передать первым аргументом, если он не рядом.
"""
import getpass
import io
import os
import re
import smtplib
import sys


def read_conf(path):
    conf = {}
    with io.open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                conf[k.strip().lower()] = v.strip()
    return conf


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "mail.conf")
    if not os.path.exists(path):
        sys.exit("Нет файла %s — укажи путь первым аргументом." % path)

    conf = read_conf(path)
    print("Ящик:   %s" % conf.get("user", "(не указан)"))
    print("Сервер: %s:%s" % (conf.get("host", "?"), conf.get("port", "?")))
    print()

    pwd = getpass.getpass("Пароль ящика (ввод не показывается): ")
    if not pwd:
        sys.exit("Пусто — ничего не менял.")
    if pwd != getpass.getpass("Ещё раз, для проверки: "):
        sys.exit("Не совпало — ничего не менял.")

    # Сначала проверяем, потом пишем: незачем портить рабочий конфиг
    # заведомо неверным паролем.
    host, port, user = conf.get("host"), int(conf.get("port", 465)), conf.get("user")
    print("\nПробую войти…")
    try:
        maker = smtplib.SMTP_SSL if port == 465 else smtplib.SMTP
        with maker(host, port, timeout=20) as s:
            if port != 465:
                s.starttls()
            s.login(user, pwd)
        print("Вход принят.")
    except smtplib.SMTPAuthenticationError as e:
        sys.exit("Отказ: %s %s\nПароль НЕ записан — проверь его в панели хостинга."
                 % (e.smtp_code, e.smtp_error.decode("utf-8", "replace")[:120]))
    except Exception as e:
        sys.exit("Не дозвонился до сервера: %s: %s\nПароль НЕ записан."
                 % (type(e).__name__, str(e)[:150]))

    text = io.open(path, encoding="utf-8").read()
    new, n = re.subn(r"(?m)^[ \t]*password[ \t]*=.*$", "password = " + pwd, text)
    if not n:
        new = text.rstrip("\n") + "\npassword = " + pwd + "\n"
    # Права на файл возвращаем сразу: в нём пароль, а на общем хостинге
    # домашний каталог читают не только свои процессы.
    fd = os.open(path + ".new", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with io.open(fd, "w", encoding="utf-8") as f:
        f.write(new)
    os.replace(path + ".new", path)
    os.chmod(path, 0o600)
    print("Записано в %s (права 600). Письма пойдут со следующей отправки." % path)


main()
