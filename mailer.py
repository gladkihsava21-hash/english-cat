"""Отправка писем: коды подтверждения почты репетитора.

Два пути, по убыванию надёжности доставки:
  1. SMTP с ящиком на своём домене — письмо подписано, не летит в спам;
  2. локальный sendmail — работает без настройки, но провайдеры чаще
     кидают такие письма в спам.

Настройки берутся из файла рядом с базой (savely-data/mail.conf), потому что
на виртуальном хостинге переменные окружения задать негде:

    host = smtp.timeweb.ru
    port = 465
    user = noreply@wordcat.ru
    password = ...
    from = Савелий <noreply@wordcat.ru>
"""

import os
import smtplib
import subprocess
from email.message import EmailMessage
from email.utils import formataddr

import db

CONF_NAME = "mail.conf"


def _conf():
    path = os.path.join(os.path.dirname(os.path.abspath(db.DB_PATH)), CONF_NAME)
    out = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[k.strip().lower()] = v.strip()
    except OSError:
        pass
    return out


def _build(to_addr, subject, body, sender):
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_addr
    msg.set_content(body)
    return msg


def _send_smtp(conf, msg):
    port = int(conf.get("port", "465"))
    host = conf["host"]
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=20) as s:
            s.login(conf["user"], conf["password"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls()
            s.login(conf["user"], conf["password"])
            s.send_message(msg)


def _send_sendmail(msg):
    path = "/usr/sbin/sendmail"
    if not os.path.exists(path):
        raise RuntimeError("no_sendmail")
    subprocess.run([path, "-t", "-oi"], input=msg.as_bytes(), check=True, timeout=25)


def send(to_addr, subject, body):
    """Бросает исключение, если отправить не удалось ни одним способом."""
    conf = _conf()
    sender = conf.get("from") or formataddr(("Савелий", conf.get("user") or "noreply@localhost"))
    msg = _build(to_addr, subject, body, sender)

    if conf.get("host") and conf.get("user") and conf.get("password"):
        try:
            _send_smtp(conf, msg)
            return "smtp"
        except Exception as e:
            print("!! SMTP не сработал (%s), пробую sendmail" % type(e).__name__)
    _send_sendmail(msg)
    return "sendmail"


def send_verify_code(to_addr, name, code):
    body = (
        "Здравствуйте, %s.\n\n"
        "Код для подтверждения почты в панели репетитора:\n\n"
        "    %s\n\n"
        "Код действует 30 минут. Если это были не вы — просто удалите письмо,\n"
        "без кода кабинетом никто не воспользуется.\n\n"
        "— Савелий, кот-репетитор\n"
        "https://wordcat.ru\n"
    ) % (name or "репетитор", code)
    return send(to_addr, "Код подтверждения — Савелий", body)


def send_reset_code(to_addr, name, code):
    body = (
        "Здравствуйте, %s.\n\n"
        "Код для смены пароля в панели репетитора:\n\n"
        "    %s\n\n"
        "Код действует 30 минут и работает один раз.\n\n"
        "Если пароль менять не собирались — просто удалите письмо. Пароль\n"
        "останется прежним: сам по себе код ничего не меняет, его нужно\n"
        "ввести на сайте вместе с новым паролем.\n\n"
        "— Савелий, кот-репетитор\n"
        "https://wordcat.ru\n"
    ) % (name or "репетитор", code)
    return send(to_addr, "Код для смены пароля — Савелий", body)


def send_new_work(to_addr, name, count, student_name):
    what = "работа" if count == 1 else "работы"
    # Род по последней букве имени НЕ угадывается. Правило «кончается на
    # -а/-я, значит женское» ломается на самых частых уменьшительных:
    # Ваня, Петя, Дима, Илья, Никита, Гоша. Репетитор регулярно получал бы
    # письма, называющие его учеников не тем полом, — и это не мелочь,
    # это про уважение к ребёнку. Формулировка без рода: «работа от Вани»
    # верна всегда.
    body = (
        "%s, здравствуйте.\n\n"
        "Новая %s на проверку — от ученика: %s.\n"
        "Ждут проверки: %d.\n\n"
        "Посмотреть: https://wordcat.ru/tutor.html — вкладка «Фото тетрадей».\n\n"
        "— Савелий\n\n"
        "Письма приходят не чаще раза в час, даже если работ несколько.\n"
        "Не нужны — напишите @KOTSAVELII, отключим.\n"
    ) % (name or "Коллега", what, student_name, count)
    return send(to_addr, "Новая работа на проверку — Савелий", body)
