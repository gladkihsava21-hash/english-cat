"""База Савелия: репетиторы, ученики, прогресс, домашка.

SQLite — файл savely.db рядом со скриптом. Для 50 учеников этого с запасом;
при переезде на сервер меняется только строка подключения.
"""
import hashlib
import json
import os
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

# На сервере база должна лежать ВНЕ папки с кодом: git pull при обновлении
# не должен иметь ни малейшего шанса задеть прогресс учеников.
DB_PATH = os.environ.get(
    "SAVELY_DB",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "savely.db"),
)
_local = threading.local()

SCHEMA = """
CREATE TABLE IF NOT EXISTS tutors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL UNIQUE,
    pass_hash    TEXT NOT NULL,
    pass_salt    TEXT NOT NULL,
    invite_code  TEXT NOT NULL UNIQUE,
    token        TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    name         TEXT NOT NULL,
    color        TEXT DEFAULT '#FF8C42',
    created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    group_id     INTEGER REFERENCES groups(id),
    name         TEXT NOT NULL,
    token        TEXT NOT NULL UNIQUE,
    restore_code TEXT,
    level        TEXT,
    vocab        INTEGER DEFAULT 0,
    xp           INTEGER DEFAULT 0,
    streak       INTEGER DEFAULT 0,
    blitz_best   INTEGER DEFAULT 0,
    dictionary   TEXT DEFAULT '[]',
    activity     TEXT DEFAULT '{}',
    achievements TEXT DEFAULT '[]',
    note         TEXT DEFAULT '',
    goal         INTEGER DEFAULT 50,
    created_at   TEXT NOT NULL,
    last_seen    TEXT
);

CREATE TABLE IF NOT EXISTS homework (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    student_id   INTEGER REFERENCES students(id),
    group_id     INTEGER REFERENCES groups(id),
    title        TEXT NOT NULL,
    words        TEXT NOT NULL DEFAULT '[]',
    due_date     TEXT,
    created_at   TEXT NOT NULL,
    archived     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notes_to_students (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    student_id   INTEGER REFERENCES students(id),
    group_id     INTEGER REFERENCES groups(id),
    text         TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    archived     INTEGER DEFAULT 0
);

-- Фото домашки: ученик снимает тетрадь, Савелий разбирает, репетитор смотрит.
-- Само изображение лежит файлом рядом с базой, здесь только путь и разбор:
--blob'ы раздули бы базу до сотен мегабайт за месяц.
CREATE TABLE IF NOT EXISTS photo_homework (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    student_id   INTEGER NOT NULL REFERENCES students(id),
    homework_id  INTEGER REFERENCES homework(id),
    file_name    TEXT NOT NULL,
    comment      TEXT DEFAULT '',
    check_status TEXT NOT NULL DEFAULT 'pending',
    check_result TEXT DEFAULT '',
    seen_by_tutor INTEGER DEFAULT 0,
    created_at   TEXT NOT NULL,
    archived     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    token        TEXT PRIMARY KEY,
    created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photo_tutor ON photo_homework(tutor_id);
CREATE INDEX IF NOT EXISTS idx_students_tutor ON students(tutor_id);
CREATE INDEX IF NOT EXISTS idx_notes_tutor ON notes_to_students(tutor_id);
CREATE INDEX IF NOT EXISTS idx_homework_tutor ON homework(tutor_id);
CREATE INDEX IF NOT EXISTS idx_groups_tutor ON groups(tutor_id);
"""

# Колонки, добавленные после первого релиза. База репетитора с живыми
# учениками должна переживать обновление, поэтому не пересоздаём таблицы.
MIGRATIONS = [
    ("students", "restore_code", "TEXT"),
    ("students", "group_id", "INTEGER REFERENCES groups(id)"),
    ("students", "achievements", "TEXT DEFAULT '[]'"),
    ("students", "note", "TEXT DEFAULT ''"),
    ("students", "goal", "INTEGER DEFAULT 50"),
    ("homework", "group_id", "INTEGER REFERENCES groups(id)"),
    ("tutors", "failed_logins", "INTEGER DEFAULT 0"),
    ("tutors", "locked_until", "TEXT"),
    ("tutors", "recovery_code", "TEXT"),
    ("tutors", "pass_changed_at", "TEXT"),
    ("tutors", "email_verified", "INTEGER DEFAULT 0"),
    ("tutors", "verify_code", "TEXT"),
    ("tutors", "verify_sent_at", "TEXT"),
    ("tutors", "verify_tries", "INTEGER DEFAULT 0"),
    ("tutors", "plan", "TEXT DEFAULT 'trial'"),
    ("tutors", "student_limit", "INTEGER DEFAULT 15"),
    ("tutors", "trial_ends_at", "TEXT"),
    ("tutors", "paid_until", "TEXT"),
    ("homework", "task_text", "TEXT DEFAULT ''"),
    ("homework", "reading_text", "TEXT DEFAULT ''"),
    ("photo_homework", "kind", "TEXT DEFAULT 'photo'"),
    ("photo_homework", "reading_score", "INTEGER"),
    ("tutors", "notified_at", "TEXT"),
    # проверка домашек: отдельная подписка на каждого ученика
    ("tutors", "checks_free", "INTEGER DEFAULT 0"),
    ("students", "check_pack", "TEXT"),
    ("students", "checks_used", "INTEGER DEFAULT 0"),
    ("students", "checks_extra", "INTEGER DEFAULT 0"),
    ("students", "checks_period", "TEXT"),
    ("students", "chat_used", "INTEGER DEFAULT 0"),
    ("students", "chat_period", "TEXT"),
    # Устройство, с которого завели кабинет. Нужно против бесконечного
    # триала: три дня заканчиваются — регистрируешься с новой почтой и
    # получаешь ещё три. Почта бесплатна и бесконечна, устройство — нет.
    ("tutors", "device_id", "TEXT"),
    ("tutors", "signup_ip", "TEXT"),
    # Сброс пароля кодом с почты. Отдельные колонки от подтверждения почты:
    # это разные коды с разным смыслом, и общие поля означали бы, что запрос
    # сброса гасит незавершённое подтверждение (и наоборот).
    ("tutors", "reset_code", "TEXT"),
    ("tutors", "reset_sent_at", "TEXT"),
    ("tutors", "reset_tries", "INTEGER DEFAULT 0"),
    # Список папок словаря. Отдельно от слов, потому что папка может
    # быть ПУСТОЙ: её заводят под задачу и только потом наполняют.
    ("students", "folders", "TEXT DEFAULT '[]'"),
    # Какие папки ученик выбрал для тренировки. Пустой массив = весь
    # словарь. Ездит с состоянием, чтобы выбор пережил переезд.
    ("students", "train_folders", "TEXT DEFAULT '[]'"),
    # Когда определён уровень. В профиле ученик видит не только «B1», но и
    # дату: уровень полугодовой давности — это уже характеристика не его,
    # а того, кем он был, и повод пройти тест заново. Без даты «B1»
    # выглядит вечным приговором.
    ("students", "level_set_at", "TEXT"),
    # Когда ученик сам перевыпустил личный код. Нужно ровно для одного
    # разговора: «код не подходит» — «ты менял его тогда-то, работает новый».
    # Без даты это неотличимо от поломки сайта.
    ("students", "code_changed_at", "TEXT"),
    # ---- видеоурок ----
    # Ссылка на комнату репетитора: его собственная — Zoom, Google Meet,
    # Телемост, что угодно. Хранится у РЕПЕТИТОРА, а не у ученика: комната
    # у него одна, а учеников двадцать.
    ("tutors", "lesson_url", "TEXT DEFAULT ''"),
    # Когда репетитор нажал «начать урок». Ученик по этому времени видит
    # «идёт урок» и не заходит в пустую комнату гадать, придёт ли кто-то.
    ("tutors", "lesson_open_at", "TEXT"),
    # Каким упражнением ученик отрабатывает слова этой домашки. Пусто —
    # как раньше: ученик выбирает сам. Это и есть «репетитор собирает игру»:
    # список слов и адресация у домашки уже были, не хватало выбора игры.
    ("homework", "game", "TEXT DEFAULT ''"),
]


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def conn():
    """Отдельное соединение на поток — ThreadingHTTPServer работает в несколько потоков."""
    c = getattr(_local, "conn", None)
    if c is None:
        c = sqlite3.connect(DB_PATH, timeout=10)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.execute("PRAGMA foreign_keys=ON")
        _local.conn = c
    return c


def init():
    c = conn()
    c.executescript(SCHEMA)
    # Кто зарегистрировался ДО появления проверки почты, подтверждён по факту:
    # запирать человеку кабинет задним числом нельзя, он ничего не нарушал
    had_verify_column = "email_verified" in {
        r["name"] for r in c.execute("PRAGMA table_info(tutors)")
    }

    for table, column, decl in MIGRATIONS:
        have = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
            if table == "tutors" and column == "email_verified" and not had_verify_column:
                c.execute("UPDATE tutors SET email_verified=1")
            if table == "tutors" and column == "trial_ends_at":
                # Кто регистрировался до появления триала, получает свои
                # три дня с этого момента — а не блокировку задним числом
                end = (datetime.now(timezone.utc)
                       + timedelta(days=TRIAL_DAYS)).isoformat(timespec="seconds")
                c.execute("UPDATE tutors SET trial_ends_at=? WHERE trial_ends_at IS NULL",
                          (end,))
                # тариф «trial» отменён — переводим на минимальный платный
                c.execute("UPDATE tutors SET plan='start' WHERE plan='trial' OR plan IS NULL")
            if table == "tutors" and column == "checks_free":
                # Кто регистрировался, когда проверка домашек входила в базовый
                # тариф, оставляет её бесплатно навсегда. Отбирать оплаченную
                # фичу задним числом нельзя, а первые клиенты — самые ценные.
                c.execute("UPDATE tutors SET checks_free=1")
    c.commit()


