#!/usr/bin/env python3
"""Сервер Савелия: статика + API (репетиторы, ученики, домашка) + чат через Claude CLI.

Запуск:  python3 server.py
Сайт:    http://localhost:4210
Панель:  http://localhost:4210/tutor.html
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
from urllib.parse import urlparse

import db
import mailer

# Версия кода, который СЕЙЧАС В ПАМЯТИ. Цифру пишет tools/bump.py — ту же,
# что уходит в ?v= на страницах.
#
# Зачем. На виртуальном хостинге питон живёт внутри процесса веб-сервера,
# и заливка файлов сама по себе НИЧЕГО не перезапускает. Статика при этом
# обновляется сразу — её отдают с диска, — а server.py остаётся в памяти
# старый. Снаружи выглядит как успешный деплой, хотя серверная часть та же.
# Поймано больно: правки безопасности лежали на сервере, а обход лимита
# частоты продолжал работать, и заметил я это только потому, что проверял
# запросами, а не глазами.
#
# Теперь это видно одним curl /health: цифра совпала с ?v= на странице —
# приложение перезапущено; не совпала или её нет вовсе — в памяти старый
# код, надо нажать «Перезапустить приложение» в панели хостинга.
ASSET_VERSION = 154

PORT = int(os.environ.get("SAVELY_PORT", "4210"))
# За nginx сервер слушает только localhost — снаружи он не должен быть виден
HOST = os.environ.get("SAVELY_HOST", "")
ROOT = os.path.dirname(os.path.abspath(__file__))
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")

NO_TOOLS = "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite"

PERSONA = (
    "Ты — Савелий, рыжий кот-репетитор английского языка на учебном сайте. "
    "Характер: добрый, весёлый, слегка вредный кот; уместно вставляешь «мяу», «мур» и кошачьи шутки, но без перебора. "
    "Отвечаешь по-русски, коротко (обычно 1–4 предложения), без markdown-заголовков и списков. "
    "Твоя работа: расширять словарный запас ученика. Предлагай новые английские слова его уровня "
    "(слово — перевод — короткий пример), объясняй значения и оттенки, проверяй слова из его словаря, "
    "отвечай на вопросы про английский. Предлагая слово, выбирай то, которого ещё нет в словаре ученика. "
    "Если ученик просит добавить слово (или соглашается на твоё предложение) — верни его в add_word. "
    "Если ты проверял слово и ученик только что ответил — оцени ответ и верни результат в mark. "
    "Ты общаешься со школьниками: только про английский и учёбу, без грубости и недетских тем."
)

FORMAT = (
    "Ответь СТРОГО одним JSON-объектом, без пояснений и без ```-ограждений: "
    '{"reply": "текст ответа Савелия", '
    '"add_word": null или {"w": "английское слово", "t": "перевод", "ex": "короткий пример по-английски"}, '
    '"mark": null или {"w": "проверявшееся слово", "correct": true/false}}'
)


# ---------- чат ----------

# Сколько контекста уходит в каждое сообщение. Раньше было 40 слов и 12 реплик —
# это 1042 входных токена, из которых больше половины Савелий не использовал.
# На 15 и 6 ответы не изменились, а вход похудел на треть: при 100 сообщениях
# в месяц с ученика это заметная разница на сотне учеников.
DICT_IN_PROMPT = 15
HISTORY_IN_PROMPT = 6


def build_prompt(payload):
    prof = payload.get("profile") or {}
    dic = (prof.get("dictionary") or [])[:DICT_IN_PROMPT]
    dic_str = "; ".join(
        f"{d.get('w')} — {d.get('t')} [{d.get('status')}]" for d in dic
    ) or "пока пусто"
    lines = [
        PERSONA,
        "",
        f"Ученик: {prof.get('name', '?')}, уровень {prof.get('level', '?')} "
        f"({prof.get('levelName', '')}), словарный запас ~{prof.get('vocab', '?')} слов, "
        f"звание «{prof.get('rank', 'Котёнок')}» ({prof.get('xp', 0)} очков).",
        f"Словарь ученика: {dic_str}",
    ]
    if payload.get("voice"):
        lines.append("Ученик сейчас общается ГОЛОСОМ: твой ответ будет озвучен. "
                     "Отвечай особенно коротко (1–2 предложения), без списков, скобок и смайликов.")
    lines.append("")
    lines.append("Диалог (последние сообщения):")
    for m in (payload.get("history") or [])[-HISTORY_IN_PROMPT:]:
        role = "Ученик: " if m.get("who") == "user" else "Савелий: "
        lines.append(role + str(m.get("text", ""))[:500])
    lines += ["", FORMAT]
    return "\n".join(lines)


def _clean_key(value):
    """Ключ уходит в HTTP-заголовок, а туда можно только ASCII. Кривой ключ
    (со случайной кириллицей из буфера обмена) иначе роняет каждый запрос
    невнятной ошибкой кодировки."""
    key = (value or "").strip()
    if not key:
        return ""
    try:
        key.encode("ascii")
    except UnicodeEncodeError:
        print("!! ANTHROPIC_API_KEY содержит недопустимые символы — ключ не принят")
        return ""
    return key


def _read_key():
    """Ключ берём из переменной окружения либо из файла рядом с базой.
    На виртуальном хостинге переменные окружения задать негде — там
    единственный рабочий способ положить ключ это файл вне public_html."""
    env = os.environ.get("ANTHROPIC_API_KEY")
    if env:
        return _clean_key(env)
    path = os.path.join(os.path.dirname(os.path.abspath(db.DB_PATH)), "api_key.txt")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return _clean_key(f.read())
    except OSError:
        return ""


ANTHROPIC_KEY = _read_key()
if ANTHROPIC_KEY:
    print("Ключ Claude API найден — умный чат и проверка фото включены")


def _read_side_key(filename):
    """Ключ стороннего провайдера — тем же способом, что и основной."""
    path = os.path.join(os.path.dirname(os.path.abspath(db.DB_PATH)), filename)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return _clean_key(f.read())
    except OSError:
        return ""


# Чат можно увести на модель подешевле — на нём простой диалог по словам,
# и разница в цене на сотне учеников выходит в полторы тысячи рублей в месяц.
# Проверку фото это НЕ затрагивает: там детский почерк, и Sonnet 5 держит его
# заметно лучше всех остальных — экономить на этом означает ломать продукт.
#
# Дефолт остаётся Haiku. Переключается одной строкой в savely-data/chat.conf
# или переменной SAVELY_CHAT_PROVIDER: anthropic | deepseek | gemini.
CHAT_PROVIDER = (os.environ.get("SAVELY_CHAT_PROVIDER") or "").strip().lower()
if not CHAT_PROVIDER:
    _cp = os.path.join(os.path.dirname(os.path.abspath(db.DB_PATH)), "chat.conf")
    try:
        with open(_cp, "r", encoding="utf-8") as f:
            CHAT_PROVIDER = f.read().strip().lower()
    except OSError:
        CHAT_PROVIDER = "anthropic"
CHAT_PROVIDER = CHAT_PROVIDER or "anthropic"

DEEPSEEK_KEY = _read_side_key("deepseek_key.txt")
GEMINI_KEY = _read_side_key("gemini_key.txt")

# Столько ждём альтернативного провайдера. Ученик сидит и смотрит на «...» —
# восемь секунд это уже предел, дальше уходим на Haiku, который отвечает быстро.
ALT_TIMEOUT = 8

CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "add_word": {
            "type": ["object", "null"],
            "properties": {
                "w": {"type": "string"}, "t": {"type": "string"},
                "ex": {"type": "string"}, "level": {"type": "string"},
            },
            "required": ["w", "t"],
            "additionalProperties": False,
        },
        # объект, а не строка: FORMAT просит {"w":..., "correct":...}, и клиент
        # читает mark.w. Пока здесь стояла строка, схема молча приводила ответ
        # к тексту и отметка «слово угадано» из чата не срабатывала ни разу
        "mark": {
            "type": ["object", "null"],
            "properties": {
                "w": {"type": "string"}, "correct": {"type": "boolean"},
            },
            "required": ["w", "correct"],
            "additionalProperties": False,
        },
    },
    "required": ["reply"],
    "additionalProperties": False,
}


def ask_claude_api(payload):
    """Чат через Claude API — так работает сайт на хостинге.
    Haiku: ответы короткие, счёт выходит около 0,1 ₽ за сообщение."""
    body = {
        "model": os.environ.get("SAVELY_CHAT_MODEL", "claude-haiku-4-5"),
        "max_tokens": 900,
        "output_config": {"format": {"type": "json_schema", "schema": CHAT_SCHEMA}},
        "messages": [{"role": "user", "content": build_prompt(payload)}],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = json.loads(resp.read())
    if data.get("stop_reason") == "refusal":
        raise RuntimeError("refused")
    text = next((b.get("text", "") for b in data.get("content", [])
                 if b.get("type") == "text"), "")
    return _shape(json.loads(text) if text else {})


EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$")
# Домены-«однодневки»: кабинет с таким адресом невозможно восстановить,
# и владелец через неделю приходит с претензией, что потерял учеников
THROWAWAY = {
    "mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com",
    "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com",
    "getnada.com", "dropmail.me", "fakemail.net", "maildrop.cc",
}


def valid_email(email):
    email = str(email or "").strip().lower()
    if len(email) < 6 or len(email) > 254 or not EMAIL_RE.match(email):
        return False
    domain = email.rsplit("@", 1)[-1]
    if domain in THROWAWAY:
        return False
    if ".." in email or email.startswith(".") or "@." in email:
        return False
    return True


def verified_tutor(payload):
    """(репетитор, ошибка). Пока почта не подтверждена, данные учеников
    не отдаём: иначе регистрация на чужой адрес открывает чужой кабинет."""
    tutor = db.get_tutor_by_token(payload.get("token"))
    if not tutor:
        return None, {"ok": False, "error": "unauthorized"}
    if not db.is_verified(tutor):
        return None, {"ok": False, "error": "need_verify"}
    if db.access_state(tutor) == "expired":
        # Ученики при этом продолжают заниматься: они не виноваты, что
        # репетитор не заплатил, а оборванный посреди четверти сервис
        # хоронит репутацию быстрее, чем неоплата съедает деньги
        return None, {"ok": False, "error": "need_payment"}
    return tutor, None


def student_owner(payload):
    """(ученик, ошибка) по токену из запроса.

    Токен — единственный ключ к личному кабинету ученика: он же
    подтверждает, что это его аккаунт. Личный код для этого не годится,
    его показывают в профиле и диктуют вслух; токен не показывают нигде.

    Пары «логин + пароль» у ученика нет и не заводится — почему именно
    так, написано у Api.student_profile.
    """
    row = db.get_student_by_token(payload.get("token"))
    if not row:
        # Тот же текст, что у остальных ручек ученика: клиент по нему
        # понимает, что аккаунт не найден, и уводит на экран входа.
        return None, {"ok": False, "error": "unknown_student"}
    return row, None


# ---------- ограничение частоты ----------

# Без него один скрипт забивает базу синхронизациями, а перебор кода
# приглашения не стоит атакующему ничего.
#
# Счётчики лежат в базе (db.rate_hit). Здесь раньше был словарь в памяти
# с припиской «для шаред-хостинга этого достаточно» — как раз наоборот:
# на шаред-хостинге он и не работает, потому что процессов много.
_SWEEP = 0
_HIT_LIMITS = {
    "/api/student/sync": (40, 60),      # (запросов, за столько секунд)
    "/api/student/photo": (10, 300),
    "/api/student/reading": (30, 300),
    "/api/student/join": (30, 600),
    # Личный кабинет ученика. Профиль открывают часто (каждый заход на
    # экран), остальное — редкие и необратимые действия, и частить ими
    # незачем: перевыпуск кода отнимает доступ у старого устройства,
    # удаление стирает аккаунт. Ключ у всех — токен, то есть лимит
    # считается на аккаунт, а не на весь класс с одного школьного вайфая.
    "/api/student/profile": (60, 300),
    "/api/student/name": (20, 600),
    "/api/student/code/new": (5, 600),
    "/api/student/delete": (5, 600),
    "/api/join": (60, 600),
    "/api/student/restore": (10, 600),
    "/api/tutor/login": (20, 300),
    "/api/tutor/register": (5, 600),
    # Считается по IP (токена на этом шаге ещё нет). Без лимита форма
    # «забыли пароль» становится способом завалить чужой ящик письмами;
    # второй заслон — RESET_RESEND, не чаще раза в минуту на кабинет.
    "/api/tutor/lesson/open": (30, 300),
    "/api/tutor/reset/send": (5, 900),
    # Проверка кода: перебрать шесть цифр — миллион вариантов, но пробовать
    # их надо где-то, и здесь. Счётчик попыток на сам код тоже есть.
    "/api/tutor/reset/check": (10, 600),
    "/api/chat": (120, 300),
    # Каждый вызов читает файл с диска и кодирует до 8 МБ в base64.
    # Лимита не было вовсе, а хостинг однопроцессный: этого хватает,
    # чтобы положить сайт для живых репетиторов.
    "/api/photo": (120, 300),
}


def rate_ok(path, who):
    """Лимит частоты.

    КЛЮЧ — ВСЕГДА АДРЕС, и это принципиально. Раньше ключом служило
    `payload.get("token") or who`, то есть поле из ТЕЛА ЗАПРОСА, которое
    никто не проверял. Достаточно было слать случайную строку в "token",
    и каждый запрос получал свежий пустой счётчик: проверено — 40 из 40
    прошли без единого отказа там, где лимит 30.

    Хуже всего это било по /api/chat: у гостя без валидного токена
    проверка квоты пропускается сознательно (витрина), и единственным
    заслоном был этот лимит. То есть любой желающий мог без регистрации
    жечь платный ключ Claude API в неограниченном темпе.

    Токен в ключ НЕ ВХОДИТ вообще. Первая попытка починки добавляла его
    как дополнительную часть ключа — и обход остался: злоумышленник шлёт
    новую случайную строку, получает новую пару (адрес, токен) и снова
    пустой счётчик. Проверено: 36 из 36 запросов прошли при лимите 30.
    Любое участие непроверенного поля из тела запроса в ключе означает,
    что лимита нет.

    Плата за это — общий счётчик у тех, кто сидит за одним адресом:
    школьный класс через один роутер делит лимит на всех. Поэтому пороги
    выше подняты с запасом на такой случай. Это честный размен: тесновато
    целому классу лучше, чем открытый кран к платному ИИ.

    СЧИТАЕМ В БАЗЕ, А НЕ В ПАМЯТИ. Это вторая половина той же дыры, и без
    неё первая ничего не стоила. Локально всё выглядело правильно: 60
    прошло, 20 отбито. На боевом — 15 из 15 при лимите 10. Там запросы
    обслуживает не один процесс, а сколько поднимет Apache, и словарь
    в памяти у каждого свой: пятнадцать запросов размазались по процессам,
    ни один не дошёл до порога. То есть ограничения на живом сайте не было
    ВООБЩЕ — ни до правки, ни после неё, пока счётчик жил в памяти.

    Отсюда правило на будущее: любое ограничение, которое должно работать
    на хостинге, обязано жить в базе. Проверять такое надо на боевом,
    локальный однопроцессный сервер эту разницу скрывает."""
    limit = _HIT_LIMITS.get(path)
    if not limit:
        return True
    count, window = limit
    # Раз в сотню обращений убираем отметки старше часа, чтобы таблица
    # не росла. Отдельного расписания на виртуальном хостинге нет.
    global _SWEEP
    _SWEEP += 1
    if _SWEEP % 100 == 0:
        db.rate_sweep()
    return db.rate_hit("%s|%s" % (path, who), count, window)


# ---------- лог ошибок ----------

def who_is(payload):
    """(tutor_id, student_id) по токену из запроса — чтобы в логе ошибок
    было видно, кого задело, и было кому написать. Сам токен в лог
    не попадает: по нему входят в кабинет."""
    token = payload.get("token") if isinstance(payload, dict) else None
    if not token:
        return None, None
    try:
        tutor = db.get_tutor_by_token(token)
        if tutor:
            return tutor["id"], None
        student = db.get_student_by_token(token)
        if student:
            return student["tutor_id"], student["id"]
    except Exception:
        pass
    return None, None


def report_error(endpoint, exc, payload=None, status=500, stream=None):
    """Исключение — в stderr, как и раньше, и в таблицу errors, откуда его
    видно в админке. Раньше был только stderr: на хостинге это журнал
    Apache, который никто не читает, и о сбоях узнавали от репетиторов.

    Ничего не бросает. Ошибка в логировании ошибки не должна оставить
    запрос без ответа."""
    try:
        trace = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    except Exception:
        trace = ""
    try:
        (stream or sys.stderr).write(trace)
    except Exception:
        pass
    tutor_id, student_id = who_is(payload)
    ip = payload.get("_ip") if isinstance(payload, dict) else None
    db.log_error(endpoint, "%s: %s" % (type(exc).__name__, exc), trace,
                 status=status, tutor_id=tutor_id, student_id=student_id, ip=ip)


def notify_tutor_later(tutor_id, student_name):
    """Письмо репетитору о новой работе. Ошибку отправки глотаем:
    ученик не должен видеть сбой из-за того, что почта легла."""
    try:
        tutor = db.get_tutor_by_id(tutor_id)
        if not tutor or not db.is_verified(tutor):
            return
        # Переключатель в панели. Раньше отключить письма можно было только
        # написав в телеграм — то есть репетитор жил с ними или отписывался
        # почтовым фильтром, а мы об этом не знали.
        if not db.notify_on(tutor, "work"):
            return
        should, count = db.notify_due(tutor_id)
        if not should:
            return
        mailer.send_new_work(tutor["email"], tutor["name"], count, student_name)
    except Exception as e:
        report_error("mail/new_work", e)


# ---------- фоновая работа ----------
#
# Расписания на виртуальном хостинге нет — есть только запросы. Поэтому
# редкая фоновая работа (напоминания на почту) подвешена на хвост обычных
# запросов: ответ уже отдан, процесс всё равно жив ещё мгновение. Раз в
# несколько минут один из запросов делает чуть больше работы, чем нужно
# ему самому, — и никто этого не замечает.
#
# От повторов защищено дважды. Первый заслон — время в памяти процесса:
# не чаще раза в HOUSEKEEP_EVERY секунд НА ПРОЦЕСС. Процессов на хостинге
# несколько, у каждого своя память, так что одного этого мало — та же
# грабля, что у лимита частоты. Второй заслон — в базе: право на письмо
# берётся одним условным UPDATE (db._claim), и из двух процессов его
# получает ровно один.
#
# Отправка почты — до 20 секунд на таймауте SMTP. Она здесь после ответа
# клиенту, поэтому ученик, чей запрос «попался», задержки не видит.
HOUSEKEEP_EVERY = 600
_NEXT_HOUSEKEEP = 0.0


def housekeeping():
    """Дёргается после каждого запроса к API из обоих входов. Дёшево:
    почти всегда — одно сравнение чисел."""
    global _NEXT_HOUSEKEEP
    if time.time() < _NEXT_HOUSEKEEP:
        return
    _NEXT_HOUSEKEEP = time.time() + HOUSEKEEP_EVERY
    try:
        send_due_reminders()
    except Exception as e:
        report_error("housekeeping", e)


def send_due_reminders():
    """Письма репетиторам: «пробный период кончается завтра» и недельный
    дайджест «кто пропал и у кого накопились слова». Что, кому и как
    часто — в db.py, раздел «напоминания репетитору»."""
    # Без настроенного SMTP — ничего не делаем, даже не отмечаем в базе.
    # Это защита от рассылки с машины разработчика: почему именно так —
    # у mailer.smtp_ready(). На боевом mail.conf есть.
    if not mailer.smtp_ready():
        return
    for t in db.tutors_trial_ending():
        if not db.claim_trial_warning(t["id"]):
            continue
        try:
            plan = db.plan_by_id(t["plan"] or "start")
            keys = t.keys()
            limit = (t["student_limit"] if "student_limit" in keys else None) or plan["limit"]
            mailer.send_trial_ending(
                t["email"], t["name"], db.trial_end_word(t),
                plan["name"], plan["price"], limit, db.student_count(t["id"]))
        except Exception as e:
            report_error("mail/trial", e, {"token": t["token"]})

    for t in db.tutors_for_reminders():
        # Считаем раз в сутки — это разбор словарей всех учеников,
        # столько же, сколько один заход в панель.
        if not db.claim_reminder_check(t["id"]):
            continue
        items = db.reminder_digest(t["id"])
        if not items:
            continue
        # Есть что сказать — но не чаще раза в неделю. Право на отправку
        # берём ПОСЛЕ проверки содержимого: иначе пустая неделя съедала бы
        # окно, и о пропавшем на восьмой день ученике письмо пришло бы
        # на четырнадцатый.
        if not db.claim_reminder_send(t["id"]):
            continue
        try:
            mailer.send_reminder_digest(t["email"], t["name"], items)
        except Exception as e:
            report_error("mail/remind", e, {"token": t["token"]})


def ai_error_text(exc, payload=None):
    """Переводим сбой ИИ в понятную строку. Текст исключения наружу не
    отдаём: там бывают куски запроса и обрывки ключа.

    Штатные состояния (ключа нет, лимит, отказ классификатора) в лог
    ошибок не пишем — это не сбои. Всё остальное пишем: сломанный ключ
    и упавший провайдер владелец должен увидеть в админке, а не в жалобе."""
    import urllib.error
    msg = str(exc)
    if isinstance(exc, urllib.error.HTTPError):
        if exc.code == 401:
            report_error("ai/chat", exc, payload, status=exc.code)
            return "Ключ Claude API не принят — проверь ANTHROPIC_API_KEY."
        if exc.code == 429:
            return "Слишком много запросов к ИИ. Подожди минуту."
        if exc.code >= 500:
            report_error("ai/chat", exc, payload, status=exc.code)
            return "ИИ временно недоступен, попробуй позже."
        report_error("ai/chat", exc, payload, status=exc.code)
        return "Запрос к ИИ отклонён (код %d)." % exc.code
    if "not_logged_in" in msg:
        return "not_logged_in"
    if "refused" in msg:
        return "Савелий не смог ответить на это. Спроси иначе."
    if "no_api_key" in msg:
        return "ai_off"
    report_error("ai/chat", exc, payload)
    return "Савелий задумался и не ответил. Попробуй ещё раз."


def _shape(parsed):
    """Приводим ответ любого провайдера к одному виду."""
    if not isinstance(parsed, dict) or not parsed.get("reply"):
        raise RuntimeError("empty result")
    mark = parsed.get("mark")
    if not isinstance(mark, dict) or not mark.get("w"):
        mark = None
    add = parsed.get("add_word")
    if not isinstance(add, dict) or not add.get("w"):
        add = None
    return {"ok": True, "reply": str(parsed["reply"]), "add_word": add, "mark": mark}


def _post_json(url, body, headers, timeout):
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"),
        headers=dict(headers, **{"content-type": "application/json"}))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def ask_deepseek(payload):
    """DeepSeek говорит на диалекте OpenAI. Строгих схем там нет — только
    режим «верни JSON», поэтому ответ может прийти кривым; на этот случай
    выше стоит фолбэк на Haiku."""
    data = _post_json(
        "https://api.deepseek.com/chat/completions",
        {
            "model": os.environ.get("SAVELY_DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "max_tokens": 900,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": build_prompt(payload)}],
        },
        {"authorization": "Bearer " + DEEPSEEK_KEY}, ALT_TIMEOUT)
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    return _shape(json.loads(text))


# Gemini не понимает ни ["object","null"], ни additionalProperties —
# для него схема попроще, необязательные поля просто не в required
GEMINI_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "add_word": {
            "type": "object",
            "properties": {"w": {"type": "string"}, "t": {"type": "string"},
                           "ex": {"type": "string"}, "level": {"type": "string"}},
        },
        "mark": {
            "type": "object",
            "properties": {"w": {"type": "string"}, "correct": {"type": "boolean"}},
        },
    },
    "required": ["reply"],
}


def ask_gemini(payload):
    model = os.environ.get("SAVELY_GEMINI_MODEL", "gemini-2.5-flash")
    data = _post_json(
        "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % model,
        {
            "contents": [{"parts": [{"text": build_prompt(payload)}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": GEMINI_SCHEMA,
                "maxOutputTokens": 900,
            },
        },
        {"x-goog-api-key": GEMINI_KEY}, ALT_TIMEOUT)
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}]
    return _shape(json.loads(parts[0].get("text") or "{}"))


ALT_PROVIDERS = {
    "deepseek": (ask_deepseek, lambda: DEEPSEEK_KEY),
    "gemini":   (ask_gemini,   lambda: GEMINI_KEY),
}


def ai_available():
    """Есть ли чем отвечать «по-умному»: ключ Claude, альтернативный
    провайдер или локальный CLI (только для разработки). Клиенту это
    нужно, чтобы не обещать нейросеть там, где её нет: ученик получает
    честную рамку чата, репетитор — честную вкладку проверки.

    SAVELY_NO_AI=1 — посмотреть локально, как сайт выглядит без нейросети:
    на машине разработчика CLI есть всегда, а на боевом сейчас нет ничего."""
    if os.environ.get("SAVELY_NO_AI"):
        return False
    if ANTHROPIC_KEY:
        return True
    alt = ALT_PROVIDERS.get(CHAT_PROVIDER)
    if alt and alt[1]():
        return True
    return os.path.exists(CLAUDE)


# Пока нейросети нет, проверка домашек не работает — и счёт за неё не
# начисляется. Иначе репетитор платил бы за пакет, который ничего не
# проверяет. Флаг живёт в db, потому что счёт считает db.checks_bill,
# а про ключ знает только этот модуль.
db.CHECKS_SUSPENDED = not ai_available()


def ask_claude(payload):
    """Дешёвый провайдер, если он настроен, иначе Claude. Любая осечка
    альтернативы — молча уходим на Haiku: ученик не должен видеть, что
    у нас там что-то не сложилось."""
    if os.environ.get("SAVELY_NO_AI"):
        raise RuntimeError("no_api_key")   # режим «как на боевом без ключа», см. ai_available
    alt = ALT_PROVIDERS.get(CHAT_PROVIDER)
    if alt and alt[1]():
        try:
            return alt[0](payload)
        except Exception as e:
            print("!! %s не ответил (%s) — беру Haiku" % (CHAT_PROVIDER, type(e).__name__))

    if ANTHROPIC_KEY:
        return ask_claude_api(payload)
    if not os.path.exists(CLAUDE):
        # ни ключа, ни CLI — это штатная ситуация на хостинге до оплаты API
        raise RuntimeError("no_api_key")
    return ask_claude_cli(payload)


def ask_claude_cli(payload):
    out = subprocess.run(
        [CLAUDE, "-p", build_prompt(payload), "--output-format", "json",
         "--model", "sonnet", "--disallowedTools", NO_TOOLS, "--max-turns", "3"],
        capture_output=True, text=True, timeout=120, cwd=ROOT,
    )
    data = json.loads(out.stdout)
    result = (data.get("result") or "").strip()
    if "/login" in result or "Invalid API key" in result:
        raise RuntimeError("not_logged_in")
    if data.get("is_error") or data.get("subtype") != "success" or not result:
        raise RuntimeError(result or data.get("subtype") or "empty result")
    m = re.search(r"\{.*\}", result, re.S)
    parsed = None
    if m:
        try:
            parsed = json.loads(m.group(0))
        except json.JSONDecodeError:
            parsed = None
    if not isinstance(parsed, dict) or not parsed.get("reply"):
        parsed = {"reply": result}
    return {
        "ok": True,
        "reply": str(parsed.get("reply")),
        "add_word": parsed.get("add_word") or None,
        "mark": parsed.get("mark") or None,
    }


# ---------- API ----------

class Api:
    """Каждый метод получает (handler, payload) и возвращает dict."""

    # --- репетитор ---

    @staticmethod
    def tutor_register(h, p):
        name = str(p.get("name", "")).strip()
        email = str(p.get("email", "")).strip()
        password = str(p.get("password", ""))
        if len(name) < 2:
            return {"ok": False, "error": "Введите имя — хотя бы две буквы."}
        if not valid_email(email):
            return {"ok": False, "error": "Проверьте адрес почты — на него придёт код."}
        problem = db.password_problem(password)
        if problem:
            return {"ok": False, "error": problem}
        # Устройство и адрес: против бесконечного триала. Подробно, почему
        # именно так и почему без блокировок, — в db.py у SIGNUP_IP_LIMIT.
        device_id = str(p.get("deviceId") or "")[:64]
        ip = str(p.get("_ip") or "")[:64]
        if db.signups_from_ip(ip) >= db.SIGNUP_IP_LIMIT:
            return {"ok": False, "error":
                    "С этого адреса сегодня уже создали несколько кабинетов. "
                    "Если это вы и так и надо — напишите @KOTSAVELII, откроем вручную."}
        trial_taken = db.device_used_trial(device_id)

        row = db.create_tutor(name, email, password, device_id=device_id, signup_ip=ip)
        if not row:
            return {"ok": False, "error": "Такой email уже зарегистрирован."}
        # Тариф подбираем по заявленному числу учеников. Верим на слово:
        # лимит всё равно проверяется по факту при добавлении ученика
        try:
            db.set_plan_by_count(row["id"], int(p.get("studentCount") or 0))
        except (ValueError, TypeError):
            pass
        # Бесплатные дни — один раз на устройство. Кабинет при этом
        # создаётся: запирать регистрацию нельзя, идентификатор стирается
        # в два клика и первым под запрет попал бы честный человек.
        if not trial_taken:
            db.start_trial(row["id"])
        row = db.get_tutor_by_token(row["token"])
        # Код отправляем сразу: без подтверждения кабинет не откроется,
        # и лишний шаг «нажмите отправить» тут только раздражает
        sent, send_error = True, None
        try:
            mailer.send_verify_code(row["email"], row["name"], db.set_verify_code(row["id"]))
        except Exception as e:
            report_error("mail/verify", e, {"token": row["token"], "_ip": ip})
            # Только факт, без совета: что делать дальше, говорит экран
            # подтверждения, и говорит на «вы» — панель репетитора
            # обращается к взрослому человеку, в отличие от сайта ученика.
            sent, send_error = False, "Письмо не ушло."
        return {"ok": True, "token": row["token"], "tutor": db.tutor_public(row),
                "recoveryCode": row["recovery_code"],
                "trialSkipped": trial_taken,
                "needVerify": True, "mailSent": sent, "mailError": send_error}

    @staticmethod
    def tutor_login(h, p):
        row, err = db.login_tutor(str(p.get("email", "")), str(p.get("password", "")))
        if not row:
            return {"ok": False, "error": err or "Неверный email или пароль."}
        return {"ok": True, "token": row["token"], "tutor": db.tutor_public(row),
                "needVerify": not db.is_verified(row),
                "access": db.access_state(row)}

    @staticmethod
    def tutor_students(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        hw = db.list_homework(tutor["id"])
        students = []
        for s in db.list_students(tutor["id"]):
            students.append(db.student_public(s, db.homework_for_student(hw, s)))
        return {
            "ok": True,
            "tutor": db.tutor_public(tutor),
            "students": students,
            "groups": [db.group_public(g) for g in db.list_groups(tutor["id"])],
            "messages": [{"id": m["id"], "text": m["text"],
                          "studentId": m["student_id"], "groupId": m["group_id"],
                          "createdAt": m["created_at"]}
                         for m in db.list_messages(tutor["id"])],
            "homework": [{
                "id": x["id"], "title": x["title"],
                "studentId": x["student_id"], "groupId": x["group_id"],
                "words": json.loads(x["words"] or "[]"),
                "dueDate": x["due_date"], "createdAt": x["created_at"],
            } for x in hw],
        }

    @staticmethod
    def tutor_student_detail(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        row = db.get_student_by_id(int(p.get("studentId") or 0))
        if not row or row["tutor_id"] != tutor["id"]:
            return {"ok": False, "error": "not_found"}
        hw = db.homework_for_student(db.list_homework(tutor["id"]), row)
        return {"ok": True, "student": db.student_public(row, hw, detail=True)}

    @staticmethod
    def tutor_student_note(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.set_student_note(tutor["id"], int(p.get("studentId") or 0), p.get("note") or "")
        return {"ok": True}

    @staticmethod
    def tutor_message(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        text = str(p.get("text", "")).strip()
        if not text:
            return {"ok": False, "error": "Напишите текст сообщения."}
        sid, gid = p.get("studentId"), p.get("groupId")
        db.create_message(tutor["id"], text,
                          student_id=int(sid) if sid else None,
                          group_id=int(gid) if gid else None)
        return {"ok": True}

    @staticmethod
    def tutor_message_archive(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.archive_message(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    # --- группы ---

    @staticmethod
    def group_create(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        name = str(p.get("name", "")).strip()
        if not name:
            return {"ok": False, "error": "Введите название группы."}
        row = db.create_group(tutor["id"], name, p.get("color"))
        return {"ok": True, "group": db.group_public(row)}

    @staticmethod
    def group_update(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.update_group(tutor["id"], int(p.get("id") or 0), p.get("name"), p.get("color"))
        return {"ok": True}

    @staticmethod
    def group_delete(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.delete_group(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    @staticmethod
    def group_assign(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        gid = p.get("groupId")
        db.set_student_group(tutor["id"], int(p.get("studentId") or 0),
                             int(gid) if gid else None)
        return {"ok": True}

    @staticmethod
    def tutor_homework_create(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        words = p.get("words") or []
        has_task = bool(str(p.get("taskText") or "").strip())
        has_reading = bool(str(p.get("readingText") or "").strip())
        if not isinstance(words, list):
            words = []
        if not words and not has_task and not has_reading:
            return {"ok": False,
                    "error": "Добавьте слова, задание текстом или текст для чтения."}
        clean = []
        for w in words:
            if isinstance(w, dict) and w.get("w"):
                clean.append({
                    "w": str(w.get("w"))[:60],
                    "t": str(w.get("t", ""))[:100],
                    "ex": str(w.get("ex", ""))[:200],
                    "level": str(w.get("level", ""))[:4],
                })
        if not clean and not has_task and not has_reading:
            return {"ok": False, "error": "Слова не распознаны."}
        sid, gid = p.get("studentId"), p.get("groupId")
        row = db.create_homework(
            tutor["id"], str(p.get("title", "")), clean,
            student_id=int(sid) if sid else None,
            group_id=int(gid) if gid else None,
            due_date=str(p.get("dueDate") or "") or None,
            task_text=p.get("taskText", ""),
            reading_text=p.get("readingText", ""),
            # Игра, которой ученик отрабатывает эти слова. Пустая строка —
            # прежнее поведение: ученик выбирает упражнение сам.
            game=str(p.get("game") or "")[:32],
        )
        return {"ok": True, "id": row["id"]}

    @staticmethod
    def tutor_homework_archive(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.archive_homework(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    @staticmethod
    def tutor_student_delete(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.delete_student(tutor["id"], int(p.get("studentId") or 0))
        return {"ok": True}

    # --- ученик ---

    @staticmethod
    def join_info(h, p):
        tutor = db.get_tutor_by_code(p.get("code"))
        if not tutor:
            return {"ok": False, "error": "Такой ссылки не существует."}
        return {"ok": True, "tutorName": tutor["name"]}

    @staticmethod
    def student_restore(h, p):
        """Вход с другого устройства по ЛИЧНОМУ коду ученика.

        По имени искать нельзя: код приглашения общий на весь класс,
        а имена одноклассников видны в рейтинге — любой ученик мог бы
        забрать чужой токен и весь прогресс.
        """
        row = db.get_student_by_restore_code(p.get("restoreCode"))
        if not row:
            return {"ok": False, "error": "Код не подошёл. Проверь его в профиле на своём устройстве."}
        tutor = db.get_tutor_by_id(row["tutor_id"])
        return {"ok": True, "found": True, "token": row["token"],
                "state": db.student_state(row),
                "tutorName": tutor["name"] if tutor else "",
                # Чат открывают сразу после входа, до первой синхронизации —
                # флаг нужен уже здесь, иначе первая реплика кота обещает
                # «поболтать», а вторая берёт слова назад.
                "ai": ai_available()}

    @staticmethod
    def student_pull(h, p):
        """Полное состояние по токену — для восстановления после чистки браузера."""
        row = db.get_student_by_token(p.get("token"))
        if not row:
            return {"ok": False, "error": "unknown_student"}
        return {"ok": True, "state": db.student_state(row)}

    @staticmethod
    def student_join(h, p):
        tutor = db.get_tutor_by_code(p.get("code"))
        if not tutor:
            return {"ok": False, "error": "Такой ссылки не существует."}
        name = str(p.get("name", "")).strip()
        if len(name) < 2:
            # это экран УЧЕНИКА — обращаемся на «ты» и подсказываем пример
            return {"ok": False, "error": "Напиши имя — хотя бы две буквы. Можно просто «Ваня»."}
        allowed, limit = db.can_add_student(tutor)
        if not allowed:
            # было «занято всё %d мест» (рассогласование) и «попроси ЕЁ» —
            # женский род прилетал любому репетитору, включая мужчин
            return {"ok": False, "error":
                    "У репетитора заняты все %d мест. Напиши ему — он добавит место, "
                    "и ты подключишься." % limit}
        row = db.create_student(tutor["id"], name)
        return {"ok": True, "token": row["token"], "tutorName": tutor["name"],
                "restoreCode": row["restore_code"]}

    @staticmethod
    def student_sync(h, p):
        row = db.sync_student(p.get("token"), p.get("state") or {})
        if not row:
            return {"ok": False, "error": "unknown_student"}
        hw = db.homework_for_student(db.list_homework(row["tutor_id"]), row)
        keys_cache = None
        tasks = []
        for x in hw:
            k = x.keys()
            tasks.append({
                "id": x["id"],
                "title": x["title"],
                "words": json.loads(x["words"] or "[]"),
                "dueDate": x["due_date"],
                "taskText": x["task_text"] if "task_text" in k else "",
                "readingText": x["reading_text"] if "reading_text" in k else "",
                "game": (x["game"] if "game" in k else "") or "",
            })
        msgs = db.messages_for_student(db.list_messages(row["tutor_id"]), row)
        return {
            "ok": True,
            "homework": tasks,
            "leaderboard": db.leaderboard(row),
            "messages": [{"id": m["id"], "text": m["text"], "createdAt": m["created_at"]}
                         for m in msgs[:5]],
            # Видеоурок приходит той же синхронизацией, что и домашка:
            # отдельный запрос раз в три секунды ради одной строки —
            # лишняя нагрузка на хостинг, где и так всё на одном процессе.
            "lesson": db.lesson_state(db.get_tutor_by_id(row["tutor_id"])),
            # Есть ли нейросеть. Чат ученика по этому флагу решает, идти
            # ли за ответом на сервер или сразу отвечать по правилам, и
            # честно говорит об этом с первой реплики, а не после сбоя.
            "ai": ai_available(),
        }

    # --- личный кабинет ученика ---
    #
    # Пароля у ученика нет. Это решение, а не пробел: ему 10-15 лет, вход
    # по ссылке репетитора занимает одно поле «имя», а пароль он забудет
    # к третьему занятию — и превратит репетитора в службу поддержки.
    # Роль пары «логин + пароль» здесь играет ЛИЧНЫЙ КОД: один секрет,
    # который можно показать, скопировать и перевыпустить. Поэтому здесь
    # нет ни «показать пароль» (в базе лежал бы хеш, показать сохранённый
    # пароль нельзя в принципе), ни «сменить пароль» — есть «перевыпустить
    # код», и это ровно тот же сброс доступа, только без второго секрета,
    # который нечем восстанавливать.

    @staticmethod
    def student_profile(h, p):
        """Всё, что ученик видит и меняет о себе."""
        row, err = student_owner(p)
        if err:
            return err
        return {"ok": True, "profile": db.student_profile(row)}

    @staticmethod
    def student_name(h, p):
        """Смена имени. Имя видно репетитору в панели, поэтому правила
        те же, что при входе по ссылке, — одна проверка на оба места."""
        row, err = student_owner(p)
        if err:
            return err
        problem = db.student_name_problem(p.get("name"))
        if problem:
            return {"ok": False, "error": problem}
        row = db.set_student_name(row["id"], p.get("name"))
        return {"ok": True, "name": row["name"]}

    @staticmethod
    def student_code_new(h, p):
        """Перевыпуск личного кода — сброс доступа по-нашему.

        Старый код умирает сразу: иначе подсмотревший одноклассник
        остаётся в аккаунте, и вся операция бессмысленна. Токен живёт,
        так что устройство, с которого нажали кнопку, не вылетает.
        """
        row, err = student_owner(p)
        if err:
            return err
        return {"ok": True, "restoreCode": db.reissue_restore_code(row["id"])}

    @staticmethod
    def student_delete(h, p):
        """Удаление своего аккаунта. Необратимо и по-настоящему:
        словарь, очки, домашка и присланные фото уходят с сервера.

        Отдельное поле confirm — чтобы случайный повтор запроса (кнопка
        нажата дважды, клиент переотправил) не сносил аккаунт молча.
        """
        row, err = student_owner(p)
        if err:
            return err
        if p.get("confirm") is not True:
            return {"ok": False, "error": "Удаление не подтверждено."}
        db.delete_student_account(row["id"])
        return {"ok": True}

    @staticmethod
    def tutor_password_change(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        if not db.check_password(str(p.get("oldPassword", "")),
                                 tutor["pass_hash"], tutor["pass_salt"]):
            return {"ok": False, "error": "Текущий пароль неверный."}
        problem = db.password_problem(p.get("newPassword"))
        if problem:
            return {"ok": False, "error": problem}
        token = db.set_tutor_password(tutor["id"], str(p.get("newPassword")))
        return {"ok": True, "token": token,
                "note": "Пароль изменён. На других устройствах придётся войти заново."}

    @staticmethod
    def tutor_password_reset(h, p):
        """Сброс по коду восстановления — вместо писем на почту.
        Почтовой рассылки у нас нет, а забытый пароль иначе не вернуть."""
        row = db.get_tutor_by_recovery(p.get("recoveryCode"))
        if not row:
            return {"ok": False, "error": "Код не подошёл."}
        problem = db.password_problem(p.get("newPassword"))
        if problem:
            return {"ok": False, "error": problem}
        token = db.set_tutor_password(row["id"], str(p.get("newPassword")))
        return {"ok": True, "token": token, "tutor": db.tutor_public(row)}

    @staticmethod
    def tutor_recovery_code(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        return {"ok": True, "recoveryCode": db.ensure_recovery_code(tutor["id"])}

    @staticmethod
    def plans(h, p):
        """Открытый прайс — нужен на регистрации, когда токена ещё нет.
        Раньше цены были продублированы в js/tutor-verify.js и разъезжались
        с сервером при каждой правке: витрина обещала одно, счёт приходил
        на другое. Теперь источник правды один."""
        return {
            "ok": True,
            "plans": db.PLANS,
            "extraPrice": db.EXTRA_STUDENT_PRICE,
            "trialDays": db.TRIAL_DAYS,
            "checkPacks": [{"id": x["id"], "name": x["name"], "limit": x["limit"],
                            "price": x["price"][0]} for x in db.CHECK_PACKS],
            "extraCheckPrice": db.EXTRA_CHECK_PRICE,
        }

    @staticmethod
    def tutor_plan(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        return {"ok": True, "tutor": db.tutor_public(tutor),
                "plans": db.PLANS, "extraPrice": db.EXTRA_STUDENT_PRICE}

    @staticmethod
    def tutor_add_slot(h, p):
        """Расширить лимит на N учеников. Оплата пока не подключена —
        место открывается сразу, счёт выставляется вручную."""
        tutor, err = verified_tutor(p)
        if err:
            return err
        extra = max(1, min(50, int(p.get("count") or 1)))
        db.raise_student_limit(tutor["id"], extra)
        row = db.get_tutor_by_token(p.get("token"))
        return {"ok": True, "tutor": db.tutor_public(row),
                "charged": extra * db.EXTRA_STUDENT_PRICE}

    # --- админка владельца ---

    @staticmethod
    def admin_login(h, p):
        token, err = db.admin_login(p.get("password"))
        if not token:
            return {"ok": False, "error": err}
        return {"ok": True, "token": token}

    @staticmethod
    def admin_logout(h, p):
        db.admin_logout(p.get("token"))
        return {"ok": True}

    @staticmethod
    def admin_data(h, p):
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        return {"ok": True, "overview": db.admin_overview(),
                "tutors": db.admin_tutors(), "plans": db.PLANS,
                "extraPrice": db.EXTRA_STUDENT_PRICE,
                "aiOn": bool(ANTHROPIC_KEY)}

    @staticmethod
    def admin_set_plan(h, p):
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        db.admin_set_plan(int(p.get("tutorId") or 0), p.get("plan"), p.get("limit"))
        return {"ok": True, "tutors": db.admin_tutors(), "overview": db.admin_overview()}

    @staticmethod
    def admin_verify(h, p):
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        db.admin_set_verified(int(p.get("tutorId") or 0), bool(p.get("value")))
        return {"ok": True, "tutors": db.admin_tutors(), "overview": db.admin_overview()}

    @staticmethod
    def admin_delete(h, p):
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        # Подтверждение словом: удаление уносит учеников, домашки и фото
        if str(p.get("confirm", "")).strip().upper() != "УДАЛИТЬ":
            return {"ok": False, "error": "Не подтверждено."}
        db.admin_delete_tutor(int(p.get("tutorId") or 0))
        return {"ok": True, "tutors": db.admin_tutors(), "overview": db.admin_overview()}

    @staticmethod
    def admin_pay(h, p):
        """Отметить оплату вручную: платёжной системы пока нет,
        владелец выставляет счёт сам и продлевает доступ здесь."""
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        db.set_paid_until(int(p.get("tutorId") or 0), int(p.get("days") or 30))
        return {"ok": True, "tutors": db.admin_tutors(), "overview": db.admin_overview()}

    @staticmethod
    def admin_errors(h, p):
        """Последние ошибки сервера — отдельным запросом, а не в admin_data:
        полсотни стеков весят больше всей остальной сводки."""
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        return {"ok": True, "errors": db.recent_errors(50), "summary": db.errors_summary()}

    @staticmethod
    def admin_errors_clear(h, p):
        if not db.admin_check(p.get("token")):
            return {"ok": False, "error": "unauthorized"}
        db.clear_errors()
        return {"ok": True, "errors": [], "summary": db.errors_summary()}

    # --- подтверждение почты ---

    @staticmethod
    def tutor_verify_send(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        if db.is_verified(tutor):
            return {"ok": True, "already": True}
        age = db.seconds_since_verify_sent(tutor)
        if age is not None and age < db.VERIFY_RESEND:
            wait = int(db.VERIFY_RESEND - age)
            return {"ok": False, "error": "Новый код можно запросить через %d сек." % wait}
        code = db.set_verify_code(tutor["id"])
        try:
            how = mailer.send_verify_code(tutor["email"], tutor["name"], code)
        except Exception as e:
            report_error("mail/verify", e, p)
            return {"ok": False,
                    "error": "Письмо не ушло. Проверьте адрес или напишите @KOTSAVELII — подтвердим вручную."}
        return {"ok": True, "sentVia": how}

    @staticmethod
    def tutor_lesson_set(h, p):
        """Сохранить ссылку на свою комнату (Zoom, Meet, Телемост…)."""
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        url = str(p.get("url", "")).strip()
        if url:
            # Только http(s) и только абсолютный адрес. Без этой проверки
            # в поле можно положить javascript:… — и ученик, нажав кнопку
            # «на урок», выполнит чужой скрипт у себя на странице.
            if not re.match(r"^https://[^\s<>\"']+$", url):
                return {"ok": False, "error":
                        "Нужна полная ссылка, начинающаяся с https:// — "
                        "скопируйте её из Zoom, Google Meet или Телемоста."}
            if len(url) > 500:
                return {"ok": False, "error": "Ссылка слишком длинная."}
        db.set_lesson_url(tutor["id"], url)
        return {"ok": True, "url": url}

    @staticmethod
    def tutor_lesson_open(h, p):
        """Позвать учеников: у них загорается «идёт урок»."""
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        row = db.get_tutor_by_id(tutor["id"])
        if not (row["lesson_url"] if "lesson_url" in row.keys() else ""):
            return {"ok": False, "error": "Сначала добавьте ссылку на свою комнату."}
        db.open_lesson(tutor["id"], bool(p.get("on", True)))
        return {"ok": True, "minutes": db.LESSON_OPEN_MINUTES}

    @staticmethod
    def tutor_notify_set(h, p):
        """Переключатели писем: о новых работах и еженедельный дайджест.
        Что не прислали — не трогаем, поэтому можно менять по одному."""
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        work = p.get("work")
        remind = p.get("remind")
        db.set_notify(tutor["id"],
                      work=bool(work) if work is not None else None,
                      remind=bool(remind) if remind is not None else None)
        return {"ok": True, "tutor": db.tutor_public(db.get_tutor_by_id(tutor["id"]))}

    @staticmethod
    def tutor_reset_send(h, p):
        """Отправить код смены пароля на почту.

        Отвечаем «ok» ВСЕГДА, даже если такой почты нет. Иначе форма
        «забыли пароль» превращается в проверялку чужой клиентской базы:
        ввёл адрес, увидел «нет такого» — узнал, что человек нами не
        пользуется. Настоящий владелец почты письмо получит и без подсказки."""
        email = str(p.get("email", "")).strip().lower()
        tutor = db.get_tutor_by_email(email) if valid_email(email) else None
        if tutor:
            age = db.seconds_since_reset_sent(tutor)
            if age is None or age >= db.RESET_RESEND:
                code = db.set_reset_code(tutor["id"])
                try:
                    mailer.send_reset_code(tutor["email"], tutor["name"], code)
                except Exception as e:
                    # Наружу не выносим: по «письмо не ушло» тоже читается,
                    # что адрес в базе есть. В лог — полностью.
                    report_error("mail/reset", e, {"token": tutor["token"], "_ip": p.get("_ip")})
        return {"ok": True, "sent": True}

    @staticmethod
    def tutor_reset_check(h, p):
        """Проверить код и поставить новый пароль."""
        ok, err = db.reset_password_by_code(
            str(p.get("email", "")), str(p.get("code", "")), str(p.get("password", "")))
        if not ok:
            return {"ok": False, "error": err}
        return {"ok": True}

    @staticmethod
    def tutor_verify_check(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        good, err = db.check_verify_code(tutor["id"], p.get("code"))
        if not good:
            return {"ok": False, "error": err}
        return {"ok": True, "tutor": db.tutor_public(db.get_tutor_by_token(p.get("token")))}

    # --- фото домашки ---

    @staticmethod
    def student_photo_upload(h, p):
        """Ученик присылает фото тетради. Разбор — если есть ключ API;
        без ключа фото всё равно уходит репетитору, это уже полезно."""
        row = db.get_student_by_token(p.get("token"))
        if not row:
            return {"ok": False, "error": "unknown_student"}

        raw = str(p.get("image") or "")
        if "," in raw and raw.startswith("data:"):
            head, raw = raw.split(",", 1)
            media = head.split(";")[0].replace("data:", "") or "image/jpeg"
        else:
            media = "image/jpeg"
        if media not in ("image/jpeg", "image/png", "image/webp"):
            return {"ok": False, "error": "Такой формат не подойдёт — нужен JPEG или PNG."}
        try:
            blob = base64.b64decode(raw, validate=True)
        except Exception:
            return {"ok": False, "error": "Файл не распознан, попробуй снять ещё раз."}
        if not 1024 <= len(blob) <= 8 * 1024 * 1024:
            return {"ok": False, "error": "Фото должно быть от 1 КБ до 8 МБ."}

        ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[media]
        name = db.save_photo_file(blob, ext)

        hw_id, task_title = p.get("homeworkId"), ""
        if hw_id:
            hw = db.get_homework(int(hw_id)) if hasattr(db, "get_homework") else None
            if hw and hw["tutor_id"] == row["tutor_id"]:
                task_title = hw["title"]
            else:
                hw_id = None

        photo = db.create_photo_homework(
            row["tutor_id"], row["id"], name,
            homework_id=int(hw_id) if hw_id else None,
            comment=p.get("comment", ""),
        )

        # Лимит режет только разбор нейросетью. Сама домашка уходит репетитору
        # в любом случае — снимок тетради полезен и без Савелия, а обрывать
        # ученика на середине работы из-за чужой подписки нечестно.
        allowed, quota, why = db.use_check(row["id"])
        if not allowed:
            db.set_photo_check(photo["id"], "no_quota", None)
            notify_tutor_later(row["tutor_id"], row["name"])
            return {"ok": True, "quota": quota, "notice": why,
                    "photo": db.photo_public(db.get_photo(photo["id"]))}

        try:
            result = check_homework_photo(
                blob, media, level=row["level"] or "A1", task_title=task_title)
            db.set_photo_check(photo["id"], "done", result)
        except Exception as e:
            reason = str(e)
            status = "no_ai" if "no_api_key" in reason else "failed"
            db.set_photo_check(photo["id"], status, None)
            if status == "failed":
                report_error("ai/photo", e, p)
            # проверка не состоялась не по вине ученика — возвращаем списание
            db.refund_check(row["id"])
            quota = db.check_state(row["id"])

        notify_tutor_later(row["tutor_id"], row["name"])
        return {"ok": True, "quota": quota,
                "photo": db.photo_public(db.get_photo(photo["id"]))}

    @staticmethod
    def student_photo_list(h, p):
        row = db.get_student_by_token(p.get("token"))
        if not row:
            return {"ok": False, "error": "unknown_student"}
        return {"ok": True,
                "photos": [db.photo_public(x) for x in db.photos_for_student(row["id"])]}

    @staticmethod
    def tutor_checks(h, p):
        """Проверка домашек: кому подключена, сколько израсходовано, и счёт."""
        tutor, err = verified_tutor(p)
        if err:
            return err
        count = db.student_count(tutor["id"])
        students = []
        for s in db.list_students(tutor["id"]):
            st = db.check_state(s["id"]) or {}
            students.append({
                "id": s["id"], "name": s["name"],
                "pack": st.get("pack"), "packName": st.get("packName"),
                "free": st.get("free", False),
                "used": st.get("used", 0), "limit": st.get("limit", 0),
                "left": st.get("left", 0), "extra": st.get("extra", 0),
            })
        return {
            "ok": True,
            "students": students,
            "packs": [{"id": x["id"], "name": x["name"], "limit": x["limit"],
                       "price": db.check_pack_price(x, count)}
                      for x in db.CHECK_PACKS],
            "bill": db.checks_bill(tutor["id"]),
            "extraPrice": db.EXTRA_CHECK_PRICE,
            "maxPhotos": db.PHOTOS_PER_CHECK,
            "freeForAll": bool(tutor["checks_free"]) if "checks_free" in tutor.keys() else False,
            # Честная вкладка: пока нейросети нет, репетитор должен видеть,
            # что разбора не будет и счёт не начисляется, — а не гадать,
            # почему у всех работ «посмотрите сами».
            "aiOn": ai_available(),
        }

    @staticmethod
    def tutor_check_set(h, p):
        """Включить или выключить проверку конкретному ученику."""
        tutor, err = verified_tutor(p)
        if err:
            return err
        pack = p.get("pack") or None
        ok, why = db.set_check_pack(int(p.get("studentId") or 0), tutor["id"], pack)
        if not ok:
            return {"ok": False, "error": why}
        return Api.tutor_checks(h, p)

    @staticmethod
    def tutor_photo_list(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        return {"ok": True,
                "photos": [db.photo_public(x, for_tutor=True)
                           for x in db.photos_for_tutor(tutor["id"])]}

    @staticmethod
    def tutor_photo_seen(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        db.mark_photo_seen(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    @staticmethod
    def tutor_photo_archive(h, p):
        tutor, err = verified_tutor(p)
        if err:
            return err
        return {"ok": db.archive_photo(tutor["id"], int(p.get("id") or 0))}

    @staticmethod
    def photo_fetch(h, p):
        """Отдаём саму картинку — только своему репетитору или самому ученику.
        Файл лежит вне публичной папки, попасть к нему можно лишь сюда."""
        pid = int(p.get("id") or 0)
        row = db.get_photo(pid)
        if not row:
            return {"ok": False, "error": "not_found"}

        allowed = False
        tutor = db.get_tutor_by_token(p.get("token"))
        if tutor and tutor["id"] == row["tutor_id"]:
            allowed = True
        else:
            student = db.get_student_by_token(p.get("token"))
            if student and student["id"] == row["student_id"]:
                allowed = True
        if not allowed:
            return {"ok": False, "error": "forbidden"}

        full = db.photo_path(row["file_name"])
        if not full:
            return {"ok": False, "error": "not_found"}
        with open(full, "rb") as f:
            blob = f.read()
        ext = os.path.splitext(full)[1].lstrip(".").lower()
        media = {"png": "image/png", "webp": "image/webp"}.get(ext, "image/jpeg")
        return {"ok": True, "image": "data:%s;base64,%s" % (
            media, base64.b64encode(blob).decode("ascii"))}

    @staticmethod
    def student_reading(h, p):
        """Результат чтения вслух. Разбор делает браузер — сюда приходит
        готовая оценка, серверу остаётся сохранить её для репетитора."""
        row = db.get_student_by_token(p.get("token"))
        if not row:
            return {"ok": False, "error": "unknown_student"}
        try:
            score = max(0, min(100, int(p.get("score") or 0)))
        except (ValueError, TypeError):
            return {"ok": False, "error": "Некорректная оценка."}
        problems = p.get("problems") or []
        if not isinstance(problems, list):
            problems = []
        clean = []
        for x in problems[:60]:
            if isinstance(x, dict) and x.get("word"):
                clean.append({"word": str(x["word"])[:40],
                              "said": str(x.get("said") or "")[:40],
                              "type": "missed" if x.get("type") == "missed" else "wrong"})
        hw_id = p.get("homeworkId")
        rec = db.create_reading_result(
            row["tutor_id"], row["id"],
            homework_id=int(hw_id) if hw_id else None,
            score=score,
            result={"score": score, "problems": clean,
                    "total": int(p.get("total") or 0),
                    "said": str(p.get("said") or "")[:2000]},
        )
        notify_tutor_later(row["tutor_id"], row["name"])
        return {"ok": True, "id": rec["id"]}

    # --- чат ---

    @staticmethod
    def chat(h, p):
        # Ученика узнаём по токену. Без токена — гость с витрины: его держит
        # общий rate limit, отдельного счётчика на него не завести.
        row = db.get_student_by_token(p.get("token")) if p.get("token") else None
        if row:
            allowed, quota = db.use_chat(row["id"])
            if not allowed:
                # Отказ приходит репликой кота, а не красной ошибкой: ученик
                # не виноват, что заболтался, и пугать его нечем.
                return {"ok": True, "limitReached": True, "quota": quota,
                        "reply": "Мур... я сегодня наговорился на месяц вперёд 🐈‍⬛ "
                                 "Лимит сообщений обновится 1-го числа. "
                                 "А пока давай потренируем карточки — там я всегда с тобой!"}
        try:
            res = ask_claude(p)
            if row:
                res["quota"] = db.chat_state(row["id"])
            return res
        except Exception as e:
            if row:
                db.refund_chat(row["id"])   # не ответил — не считаем
            return {"ok": False, "error": ai_error_text(e, p)}


# ---------- проверка фото домашки ----------
# Sonnet берёт картинку до 2576 пикселей по длинной стороне, Haiku — только
# 1568. На детском почерке эта разница решает: Haiku начинает путать буквы.
VISION_MODEL = os.environ.get("SAVELY_VISION_MODEL", "claude-sonnet-5")

CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {"type": "boolean"},
        "summary": {"type": "string"},
        "mistakes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "wrong": {"type": "string"},
                    "right": {"type": "string"},
                    "why": {"type": "string"},
                },
                "required": ["wrong", "right", "why"],
                "additionalProperties": False,
            },
        },
        "praise": {"type": "string"},
        "verdict": {"type": "string"},
    },
    "required": ["readable", "summary", "mistakes", "praise", "verdict"],
    "additionalProperties": False,
}

CHECK_PROMPT = """Ты — Савелий, кот-репетитор английского. Перед тобой фото
тетради ученика (русскоязычный школьник, уровень {level}).

