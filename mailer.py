"""Отправка писем репетитору: коды подтверждения и сброса пароля, «пришла
работа на проверку», недельный дайджест по ученикам, конец пробного периода.

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
from email.utils import formataddr, formatdate, make_msgid, parseaddr

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

    # Date и Message-ID добавляем руками — без них письма уходили в спам.
    #
    # Ни EmailMessage, ни smtplib.send_message их не проставляют, а Date по
    # RFC 5322 обязателен, и отсутствие обоих — учебниковый признак
    # спам-рассылки. Особенно строг Gmail, а именно туда пишет большинство
    # репетиторов. То есть письмо могло честно уйти, пройти SPF и всё равно
    # не попасться человеку на глаза.
    #
    # Домен для Message-ID берём из адреса отправителя, а не из константы:
    # он задаётся в mail.conf и на другой площадке будет другим, а
    # Message-ID с чужим доменом хуже, чем никакого.
    domain = (parseaddr(sender)[1].rsplit("@", 1) + ["wordcat.ru"])[1] or "wordcat.ru"
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=domain)
    # Транзакционное письмо: не надо ни автоответов, ни «вас нет на месте».
    msg["Auto-Submitted"] = "auto-generated"

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


def _smtp_configured(conf):
    return bool(conf.get("host") and conf.get("user") and conf.get("password"))


def smtp_ready():
    """Настроен ли SMTP. Фоновые письма (напоминания, конец триала) идут
    ТОЛЬКО через него — без mail.conf они не отправляются вовсе.

    Причина — безопасность разработки, а не доставляемость. Без mail.conf
    send() уходит в локальный sendmail, и на маке разработчика он тоже
    есть. Фоновая рассылка стартует сама, на хвосте любого запроса, —
    то есть стоило бы запустить server.py с копией боевой базы (а это
    штатный способ проверить совместимость, см. AGENTS.md), и живые
    репетиторы получили бы письма с чужой машины. Письма по явному
    действию (код на почту, новая работа) этой защиты не требуют:
    их вызывает человек, а не таймер."""
    return _smtp_configured(_conf())


def send(to_addr, subject, body):
    """Отправить письмо. Бросает исключение, если не вышло НИ ОДНИМ способом.

    Возвращает способ доставки, и звонящему важно различать три:
      "smtp"     — ушло по-настоящему, ящиком на своём домене;
      "fallback" — SMTP настроен, но ОТКАЗАЛ, письмо отдано sendmail;
      "sendmail" — SMTP не настроен вовсе (так живёт машина разработчика).

    Разница между двумя последними принципиальна. sendmail на хостинге —
    это /usr/local/bin/php-sendmail-proxy, и он возвращает код 0 всегда:
    исключения нет, а письмо при этом никуда не доходит. То есть при
    отказе SMTP сайт честно считал, что письмо отправлено, репетитор
    видел «код отправлен» и ждал письма, которого не будет. Так и вышло
    3 сентября: пароль ящика перестал подходить, регистрация встала, а в
    журнале ошибок было пусто — про отказ SMTP тут стоял один print(),
    уходивший в лог Apache, который никто не читает."""
    conf = _conf()
    sender = conf.get("from") or formataddr(("Савелий", conf.get("user") or "noreply@localhost"))
    msg = _build(to_addr, subject, body, sender)

    if _smtp_configured(conf):
        try:
            _send_smtp(conf, msg)
            return "smtp"
        except Exception as e:
            # В базу, а не в stdout: отсюда это видно в админке.
            #
            # Пишем ТОЛЬКО тип и текст исключения. Ни conf, ни тело письма
            # сюда попасть не должны: в conf лежит пароль ящика, а в теле —
            # код подтверждения, то есть ровно то, чем открывают чужой
            # кабинет. smtplib отдаёт «(535, b'Incorrect authentication
            # data')» — этого хватает, чтобы понять причину.
            db.log_error("mail/smtp", "%s: %s" % (type(e).__name__, e),
                         status=502)
            print("!! SMTP не сработал (%s), пробую sendmail" % type(e).__name__)
            _send_sendmail(msg)
            return "fallback"
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


def send_student_reset_code(to_addr, name, code):
    """Письмо ученику. Отдельно от репетиторского не ради вежливости:
    у нас всюду разное обращение — к ученику на «ты», ко взрослому на
    «вы», — и письмо, которое читает ребёнок, не должно звать его
    в панель репетитора."""
    body = (
        "Привет, %s!\n\n"
        "Код, чтобы задать новый пароль:\n\n"
        "    %s\n\n"
        "Он работает 30 минут и только один раз.\n\n"
        "Если пароль менять не собирался — просто удали письмо. Сам по себе\n"
        "код ничего не меняет: его нужно ввести на сайте вместе с новым\n"
        "паролем. А твой словарь и очки останутся на месте в любом случае.\n\n"
        "— Савелий, кот-репетитор\n"
        "https://wordcat.ru\n"
    ) % (name or "друг", code)
    return send(to_addr, "Код для нового пароля — Савелий", body)


# Как отключить — в каждом письме, которое можно отключить. Раньше здесь
# стояло «напишите @KOTSAVELII, отключим»: то есть репетитор либо терпел,
# либо ставил почтовый фильтр, и мы об этом не узнавали.
UNSUBSCRIBE_NOTE = (
    "Отключить можно в панели: вкладка «Подписка» → «Письма на почту».\n"
)


def _plural(n, one, few, many):
    a, b = abs(n) % 100, abs(n) % 10
    if 10 < a < 20:
        return many
    if 1 < b < 5:
        return few
    if b == 1:
        return one
    return many


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
        + UNSUBSCRIBE_NOTE
    ) % (name or "Коллега", what, student_name, count)
    return send(to_addr, "Новая работа на проверку — Савелий", body)


def send_reminder_digest(to_addr, name, items):
    """Еженедельно: кто из учеников пропал и у кого накопились слова.

    Род ученика не угадываем (см. send_new_work) — все фразы без рода:
    «не заходит N дней», а не «не заходил(а)»."""
    lines = []
    for it in items:
        parts = []
        if it.get("silentDays"):
            d = it["silentDays"]
            parts.append("не заходит %d %s" % (d, _plural(d, "день", "дня", "дней")))
        if it.get("overdue"):
            n = it["overdue"]
            parts.append("%d %s ждут повторения" % (n, _plural(n, "слово", "слова", "слов")))
        lines.append("  • %s — %s." % (it["name"], ", ".join(parts)))
    body = (
        "%s, здравствуйте.\n\n"
        "Коротко о том, что стоит заметить у учеников на этой неделе:\n\n"
        "%s\n\n"
        "Открыть панель: https://wordcat.ru/tutor.html\n\n"
        "— Савелий\n\n"
        "Такое письмо приходит не чаще раза в неделю и только если есть\n"
        "что сказать. " + UNSUBSCRIBE_NOTE
    ) % (name or "Коллега", "\n".join(lines))
    n = len(items)
    subject = "%d %s: кто пропал и у кого накопились слова — Савелий" % (
        n, _plural(n, "ученик", "ученика", "учеников"))
    return send(to_addr, subject, body)


def send_trial_ending(to_addr, name, when, plan_name, price, limit, count):
    """Пробный период кончается: одно письмо, за сутки с небольшим.

    Это не рассылка, а сообщение о состоянии кабинета, поэтому
    переключателем в панели оно не отключается — как и коды на почту.
    Главное здесь сказать честно: что закроется (панель), что нет
    (занятия учеников), и что автосписаний не будет."""
    body = (
        "%s, здравствуйте.\n\n"
        "Бесплатные дни в панели репетитора заканчиваются %s.\n"
        "Дальше — тариф «%s», %d ₽ в месяц: до %d учеников, сейчас у вас %d.\n"
        "Ученики не платят ничего.\n\n"
        "Чтобы панель не закрылась, напишите в телеграм @KOTSAVELII — пришлём\n"
        "счёт, панель открывается в день оплаты. Автосписаний нет: без\n"
        "вашего решения ничего не спишется.\n\n"
        "Если продолжать не планируете — делать ничего не нужно. Ученики\n"
        "продолжат заниматься как обычно, прогресс и выданные домашки\n"
        "останутся; закроется только ваша панель.\n\n"
        "— Савелий\n"
        "https://wordcat.ru/tutor.html\n"
    ) % (name or "Коллега", when, plan_name, price, limit, count)
    return send(to_addr, "Пробный период заканчивается %s — Савелий" % when, body)