# ---------- пароли ----------

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return h.hex(), salt


def check_password(password, pass_hash, salt):
    h, _ = hash_password(password, salt)
    return secrets.compare_digest(h, pass_hash)


def new_token():
    return secrets.token_urlsafe(24)


def new_invite_code():
    # без похожих символов (0/O, 1/I) — код диктуют вслух и переписывают руками
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))


# ---------- репетиторы ----------

def device_used_trial(device_id):
    """Брали ли уже бесплатные дни с этого устройства.

    Считаем ЛЮБОЙ прежний кабинет с тем же идентификатором, включая
    удалённые впоследствии: иначе цикл «зарегистрировался — удалился —
    зарегистрировался» возвращает бесконечный триал."""
    if not device_id:
        return False
    return conn().execute(
        "SELECT 1 FROM tutors WHERE device_id=? LIMIT 1", (device_id,)
    ).fetchone() is not None


def signups_from_ip(ip, hours=None):
    """Сколько кабинетов завели с этого адреса за последние часы.

    Второй сигнал на случай, когда localStorage просто очистили. Сам по
    себе слабый — за одним адресом сидит целая школа, — поэтому используется
    как порог, а не как признак."""
    if not ip:
        return 0
    since = (datetime.now(timezone.utc)
             - timedelta(hours=hours or SIGNUP_IP_WINDOW_H)).isoformat(timespec="seconds")
    row = conn().execute(
        "SELECT COUNT(*) AS n FROM tutors WHERE signup_ip=? AND created_at>=?",
        (ip, since),
    ).fetchone()
    return row["n"] if row else 0


def create_tutor(name, email, password, device_id=None, signup_ip=None):
    email = email.strip().lower()
    if get_tutor_by_email(email):
        return None
    pass_hash, salt = hash_password(password)
    code = new_invite_code()
    while conn().execute("SELECT 1 FROM tutors WHERE invite_code=?", (code,)).fetchone():
        code = new_invite_code()
    token = new_token()
    # Лимит мест ставим явно по минимальному тарифу. Раньше он не задавался,
    # и колонка отдавала своё DEFAULT 15 — цифра, не совпадающая ни с одним
    # тарифом. Репетитор, пропустивший поле «сколько у вас учеников» (оно
    # необязательное), получал 15 мест по цене пяти, а в шапке висело
    # «Старт · 3/15», что выглядело как ошибка в прайсе.
    cur = conn().execute(
        "INSERT INTO tutors (name, email, pass_hash, pass_salt, invite_code, token,"
        " created_at, recovery_code, plan, student_limit, device_id, signup_ip)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        (name.strip(), email, pass_hash, salt, code, token, now(), new_recovery_code(),
         PLANS[0]["id"], PLANS[0]["limit"], device_id or None, signup_ip or None),
    )
    conn().commit()
    return get_tutor_by_id(cur.lastrowid)


def get_tutor_by_email(email):
    return conn().execute(
        "SELECT * FROM tutors WHERE email=?", (email.strip().lower(),)
    ).fetchone()


def get_tutor_by_id(tutor_id):
    return conn().execute("SELECT * FROM tutors WHERE id=?", (tutor_id,)).fetchone()


def get_tutor_by_token(token):
    if not token:
        return None
    return conn().execute("SELECT * FROM tutors WHERE token=?", (token,)).fetchone()


def get_tutor_by_code(code):
    if not code:
        return None
    return conn().execute(
        "SELECT * FROM tutors WHERE invite_code=?", (code.strip().upper(),)
    ).fetchone()


def login_tutor(email, password):
    """Возвращает (строка, ошибка). Ошибка — текст для человека либо None."""
    row = get_tutor_by_email(email)
    if not row:
        # Отвечаем так же, как на верный email с неверным паролем: иначе
        # по разнице ответов собирают список зарегистрированных почт
        return None, "Неверный email или пароль."
    left = login_lock_left(row)
    if left:
        mins = max(1, round(left / 60))
        return None, "Слишком много попыток. Попробуй через %d мин." % mins
    if not check_password(password, row["pass_hash"], row["pass_salt"]):
        pause = note_failed_login(row["id"], row)
        if pause:
            mins = max(1, round(pause / 60))
            return None, "Неверный пароль. Вход закрыт на %d мин." % mins
        return None, "Неверный email или пароль."
    clear_failed_logins(row["id"])
    return row, None


# ---------- группы ----------

def create_group(tutor_id, name, color=None):
    cur = conn().execute(
        "INSERT INTO groups (tutor_id, name, color, created_at) VALUES (?,?,?,?)",
        (tutor_id, name.strip()[:60] or "Группа", (color or "#FF8C42")[:16], now()),
    )
    conn().commit()
    return conn().execute("SELECT * FROM groups WHERE id=?", (cur.lastrowid,)).fetchone()


def list_groups(tutor_id):
    return conn().execute(
        "SELECT * FROM groups WHERE tutor_id=? ORDER BY name COLLATE NOCASE", (tutor_id,)
    ).fetchall()


def update_group(tutor_id, group_id, name=None, color=None):
    if name is not None:
        conn().execute("UPDATE groups SET name=? WHERE id=? AND tutor_id=?",
                       (name.strip()[:60], group_id, tutor_id))
    if color is not None:
        conn().execute("UPDATE groups SET color=? WHERE id=? AND tutor_id=?",
                       (color[:16], group_id, tutor_id))
    conn().commit()


def delete_group(tutor_id, group_id):
    # учеников не трогаем — они просто остаются без группы
    conn().execute("UPDATE students SET group_id=NULL WHERE group_id=? AND tutor_id=?",
                   (group_id, tutor_id))
    conn().execute("UPDATE homework SET group_id=NULL WHERE group_id=? AND tutor_id=?",
                   (group_id, tutor_id))
    conn().execute("DELETE FROM groups WHERE id=? AND tutor_id=?", (group_id, tutor_id))
    conn().commit()


def set_student_group(tutor_id, student_id, group_id):
    conn().execute("UPDATE students SET group_id=? WHERE id=? AND tutor_id=?",
                   (group_id or None, student_id, tutor_id))
    conn().commit()


# ---------- ученики ----------