Разбери работу:
- summary: что в работе написано и что ученик делал. Если фото не читается —
  скажи об этом прямо и объясни, что переснять (свет, фокус, угол).
- mistakes: КАЖДАЯ найденная ошибка. wrong — как написано, right — как надо,
  why — короткое объяснение правила по-русски, понятное ребёнку.
  Пустой список, если ошибок нет.
- praise: что получилось хорошо. Не выдумывай — если хвалить нечего, отметь
  хотя бы старание или аккуратность.
- verdict: одна фраза для репетитора — общее впечатление и на что обратить
  внимание на занятии.
- readable: false, если разобрать почерк невозможно.

Пиши по-русски, тепло и без сюсюканья. Английские слова — как в оригинале.
{task}"""


def check_homework_photo(image_bytes, media_type="image/jpeg", level="A1", task_title=""):
    """Отдаём фото Claude и получаем разбор. Бросает исключение при проблеме —
    вызывающий решает, что показать ученику."""
    if not ANTHROPIC_KEY:
        raise RuntimeError("no_api_key")

    task = ("Задание, к которому эта работа: «%s».\n" % task_title) if task_title else ""
    body = {
        "model": VISION_MODEL,
        "max_tokens": 2000,
        "output_config": {"format": {"type": "json_schema", "schema": CHECK_SCHEMA}},
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image", "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": base64.b64encode(image_bytes).decode("ascii"),
                }},
                {"type": "text", "text": CHECK_PROMPT.format(level=level, task=task)},
            ],
        }],
    }
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
        },
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read())

    # Классификаторы могут отклонить запрос — это приходит как обычный 200
    if data.get("stop_reason") == "refusal":
        raise RuntimeError("refused")
    text = next((b.get("text", "") for b in data.get("content", [])
                 if b.get("type") == "text"), "")
    if not text:
        raise RuntimeError("empty_response")
    return json.loads(text)


ROUTES = {
    "/api/tutor/register": Api.tutor_register,
    "/api/tutor/login": Api.tutor_login,
    "/api/tutor/students": Api.tutor_students,
    "/api/tutor/student": Api.tutor_student_detail,
    "/api/tutor/student/note": Api.tutor_student_note,
    "/api/tutor/student/delete": Api.tutor_student_delete,
    "/api/tutor/homework": Api.tutor_homework_create,
    "/api/tutor/homework/archive": Api.tutor_homework_archive,
    "/api/tutor/message": Api.tutor_message,
    "/api/tutor/message/archive": Api.tutor_message_archive,
    "/api/tutor/group/create": Api.group_create,
    "/api/tutor/group/update": Api.group_update,
    "/api/tutor/group/delete": Api.group_delete,
    "/api/tutor/group/assign": Api.group_assign,
    "/api/join": Api.join_info,
    "/api/student/join": Api.student_join,
    "/api/student/restore": Api.student_restore,
    "/api/student/pull": Api.student_pull,
    "/api/student/sync": Api.student_sync,
    "/api/student/profile": Api.student_profile,
    "/api/student/name": Api.student_name,
    "/api/student/code/new": Api.student_code_new,
    "/api/student/delete": Api.student_delete,
    "/api/admin/login": Api.admin_login,
    "/api/admin/logout": Api.admin_logout,
    "/api/admin/data": Api.admin_data,
    "/api/admin/plan": Api.admin_set_plan,
    "/api/admin/verify": Api.admin_verify,
    "/api/admin/pay": Api.admin_pay,
    "/api/admin/delete": Api.admin_delete,
    "/api/admin/errors": Api.admin_errors,
    "/api/admin/errors/clear": Api.admin_errors_clear,
    "/api/tutor/notify/set": Api.tutor_notify_set,
    "/api/tutor/plan": Api.tutor_plan,
    "/api/tutor/add-slot": Api.tutor_add_slot,
    "/api/tutor/verify/send": Api.tutor_verify_send,
    "/api/tutor/verify/check": Api.tutor_verify_check,
    "/api/tutor/lesson/set": Api.tutor_lesson_set,
    "/api/tutor/lesson/open": Api.tutor_lesson_open,
    "/api/tutor/reset/send": Api.tutor_reset_send,
    "/api/tutor/reset/check": Api.tutor_reset_check,
    "/api/tutor/password": Api.tutor_password_change,
    "/api/tutor/password/reset": Api.tutor_password_reset,
    "/api/tutor/recovery": Api.tutor_recovery_code,
    "/api/student/reading": Api.student_reading,
    "/api/student/photo": Api.student_photo_upload,
    "/api/student/photo/list": Api.student_photo_list,
    "/api/plans": Api.plans,
    "/api/tutor/checks": Api.tutor_checks,
    "/api/tutor/checks/set": Api.tutor_check_set,
    "/api/tutor/photos": Api.tutor_photo_list,
    "/api/tutor/photo/seen": Api.tutor_photo_seen,
    "/api/tutor/photo/archive": Api.tutor_photo_archive,
    "/api/photo": Api.photo_fetch,
    "/api/chat": Api.chat,
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        path = urlparse(self.path).path
        handler = ROUTES.get(path)
        if not handler:
            self._send_json({"ok": False, "error": "not_found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length) or b"{}")
        except Exception:
            self._send_json({"ok": False, "error": "bad_json"}, 400)
            return
        who = self.client_address[0] if self.client_address else "?"
        # Адрес кладём в сам запрос — под mod_wsgi обработчику передаётся
        # None вместо соединения, и достать его там больше неоткуда.
        # ПРИСВАИВАЕМ, а не дополняем: иначе клиент пришлёт свой "_ip".
        payload["_ip"] = who
        if not rate_ok(path, who):
            self._send_json({"ok": False,
                             "error": "Слишком часто — подождите полминуты."}, 429)
            return
        try:
            self._send_json(handler(self, payload))
        except (ValueError, TypeError, KeyError) as e:
            # неверные типы в запросе — это ошибка клиента, а не сервера;
            # текст исключения наружу не отдаём. В лог всё равно пишем:
            # KeyError в нашем коде выглядит точно так же, как кривой
            # запрос, и отличить их можно только по стеку.
            report_error(path, e, payload, status=400)
            self._send_json({"ok": False, "error": "Запрос не разобрал. Обновите страницу и попробуйте ещё раз."}, 400)
        except Exception as e:
            report_error(path, e, payload, status=500)
            self._send_json({"ok": False, "error": "У нас что-то отвалилось. Это не ваша ошибка — попробуйте через минуту."}, 500)
        # Ответ уже ушёл — можно заняться фоновой работой, не задерживая его.
        housekeeping()

    def end_headers(self):
        # при разработке браузер не должен кэшировать css/js —
        # иначе правки не видны до ручной очистки кэша
        if self.path.endswith((".css", ".js", ".html")) or self.path == "/":
            self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json({"ok": True, "version": ASSET_VERSION})
            return
        if not self._servable(path):
            self.send_error(404, "Not Found")
            return
        super().do_GET()

    def list_directory(self, path):
        # листинг каталогов раскрывает структуру проекта — не отдаём
        self.send_error(404, "Not Found")
        return None

    @staticmethod
    def _servable(path):
        """Раздаём только фронтенд. База, серверный код и всё, чего нет
        в белом списке, наружу не уходят — там хеши паролей и токены."""
        name = path.lstrip("/")
        if name in ("", "index.html", "tutor.html", "admin.html", "credits.html",
                    "privacy.html", "offer.html",
                    "manifest.json", "sw.js",
                    "icon-192.png", "icon-512.png", "favicon.ico", "robots.txt"):
            return True
        # Скрытые файлы и выход вверх — на любом уровне пути, а не только
        # в начале: «img/../db.py» и «img/.env» тоже мимо.
        parts = name.split("/")
        if any(p in ("", "..") or p.startswith(".") for p in parts):
            return False
        # Каталог и расширение проверяем ПАРОЙ: иначе js/savely.db стал бы
        # доступен, стоит кому-то положить туда файл.
        rules = (
            # .woff2 — шрифты в css/fonts/. Раньше они приезжали с Google,
            # теперь лежат у нас; без этого расширения страница отдавалась
            # бы системным шрифтом и никакой ошибки в глаза не бросалось.
            # .txt — текст лицензии OFL рядом со шрифтами: она требует,
            # чтобы лицензия распространялась вместе с файлами.
            ("css/", (".css", ".woff2", ".txt")),
            ("js/",  (".js",)),
            # Картинки к словам. Манифест лежит рядом и отдаётся тоже —
            # в нём только авторы и лицензии, это открытые данные, и на них
            # ссылается страница атрибуции.
            ("img/", (".webp", ".png", ".jpg", ".jpeg", ".svg", ".json")),
        )
        return any(name.startswith(d) and name.endswith(e) for d, e in rules)

    def log_message(self, fmt, *args):
        # log_error передаёт первым аргументом код ответа, а не строку запроса —
        # приводим к тексту, иначе поиск подстроки падает
        line = str(args[0]) if args else ""
        if "/api/" in line and "sync" not in line:
            super().log_message(fmt, *args)


if __name__ == "__main__":
    db.init()
    print(f"Савелий слушает на http://localhost:{PORT}")
    print(f"Панель репетитора: http://localhost:{PORT}/tutor.html")
    print(f"База: {db.DB_PATH}")
    ThreadingHTTPServer((HOST or "127.0.0.1", PORT), Handler).serve_forever()
