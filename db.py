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
    ("tutors", "student_limit", "INTEGER DEFAULT 5"),
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
    for table, column, decl in MIGRATIONS:
        have = {r["name"] for r in c.execute(f"PRAGMA table_info({table})")}
        if column not in have:
            c.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
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

def create_tutor(name, email, password):
    email = email.strip().lower()
    if get_tutor_by_email(email):
        return None
    pass_hash, salt = hash_password(password)
    code = new_invite_code()
    while conn().execute("SELECT 1 FROM tutors WHERE invite_code=?", (code,)).fetchone():
        code = new_invite_code()
    token = new_token()
    cur = conn().execute(
        "INSERT INTO tutors (name, email, pass_hash, pass_salt, invite_code, token,"
        " created_at, recovery_code) VALUES (?,?,?,?,?,?,?,?)",
        (name.strip(), email, pass_hash, salt, code, token, now(), new_recovery_code()),
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
        })
    clean_activity = {}
    # берём ПОСЛЕДНИЕ дни: срез сначала выбрасывал бы свежую активность
    # и обнулял «очки за неделю» в панели репетитора
    for k, v in sorted(activity.items())[-400:]:
        if isinstance(k, str) and len(k) <= 12:
            clean_activity[k] = _as_int(v, 0, 0, 100000)
    conn().execute(
        "UPDATE students SET level=?, vocab=?, xp=?, streak=?, blitz_best=?,"
        " dictionary=?, activity=?, achievements=?, goal=?, last_seen=? WHERE id=?",
        (
            str(state.get("level") or "")[:4] or None,
            _as_int(state.get("vocabEstimate"), 0, 0, 100000),
            _as_int(state.get("xp"), 0, 0, 10_000_000),
            _as_int(state.get("streak"), 0, 0, 3650),
            _as_int(state.get("blitzBest"), 0, 0, 100000),
            json.dumps(clean_dict, ensure_ascii=False),
            json.dumps(clean_activity, ensure_ascii=False),
            json.dumps([str(a)[:40] for a in achievements[:100]], ensure_ascii=False),
            _as_int(state.get("goal"), 50, 10, 500),
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
    }


def set_student_note(tutor_id, student_id, note):
    conn().execute("UPDATE students SET note=? WHERE id=? AND tutor_id=?",
                   (str(note)[:2000], student_id, tutor_id))
    conn().commit()


def delete_student(tutor_id, student_id):
    # tutor_id обязателен в обоих запросах: без него чужой репетитор
    # мог бы удалить домашку учеников, которые ему не принадлежат
    conn().execute("DELETE FROM homework WHERE student_id=? AND tutor_id=?",
                   (student_id, tutor_id))
    conn().execute("DELETE FROM students WHERE id=? AND tutor_id=?", (student_id, tutor_id))
    conn().commit()


# ---------- домашка ----------

def create_homework(tutor_id, title, words, student_id=None, group_id=None, due_date=None):
    cur = conn().execute(
        "INSERT INTO homework (tutor_id, student_id, group_id, title, words, due_date, created_at)"
        " VALUES (?,?,?,?,?,?,?)",
        (
            tutor_id,
            student_id,
            group_id,
            title.strip()[:120] or "Домашка",
            json.dumps(words[:100], ensure_ascii=False),
            due_date,
            now(),
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
                # засчитываем первый успешный повтор, а не полное «выучено»:
                # статус learned наступает только через ~месяц по расписанию SRS
                if d and ((d.get("knew") or 0) >= 1 or d.get("status") == "learned"):
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
    plan_id = (row["plan"] if "plan" in keys else None) or "trial"
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
    out = {
        "id": row["id"],
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
    if not secrets.compare_digest(str(code or "").strip(), row["verify_code"]):
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


# ---------- тарифы ----------

# Себестоимость ученика ~10 ₽/мес (ИИ + сервер). Цены дают 10–20-кратный
# запас: рост важнее выжимания, а поддержка и развитие тоже чего-то стоят.
PLANS = [
    {"id": "trial",    "limit": 5,  "price": 0,    "name": "Пробный"},
    {"id": "start",    "limit": 15, "price": 690,  "name": "Старт"},
    {"id": "practice", "limit": 30, "price": 1290, "name": "Практика"},
    {"id": "school",   "limit": 60, "price": 1990, "name": "Школа"},
]
EXTRA_STUDENT_PRICE = 99


def plan_by_id(plan_id):
    for p in PLANS:
        if p["id"] == plan_id:
            return p
    return PLANS[0]


def plan_for_count(count):
    for p in PLANS:
        if count <= p["limit"]:
            return p
    return PLANS[-1]


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