def new_restore_code():
    """Личный код ученика для входа с другого устройства.
    Отдельный от кода приглашения: тот общий на весь класс, и по нему
    нельзя было бы отличить владельца аккаунта от одноклассника."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(2))


def create_student(tutor_id, name):
    token = new_token()
    code = new_restore_code()
    while conn().execute("SELECT 1 FROM students WHERE restore_code=?", (code,)).fetchone():
        code = new_restore_code()
    # last_seen остаётся пустым до первого занятия — иначе репетитор
    # увидит «был сегодня» у ученика, который только перешёл по ссылке
    cur = conn().execute(
        "INSERT INTO students (tutor_id, name, token, restore_code, created_at) VALUES (?,?,?,?,?)",
        (tutor_id, name.strip()[:40], token, code, now()),
    )
    conn().commit()
    return get_student_by_id(cur.lastrowid)


def student_name_problem(name):
    """Что не так с именем ученика. Возвращает текст ошибки или None.

    Отдельной функцией, потому что имя теперь вводят в двух местах: при
    входе по ссылке и в профиле. Правила обязаны совпадать, иначе ученик
    зарегистрируется с именем, которое ему же нельзя будет сохранить.
    """
    clean = str(name or "").strip()
    if len(clean) < 2:
        # экран УЧЕНИКА — на «ты», как везде у него
        return "Напиши имя — хотя бы две буквы. Можно просто «Ваня»."
    if len(clean) > 40:
        # Молча обрезать нельзя: человек уйдёт с экрана в уверенности, что
        # сохранилось то, что он набрал, а репетитор увидит огрызок.
        return "Слишком длинное имя — до 40 знаков."
    return None


def set_student_name(student_id, name):
    """Смена имени. Владельца проверяет вызывающий: сюда доходит только
    свой id, добытый по токену."""
    conn().execute("UPDATE students SET name=? WHERE id=?",
                   (str(name).strip()[:40], student_id))
    conn().commit()
    return get_student_by_id(student_id)


def reissue_restore_code(student_id):
    """Новый личный код взамен старого.

    Старый перестаёт работать в ту же секунду — в этом весь смысл: код
    подсмотрел одноклассник, и войти по нему больше нельзя.

    Токен при этом НЕ трогаем. Устройство, с которого нажали кнопку,
    обязано остаться в аккаунте: иначе ученик выкидывает сам себя и
    попадает на экран входа с кодом, которого ещё не успел записать.
    """
    code = new_restore_code()
    while conn().execute("SELECT 1 FROM students WHERE restore_code=? AND id<>?",
                         (code, student_id)).fetchone():
        code = new_restore_code()
    conn().execute("UPDATE students SET restore_code=?, code_changed_at=? WHERE id=?",
                   (code, now(), student_id))
    conn().commit()
    return code


def student_profile(row):
    """Личный кабинет ученика: то, чем он управляет сам.

    Почты и пароля у ученика нет — вход по личному коду, и код здесь
    ровно то же, чем у взрослых бывает пара «логин + пароль».

    Имя репетитора отдаём, адрес — нет: ученику он не нужен, а утечка
    адреса из детского кабинета — это утечка адреса.
    """
    keys = row.keys()
    tutor = get_tutor_by_id(row["tutor_id"])
    return {
        "name": row["name"],
        "restoreCode": (row["restore_code"] if "restore_code" in keys else "") or "",
        "codeChangedAt": row["code_changed_at"] if "code_changed_at" in keys else None,
        "level": row["level"] or "",
        "levelSetAt": row["level_set_at"] if "level_set_at" in keys else None,
        "vocab": row["vocab"] or 0,
        "words": len(json.loads(row["dictionary"] or "[]")),
        "xp": row["xp"] or 0,
        "createdAt": row["created_at"],
        "tutorName": tutor["name"] if tutor else "",
    }


def get_student_by_restore_code(code):
    if not code:
        return None
    clean = str(code).strip().upper().replace(" ", "")
    if "-" not in clean and len(clean) == 8:
        clean = clean[:4] + "-" + clean[4:]
    return conn().execute(
        "SELECT * FROM students WHERE restore_code=?", (clean,)).fetchone()


def get_student_by_id(student_id):
    return conn().execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()


def get_student_by_token(token):
    if not token:
        return None
    return conn().execute("SELECT * FROM students WHERE token=?", (token,)).fetchone()


def list_students(tutor_id):
    return conn().execute(
        "SELECT * FROM students WHERE tutor_id=? ORDER BY name COLLATE NOCASE", (tutor_id,)
    ).fetchall()


def _as_int(value, default=0, lo=0, hi=10_000_000):
    """Данные приходят из браузера — им нельзя доверять."""
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def sync_student(token, state):
    """Принимает снимок состояния из браузера ученика."""
    row = get_student_by_token(token)
    if not row:
        return None
    dictionary = state.get("dictionary")
    if not isinstance(dictionary, list):
        dictionary = []
    activity = state.get("activity")
    if not isinstance(activity, dict):
        activity = {}
    achievements = state.get("achievements")
    if not isinstance(achievements, list):
        achievements = []
    # чистим словарь от мусора: только строковые поля, ограниченной длины
    clean_dict = []
    for d in dictionary[:1000]:
        if not isinstance(d, dict) or not d.get("w"):
            continue
        clean_dict.append({
            "w": str(d.get("w"))[:60],
            "t": str(d.get("t", ""))[:120],
            "status": str(d.get("status", "new"))[:12],
            "knew": _as_int(d.get("knew"), 0, 0, 9999),
            "forgot": _as_int(d.get("forgot"), 0, 0, 9999),
            # расписание повторений: без него переезд на другое устройство
            # сбрасывал бы весь словарь в «пора повторить прямо сейчас»
            "due": str(d.get("due") or "")[:12] or None,
            "interval": _as_int(d.get("interval"), 0, 0, 3650),
            "reps": _as_int(d.get("reps"), 0, 0, 9999),
            "ease": min(3.0, max(1.0, float(d.get("ease") or 2.0))) if isinstance(d.get("ease"), (int, float)) else 2.0,
            "lastReview": str(d.get("lastReview") or "")[:12] or None,
            "seen": bool(d.get("seen")),
            # Папки ученика. Чистим так же, как всё остальное: имена —
            # строки до 30 знаков, не больше 20 штук на слово. Это не про
            # злой умысел, а про то, что снимок приходит из браузера и
            # верить ему на слово нельзя ни в одном поле.
            "folders": [str(f)[:30] for f in (d.get("folders") or [])
                        if isinstance(f, str) and f.strip()][:20],
        })
    # ---- защита от затирания ----
    # Клиент может прислать пустое состояние по куче причин: сбой скрипта,
    # гонка при загрузке, очищенный localStorage, кривой запрос. Раньше
    # такая синхронизация СТИРАЛА словарь ученика на сервере — то есть
    # последнюю копию его прогресса. Пустым данным не верим.
    prev_dict = json.loads(row["dictionary"] or "[]")
    if not clean_dict and prev_dict:
        clean_dict = prev_dict

    prev_ach = json.loads(row["achievements"] or "[]") if "achievements" in row.keys() else []
    if not achievements and prev_ach:
        achievements = prev_ach

    # Список папок: те же правила, что у папок внутри слова.
    folders = state.get("folders")
    clean_folders = [str(f)[:30] for f in (folders or [])
                     if isinstance(f, str) and f.strip()][:50]
    prev_folders = json.loads((row["folders"] if "folders" in row.keys() else "[]") or "[]")
    # Пустому списку не верим по той же причине, что и пустому словарю:
    # чаще всего это сбой, а не «человек удалил все папки».
    if not clean_folders and prev_folders:
        clean_folders = prev_folders

    # Выбор папок для тренировки. Здесь пустой список — ЗНАЧИМОЕ значение
    # («тренирую весь словарь»), а не признак сбоя, поэтому в отличие от
    # списка папок его принимаем как есть.
    train = state.get("trainFolders")
    clean_train = [str(f)[:30] for f in (train or [])
                   if isinstance(f, str) and f.strip()][:50]

    clean_activity = {}
    # берём ПОСЛЕДНИЕ дни: срез сначала выбрасывал бы свежую активность
    # и обнулял «очки за неделю» в панели репетитора
    for k, v in sorted(activity.items())[-400:]:
        if isinstance(k, str) and len(k) <= 12:
            clean_activity[k] = _as_int(v, 0, 0, 100000)
    # Активность дополняем, а не заменяем: занятия с другого устройства
    # иначе исчезали бы из панели репетитора
    prev_activity = json.loads(row["activity"] or "{}")
    for k, v in prev_activity.items():
        if k not in clean_activity:
            clean_activity[k] = v

    # Очки и рекорды не должны уменьшаться: устаревший снимок с другого
    # устройства иначе откатывал бы ученика назад
    new_xp = max(_as_int(state.get("xp"), 0, 0, 10_000_000), row["xp"] or 0)
    new_blitz = max(_as_int(state.get("blitzBest"), 0, 0, 100000), row["blitz_best"] or 0)
    new_vocab = _as_int(state.get("vocabEstimate"), 0, 0, 100000) or (row["vocab"] or 0)
    new_level = str(state.get("level") or "")[:4] or row["level"]
    # Дата определения уровня. Ставим ТОЛЬКО в момент смены: снимок
    # прилетает каждые три секунды, и «дата последней синхронизации»
    # означала бы в профиле вечное «уровень определён сегодня».
    # У тех, кто проходил тест до появления колонки, останется пусто —
    # профиль честно скажет, что даты нет, а не выдумает её.
    level_at = row["level_set_at"] if "level_set_at" in row.keys() else None
    if new_level and new_level != (row["level"] or ""):
        level_at = now()
    conn().execute(
        "UPDATE students SET level=?, level_set_at=?, vocab=?, xp=?, streak=?, blitz_best=?,"
        " dictionary=?, activity=?, achievements=?, goal=?, folders=?,"
        " train_folders=?, last_seen=? WHERE id=?",
        (
            new_level,
            level_at,
            new_vocab,
            new_xp,
            _as_int(state.get("streak"), 0, 0, 3650),
            new_blitz,
            json.dumps(clean_dict, ensure_ascii=False),
            json.dumps(clean_activity, ensure_ascii=False),
            json.dumps([str(a)[:40] for a in achievements[:100]], ensure_ascii=False),
            _as_int(state.get("goal"), 50, 10, 500),
            json.dumps(clean_folders, ensure_ascii=False),
            json.dumps(clean_train, ensure_ascii=False),
            now(),
            row["id"],
        ),
    )
    conn().commit()
    return get_student_by_id(row["id"])


def student_state(row):
    """Состояние ученика для восстановления на новом устройстве."""
    keys = row.keys()
    return {
        "name": row["name"],
        "restoreCode": row["restore_code"] if "restore_code" in keys else None,
        "level": row["level"],
        "vocabEstimate": row["vocab"],
        "xp": row["xp"],
        "blitzBest": row["blitz_best"],
        "goal": row["goal"] if "goal" in row.keys() else 50,
        "dictionary": json.loads(row["dictionary"] or "[]"),
        "activity": json.loads(row["activity"] or "{}"),
        "achievements": json.loads((row["achievements"] if "achievements" in row.keys() else "[]") or "[]"),
        "folders": json.loads((row["folders"] if "folders" in keys else "[]") or "[]"),
        "trainFolders": json.loads((row["train_folders"] if "train_folders" in keys else "[]") or "[]"),
    }


def set_student_note(tutor_id, student_id, note):
    conn().execute("UPDATE students SET note=? WHERE id=? AND tutor_id=?",
                   (str(note)[:2000], student_id, tutor_id))
    conn().commit()


def _purge_student_rows(student_id):
    """Всё, что ссылается на ученика, — перед удалением его самого.

    Не «на всякий случай»: foreign_keys=ON, и DELETE FROM students падает
    с IntegrityError, пока на строку ссылается хоть одно фото, личное
    сообщение или домашка. Раньше здесь чистилась только домашка, поэтому
    удаление ученика, которому репетитор писал лично или который присылал
    фото, отваливалось пятисоткой.

    Файлы фотографий убираем с диска: удалили аккаунт — значит, тетрадей
    этого ребёнка на сервере больше нет. Ошибку игнорируем осознанно —
    отсутствующий файл означает, что удалять уже нечего.
    """
    photos = conn().execute(
        "SELECT file_name FROM photo_homework WHERE student_id=?", (student_id,)).fetchall()
    for p in photos:
        # photo_path отдаёт None, если файла уже нет; os.remove(None) — это
        # TypeError, а не OSError, и он бы вылетел наружу пятисоткой.
        # Так что проверяем ЯВНО, а не полагаемся на except.
        full = photo_path(p["file_name"])
        if not full:
            continue
        try:
            os.remove(full)
        except OSError:
            pass
    conn().execute("DELETE FROM photo_homework WHERE student_id=?", (student_id,))
    conn().execute("DELETE FROM notes_to_students WHERE student_id=?", (student_id,))
    conn().execute("DELETE FROM homework WHERE student_id=?", (student_id,))


def delete_student(tutor_id, student_id):
    # Владельца проверяем ОТДЕЛЬНО и заранее: чистка связанных строк идёт
    # по одному student_id, и без этой проверки чужой репетитор стёр бы
    # фото и домашку ученика, который ему не принадлежит.
    row = get_student_by_id(student_id)
    if not row or row["tutor_id"] != tutor_id:
        return False
    _purge_student_rows(student_id)
    conn().execute("DELETE FROM students WHERE id=?", (student_id,))
    conn().commit()
    return True


def delete_student_account(student_id):
    """Ученик удаляет себя сам, из своего профиля.

    Владелец проверен вызывающим: сюда доходит только тот id, который
    сервер достал по токену из запроса. Репетитор здесь ни при чём —
    это аккаунт ученика, и уйти он вправе без разрешения.
    """
    _purge_student_rows(student_id)
    conn().execute("DELETE FROM students WHERE id=?", (student_id,))
    conn().commit()


# ---------- домашка ----------

def create_homework(tutor_id, title, words, student_id=None, group_id=None,
                    due_date=None, task_text="", reading_text="", game=""):
    cur = conn().execute(
        "INSERT INTO homework (tutor_id, student_id, group_id, title, words, due_date,"
        " created_at, task_text, reading_text, game) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            tutor_id,
            student_id,
            group_id,
            title.strip()[:120] or "Домашка",
            json.dumps(words[:100], ensure_ascii=False),
            due_date,
            now(),
            str(task_text or "")[:4000],
            str(reading_text or "")[:2000],
            str(game or "")[:32],
        ),
    )
    conn().commit()
    return conn().execute("SELECT * FROM homework WHERE id=?", (cur.lastrowid,)).fetchone()


def list_homework(tutor_id, include_archived=False):
    sql = "SELECT * FROM homework WHERE tutor_id=?"
    args = [tutor_id]
    if not include_archived:
        sql += " AND archived=0"
    sql += " ORDER BY created_at DESC"
    return conn().execute(sql, args).fetchall()


def homework_for_student(all_homework, student_row):
    """Ученику видна домашка: лично ему, его группе или всем сразу."""
    out = []
    for hw in all_homework:
        if hw["student_id"] is not None:
            if hw["student_id"] == student_row["id"]:
                out.append(hw)
        elif hw["group_id"] is not None:
            if student_row["group_id"] == hw["group_id"]:
                out.append(hw)
        else:
            out.append(hw)
    return out


def archive_homework(tutor_id, hw_id):
    conn().execute(
        "UPDATE homework SET archived=1 WHERE id=? AND tutor_id=?", (hw_id, tutor_id)
    )
    conn().commit()


# ---------- сообщения ученикам ----------

def create_message(tutor_id, text, student_id=None, group_id=None):
    cur = conn().execute(
        "INSERT INTO notes_to_students (tutor_id, student_id, group_id, text, created_at)"
        " VALUES (?,?,?,?,?)",
        (tutor_id, student_id, group_id, str(text).strip()[:500], now()),
    )
    conn().commit()
    return conn().execute(
        "SELECT * FROM notes_to_students WHERE id=?", (cur.lastrowid,)).fetchone()


def list_messages(tutor_id):
    return conn().execute(
        "SELECT * FROM notes_to_students WHERE tutor_id=? AND archived=0"
        " ORDER BY created_at DESC", (tutor_id,)
    ).fetchall()


def archive_message(tutor_id, msg_id):
    conn().execute("UPDATE notes_to_students SET archived=1 WHERE id=? AND tutor_id=?",
                   (msg_id, tutor_id))
    conn().commit()


def messages_for_student(all_messages, student_row):
    """Ученику видно адресованное лично ему, его группе или всем."""
    out = []
    for m in all_messages:
        if m["student_id"] is not None:
            if m["student_id"] == student_row["id"]:
                out.append(m)
        elif m["group_id"] is not None:
            if student_row["group_id"] == m["group_id"]:
                out.append(m)
        else:
            out.append(m)
    return out


# ---------- сериализация для API ----------

def xp_since(activity, days):
    """Сколько очков ученик набрал за последние N дней."""
    from datetime import date, timedelta
    today = date.today()
    total = 0
    for i in range(days):
        key = (today - timedelta(days=i)).isoformat()
        total += int(activity.get(key) or 0)
    return total


def student_public(row, homework=None, detail=False):
    """Данные ученика для панели репетитора: прогресс + выполнение домашки."""
    dictionary = json.loads(row["dictionary"] or "[]")
    learned = [d for d in dictionary if d.get("status") == "learned"]
    learning = [d for d in dictionary if d.get("status") == "learning"]
    fresh = [d for d in dictionary if d.get("status") == "new"]
    # Слова, где ошибок не меньше, чем успехов, — только они реально проблемные.
    # Фильтр «была хотя бы одна ошибка» показывал бы и давно выученные слова.
    weak = sorted(
        [d for d in dictionary
         if (d.get("forgot") or 0) > 0 and (d.get("forgot") or 0) >= (d.get("knew") or 0)],
        key=lambda d: (d.get("forgot") or 0) - (d.get("knew") or 0),
        reverse=True,
    )[:8]
    activity = json.loads(row["activity"] or "{}")
    keys = row.keys()
    data = {
        "id": row["id"],
        "name": row["name"],
        "groupId": row["group_id"] if "group_id" in keys else None,
        "level": row["level"],
        "vocab": row["vocab"],
        "xp": row["xp"],
        "xpWeek": xp_since(activity, 7),
        "xpMonth": xp_since(activity, 30),
        "streak": row["streak"],
        "blitzBest": row["blitz_best"],
        "goal": row["goal"] if "goal" in keys else 50,
        "note": (row["note"] if "note" in keys else "") or "",
        "achievements": json.loads((row["achievements"] if "achievements" in keys else "[]") or "[]"),
        "words": {
            "total": len(dictionary),
            "learned": len(learned),
            "learning": len(learning),
            "new": len(fresh),
        },
        "weak": [{"w": d.get("w"), "t": d.get("t"),
                  "knew": d.get("knew") or 0, "forgot": d.get("forgot") or 0} for d in weak],
        "activity": activity,
        "lastSeen": row["last_seen"],
        "createdAt": row["created_at"],
        # Личный код ученика виден его репетитору. Без этого ребёнок,
        # сменивший телефон или почистивший браузер, терял доступ
        # к прогрессу навсегда — помочь ему было некому.
        "restoreCode": (row["restore_code"] if "restore_code" in keys else None) or "",
    }
    if detail:
        data["dictionary"] = dictionary
    if homework is not None:
        known = {str(d.get("w", "")).lower(): d for d in dictionary}
        tasks = []
        for hw in homework:
            words = json.loads(hw["words"] or "[]")
            done = 0
            for w in words:
                d = known.get(str(w.get("w", "")).lower())
                # Засчитываем только ПРОВЕРЕННЫЙ ответ: ввод с клавиатуры,
                # выбор варианта, диктант. Поле checked ставит клиент, и
                # только там, где ответ действительно сверялся.
                #
                # Раньше здесь стояло knew >= 1 — то есть хватало одного
                # нажатия «Помню» на карточке, где ученик оценивает себя сам.
                # Репетитор видел «сдал 10 из 10» у того, кто не глядя
                # протыкал десять карточек. Это ровно то, за что он платит.
                #
                # status == "learned" оставлен: до него слово доходит только
                # через четыре успешных повтора по расписанию SRS, накрутить
                # его нажатиями нельзя.
                if d and ((d.get("checked") or 0) >= 1 or d.get("status") == "learned"):
                    done += 1
            tasks.append({
                "id": hw["id"],
                "title": hw["title"],
                "total": len(words),
                "done": done,
                "dueDate": hw["due_date"],
                "createdAt": hw["created_at"],
            })
        data["homework"] = tasks
    return data


def tutor_public(row):
    keys = row.keys()
    plan_id = (row["plan"] if "plan" in keys else None) or "start"
    limit = (row["student_limit"] if "student_limit" in keys else 5) or 5
    plan = plan_by_id(plan_id)
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "inviteCode": row["invite_code"],
        "createdAt": row["created_at"],
        "plan": plan_id,
        "planName": plan["name"],
        "planPrice": plan["price"],
        "studentLimit": limit,
        "studentCount": student_count(row["id"]),
        "extraPrice": EXTRA_STUDENT_PRICE,
        "emailVerified": bool(row["email_verified"]) if "email_verified" in keys else True,
        "access": access_state(row),
        "trialHoursLeft": trial_left(row),
        "paidDaysLeft": paid_left(row),
        "trialDays": TRIAL_DAYS,
        "lessonUrl": (row["lesson_url"] if "lesson_url" in keys else "") or "",
        "lessonLive": lesson_state(row)["live"],
    }


def group_public(row):
    return {"id": row["id"], "name": row["name"], "color": row["color"]}


def leaderboard(student_row, limit=12):
    """Рейтинг одноклассников за неделю — виден самому ученику.
    Показываем только имя и очки: чужой прогресс по словам не раскрываем."""
    peers = conn().execute(
        "SELECT id, name, xp, activity, group_id FROM students WHERE tutor_id=?",
        (student_row["tutor_id"],),
    ).fetchall()
    same_group = [p for p in peers if p["group_id"] == student_row["group_id"]] \
        if student_row["group_id"] else peers
    rows = []
    for p in same_group:
        act = json.loads(p["activity"] or "{}")
        rows.append({
            "name": p["name"],
            "xpWeek": xp_since(act, 7),
            "me": p["id"] == student_row["id"],
        })
    rows.sort(key=lambda r: -r["xpWeek"])
    for i, r in enumerate(rows):
        r["place"] = i + 1
    # ученик всегда видит себя, даже если он вне первой дюжины
    top = rows[:limit]
    if not any(r["me"] for r in top):
        mine = next((r for r in rows if r["me"]), None)
        if mine:
            top = top[:limit - 1] + [mine]
    return top


# ---------- фото домашки ----------

# Картинки лежат рядом с базой, а не в public_html: иначе любой,
# угадавший имя файла, посмотрел бы тетрадь чужого ребёнка.
PHOTO_DIR = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), "photos")


def save_photo_file(data: bytes, ext: str = "jpg") -> str:
    """Кладём файл под случайным именем и возвращаем это имя."""
    os.makedirs(PHOTO_DIR, exist_ok=True)
    try:
        os.chmod(PHOTO_DIR, 0o700)
    except OSError:
        pass
    name = "%s.%s" % (secrets.token_hex(16), ext if ext in ("jpg", "png", "webp") else "jpg")
    path = os.path.join(PHOTO_DIR, name)
    with open(path, "wb") as f:
        f.write(data)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return name


def photo_path(file_name: str):
    """Путь к файлу по имени из базы. Имя из базы, но проверяем всё равно:
    если оно когда-нибудь придёт снаружи, «..» уведёт за пределы папки."""
    safe = os.path.basename(str(file_name or ""))
    if not safe or safe.startswith("."):
        return None
    full = os.path.normpath(os.path.join(PHOTO_DIR, safe))
    if not full.startswith(PHOTO_DIR + os.sep) or not os.path.isfile(full):
        return None
    return full


def create_photo_homework(tutor_id, student_id, file_name, homework_id=None, comment=""):
    cur = conn().execute(
        "INSERT INTO photo_homework (tutor_id, student_id, homework_id, file_name,"
        " comment, check_status, created_at) VALUES (?,?,?,?,?,?,?)",
        (tutor_id, student_id, homework_id, file_name,
         str(comment or "")[:500], "pending", now()),
    )
    conn().commit()
    return get_photo(cur.lastrowid)


def get_photo(photo_id):
    return conn().execute(
        "SELECT * FROM photo_homework WHERE id=?", (photo_id,)
    ).fetchone()


def set_photo_check(photo_id, status, result):
    conn().execute(
        "UPDATE photo_homework SET check_status=?, check_result=? WHERE id=?",
        (status, json.dumps(result, ensure_ascii=False), photo_id),
    )
    conn().commit()


def photos_for_student(student_id, limit=20):
    return conn().execute(
        "SELECT * FROM photo_homework WHERE student_id=? AND archived=0"
        " ORDER BY id DESC LIMIT ?", (student_id, limit)
    ).fetchall()


def photos_for_tutor(tutor_id, limit=200):
    return conn().execute(
        "SELECT p.*, s.name AS student_name FROM photo_homework p"
        " JOIN students s ON s.id = p.student_id"
        " WHERE p.tutor_id=? AND p.archived=0 ORDER BY p.id DESC LIMIT ?",
        (tutor_id, limit)
    ).fetchall()


def mark_photo_seen(tutor_id, photo_id):
    conn().execute(
        "UPDATE photo_homework SET seen_by_tutor=1 WHERE id=? AND tutor_id=?",
        (photo_id, tutor_id),
    )
    conn().commit()


def archive_photo(tutor_id, photo_id):
    """Удаляем и файл: тетради детей не должны копиться вечно."""
    row = conn().execute(
        "SELECT file_name FROM photo_homework WHERE id=? AND tutor_id=?",
        (photo_id, tutor_id),
    ).fetchone()
    if not row:
        return False
    full = photo_path(row["file_name"])
    if full:
        try:
            os.remove(full)
        except OSError:
            pass
    conn().execute(
        "UPDATE photo_homework SET archived=1 WHERE id=? AND tutor_id=?",
        (photo_id, tutor_id),
    )
    conn().commit()
    return True


def photo_public(row, for_tutor=False):
    keys0 = row.keys()
    out = {
        "id": row["id"],
        "kind": (row["kind"] if "kind" in keys0 else "photo") or "photo",
        "readingScore": row["reading_score"] if "reading_score" in keys0 else None,
        "homeworkId": row["homework_id"],
        "comment": row["comment"],
        "status": row["check_status"],
        "createdAt": row["created_at"],
    }
    try:
        out["result"] = json.loads(row["check_result"] or "null")
    except (ValueError, TypeError):
        out["result"] = None
    if for_tutor:
        keys = row.keys()
        out["studentName"] = row["student_name"] if "student_name" in keys else ""
        out["studentId"] = row["student_id"]
        out["seen"] = bool(row["seen_by_tutor"])
    return out


def get_homework(hw_id):
    return conn().execute("SELECT * FROM homework WHERE id=?", (hw_id,)).fetchone()


# ---------- защита входа ----------

# Пароль репетитора открывает доступ к данным полусотни детей. Без задержки
# его подбирают перебором за часы, поэтому после неудач вход закрывается.
LOCK_STEPS = [(10, 30 * 60), (5, 5 * 60), (3, 30)]  # (неудач, пауза в секундах)


def _parse_ts(value):
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def login_lock_left(row):
    """Сколько секунд осталось до разблокировки. 0 — можно пробовать."""
    keys = row.keys()
    if "locked_until" not in keys or not row["locked_until"]:
        return 0
    until = _parse_ts(row["locked_until"])
    if not until:
        return 0
    left = (until - datetime.now(timezone.utc)).total_seconds()
    return int(left) if left > 0 else 0


def note_failed_login(tutor_id, row):
    keys = row.keys()
    fails = (row["failed_logins"] if "failed_logins" in keys else 0) or 0
    fails += 1
    pause = 0
    for need, seconds in LOCK_STEPS:
        if fails >= need:
            pause = seconds
            break
    until = (datetime.now(timezone.utc) + timedelta(seconds=pause)).isoformat(
        timespec="seconds") if pause else None
    conn().execute("UPDATE tutors SET failed_logins=?, locked_until=? WHERE id=?",
                   (fails, until, tutor_id))
    conn().commit()
    return pause


def clear_failed_logins(tutor_id):
    conn().execute(
        "UPDATE tutors SET failed_logins=0, locked_until=NULL WHERE id=?", (tutor_id,))
    conn().commit()


def new_recovery_code():
    """Код восстановления: три группы по четыре знака, диктуется голосом."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3))


