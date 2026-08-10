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
from datetime import datetime, timezone

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "savely.db")
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

CREATE TABLE IF NOT EXISTS students (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    name         TEXT NOT NULL,
    token        TEXT NOT NULL UNIQUE,
    level        TEXT,
    vocab        INTEGER DEFAULT 0,
    xp           INTEGER DEFAULT 0,
    streak       INTEGER DEFAULT 0,
    blitz_best   INTEGER DEFAULT 0,
    dictionary   TEXT DEFAULT '[]',
    activity     TEXT DEFAULT '{}',
    created_at   TEXT NOT NULL,
    last_seen    TEXT
);

CREATE TABLE IF NOT EXISTS homework (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    student_id   INTEGER REFERENCES students(id),
    title        TEXT NOT NULL,
    words        TEXT NOT NULL DEFAULT '[]',
    due_date     TEXT,
    created_at   TEXT NOT NULL,
    archived     INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_students_tutor ON students(tutor_id);
CREATE INDEX IF NOT EXISTS idx_homework_tutor ON homework(tutor_id);
"""


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
    conn().executescript(SCHEMA)
    conn().commit()


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
        "INSERT INTO tutors (name, email, pass_hash, pass_salt, invite_code, token, created_at)"
        " VALUES (?,?,?,?,?,?,?)",
        (name.strip(), email, pass_hash, salt, code, token, now()),
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
    row = get_tutor_by_email(email)
    if not row or not check_password(password, row["pass_hash"], row["pass_salt"]):
        return None
    return row


# ---------- ученики ----------

def create_student(tutor_id, name):
    token = new_token()
    # last_seen остаётся пустым до первого занятия — иначе репетитор
    # увидит «был сегодня» у ученика, который только перешёл по ссылке
    cur = conn().execute(
        "INSERT INTO students (tutor_id, name, token, created_at) VALUES (?,?,?,?)",
        (tutor_id, name.strip()[:40], token, now()),
    )
    conn().commit()
    return get_student_by_id(cur.lastrowid)


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


def sync_student(token, state):
    """Принимает снимок состояния из браузера ученика."""
    row = get_student_by_token(token)
    if not row:
        return None
    dictionary = state.get("dictionary") or []
    if not isinstance(dictionary, list):
        dictionary = []
    activity = state.get("activity") or {}
    if not isinstance(activity, dict):
        activity = {}
    conn().execute(
        "UPDATE students SET level=?, vocab=?, xp=?, streak=?, blitz_best=?,"
        " dictionary=?, activity=?, last_seen=? WHERE id=?",
        (
            str(state.get("level") or "")[:4] or None,
            int(state.get("vocabEstimate") or 0),
            int(state.get("xp") or 0),
            int(state.get("streak") or 0),
            int(state.get("blitzBest") or 0),
            json.dumps(dictionary[:500], ensure_ascii=False),
            json.dumps(activity, ensure_ascii=False),
            now(),
            row["id"],
        ),
    )
    conn().commit()
    return get_student_by_id(row["id"])


def delete_student(tutor_id, student_id):
    conn().execute("DELETE FROM homework WHERE student_id=?", (student_id,))
    conn().execute("DELETE FROM students WHERE id=? AND tutor_id=?", (student_id, tutor_id))
    conn().commit()


# ---------- домашка ----------

def create_homework(tutor_id, title, words, student_id=None, due_date=None):
    cur = conn().execute(
        "INSERT INTO homework (tutor_id, student_id, title, words, due_date, created_at)"
        " VALUES (?,?,?,?,?,?)",
        (
            tutor_id,
            student_id,
            title.strip()[:120] or "Домашка",
            json.dumps(words[:100], ensure_ascii=False),
            due_date,
            now(),
        ),
    )
    conn().commit()
    return conn().execute("SELECT * FROM homework WHERE id=?", (cur.lastrowid,)).fetchone()


def list_homework(tutor_id, student_id=None, include_archived=False):
    sql = "SELECT * FROM homework WHERE tutor_id=?"
    args = [tutor_id]
    if student_id is not None:
        sql += " AND (student_id IS NULL OR student_id=?)"
        args.append(student_id)
    if not include_archived:
        sql += " AND archived=0"
    sql += " ORDER BY created_at DESC"
    return conn().execute(sql, args).fetchall()


def archive_homework(tutor_id, hw_id):
    conn().execute(
        "UPDATE homework SET archived=1 WHERE id=? AND tutor_id=?", (hw_id, tutor_id)
    )
    conn().commit()


# ---------- сериализация для API ----------

def student_public(row, homework=None):
    """Данные ученика для панели репетитора: прогресс + выполнение домашки."""
    dictionary = json.loads(row["dictionary"] or "[]")
    learned = [d for d in dictionary if d.get("status") == "learned"]
    learning = [d for d in dictionary if d.get("status") == "learning"]
    fresh = [d for d in dictionary if d.get("status") == "new"]
    # слова, где ошибок больше чем успехов — на них репетитору стоит посмотреть
    weak = sorted(
        [d for d in dictionary if (d.get("forgot") or 0) > 0],
        key=lambda d: (d.get("forgot") or 0) - (d.get("knew") or 0),
        reverse=True,
    )[:8]
    activity = json.loads(row["activity"] or "{}")
    data = {
        "id": row["id"],
        "name": row["name"],
        "level": row["level"],
        "vocab": row["vocab"],
        "xp": row["xp"],
        "streak": row["streak"],
        "blitzBest": row["blitz_best"],
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
    if homework is not None:
        known = {str(d.get("w", "")).lower(): d for d in dictionary}
        tasks = []
        for hw in homework:
            words = json.loads(hw["words"] or "[]")
            done = 0
            for w in words:
                d = known.get(str(w.get("w", "")).lower())
                if d and d.get("status") == "learned":
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
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "inviteCode": row["invite_code"],
        "createdAt": row["created_at"],
    }