def ensure_recovery_code(tutor_id):
    row = conn().execute("SELECT recovery_code FROM tutors WHERE id=?", (tutor_id,)).fetchone()
    if row and row["recovery_code"]:
        return row["recovery_code"]
    code = new_recovery_code()
    conn().execute("UPDATE tutors SET recovery_code=? WHERE id=?", (code, tutor_id))
    conn().commit()
    return code


def get_tutor_by_recovery(code):
    code = str(code or "").strip().upper()
    if len(code) < 8:
        return None
    return conn().execute(
        "SELECT * FROM tutors WHERE recovery_code=?", (code,)).fetchone()


def set_tutor_password(tutor_id, password):
    """Меняем пароль и выдаём новый токен: старые сессии должны отвалиться,
    иначе смена пароля после утечки ничего не даёт."""
    pass_hash, salt = hash_password(password)
    token = new_token()
    conn().execute(
        "UPDATE tutors SET pass_hash=?, pass_salt=?, token=?, failed_logins=0,"
        " locked_until=NULL, pass_changed_at=? WHERE id=?",
        (pass_hash, salt, token, now(), tutor_id))
    conn().commit()
    return token


WEAK_PASSWORDS = {
    "password", "123456", "12345678", "qwerty", "111111", "123456789",
    "parol123", "qwerty123", "1q2w3e4r", "123123", "000000", "iloveyou",
    "пароль", "йцукен", "secret123", "admin123",
}


def password_problem(password):
    """Возвращает текст проблемы или None. Требования мягкие: репетитор —
    не сисадмин, слишком жёсткие правила приведут к паролю на бумажке."""
    p = str(password or "")
    if len(p) < 8:
        return "Пароль должен быть хотя бы из 8 символов."
    if p.lower() in WEAK_PASSWORDS:
        return "Этот пароль слишком известный — подберут за секунду."
    if p.isdigit():
        return "Только из цифр — ненадёжно. Добавь буквы."
    return None


# ---------- подтверждение почты ----------

VERIFY_TTL = 30 * 60      # код живёт полчаса
VERIFY_RESEND = 60        # не чаще раза в минуту
VERIFY_MAX_TRIES = 8      # столько попыток ввода на один код


def new_verify_code():
    # шестизначный, диктуется голосом и легко вводится на телефоне
    return "".join(secrets.choice("0123456789") for _ in range(6))


def set_verify_code(tutor_id):
    code = new_verify_code()
    conn().execute(
        "UPDATE tutors SET verify_code=?, verify_sent_at=?, verify_tries=0 WHERE id=?",
        (code, now(), tutor_id))
    conn().commit()
    return code


def seconds_since_verify_sent(row):
    keys = row.keys()
    if "verify_sent_at" not in keys or not row["verify_sent_at"]:
        return None
    sent = _parse_ts(row["verify_sent_at"])
    if not sent:
        return None
    return (datetime.now(timezone.utc) - sent).total_seconds()


def check_verify_code(tutor_id, code):
    """Возвращает (успех, текст ошибки)."""
    row = conn().execute("SELECT * FROM tutors WHERE id=?", (tutor_id,)).fetchone()
    if not row:
        return False, "Кабинет не найден."
    if row["email_verified"]:
        return True, None
    if not row["verify_code"]:
        return False, "Код не запрашивали. Нажми «Отправить ещё раз»."
    age = seconds_since_verify_sent(row)
    if age is None or age > VERIFY_TTL:
        return False, "Код устарел. Запроси новый."
    if (row["verify_tries"] or 0) >= VERIFY_MAX_TRIES:
        return False, "Слишком много попыток. Запроси новый код."
    if not secrets.compare_digest(str(code or "").strip().encode("utf-8"),
                                  str(row["verify_code"]).encode("utf-8")):
        conn().execute("UPDATE tutors SET verify_tries=verify_tries+1 WHERE id=?", (tutor_id,))
        conn().commit()
        left = VERIFY_MAX_TRIES - (row["verify_tries"] or 0) - 1
        return False, "Код не подошёл. Осталось попыток: %d." % max(0, left)
    conn().execute(
        "UPDATE tutors SET email_verified=1, verify_code=NULL, verify_tries=0 WHERE id=?",
        (tutor_id,))
    conn().commit()
    return True, None


def is_verified(row):
    keys = row.keys()
    return bool(row["email_verified"]) if "email_verified" in keys else True


# ---------- сброс пароля кодом с почты ----------
# Код восстановления, который показывается один раз при регистрации, никуда
# не девается — но его теряют. Это второй путь, для тех, у кого доступ к почте
# есть, а бумажки с кодом нет.

RESET_TTL = 30 * 60        # столько же, сколько у кода подтверждения
RESET_RESEND = 60          # не чаще раза в минуту — чтобы почтой не заваливали
RESET_MAX_TRIES = 8


def set_reset_code(tutor_id):
    code = new_verify_code()   # тот же формат: шесть цифр, диктуется голосом
    conn().execute(
        "UPDATE tutors SET reset_code=?, reset_sent_at=?, reset_tries=0 WHERE id=?",
        (code, now(), tutor_id))
    conn().commit()
    return code


def seconds_since_reset_sent(row):
    keys = row.keys()
    if "reset_sent_at" not in keys or not row["reset_sent_at"]:
        return None
    sent = _parse_ts(row["reset_sent_at"])
    if not sent:
        return None
    return (datetime.now(timezone.utc) - sent).total_seconds()


def reset_password_by_code(email, code, new_password):
    """Возвращает (успех, текст ошибки).

    Ошибку про несуществующую почту наружу НЕ отдаём: иначе форма сброса
    превращается в проверялку «есть ли у вас такой клиент». Отвечаем так же,
    как при неверном коде."""
    row = get_tutor_by_email(email)
    generic = "Код не подошёл или устарел. Запросите новый."
    if not row:
        return False, generic
    if not row["reset_code"]:
        return False, generic
    age = seconds_since_reset_sent(row)
    if age is None or age > RESET_TTL:
        return False, "Код устарел — он живёт 30 минут. Запросите новый."
    if (row["reset_tries"] or 0) >= RESET_MAX_TRIES:
        return False, "Слишком много попыток. Запросите новый код."
    if not secrets.compare_digest(str(code or "").strip().encode("utf-8"),
                                  str(row["reset_code"]).encode("utf-8")):
        conn().execute("UPDATE tutors SET reset_tries=reset_tries+1 WHERE id=?", (row["id"],))
        conn().commit()
        left = RESET_MAX_TRIES - (row["reset_tries"] or 0) - 1
        return False, "Код не подошёл. Осталось попыток: %d." % max(0, left)
    problem = password_problem(new_password)
    if problem:
        return False, problem
    pass_hash, salt = hash_password(new_password)
    # Токен меняем обязательно: если пароль сбрасывают потому, что доступ
    # увели, старая сессия угонщика обязана оборваться.
    new_tok = new_token()
    conn().execute(
        "UPDATE tutors SET pass_hash=?, pass_salt=?, token=?, pass_changed_at=?,"
        " reset_code=NULL, reset_tries=0 WHERE id=?",
        (pass_hash, salt, new_tok, now(), row["id"]))
    conn().commit()
    return True, None


# ---------- тарифы ----------

# Базовый тариф покрывает сайт и чат с Савелием. Чат дешёвый и предсказуемый:
# ~1300 входных токенов на сообщение, при 100 сообщениях в месяц это 2–18 ₽
# с ученика в зависимости от модели.
#
# Проверка фото тетради стоит на порядок дороже (Sonnet 5, картинка целиком),
# поэтому она вынесена в отдельную подписку — см. CHECK_PACKS. Пока она была
# внутри базового тарифа, активный ученик съедал прибыль от пяти обычных.
#
# «Практика» стоит 1299, а не 1399, потому что Старт + 5 доплат = 1394:
# при более высокой цене plan_for_count честно выбирал бы связку подешевле,
# и тариф просто никогда не показывался бы.
PLANS = [
    {"id": "start",    "limit": 5,  "price": 799,  "name": "Старт"},
    {"id": "practice", "limit": 10, "price": 1299, "name": "Практика"},
    # 2399, а не 2499, по той же причине: Практика + 10 доплат = 2489,
    # и при более высокой цене «Школа» тоже осталась бы мёртвым тарифом
    {"id": "school",   "limit": 20, "price": 2399, "name": "Школа"},
    {"id": "pro",      "limit": 50, "price": 4990, "name": "Профи"},
]
TRIAL_DAYS = 3
EXTRA_STUDENT_PRICE = 119

# ---------- защита от бесконечного триала ----------
# Три дня заканчиваются — заводишь новую почту и получаешь ещё три.
# Почта бесплатна и бесконечна, поэтому считаем не почты, а устройства.
#
# Чего эта защита СОЗНАТЕЛЬНО не делает:
#
# 1. Не трогает учеников. Они не платят, и они как раз сидят с одного
#    устройства по-настоящему — класс за одним компьютером, двое детей
#    на планшете. Ограничить их значило бы сломать живых ради защиты от
#    того, чего они не делают.
# 2. Не запрещает ВХОД. Ограничение только на регистрацию: иначе человек,
#    сменивший ноутбук, теряет оплаченный кабинет.
# 3. Не блокирует наглухо. Идентификатор устройства лежит в localStorage
#    и стирается в два клика, режим инкогнито обходит его сходу — строить
#    на нём запрет значит запереть честных и не задержать хитрых. Поэтому
#    второй кабинет с того же устройства ЗАВЕДЁТСЯ, но БЕЗ триала: платить
#    с первого дня. Ровно то, что мы и защищаем, — бесплатные дни.
#
# IP считаем отдельно и мягче: за одним адресом сидит вся школа или семья,
# и запрет по нему бьёт по нескольким репетиторам сразу.
SIGNUP_IP_LIMIT = 3        # регистраций с одного адреса за сутки
SIGNUP_IP_WINDOW_H = 24

# ---------- проверка домашек ----------

# Цена за ОДНОГО ученика в месяц. Три цены в "price" — это скидка за объём:
# до 10 учеников, от 10 и от 20. Себестоимость одной проверки 1–5 ₽
# (1–5 фото по 1,04 ₽), так что маржа держится в 44–58% даже если каждый
# ученик шлёт по пять снимков на каждую домашку.
CHECK_PACKS = [
    {"id": "light",  "limit": 8,  "price": (99, 89, 79),    "name": "Лёгкая"},
    {"id": "normal", "limit": 12, "price": (149, 129, 119), "name": "Обычная"},
    {"id": "dense",  "limit": 16, "price": (199, 169, 149), "name": "Плотная"},
]
DEFAULT_CHECK_PACK = "normal"
EXTRA_CHECK_PRICE = 19   # за проверку сверх лимита пакета
SINGLE_CHECK_PRICE = 29  # разовая проверка без подписки


# ---------- видеоурок ----------
# Ссылка на комнату у репетитора СВОЯ. Мы её не создаём и не хостим.
#
# Почему так, а не встроенное видео. Посчитал стоимость на Daily.co
# (10 000 бесплатных участнико-минут в месяц, дальше $0,004 за минуту),
# при двух участниках и восьми уроках по 45 минут на ученика:
#
#   тариф      учеников   цена ₽   мин/мес   ₽ за видео   доля цены
#   Старт          5        799      3600         0           0%
#   Практика      10       1299      7200         0           0%
#   Школа         20       2399     14400      1549          65%
#   Профи         50       4990     36000      9152         183%
#
# То есть на старших тарифах видео стоит дороже самой подписки. Строить
# на этом основную функцию — значит продавать себе в убыток тем сильнее,
# чем крупнее клиент. Поэтому: ссылка репетитора, ноль расходов, работает
# сегодня. У любого репетитора уже есть Zoom или Телемост, ему не нужен
# двадцать первый видеосервис — ему нужно, чтобы ученик нажал одну кнопку
# и попал куда надо.
LESSON_OPEN_MINUTES = 90   # столько ученик видит «идёт урок» после нажатия


def set_lesson_url(tutor_id, url):
    """Сохраняет ссылку на комнату. Пустая строка — убрать ссылку."""
    conn().execute("UPDATE tutors SET lesson_url=? WHERE id=?",
                   (str(url or "").strip()[:500], tutor_id))
    conn().commit()


def open_lesson(tutor_id, on=True):
    conn().execute("UPDATE tutors SET lesson_open_at=? WHERE id=?",
                   (now() if on else None, tutor_id))
    conn().commit()


def lesson_state(tutor_row):
    """Что показать ученику: адрес комнаты и идёт ли урок прямо сейчас."""
    keys = tutor_row.keys()
    url = (tutor_row["lesson_url"] if "lesson_url" in keys else "") or ""
    if not url:
        return {"url": "", "live": False}
    opened = tutor_row["lesson_open_at"] if "lesson_open_at" in keys else None
    live = False
    if opened:
        started = _parse_ts(opened)
        if started:
            mins = (datetime.now(timezone.utc) - started).total_seconds() / 60
            live = 0 <= mins <= LESSON_OPEN_MINUTES
    # Ссылку отдаём всегда: ученик может опоздать, а урок уже идти. Флаг
    # live управляет только тем, насколько громко зовёт кнопка.
    return {"url": url, "live": live}
PHOTOS_PER_CHECK = 5     # больше пяти снимков на одну домашку не принимаем
CHAT_MONTHLY_LIMIT = 150  # fair-use: отрезает хвост, обычный ученик не заметит


def check_pack_by_id(pack_id):
    for p in CHECK_PACKS:
        if p["id"] == pack_id:
            return p
    return None


def check_pack_price(pack, student_count):
    """Цена пакета за одного ученика с учётом скидки за объём."""
    n = max(0, int(student_count or 0))
    tier = 2 if n >= 20 else 1 if n >= 10 else 0
    return pack["price"][tier]


def _period():
    """Календарный месяц как метка счётчика: '2026-08'."""
    return datetime.now(timezone.utc).strftime("%Y-%m")


def check_state(student_id):
    """Сколько проверок домашек осталось у ученика в этом месяце.

    Счётчик сбрасывается лениво — при первом обращении в новом месяце,
    чтобы не заводить отдельную задачу в cron ради одной цифры."""
    row = conn().execute(
        "SELECT s.check_pack, s.checks_used, s.checks_extra, s.checks_period,"
        "       t.checks_free "
        "FROM students s JOIN tutors t ON t.id = s.tutor_id WHERE s.id=?",
        (student_id,)).fetchone()
    if not row:
        return None

    fresh = row["checks_period"] == _period()
    used = (row["checks_used"] or 0) if fresh else 0
    extra = (row["checks_extra"] or 0) if fresh else 0
    free = bool(row["checks_free"])
    pack = check_pack_by_id(row["check_pack"])

    if free:
        # Репетиторы, у которых проверка была включена в базовый тариф,
        # получают самый большой пакет — но не безлимит: без потолка один
        # сломанный клиент способен выесть месячный бюджет на ИИ.
        limit = CHECK_PACKS[-1]["limit"]
    elif pack:
        limit = pack["limit"]
    else:
        limit = 0

    # Небольшой овердрафт: обрывать ученика на середине домашки хуже,
    # чем доплатить за него 19 ₽ и показать это репетитору в счёте.
    overdraft = limit // 2 if limit else 0

    return {
        "free": free,
        "pack": pack["id"] if pack else None,
        "packName": pack["name"] if pack else None,
        "used": used,
        "limit": limit,
        "left": max(0, limit - used),
        "extra": extra,
        "overdraftLeft": max(0, limit + overdraft - used),
        "extraPrice": EXTRA_CHECK_PRICE,
        "maxPhotos": PHOTOS_PER_CHECK,
    }


def use_check(student_id):
    """Списывает одну проверку. Возвращает (можно, состояние, причина).

    Причина заполняется только при отказе — её текст уходит ученику."""
    st = check_state(student_id)
    if st is None:
        return False, None, "Ученик не найден."
    if st["limit"] <= 0:
        return False, st, ("Проверка домашек не подключена. "
                           "Попроси репетитора включить её в панели.")
    if st["overdraftLeft"] <= 0:
        return False, st, ("Проверки на этот месяц закончились. "
                           "Репетитор может докупить пакет побольше — "
                           "или подожди 1-го числа, лимит обновится.")

    over = st["used"] >= st["limit"]   # уходим за лимит — это платная проверка
    conn().execute(
        "UPDATE students SET checks_used=?, checks_extra=?, checks_period=? WHERE id=?",
        (st["used"] + 1, st["extra"] + (1 if over else 0), _period(), student_id))
    conn().commit()
    return True, check_state(student_id), None


def refund_check(student_id):
    """Возвращает списанную проверку, если разбор сорвался (нет ключа, упал
    запрос). Ученик не должен платить за то, что не сработало."""
    st = check_state(student_id)
    if not st or st["used"] <= 0:
        return
    over = st["used"] > st["limit"]   # снимали как платную — её и возвращаем
    conn().execute(
        "UPDATE students SET checks_used=?, checks_extra=? WHERE id=?",
        (st["used"] - 1, max(0, st["extra"] - (1 if over else 0)), student_id))
    conn().commit()


def chat_state(student_id):
    """Fair-use по чату. Отрезает только хвост: обычный ученик
    до потолка не доходит и ничего не замечает."""
    row = conn().execute(
        "SELECT chat_used, chat_period FROM students WHERE id=?", (student_id,)).fetchone()
    if not row:
        return None
    used = (row["chat_used"] or 0) if row["chat_period"] == _period() else 0
    return {"used": used, "limit": CHAT_MONTHLY_LIMIT,
            "left": max(0, CHAT_MONTHLY_LIMIT - used)}


def use_chat(student_id):
    """Списывает одно сообщение. Возвращает (можно, состояние)."""
    st = chat_state(student_id)
    if st is None:
        return False, None
    if st["left"] <= 0:
        return False, st
    conn().execute(
        "UPDATE students SET chat_used=?, chat_period=? WHERE id=?",
        (st["used"] + 1, _period(), student_id))
    conn().commit()
    return True, chat_state(student_id)


def refund_chat(student_id):
    """Запрос упал — сообщение не считаем."""
    st = chat_state(student_id)
    if st and st["used"] > 0:
        conn().execute("UPDATE students SET chat_used=? WHERE id=?",
                       (st["used"] - 1, student_id))
        conn().commit()


def set_check_pack(student_id, tutor_id, pack_id):
    """Репетитор включает или выключает проверку конкретному ученику.
    pack_id=None — выключить."""
    if pack_id and not check_pack_by_id(pack_id):
        return False, "Неизвестный пакет."
    row = conn().execute("SELECT id FROM students WHERE id=? AND tutor_id=?",
                         (student_id, tutor_id)).fetchone()
    if not row:
        return False, "Ученик не найден."
    conn().execute("UPDATE students SET check_pack=? WHERE id=?", (pack_id, student_id))
    conn().commit()
    return True, None


def checks_bill(tutor_id):
    """Счёт за проверку домашек: сколько выходит в месяц по всем ученикам."""
    free = conn().execute("SELECT checks_free FROM tutors WHERE id=?",
                          (tutor_id,)).fetchone()
    if free and free["checks_free"]:
        # Проверка досталась бесплатно навсегда — счёта нет и быть не должно,
        # иначе эти репетиторы попали бы и в выручку админки, и в счёт к оплате
        return {"students": 0, "monthly": 0, "extras": 0, "extrasCost": 0,
                "total": 0, "items": []}

    rows = conn().execute(
        "SELECT check_pack, checks_extra, checks_period FROM students WHERE tutor_id=?",
        (tutor_id,)).fetchall()
    total_students = len(rows)
    items, total, extras = [], 0, 0
    for r in rows:
        pack = check_pack_by_id(r["check_pack"])
        if pack:
            price = check_pack_price(pack, total_students)
            total += price
            items.append({"pack": pack["id"], "packName": pack["name"], "price": price})
        if r["checks_period"] == _period():
            extras += r["checks_extra"] or 0
    return {
        "students": len(items),
        "monthly": total,
        "extras": extras,
        "extrasCost": extras * EXTRA_CHECK_PRICE,
        "total": total + extras * EXTRA_CHECK_PRICE,
        "items": items,
    }


def plan_by_id(plan_id):
    for p in PLANS:
        if p["id"] == plan_id:
            return p
    return PLANS[0]


def trial_left(row):
    """Сколько часов триала осталось. 0 — кончился."""
    keys = row.keys()
    if "trial_ends_at" not in keys or not row["trial_ends_at"]:
        return 0
    end = _parse_ts(row["trial_ends_at"])
    if not end:
        return 0
    left = (end - datetime.now(timezone.utc)).total_seconds() / 3600
    return max(0, round(left, 1))


def paid_left(row):
    """Сколько дней оплачено вперёд. 0 — не оплачено."""
    keys = row.keys()
    if "paid_until" not in keys or not row["paid_until"]:
        return 0
    end = _parse_ts(row["paid_until"])
    if not end:
        return 0
    left = (end - datetime.now(timezone.utc)).total_seconds() / 86400
    return max(0, round(left, 1))


def access_state(row):
    """Что сейчас с доступом: 'paid' | 'trial' | 'expired'."""
    if paid_left(row) > 0:
        return "paid"
    if trial_left(row) > 0:
        return "trial"
    return "expired"


def start_trial(tutor_id):
    end = (datetime.now(timezone.utc) + timedelta(days=TRIAL_DAYS)).isoformat(timespec="seconds")
    conn().execute("UPDATE tutors SET trial_ends_at=? WHERE id=?", (end, tutor_id))
    conn().commit()
    return end


def set_paid_until(tutor_id, days):
    """Продлеваем от большей из дат: сегодня или уже оплаченный срок —
    иначе досрочная оплата съедала бы остаток предыдущей."""
    row = conn().execute("SELECT paid_until FROM tutors WHERE id=?", (tutor_id,)).fetchone()
    base = datetime.now(timezone.utc)
    if row and row["paid_until"]:
        cur = _parse_ts(row["paid_until"])
        if cur and cur > base:
            base = cur
    end = (base + timedelta(days=max(0, int(days or 0)))).isoformat(timespec="seconds")
    if int(days or 0) <= 0:
        end = None
    conn().execute("UPDATE tutors SET paid_until=? WHERE id=?", (end, tutor_id))
    conn().commit()
    return end


def plan_cost(plan, count):
    """Сколько всего выйдет на этом тарифе: сам тариф плюс доплата за
    места сверх лимита."""
    return plan["price"] + max(0, count - plan["limit"]) * EXTRA_STUDENT_PRICE


def plan_for_count(count):
    """Самый ДЕШЁВЫЙ вариант, а не первый подходящий.
    При 12 учениках «Практика» + 2 места = 1637 ₽ выгоднее «Школы» за 2499 ₽,
    и предлагать переплату было бы нечестно."""
    count = max(0, int(count or 0))
    return min(PLANS, key=lambda p: (plan_cost(p, count), p["limit"]))


def set_plan_by_count(tutor_id, count):
    plan = plan_for_count(max(0, int(count or 0)))
    limit = max(plan["limit"], int(count or 0))
    conn().execute("UPDATE tutors SET plan=?, student_limit=? WHERE id=?",
                   (plan["id"], limit, tutor_id))
    conn().commit()
    return plan


def student_count(tutor_id):
    return conn().execute(
        "SELECT COUNT(*) FROM students WHERE tutor_id=?", (tutor_id,)).fetchone()[0]


def can_add_student(tutor_row):
    keys = tutor_row.keys()
    limit = (tutor_row["student_limit"] if "student_limit" in keys else 5) or 5
    return student_count(tutor_row["id"]) < limit, limit


def raise_student_limit(tutor_id, extra=1):
    conn().execute(
        "UPDATE tutors SET student_limit = COALESCE(student_limit, 5) + ? WHERE id=?",
        (max(1, int(extra)), tutor_id))
    conn().commit()


# ---------- админка владельца ----------

# Пароль админа лежит файлом рядом с базой, а не в коде и не в git:
# админка видит всех репетиторов, всех детей и всю переписку.
ADMIN_SESSION_TTL = 8 * 3600
_ADMIN_FAILS = {"count": 0, "until": None}


def admin_password():
    path = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), "admin.txt")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def admin_lock_left():
    until = _ADMIN_FAILS.get("until")
    if not until:
        return 0
    left = (until - datetime.now(timezone.utc)).total_seconds()
    return int(left) if left > 0 else 0


def admin_login(password):
    """(токен, ошибка). Перебор пароля админки блокируется жёстче, чем у
    репетитора: тут одна попытка стоит доступа ко всей базе."""
    real = admin_password()
    if not real:
        return None, "Админка не настроена: нет файла admin.txt."
    left = admin_lock_left()
    if left:
        return None, "Вход закрыт. Попробуй через %d сек." % left
    # Сравниваем байты, а не строки: compare_digest на строке с кириллицей
    # бросает TypeError, и пароль на русском просто не работал бы
    if not secrets.compare_digest(str(password or "").encode("utf-8"), real.encode("utf-8")):
        _ADMIN_FAILS["count"] += 1
        if _ADMIN_FAILS["count"] >= 3:
            _ADMIN_FAILS["until"] = datetime.now(timezone.utc) + timedelta(minutes=15)
            _ADMIN_FAILS["count"] = 0
            return None, "Три неудачи. Вход закрыт на 15 минут."
        return None, "Неверный пароль."
    _ADMIN_FAILS["count"] = 0
    _ADMIN_FAILS["until"] = None
    token = new_token()
    conn().execute("INSERT INTO admin_sessions (token, created_at) VALUES (?,?)",
                   (token, now()))
    conn().execute("DELETE FROM admin_sessions WHERE created_at < ?",
                   ((datetime.now(timezone.utc) - timedelta(seconds=ADMIN_SESSION_TTL))
                    .isoformat(timespec="seconds"),))
    conn().commit()
    return token, None


def admin_check(token):
    if not token:
        return False
    row = conn().execute("SELECT created_at FROM admin_sessions WHERE token=?",
                         (token,)).fetchone()
    if not row:
        return False
    made = _parse_ts(row["created_at"])
    if not made or (datetime.now(timezone.utc) - made).total_seconds() > ADMIN_SESSION_TTL:
        conn().execute("DELETE FROM admin_sessions WHERE token=?", (token,))
        conn().commit()
        return False
    return True


def admin_logout(token):
    conn().execute("DELETE FROM admin_sessions WHERE token=?", (token,))
    conn().commit()


def admin_overview():
    c = conn()
    week = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    tutors = c.execute("SELECT COUNT(*) FROM tutors").fetchone()[0]
    students = c.execute("SELECT COUNT(*) FROM students").fetchone()[0]
    verified = c.execute("SELECT COUNT(*) FROM tutors WHERE email_verified=1").fetchone()[0]
    photos = c.execute("SELECT COUNT(*) FROM photo_homework WHERE archived=0").fetchone()[0]
    homework = c.execute("SELECT COUNT(*) FROM homework WHERE archived=0").fetchone()[0]

    active = 0
    for r in c.execute("SELECT activity FROM students"):
        try:
            days = json.loads(r["activity"] or "{}")
        except (ValueError, TypeError):
            days = {}
        if any(d >= week for d in days):
            active += 1

    base_revenue, checks_revenue = 0, 0
    for r in c.execute("SELECT id, plan, student_limit, paid_until FROM tutors"):
        if not r["paid_until"]:
            continue
        plan = plan_by_id(r["plan"] or "trial")
        limit = r["student_limit"] or plan["limit"]
        extra = max(0, limit - plan["limit"])
        base_revenue += plan["price"] + extra * EXTRA_STUDENT_PRICE
        checks_revenue += checks_bill(r["id"])["total"]
    revenue = base_revenue + checks_revenue

    # Себестоимость больше не гадаем: сообщения чата и проверки фото теперь
    # считаются в базе. Цены на август 2026 — Haiku 4.5 по 1/5 $ за миллион
    # токенов (~700 входных на сообщение) и Sonnet 5 на картинке 1100 пикселей.
    msgs = c.execute("SELECT COALESCE(SUM(chat_used),0) FROM students "
                     "WHERE chat_period=?", (_period(),)).fetchone()[0]
    checks = c.execute("SELECT COALESCE(SUM(checks_used),0) FROM students "
                       "WHERE checks_period=?", (_period(),)).fetchone()[0]
    ai_cost = round(checks * 1.04 + msgs * 0.16, 1)

    return {
        "tutors": tutors, "verified": verified, "students": students,
        "activeWeek": active, "photos": photos, "homework": homework,
        "revenue": revenue, "baseRevenue": base_revenue,
        "checksRevenue": checks_revenue,
        "chatMessages": msgs, "checksUsed": checks,
        "aiCost": ai_cost,
        "profit": round(revenue * 0.97 - ai_cost),
    }


def admin_tutors():
    out = []
    week = (datetime.now(timezone.utc) - timedelta(days=7)).date().isoformat()
    for t in conn().execute("SELECT * FROM tutors ORDER BY id DESC"):
        plan = plan_by_id(t["plan"] or "trial")
        limit = t["student_limit"] or plan["limit"]
        kids, active, last = [], 0, ""
        for s in conn().execute(
                "SELECT id,name,level,xp,activity,created_at FROM students WHERE tutor_id=?",
                (t["id"],)):
            try:
                days = json.loads(s["activity"] or "{}")
            except (ValueError, TypeError):
                days = {}
            seen = max(days) if days else ""
            if seen >= week:
                active += 1
            last = max(last, seen)
            kids.append({"id": s["id"], "name": s["name"], "level": s["level"],
                         "xp": s["xp"], "lastSeen": seen, "days": len(days)})
        extra = max(0, limit - plan["limit"])
        out.append({
            "id": t["id"], "name": t["name"], "email": t["email"],
            "verified": bool(t["email_verified"]), "createdAt": t["created_at"],
            "plan": plan["id"], "planName": plan["name"],
            "price": plan["price"] + extra * EXTRA_STUDENT_PRICE,
            "limit": limit, "students": len(kids), "activeWeek": active,
            "lastSeen": last, "inviteCode": t["invite_code"], "kids": kids,
            "access": access_state(t), "trialHoursLeft": trial_left(t),
            "paidDaysLeft": paid_left(t),
        })
    return out


def admin_set_plan(tutor_id, plan_id, limit):
    plan = plan_by_id(plan_id)
    conn().execute("UPDATE tutors SET plan=?, student_limit=? WHERE id=?",
                   (plan["id"], max(1, int(limit or plan["limit"])), tutor_id))
    conn().commit()


def admin_set_verified(tutor_id, value):
    conn().execute("UPDATE tutors SET email_verified=? WHERE id=?",
                   (1 if value else 0, tutor_id))
    conn().commit()


def admin_delete_tutor(tutor_id):
    """Удаляем вместе со всем, что к нему привязано — включая файлы фото."""
    c = conn()
    for r in c.execute("SELECT file_name FROM photo_homework WHERE tutor_id=?", (tutor_id,)):
        full = photo_path(r["file_name"])
        if full:
            try:
                os.remove(full)
            except OSError:
                pass
    for table in ("photo_homework", "homework", "notes_to_students", "students", "groups"):
        c.execute("DELETE FROM %s WHERE tutor_id=?" % table, (tutor_id,))
    c.execute("DELETE FROM tutors WHERE id=?", (tutor_id,))
    c.commit()


def create_reading_result(tutor_id, student_id, homework_id, score, result):
    """Чтение вслух храним в той же таблице, что и фото: для репетитора
    это одна лента «что прислал ученик», и разделять её незачем."""
    cur = conn().execute(
        "INSERT INTO photo_homework (tutor_id, student_id, homework_id, file_name,"
        " comment, check_status, check_result, kind, reading_score, created_at)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (tutor_id, student_id, homework_id, "", "", "done",
         json.dumps(result, ensure_ascii=False), "reading", score, now()),
    )
    conn().commit()
    return get_photo(cur.lastrowid)


# ---------- уведомления репетитору ----------

# Письмо на каждое фото — верный способ, чтобы репетитор отписался от
# уведомлений в первый же день. Шлём не чаще раза в час и сразу пишем,
# сколько всего накопилось.
NOTIFY_GAP = 3600


def notify_due(tutor_id):
    """(нужно ли слать, сколько непросмотренного). Отметку ставим сразу,
    чтобы параллельные запросы не отправили два письма."""
    row = conn().execute(
        "SELECT notified_at FROM tutors WHERE id=?", (tutor_id,)).fetchone()
    if not row:
        return False, 0
    last = _parse_ts(row["notified_at"]) if row["notified_at"] else None
    if last and (datetime.now(timezone.utc) - last).total_seconds() < NOTIFY_GAP:
        return False, 0
    unseen = conn().execute(
        "SELECT COUNT(*) FROM photo_homework WHERE tutor_id=? AND seen_by_tutor=0"
        " AND archived=0", (tutor_id,)).fetchone()[0]
    if not unseen:
        return False, 0
    conn().execute("UPDATE tutors SET notified_at=? WHERE id=?", (now(), tutor_id))
    conn().commit()
    return True, unseen
