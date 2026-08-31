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
import time
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

-- Свои задания репетитора: конструктор «как Wordwall». Набор — это список
-- вопросов одного вида (kind): викторина с вариантами, «впиши слово»
-- с пропуском, пары для соединения. Набор живёт отдельно от домашки и
-- выдаётся ей сколько угодно раз (homework.taskset_id). Содержимое —
-- JSON: вопросы маленькие, их не больше шестидесяти, отдельная таблица
-- строк дала бы только лишние запросы.
CREATE TABLE IF NOT EXISTS tasksets (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id     INTEGER NOT NULL REFERENCES tutors(id),
    title        TEXT NOT NULL,
    kind         TEXT NOT NULL,
    items        TEXT NOT NULL DEFAULT '[]',
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    archived     INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasksets_tutor ON tasksets(tutor_id);

-- Доски для урока: рисуем и раскладываем слова прямо на сайте.
--
-- Содержимое лежит одним JSON-объектом {id объекта: {…}} в data, а не
-- отдельной таблицей на каждую наклейку. Причина простая: доска всегда
-- читается и пишется целиком, объектов на урок — сотни, а не миллионы,
-- и отдельная таблица дала бы сотни строк на выборку ради одной доски.
--
-- rev — номер версии доски, растёт на каждое изменение. По нему идёт
-- синхронизация: клиент говорит «у меня было rev=17, дай что появилось
-- позже», и получает только изменённые объекты. Так двое рисуют
-- одновременно, не перетирая работу друг друга целиком.
CREATE TABLE IF NOT EXISTS boards (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id    INTEGER NOT NULL REFERENCES tutors(id),
    title       TEXT NOT NULL,
    data        TEXT NOT NULL DEFAULT '{}',
    rev         INTEGER NOT NULL DEFAULT 0,
    shared      INTEGER NOT NULL DEFAULT 0,   -- 1: ученики видят и рисуют
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    archived    INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_boards_tutor ON boards(tutor_id);

-- PDF-книжки репетитора для доски. Сам PDF и картинки страниц лежат
-- файлами вне public_html (savely-data/books/), тут только опись.
-- Страницы рендерятся по требованию и кэшируются: заливка книги при
-- этом мгновенная, а долгий рендер размазан по листанию.
CREATE TABLE IF NOT EXISTS books (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    tutor_id    INTEGER NOT NULL REFERENCES tutors(id),
    title       TEXT NOT NULL,
    pages       INTEGER NOT NULL DEFAULT 0,
    bytes       INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_books_tutor ON books(tutor_id);

-- Сигналинг видеозвонка на доске. Само видео через сервер НЕ идёт:
-- браузеры соединяются напрямую (WebRTC), а здесь лежат только короткие
-- сообщения «сватовства» — предложение соединения, ответ и кандидаты
-- адресов. Обе стороны опрашивают таблицу тем же полингом, что и доску;
-- сообщения живут минуты и чистятся при каждой записи.
CREATE TABLE IF NOT EXISTS call_msgs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id    INTEGER NOT NULL,
    sender      TEXT NOT NULL,               -- t<id> или s<id>
    kind        TEXT NOT NULL,               -- offer / answer / ice / bye
    data        TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_board ON call_msgs(board_id, id);

-- Ограничение частоты запросов. Раньше счётчик был обычным словарём
-- в памяти процесса — и на боевом хостинге не работал ВООБЩЕ.
-- Запросы там обслуживает не один процесс, а сколько поднимет Apache,
-- у каждого свой словарь: пятнадцать запросов подряд размазывались
-- по нескольким процессам, и ни один не доходил до порога. Проверено
-- на живом сайте — 15 из 15 прошли при лимите 10.
--
-- База одна на всех, поэтому счётчик переехал сюда. Цена — одна
-- короткая запись на запрос к API; на фоне остальных обращений
-- к той же базе это незаметно.
CREATE TABLE IF NOT EXISTS rate_hits (
    k    TEXT NOT NULL,
    ts   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_hits ON rate_hits(k, ts);

-- Лог ошибок сервера. До него исключения уходили в stderr, то есть на
-- хостинге — в журнал Apache, который никто не открывает: о том, что
-- у ученика «что-то отвалилось», владелец узнавал от репетитора, а
-- чаще не узнавал вовсе. Теперь последние записи видны в админке.
--
-- Что НЕ пишем: тело запроса. В нём токены, пароли и фото тетрадей.
-- Пишем адрес ручки, тип и текст исключения, стек и — если по токену
-- удалось понять — чей это был запрос, чтобы можно было связаться.
CREATE TABLE IF NOT EXISTS errors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at   TEXT NOT NULL,
    endpoint     TEXT NOT NULL,
    status       INTEGER NOT NULL DEFAULT 500,
    message      TEXT NOT NULL DEFAULT '',
    traceback    TEXT NOT NULL DEFAULT '',
    tutor_id     INTEGER,
    student_id   INTEGER,
    ip           TEXT
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
    # Присутствие ученика на доске: когда его видели и была ли вкладка
    # свёрнута. Пишется при каждом опросе доски, читается репетитором.
    ("boards", "student_seen_at", "INTEGER DEFAULT 0"),
    ("boards", "student_hidden", "INTEGER DEFAULT 0"),
    # Кого репетитор позвал на доску. NULL — доска открыта всем ученикам
    # (прежнее поведение shared); число — только этому ученику: остальные
    # не видят кнопку на главной и не проходят авторизацию рисования.
    ("boards", "invited_student_id", "INTEGER REFERENCES students(id)"),
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
    # триала: бесплатные дни заканчиваются — регистрируешься с новой почтой и
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
    # Уровень, назначенный репетитором вручную. Отдельно от level: тот
    # приходит из клиентского снапшота каждые секунды и перетёр бы
    # назначение первым же синком. Ученик применяет назначение по отметке
    # времени и дальше сам шлёт новый уровень — поля сходятся.
    ("students", "level_forced", "TEXT"),
    ("students", "level_forced_at", "TEXT"),
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
    # ---- письма репетитору ----
    # Два переключателя, а не один: письмо «пришла работа на проверку» и
    # еженедельное «кто пропал» — разные вещи, и человек, которому не
    # нужно второе, не обязан терять первое. Оба включены по умолчанию —
    # так работало до появления переключателей, и отбирать у нынешних
    # репетиторов письма молча нельзя.
    ("tutors", "notify_work", "INTEGER DEFAULT 1"),
    ("tutors", "notify_remind", "INTEGER DEFAULT 1"),
    # Когда в последний раз считали и когда в последний раз отправляли
    # дайджест. Две даты, потому что считаем чаще, чем шлём: проверка —
    # раз в сутки, письмо — не чаще раза в неделю и только если есть что
    # сказать. Одна дата заставила бы выбирать между «редко проверяем»
    # (ученик пропал, а письмо через шесть дней) и «часто шлём».
    ("tutors", "remind_checked_at", "TEXT"),
    ("tutors", "remind_sent_at", "TEXT"),
    # Письмо «пробный период кончается завтра» — один раз за триал.
    ("tutors", "trial_warned_at", "TEXT"),
    # Почта ученика-одиночки (без репетитора) — необязательная, только
    # чтобы вернуть доступ при потерянном коде: владелец находит аккаунт
    # по почте в админке и называет код. У пришедших по ссылке репетитора
    # почты не спрашиваем — код им назовёт репетитор.
    ("students", "email", "TEXT"),
    # Пароль ученика. Раньше пароля не было принципиально: вход по ссылке
    # репетитора, возврат по личному коду. Практика показала, что код
    # теряют и не понимают («захожу в другом браузере — просит имя
    # и тест заново»), а почта с паролем — то, чего человек ждёт от входа
    # по умолчанию. Код никуда не делся и работает как раньше: пароль —
    # второй путь, а не замена.
    ("students", "pass_hash", "TEXT"),
    ("students", "pass_salt", "TEXT"),
    # Сброс пароля по коду из письма — то же, что у репетиторов.
    # Ученику это нужнее: личный код он теряет чаще, чем взрослый пароль.
    ("students", "reset_code", "TEXT"),
    ("students", "reset_sent_at", "TEXT"),
    ("students", "reset_tries", "INTEGER DEFAULT 0"),
    # ---- свои задания ----
    # Домашка может нести набор из конструктора (game = "custom").
    ("homework", "taskset_id", "INTEGER REFERENCES tasksets(id)"),
    # Результаты заданий-упражнений по домашкам: {"<homework_id>":
    # {"correct": 8, "total": 10, "at": "...", "tries": 2}}. Едет из
    # браузера ученика с синхронизацией — так же, как словарь. Нужно
    # для домашек БЕЗ слов (викторина, грамматика, словообразование):
    # у них нечего считать по словарю, а репетитор должен видеть «сдал 8/10».
    ("students", "task_results", "TEXT DEFAULT '{}'"),
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
                # свои бесплатные дни с этого момента — а не блокировку задним числом
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
    _allow_standalone_students(c)
    c.commit()


def _allow_standalone_students(c):
    """Снять NOT NULL с students.tutor_id: появились ученики БЕЗ репетитора.

    Раньше ученик без ссылки репетитора жил только в localStorage браузера:
    на сервере его не существовало, личного кода не было, и на другом
    устройстве сайт встречал его как нового — именем и тестом заново
    (владелец на это и наткнулся). Теперь одиночка — обычная строка
    students с tutor_id NULL.

    SQLite не умеет ALTER COLUMN, поэтому таблица пересобирается один раз:
    создаём копию без NOT NULL, переливаем строки, меняем местами. Запуск
    повторный безопасен — по PRAGMA видно, что ограничения уже нет.
    Выполняется ПОСЛЕ колонок-миграций: копия строится по фактическому
    списку колонок."""
    info = list(c.execute("PRAGMA table_info(students)"))
    tid = next((r for r in info if r["name"] == "tutor_id"), None)
    if not tid or not tid["notnull"]:
        if tid:
            _students_token_unique(c)   # долечиваем базы, пересобранные без него
        return
    cols = [r["name"] for r in info]
    defs = []
    for r in info:
        d = r["name"] + " " + (r["type"] or "TEXT")
        if r["pk"]:
            d += " PRIMARY KEY AUTOINCREMENT"
        elif r["notnull"] and r["name"] != "tutor_id":
            d += " NOT NULL"
        if r["dflt_value"] is not None:
            d += " DEFAULT " + str(r["dflt_value"])
        if r["name"] == "tutor_id":
            d += " REFERENCES tutors(id)"
        if r["name"] == "group_id":
            d += " REFERENCES groups(id)"
        defs.append(d)
    col_list = ", ".join(cols)
    # foreign_keys выключаем на время перестановки — иначе DROP старой
    # таблицы под ссылками падает; в конце возвращаем как было
    c.execute("PRAGMA foreign_keys=OFF")
    try:
        c.execute("DROP TABLE IF EXISTS students_rebuild")
        c.execute("CREATE TABLE students_rebuild (%s)" % ", ".join(defs))
        c.execute("INSERT INTO students_rebuild (%s) SELECT %s FROM students"
                  % (col_list, col_list))
        old_n = c.execute("SELECT COUNT(*) FROM students").fetchone()[0]
        new_n = c.execute("SELECT COUNT(*) FROM students_rebuild").fetchone()[0]
        if old_n != new_n:   # не потеряли ли кого — иначе откат
            raise RuntimeError("students rebuild mismatch: %d != %d" % (old_n, new_n))
        c.execute("DROP TABLE students")
        c.execute("ALTER TABLE students_rebuild RENAME TO students")
        c.execute("CREATE INDEX IF NOT EXISTS idx_students_tutor ON students(tutor_id)")
        _students_token_unique(c)
        c.commit()
    finally:
        c.execute("PRAGMA foreign_keys=ON")


def _students_token_unique(c):
    """UNIQUE(token) из исходной схемы. PRAGMA table_info не показывает
    уникальность, поэтому пересборка выше молча её теряла — вместе с
    индексом, по которому ученика ищут на каждом запросе. Возвращаем
    отдельным индексом, если ни одного уникального по token не осталось."""
    for idx in c.execute("PRAGMA index_list(students)"):
        if not idx["unique"]:
            continue
        cols = [r["name"] for r in c.execute('PRAGMA index_info("%s")' % idx["name"])]
        if cols == ["token"]:
            return
    c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_students_token ON students(token)")


# ---------- пароли ----------

def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return h.hex(), salt


def check_password(password, pass_hash, salt):
    h, _ = hash_password(password, salt)
    return secrets.compare_digest(h, pass_hash)


# ---------- ограничение частоты ----------

def rate_hit(key, limit, window):
    """Отметить обращение. True — можно, False — слишком часто.

    Считать надо в базе, а не в памяти: см. комментарий у таблицы
    rate_hits. Ключ приходит из server.py и складывается ТОЛЬКО из
    проверенных данных — адреса запроса и адреса клиента. Ничего
    из тела запроса в ключе быть не должно: клиент подставит туда
    новое значение и получит чистый счётчик.

    BEGIN IMMEDIATE — чтобы посчитать и записать одним куском. Без
    него два процесса читают «девять» одновременно и оба проходят
    десятый раз.
    """
    c = conn()
    edge = time.time() - window
    try:
        c.execute("BEGIN IMMEDIATE")
    except sqlite3.OperationalError:
        # база занята дольше таймаута — пропускаем, но не открываем поток
        return True
    try:
        c.execute("DELETE FROM rate_hits WHERE k=? AND ts<?", (key, edge))
        n = c.execute("SELECT COUNT(*) FROM rate_hits WHERE k=?", (key,)).fetchone()[0]
        if n >= limit:
            c.commit()
            return False
        c.execute("INSERT INTO rate_hits (k, ts) VALUES (?, ?)", (key, time.time()))
        c.commit()
        return True
    except Exception:
        c.rollback()
        # Сбой счётчика не должен ронять сам запрос: ученик не виноват,
        # что база подвисла, а урок у него идёт сейчас.
        return True


def rate_sweep(older_than=3600):
    """Уборка старых отметок. Дёргается редко — раз в сотню запросов."""
    try:
        c = conn()
        c.execute("DELETE FROM rate_hits WHERE ts<?", (time.time() - older_than,))
        c.commit()
    except Exception:
        pass


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


def create_student_standalone(name, email=None, password=None):
    """Ученик без репетитора: сам зашёл на сайт и зарегистрировался.
    Аккаунт настоящий — с токеном, личным кодом и синхронизацией, просто
    tutor_id пуст: рейтинга, домашек и фото у него нет, пока репетитор
    не появится (student_adopt).

    Пароль необязателен: пришедшему по ссылке репетитора он не нужен,
    там вход по коду. Но если человек его задал — сможет войти почтой
    и паролем на любом устройстве."""
    token = new_token()
    code = new_restore_code()
    ph, salt = hash_password(password) if password else (None, None)
    cur = conn().execute(
        "INSERT INTO students (tutor_id, name, token, restore_code, email,"
        " pass_hash, pass_salt, created_at)"
        " VALUES (NULL, ?, ?, ?, ?, ?, ?, ?)",
        (name.strip()[:60], token, code, (email or "").strip().lower()[:254] or None,
         ph, salt, now()),
    )
    conn().commit()
    return get_student_by_id(cur.lastrowid)


def student_by_email(email):
    """Ученик по почте. Почта не уникальна на уровне схемы: у родителя
    может быть двое детей на один адрес. Для входа берём того, у кого
    вообще задан пароль, и самого свежего из таких."""
    return conn().execute(
        "SELECT * FROM students WHERE lower(email)=? AND pass_hash IS NOT NULL"
        " ORDER BY id DESC LIMIT 1",
        ((email or "").strip().lower(),)).fetchone()


def email_taken_by_student(email):
    """Есть ли уже аккаунт с паролем на этот адрес — чтобы при регистрации
    сказать «войди», а не заводить второй молча."""
    return student_by_email(email) is not None


def set_student_password(student_id, password):
    ph, salt = hash_password(password)
    conn().execute("UPDATE students SET pass_hash=?, pass_salt=? WHERE id=?",
                   (ph, salt, student_id))
    conn().commit()


def set_student_email(student_id, email):
    conn().execute("UPDATE students SET email=? WHERE id=?",
                   ((email or "").strip().lower()[:254] or None, student_id))
    conn().commit()


def student_login(email, password):
    """Вход по почте и паролю. Возвращает строку ученика или None.

    Ответ намеренно одинаковый и для несуществующей почты, и для неверного
    пароля: иначе форма превращается в проверялку «есть ли такой адрес»."""
    row = student_by_email(email)
    if not row or not row["pass_hash"]:
        return None
    if not check_password(password, row["pass_hash"], row["pass_salt"]):
        return None
    return row


def adopt_student(student_id, tutor_id):
    """Привязать одиночку к репетитору — когда он позже открыл ссылку.
    Только из NULL: перепривязка между репетиторами — это спор двух
    взрослых, а не кнопка."""
    conn().execute(
        "UPDATE students SET tutor_id=? WHERE id=? AND tutor_id IS NULL",
        (tutor_id, student_id))
    conn().commit()
    return get_student_by_id(student_id)


def tutor_has_student_named(tutor_id, name):
    """Есть ли у репетитора ученик с таким именем — защита от дублей:
    ребёнок с нового устройства открывает ссылку и вводит имя заново,
    получая ПУСТОЙ второй аккаунт вместо своего прогресса."""
    row = conn().execute(
        "SELECT 1 FROM students WHERE tutor_id=? AND LOWER(name)=LOWER(?) LIMIT 1",
        (tutor_id, name.strip())).fetchone()
    return bool(row)


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

    Входов теперь два: личный код (был всегда) и почта с паролем — их
    задают здесь же. Код остаётся рабочим и после того, как пароль задан:
    у пришедших по ссылке репетитора пароля может не быть вовсе.

    Имя репетитора отдаём, адрес — нет: ученику он не нужен, а утечка
    адреса из детского кабинета — это утечка адреса.
    """
    keys = row.keys()
    tutor = get_tutor_by_id(row["tutor_id"])
    return {
        "name": row["name"],
        # Свою почту ученику показываем — он её и вводил; чужую не отдаём нигде
        "email": (row["email"] if "email" in keys else "") or "",
        "hasPassword": bool("pass_hash" in keys and row["pass_hash"]),
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

    # Результаты заданий-упражнений по домашкам (викторина, грамматика,
    # словообразование). Объединяем с прежними, лучший не понижаем.
    prev_results = json.loads((row["task_results"] if "task_results" in row.keys() else "{}") or "{}")
    task_results = clean_task_results(state.get("taskResults"), prev_results)

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
        " train_folders=?, task_results=?, last_seen=? WHERE id=?",
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
            json.dumps(task_results, ensure_ascii=False),
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
        "taskResults": json.loads((row["task_results"] if "task_results" in keys else "{}") or "{}"),
    }


STUDENT_LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")

def set_student_level(tutor_id, student_id, level):
    """Репетитор назначает ученику уровень (пустая строка — снять).

    Помимо level_forced обновляем и level: панель должна показать новый
    уровень сразу, а не после того, как ученик зайдёт и отсинкается."""
    level = str(level or "")[:4]
    if level and level not in STUDENT_LEVELS:
        return False
    if level:
        conn().execute(
            "UPDATE students SET level_forced=?, level_forced_at=?, level=?, level_set_at=?"
            " WHERE id=? AND tutor_id=?",
            (level, now(), level, now(), student_id, tutor_id))
    else:
        conn().execute(
            "UPDATE students SET level_forced='', level_forced_at=? WHERE id=? AND tutor_id=?",
            (now(), student_id, tutor_id))
    conn().commit()
    return True


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
                    due_date=None, task_text="", reading_text="", game="",
                    taskset_id=None):
    cur = conn().execute(
        "INSERT INTO homework (tutor_id, student_id, group_id, title, words, due_date,"
        " created_at, task_text, reading_text, game, taskset_id)"
        " VALUES (?,?,?,?,?,?,?,?,?,?,?)",
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
            taskset_id,
        ),
    )
    conn().commit()
    return conn().execute("SELECT * FROM homework WHERE id=?", (cur.lastrowid,)).fetchone()


def homework_kind(hw):
    """Чем домашка сдаётся — от этого зависит, как считать «сдал».

    words   — есть слова: считаем по словарю (проверенные ответы);
    task    — упражнение без слов (свой набор, грамматика,
              словообразование): считаем по task_results ученика;
    photo   — только текст задания или чтение вслух: сдаётся фото или
              записью чтения, смотреть на вкладке «Фото тетрадей».
    Слова главнее всего: если они есть, домашка словарная, что бы ещё
    к ней ни было приложено."""
    keys = hw.keys()
    if json.loads(hw["words"] or "[]"):
        return "words"
    game = (hw["game"] if "game" in keys else "") or ""
    taskset_id = hw["taskset_id"] if "taskset_id" in keys else None
    if taskset_id or game in ("grammar", "wordform", "custom"):
        return "task"
    return "photo"


# ---------- свои задания (конструктор) ----------
#
# Три вида, и это сознательно мало. Wordwall берёт десятками шаблонов, но
# репетитору английского для своих упражнений нужны три вещи: вопрос
# с вариантами (грамматика, лексика), «впиши слово» с пропуском
# (словообразование, формы глагола) и «соедини пары» (термин — значение,
# начало — конец фразы). Всё это уже умеют общие блоки runMCQ / runType /
# runPairs на стороне ученика — набор просто кормит их своими данными.
#
# Санитизация здесь, а не в JS: содержимое набора уезжает в браузер
# ученика, и оно приходит из формы репетитора. Здесь уже был хранимый XSS
# через перевод слова — второй такой же нельзя. Длины режем тоже здесь.

TASKSET_KINDS = ("quiz", "gap", "pairs")
TASKSET_MAX_ITEMS = 60
TASKSETS_PER_TUTOR = 200


def _txt(v, n):
    return " ".join(str(v if v is not None else "").split())[:n]


def clean_taskset_items(kind, items):
    """(чистые записи, ошибки). Кривые записи не выбрасываем молча —
    возвращаем понятную причину с номером, чтобы репетитор её поправил,
    а не гадал, куда делся вопрос."""
    out, errors = [], []
    if not isinstance(items, list):
        return [], ["Список заданий не распознан."]
    if len(items) > TASKSET_MAX_ITEMS:
        # Молча оставить первые шестьдесят — значит потерять хвост, о котором
        # репетитор не узнает. Пусть разобьёт на два набора сам.
        errors.append("В наборе %d заданий, а больше %d в одном не бывает — разбейте на два."
                      % (len(items), TASKSET_MAX_ITEMS))
        return [], errors
    for n, it in enumerate(items, 1):
        if not isinstance(it, dict):
            continue
        if kind == "quiz":
            q = _txt(it.get("q"), 300)
            raw = [_txt(o, 80) for o in (it.get("options") or [])]
            # Правильный — по ТЕКСТУ, а не по индексу: ниже дубликаты и пустые
            # выкидываются, и индекс из формы съезжает. Первая версия брала
            # индекс как есть — и при дубликате молча назначала правильным
            # соседний вариант, а ученика оценивала бы против него.
            try:
                ci = int(it.get("correct"))
            except (TypeError, ValueError):
                ci = -1
            correct_text = raw[ci] if 0 <= ci < len(raw) else ""
            seen, opts = set(), []
            for o in raw:
                if o and o.lower() not in seen:
                    seen.add(o.lower()); opts.append(o)
            opts = opts[:6]
            correct = next((i for i, o in enumerate(opts)
                            if correct_text and o.lower() == correct_text.lower()), -1)
            if not q:
                errors.append("Вопрос %d: пустой текст." % n); continue
            if len(opts) < 2:
                errors.append("Вопрос %d: нужно хотя бы два разных варианта." % n); continue
            if correct < 0:
                errors.append("Вопрос %d: не отмечен правильный вариант." % n); continue
            out.append({"q": q, "options": opts, "correct": correct,
                        "why": _txt(it.get("why"), 300)})
        elif kind == "gap":
            q = _txt(it.get("q"), 300)
            answer = _txt(it.get("answer"), 60)
            alt = [_txt(a, 60) for a in (it.get("alt") or []) if _txt(a, 60)][:5]
            if not q:
                errors.append("Задание %d: пустое предложение." % n); continue
            if "___" not in q:
                errors.append("Задание %d: в предложении нет пропуска ___ (три подчёркивания)." % n); continue
            if not answer:
                errors.append("Задание %d: не указан ответ." % n); continue
            out.append({"q": q, "hint": _txt(it.get("hint"), 60), "answer": answer,
                        "alt": alt, "why": _txt(it.get("why"), 300)})
        elif kind == "pairs":
            l, r = _txt(it.get("l"), 80), _txt(it.get("r"), 80)
            if not l or not r:
                errors.append("Пара %d: нужны обе половины." % n); continue
            out.append({"l": l, "r": r})
    if kind == "pairs" and 0 < len(out) < 3:
        errors.append("Для «соедини пары» нужно хотя бы три пары.")
        out = []
    return out, errors


def save_taskset(tutor_id, set_id, title, kind, items):
    """(набор, ошибка). Создание или правка — по наличию set_id."""
    if kind not in TASKSET_KINDS:
        return None, "Неизвестный вид задания."
    title = _txt(title, 100)
    if not title:
        return None, "Дайте набору название — по нему вы будете его выдавать."
    clean, errors = clean_taskset_items(kind, items)
    if errors:
        return None, " ".join(errors[:3])
    if not clean:
        return None, "Добавьте хотя бы одно задание."
    c = conn()
    if set_id:
        row = c.execute("SELECT id FROM tasksets WHERE id=? AND tutor_id=?",
                        (int(set_id), tutor_id)).fetchone()
        if not row:
            return None, "Набор не найден."
        c.execute("UPDATE tasksets SET title=?, kind=?, items=?, updated_at=?, archived=0"
                  " WHERE id=?", (title, kind, json.dumps(clean, ensure_ascii=False),
                                  now(), int(set_id)))
        c.commit()
        return get_taskset(int(set_id)), None
    n = c.execute("SELECT COUNT(*) FROM tasksets WHERE tutor_id=? AND archived=0",
                  (tutor_id,)).fetchone()[0]
    if n >= TASKSETS_PER_TUTOR:
        return None, "Больше %d наборов не завести — удалите ненужные." % TASKSETS_PER_TUTOR
    cur = c.execute(
        "INSERT INTO tasksets (tutor_id, title, kind, items, created_at, updated_at)"
        " VALUES (?,?,?,?,?,?)",
        (tutor_id, title, kind, json.dumps(clean, ensure_ascii=False), now(), now()))
    c.commit()
    return get_taskset(cur.lastrowid), None


def get_taskset(set_id):
    return conn().execute("SELECT * FROM tasksets WHERE id=?", (set_id,)).fetchone()


def list_tasksets(tutor_id):
    return conn().execute(
        "SELECT * FROM tasksets WHERE tutor_id=? AND archived=0 ORDER BY updated_at DESC",
        (tutor_id,)).fetchall()


def archive_taskset(tutor_id, set_id):
    """Прячем, не удаляем: выданные домашки продолжают ссылаться на набор,
    и ученик, у которого он на главной, должен его доделать."""
    conn().execute("UPDATE tasksets SET archived=1, updated_at=? WHERE id=? AND tutor_id=?",
                   (now(), set_id, tutor_id))
    conn().commit()


TASKSET_KIND_NAMES = {"quiz": "Викторина", "gap": "Впиши слово", "pairs": "Соедини пары"}


def taskset_public(row, with_items=True):
    items = json.loads(row["items"] or "[]")
    data = {
        "id": row["id"], "title": row["title"], "kind": row["kind"],
        "kindName": TASKSET_KIND_NAMES.get(row["kind"], row["kind"]),
        "count": len(items), "updatedAt": row["updated_at"], "createdAt": row["created_at"],
    }
    if with_items:
        data["items"] = items
    return data


# ---------- результаты заданий ----------

TASK_RESULTS_KEEP = 300


def clean_task_results(raw, prev):
    """Результаты из браузера ученика — чистим и объединяем с прежними.
    Лучший результат не понижаем: снимок с другого устройства не должен
    откатывать «8 из 10» до «3 из 10» — та же логика, что у очков."""
    out = dict(prev or {})
    if not isinstance(raw, dict):
        return out
    for k, v in list(raw.items())[:TASK_RESULTS_KEEP]:
        if not str(k).isdigit() or not isinstance(v, dict):
            continue
        total = _as_int(v.get("total"), 0, 0, 1000)
        correct = _as_int(v.get("correct"), 0, 0, total or 0)
        if not total:
            continue
        old = out.get(str(k)) or {}
        at = _txt(v.get("at"), 32) or now()
        rushed = bool(v.get("rushed"))
        secs = _as_int(v.get("secs"), 0, 0, 100000)
        first = _as_int(v.get("first"), correct, 0, total)
        if old.get("total") == total:
            # Тот же набор: лучший результат, причём честный побеждает
            # прокликанный при равном счёте; «с первого раза» — самое старое.
            oc = _as_int(old.get("correct"), 0, 0, 1000)
            if correct > oc or (correct == oc and old.get("rushed") and not rushed):
                best, b_rushed, b_secs = correct, rushed, secs
            else:
                best, b_rushed, b_secs = oc, bool(old.get("rushed")), _as_int(old.get("secs"), 0, 0, 100000)
            first = _as_int(old.get("first"), first, 0, total) if "first" in old else first
        elif old and str(old.get("at") or "") > at:
            # Размер набора другой И у сервера запись свежее — это устаревший
            # снимок с другого устройства (набор переделали, там ещё старый).
            # Иначе второе устройство ученика затирало бы новый результат старым.
            continue
        else:
            best, b_rushed, b_secs = correct, rushed, secs
        out[str(k)] = {
            "correct": best, "total": total, "rushed": b_rushed, "secs": b_secs, "first": first,
            "at": max(at, str(old.get("at") or "")),
            "tries": max(_as_int(v.get("tries"), 1, 1, 100000), _as_int(old.get("tries"), 0, 0, 100000)),
        }
    if len(out) > TASK_RESULTS_KEEP:
        # старые ключи меньше — домашки нумеруются по возрастанию
        for k in sorted(out, key=lambda x: int(x))[:len(out) - TASK_RESULTS_KEEP]:
            out.pop(k, None)
    return out


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
    # Сколько слов ждут повторения — то, чего в панели не было, хотя это
    # единственная цифра, которая говорит «ученик забросил», пока он ещё
    # заходит. Считается так же, как в письме-дайджесте (student_overdue).
    overdue, scheduled = student_overdue(dictionary)
    data = {
        "id": row["id"],
        "name": row["name"],
        "groupId": row["group_id"] if "group_id" in keys else None,
        "level": row["level"],
        "levelForced": (row["level_forced"] if "level_forced" in keys else "") or "",
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
            "overdue": overdue,
            "scheduled": scheduled,
            # Та же граница, что у письма: запустил — если просрочено от
            # REMIND_OVERDUE_MIN слов и не меньше REMIND_OVERDUE_PCT процентов
            "neglected": (overdue >= REMIND_OVERDUE_MIN
                          and overdue * 100 >= REMIND_OVERDUE_PCT * scheduled),
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
        results = json.loads((row["task_results"] if "task_results" in keys else "{}") or "{}")
        tasks = []
        for hw in homework:
            words = json.loads(hw["words"] or "[]")
            kind = homework_kind(hw)
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
            # Для заданий-упражнений (свой набор, грамматика, словообразование)
            # «сдал» — это результат из task_results, а не слова: слов у них нет.
            res = results.get(str(hw["id"])) if kind == "task" else None
            tasks.append({
                "id": hw["id"],
                "title": hw["title"],
                "kind": kind,
                "game": (hw["game"] if "game" in hw.keys() else "") or "",
                "total": len(words),
                "done": done,
                "result": ({"correct": res.get("correct", 0), "total": res.get("total", 0),
                            "at": res.get("at"), "tries": res.get("tries", 1),
                            "first": res.get("first"), "secs": res.get("secs", 0),
                            "rushed": bool(res.get("rushed"))} if res else None),
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
        "notifyWork": notify_on(row, "work"),
        "notifyRemind": notify_on(row, "remind"),
    }


def group_public(row):
    return {"id": row["id"], "name": row["name"], "color": row["color"]}


def leaderboard(student_row, limit=12):
    """Рейтинг одноклассников за неделю — виден самому ученику.
    Показываем только имя и очки: чужой прогресс по словам не раскрываем."""
    if not student_row["tutor_id"]:
        return []   # одиночка: чужих детей ему показывать нельзя и незачем
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


def set_student_reset_code(student_id):
    code = new_verify_code()   # шесть цифр, тот же формат
    conn().execute(
        "UPDATE students SET reset_code=?, reset_sent_at=?, reset_tries=0 WHERE id=?",
        (code, now(), student_id))
    conn().commit()
    return code


def student_reset_password(email, code, new_password):
    """Сброс пароля ученика по коду из письма. Возвращает (ок, ошибка, строка).

    Свойства ровно те же, что у репетиторского сброса, и по тем же
    причинам: про несуществующую почту наружу не говорим (иначе форма
    становится проверялкой чужих адресов), код живёт полчаса, попыток
    ограниченное число, а при успехе меняется токен — если пароль
    сбрасывают потому, что доступ увели, чужая сессия обязана оборваться.

    Отличие одно: у ученика может не быть пароля вовсе (пришёл по ссылке
    репетитора). Тогда сброс ЗАВОДИТ пароль — это тот же путь «войти
    с другого устройства», только через почту.
    """
    row = student_by_email_any(email)
    generic = "Код не подошёл или устарел. Запроси новый."
    if not row or not row["reset_code"]:
        return False, generic, None
    age = seconds_since_reset_sent(row)
    if age is None or age > RESET_TTL:
        return False, "Код устарел — он живёт 30 минут. Запроси новый.", None
    if (row["reset_tries"] or 0) >= RESET_MAX_TRIES:
        return False, "Слишком много попыток. Запроси новый код.", None
    if not secrets.compare_digest(str(code or "").strip().encode("utf-8"),
                                  str(row["reset_code"]).encode("utf-8")):
        conn().execute("UPDATE students SET reset_tries=reset_tries+1 WHERE id=?", (row["id"],))
        conn().commit()
        left = RESET_MAX_TRIES - (row["reset_tries"] or 0) - 1
        return False, "Код не подошёл. Осталось попыток: %d." % max(0, left), None
    problem = password_problem(new_password)
    if problem:
        return False, problem, None
    pass_hash, salt = hash_password(new_password)
    new_tok = new_token()
    conn().execute(
        "UPDATE students SET pass_hash=?, pass_salt=?, token=?,"
        " reset_code=NULL, reset_tries=0 WHERE id=?",
        (pass_hash, salt, new_tok, row["id"]))
    conn().commit()
    return True, None, get_student_by_id(row["id"])


def student_by_email_any(email):
    """Ученик по почте — БЕЗ требования, чтобы пароль уже был задан.

    student_by_email отбирает только тех, у кого пароль есть: он для
    входа. Для сброса нужен любой, кто оставил адрес, — иначе тот, кто
    пришёл по ссылке репетитора и потерял личный код, не может ничего.
    """
    return conn().execute(
        "SELECT * FROM students WHERE lower(email)=? ORDER BY id DESC LIMIT 1",
        ((email or "").strip().lower(),)).fetchone()


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
# Длина бесплатного периода. Было 3 дня — мало: репетитор за три дня
# не успевает даже позвать учеников и увидеть их прогресс, то есть
# упирается в оплату раньше, чем поймёт, за что платит.
#
# Менять эту цифру безопасно ЗАДНИМ ЧИСЛОМ ни на кого не влияет: дата
# конца триала считается один раз в start_trial() и лежит в
# tutors.trial_ends_at. Уже начатые триалы не удлиняются и не режутся.
TRIAL_DAYS = 5
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


# ---------- доски для урока ----------

BOARD_MAX_OBJECTS = 3000      # больше на один урок не нарисовать
BOARD_MAX_BYTES = 8_000_000   # 8 МБ на доску: картинки тяжелее линий, но
                              # полинг тянет только новое (since rev), так что
                              # это разовая передача, а не постоянный трафик
BOARD_MAX_IMAGE = 700_000     # одна картинка (data-URL) — до ~0,5 МБ бинарно;
                              # клиент жмёт сильнее, это потолок от чужих рук
BOARD_MAX_PER_TUTOR = 60


def _board_row(row):
    """Строка доски → словарь для клиента. Содержимое НЕ отдаём:
    список досок нужен для выбора, а весь JSON там лишний вес."""
    data = json.loads(row["data"] or "{}")
    return {
        "id": row["id"],
        "title": row["title"],
        "rev": row["rev"],
        "shared": bool(row["shared"]),
        "invited": (row["invited_student_id"]
                    if "invited_student_id" in row.keys() else None),
        "objects": len(data),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_boards(tutor_id):
    rows = conn().execute(
        "SELECT * FROM boards WHERE tutor_id=? AND COALESCE(archived,0)=0"
        " ORDER BY updated_at DESC", (tutor_id,)).fetchall()
    return [_board_row(r) for r in rows]


def board_count(tutor_id):
    return conn().execute(
        "SELECT COUNT(*) n FROM boards WHERE tutor_id=? AND COALESCE(archived,0)=0",
        (tutor_id,)).fetchone()["n"]


def create_board(tutor_id, title):
    ts = now()
    cur = conn().execute(
        "INSERT INTO boards (tutor_id, title, data, rev, created_at, updated_at)"
        " VALUES (?, ?, '{}', 0, ?, ?)",
        (tutor_id, (title or "Урок").strip()[:80] or "Урок", ts, ts))
    conn().commit()
    return get_board(cur.lastrowid)


def get_board(board_id):
    return conn().execute("SELECT * FROM boards WHERE id=?", (board_id,)).fetchone()


def rename_board(board_id, tutor_id, title):
    conn().execute("UPDATE boards SET title=?, updated_at=? WHERE id=? AND tutor_id=?",
                   ((title or "").strip()[:80] or "Урок", now(), board_id, tutor_id))
    conn().commit()
    return get_board(board_id)


def set_board_shared(board_id, tutor_id, shared, invited_student_id=None):
    """Открыть/закрыть доску и выбрать, кого на неё зовём.

    invited_student_id: None — всем ученикам (как раньше), число — только
    этому. Чужого ученика сюда не пропускает server (сверяет tutor_id),
    но на всякий случай затираем приглашение при закрытии: закрытая
    доска не должна тащить за собой старый выбор."""
    conn().execute(
        "UPDATE boards SET shared=?, invited_student_id=?, updated_at=?"
        " WHERE id=? AND tutor_id=?",
        (1 if shared else 0,
         int(invited_student_id) if (shared and invited_student_id) else None,
         now(), board_id, tutor_id))
    conn().commit()
    return get_board(board_id)


def board_lets_student(board, student_row):
    """Пускает ли доска этого ученика: открыта, репетитор его, и либо
    зовут всех, либо зовут именно его. Одно место правды для рисования,
    звонка и книжных страниц."""
    if not board or not student_row:
        return False
    if not board["shared"] or student_row["tutor_id"] != board["tutor_id"]:
        return False
    keys = board.keys()
    invited = board["invited_student_id"] if "invited_student_id" in keys else None
    return not invited or int(invited) == int(student_row["id"])


def delete_board(board_id, tutor_id):
    """Прячем, а не стираем: доска — это конспект урока, и «удалил не ту»
    здесь стоит дороже, чем строка в базе."""
    conn().execute("UPDATE boards SET archived=1, updated_at=? WHERE id=? AND tutor_id=?",
                   (now(), board_id, tutor_id))
    conn().commit()


def _clean_board_object(o):
    """Объект доски приходит от клиента, поэтому проверяем всё.

    На доске рисует не только репетитор: если ученикам открыт доступ,
    любой из них может прислать что угодно. Поэтому здесь белый список
    полей и жёсткие рамки чисел — доска не должна ронять чужой браузер
    линией из миллиона точек или всплывать чужим скриптом в тексте."""
    if not isinstance(o, dict):
        return None
    oid = str(o.get("id", ""))[:40]
    kind = str(o.get("kind", ""))[:16]
    if not oid or kind not in ("pen", "line", "arrow", "rect", "ellipse",
                               "note", "text", "word", "image", "ping", "bg",
                               "task", "book"):
        return None

    def num(v, lo=-100000, hi=100000):
        try:
            f = float(v)
        except (TypeError, ValueError):
            return 0.0
        if f != f or f in (float("inf"), float("-inf")):
            return 0.0
        return max(lo, min(hi, round(f, 2)))

    out = {
        "id": oid,
        "kind": kind,
        "x": num(o.get("x")),
        "y": num(o.get("y")),
        "w": num(o.get("w"), -20000, 20000),
        "h": num(o.get("h"), -20000, 20000),
        "color": str(o.get("color", ""))[:24],
        "size": max(1, min(60, int(num(o.get("size", 3), 1, 60)))),
        "rev": int(num(o.get("rev", 0), 0, 10**9)),
        "by": str(o.get("by", ""))[:24],
    }
    if kind in ("note", "text", "word", "task"):
        out["text"] = str(o.get("text", ""))[:600]
        out["text2"] = str(o.get("text2", ""))[:600]
    if kind == "task":
        # Результат прохождения («Верно 5 из 6 · 14:32») — его пишет
        # ученик, закончив тренировку, прямо в карточку задания.
        out["result"] = str(o.get("result", ""))[:120]
    if kind == "book":
        # Страница PDF-книжки. Сама картинка НЕ едет в объекте — только
        # ссылка на книгу и номер страницы, картинку каждый клиент берёт
        # у сервера сам (/api/book/page) и кэширует. Так листание — это
        # апдейт трёх чисел, а не полмегабайта на каждый опрос.
        out["bookId"] = int(num(o.get("bookId", 0), 0, 10**9))
        out["page"] = max(1, int(num(o.get("page", 1), 1, 10000)))
        out["pages"] = max(1, int(num(o.get("pages", 1), 1, 10000)))
        out["text"] = str(o.get("text", ""))[:120]   # название для подписи
        if not out["bookId"]:
            return None
    if kind == "image":
        # Картинка едет внутри объекта как data-URL. Никаких ссылок на
        # чужие сайты: во-первых, это утечка (браузер второго участника
        # ходил бы по адресу, который придумал первый), во-вторых, доска
        # обязана открываться без интернета до внешних картинок.
        src = str(o.get("src", ""))
        if len(src) > BOARD_MAX_IMAGE:
            return None
        if not (src.startswith("data:image/jpeg;base64,")
                or src.startswith("data:image/png;base64,")
                or src.startswith("data:image/webp;base64,")):
            return None
        out["src"] = src
    if kind == "bg":
        # Фон доски — общий: у ученика урок выглядит так же, как у
        # репетитора. Живёт одним объектом с фиксированным id.
        if oid != "board-bg":
            return None
        mode = str(o.get("text", ""))
        out["text"] = mode if mode in ("dots", "grid", "lines", "clean") else "dots"
    if kind == "pen":
        pts = o.get("pts")
        if not isinstance(pts, list) or len(pts) < 2:
            return None
        # Точек в одной линии — не больше 4000: длинную линию клиент
        # и сам режет, но присланное «сверху» ограничиваем здесь.
        out["pts"] = [num(p) for p in pts[:8000]]
        if len(out["pts"]) % 2:
            out["pts"].pop()
    return out


def board_touch_presence(board_id, hidden):
    """Ученик на доске: отметить «жив и видно ли вкладку».

    Отдельным лёгким апдейтом при каждом опросе: репетитор по этим двум
    числам видит, рядом ли ученик или ушёл в другую вкладку тренировать
    задания. Точность в секунду достаточна."""
    conn().execute("UPDATE boards SET student_seen_at=?, student_hidden=? WHERE id=?",
                   (int(time.time()), 1 if hidden else 0, board_id))
    conn().commit()


def board_presence(row):
    """Что показать репетитору: no | here | away | gone."""
    seen = int(row["student_seen_at"] or 0)
    if not seen:
        return "no"
    ago = int(time.time()) - seen
    if int(row["student_hidden"] or 0):
        # Свёрнутую вкладку браузер опрашивает всё реже, вплоть до раза
        # в минуту, — поэтому «в другой вкладке» живёт долго и без опросов.
        return "away" if ago <= 180 else "gone"
    return "here" if ago <= 6 else "gone"


def board_sync(board_id, changes, deletes, since, author):
    """Слить изменения и вернуть то, чего у клиента ещё нет.

    Правило слияния — «последний по объекту побеждает». Для доски на
    двоих этого достаточно: конфликт возможен, только если оба тянут
    ОДИН И ТОТ ЖЕ объект в одну секунду, а нарисованные линии у каждого
    свои. Полной перезаписи доски не бывает никогда — иначе один
    сохранённый кадр стирал бы то, что второй нарисовал секунду назад.
    """
    row = get_board(board_id)
    if not row:
        return None
    data = json.loads(row["data"] or "{}")
    rev = int(row["rev"] or 0)

    touched = False
    for raw in (changes or [])[:400]:
        o = _clean_board_object(raw)
        if not o:
            continue
        if len(data) >= BOARD_MAX_OBJECTS and o["id"] not in data:
            break
        rev += 1
        o["rev"] = rev
        o["by"] = author[:24]
        data[o["id"]] = o
        touched = True

    for oid in (deletes or [])[:400]:
        key = str(oid)[:40]
        if key in data:
            rev += 1
            # Удалённое помним как «надгробие»: иначе второй клиент,
            # который ещё не знает об удалении, пришлёт объект обратно.
            data[key] = {"id": key, "kind": "gone", "rev": rev}
            touched = True

    if touched:
        blob = json.dumps(data, ensure_ascii=False)
        if len(blob.encode("utf-8")) > BOARD_MAX_BYTES:
            return {"error": "board_full", "rev": row["rev"]}
        conn().execute("UPDATE boards SET data=?, rev=?, updated_at=? WHERE id=?",
                       (blob, rev, now(), board_id))
        conn().commit()

    fresh = [o for o in data.values() if int(o.get("rev", 0)) > int(since or 0)]
    return {
        "rev": rev,
        "objects": [o for o in fresh if o.get("kind") != "gone"],
        "deleted": [o["id"] for o in fresh if o.get("kind") == "gone"],
        "full": int(since or 0) == 0,
    }


def clear_board(board_id, tutor_id):
    """Очистить доску целиком. Версию не сбрасываем: клиенты узнают
    об очистке по тому, что их объекты стали надгробиями."""
    row = conn().execute("SELECT * FROM boards WHERE id=? AND tutor_id=?",
                         (board_id, tutor_id)).fetchone()
    if not row:
        return None
    data = json.loads(row["data"] or "{}")
    rev = int(row["rev"] or 0)
    gone = {}
    for oid in data:
        rev += 1
        gone[oid] = {"id": oid, "kind": "gone", "rev": rev}
    conn().execute("UPDATE boards SET data=?, rev=?, updated_at=? WHERE id=?",
                   (json.dumps(gone, ensure_ascii=False), rev, now(), board_id))
    conn().commit()
    return get_board(board_id)


# ---------- сигналинг звонка ----------
CALL_TTL_SECONDS = 240        # сигналингу минуты за глаза: дальше это мусор
CALL_MSG_MAX = 32_000         # SDP с полным списком кодеков — килобайт восемь

def call_send(board_id, sender, kind, data):
    """Положить сигнальное сообщение. Возвращает False, если не влезло."""
    if kind not in ("offer", "answer", "ice", "bye"):
        return False
    blob = json.dumps(data or {}, ensure_ascii=False)
    if len(blob) > CALL_MSG_MAX:
        return False
    c = conn()
    # Чистим прошлое этой доски при каждой записи: отдельного крона на
    # хостинге нет, а так таблица сама держится в размере одного урока.
    cutoff = (datetime.now(timezone.utc) - timedelta(seconds=CALL_TTL_SECONDS))\
        .isoformat(timespec="seconds")
    c.execute("DELETE FROM call_msgs WHERE board_id=? AND created_at < ?",
              (board_id, cutoff))
    c.execute("INSERT INTO call_msgs(board_id, sender, kind, data, created_at) "
              "VALUES(?,?,?,?,?)", (board_id, sender[:24], kind, blob, now()))
    c.commit()
    return True


def call_poll(board_id, me, since):
    """Сообщения ДРУГОЙ стороны после номера since."""
    rows = conn().execute(
        "SELECT id, sender, kind, data, created_at FROM call_msgs "
        "WHERE board_id=? AND id>? AND sender<>? ORDER BY id LIMIT 50",
        (board_id, int(since or 0), me[:24])).fetchall()
    out = []
    for r in rows:
        try:
            data = json.loads(r["data"])
        except ValueError:
            data = {}
        # Возраст в секундах: первый опрос после открытия страницы находит
        # и старые сообщения — по возрасту клиент отличает живой звонок
        # от эха звонка десятиминутной давности.
        try:
            born = datetime.fromisoformat(r["created_at"])
            age = int((datetime.now(timezone.utc) - born).total_seconds())
        except ValueError:
            age = 0
        out.append({"id": r["id"], "kind": r["kind"], "data": data, "age": age})
    return out


# ---------- PDF-книжки для доски ----------

BOOK_MAX_BYTES = 20_000_000   # один PDF до 20 МБ: скан урока, не библиотека.
                              # Едет base64-JSON, как фото, — больше рискованно
                              # для памяти процесса на хостинге
BOOK_MAX_PAGES = 400
BOOKS_MAX_PER_TUTOR = 24

BOOK_DIR = os.path.join(os.path.dirname(os.path.abspath(DB_PATH)), "books")


def book_pdf_path(book_id, make_dirs=False):
    if make_dirs:
        os.makedirs(BOOK_DIR, exist_ok=True)
        try:
            os.chmod(BOOK_DIR, 0o700)
        except OSError:
            pass
    return os.path.join(BOOK_DIR, "%d.pdf" % int(book_id))


def book_page_path(book_id, page, make_dirs=False):
    """Кэш отрендеренной страницы. Номер страницы приводим к int здесь же:
    имя файла не должно собираться из чужой строки."""
    d = os.path.join(BOOK_DIR, "pages", str(int(book_id)))
    if make_dirs:
        os.makedirs(d, exist_ok=True)
    return os.path.join(d, "p%d.jpg" % int(page))


def _book_row(row):
    return {"id": row["id"], "title": row["title"], "pages": row["pages"],
            "bytes": row["bytes"], "createdAt": row["created_at"]}


def list_books(tutor_id):
    rows = conn().execute(
        "SELECT * FROM books WHERE tutor_id=? ORDER BY id DESC",
        (tutor_id,)).fetchall()
    return [_book_row(r) for r in rows]


def book_count(tutor_id):
    return conn().execute("SELECT COUNT(*) n FROM books WHERE tutor_id=?",
                          (tutor_id,)).fetchone()["n"]


def create_book(tutor_id, title, pages, size):
    cur = conn().execute(
        "INSERT INTO books (tutor_id, title, pages, bytes, created_at)"
        " VALUES (?,?,?,?,?)",
        (tutor_id, (title or "Книга").strip()[:80] or "Книга",
         int(pages), int(size), now()))
    conn().commit()
    return get_book(cur.lastrowid)


def get_book(book_id):
    return conn().execute("SELECT * FROM books WHERE id=?",
                          (int(book_id),)).fetchone()


def delete_book(book_id, tutor_id):
    """Строку — из базы, файлы — с диска. Файлы вторыми: если упадём на
    полпути, останется мусор на диске, а не битая запись в описи."""
    row = conn().execute("SELECT * FROM books WHERE id=? AND tutor_id=?",
                         (int(book_id), tutor_id)).fetchone()
    if not row:
        return False
    conn().execute("DELETE FROM books WHERE id=?", (row["id"],))
    conn().commit()
    try:
        os.remove(book_pdf_path(row["id"]))
    except OSError:
        pass
    pages_dir = os.path.join(BOOK_DIR, "pages", str(row["id"]))
    try:
        for name in os.listdir(pages_dir):
            os.remove(os.path.join(pages_dir, name))
        os.rmdir(pages_dir)
    except OSError:
        pass
    return True


def shared_board_for_student(student_row):
    """Какая доска открыта ученику прямо сейчас. Ученик не выбирает доску
    сам: он видит ровно ту, которую репетитор открыл на урок. Если
    репетитор позвал конкретного ученика — остальные доску не видят
    вовсе, для них урока просто нет."""
    if not student_row or not student_row["tutor_id"]:
        return None
    row = conn().execute(
        "SELECT * FROM boards WHERE tutor_id=? AND shared=1 AND COALESCE(archived,0)=0"
        " AND (invited_student_id IS NULL OR invited_student_id=?)"
        " ORDER BY updated_at DESC LIMIT 1",
        (student_row["tutor_id"], student_row["id"])).fetchone()
    return _board_row(row) if row else None


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


# Проверка домашек приостановлена: нейросети нет (AI_PAUSED в server.py —
# владелец запускает сайт с ИИ «в разработке», — или просто нет ключей).
# Ставит server.py при старте. Пока True — счёт за пакеты не начисляется
# ни репетитору, ни в выручку админки: платить за проверку, которая не
# проверяет, нельзя. Пакеты при этом можно выбирать заранее — они
# начнут действовать и стоить денег, когда проверка заработает.
CHECKS_SUSPENDED = False
# Оценка себестоимости одной проверки и одного сообщения, ₽. По умолчанию —
# цены Claude (Sonnet на фото, Haiku в чате); server.py переопределяет,
# если работает другой провайдер.
AI_COST_CHECK = 1.04
AI_COST_MSG = 0.16


def checks_bill(tutor_id):
    """Счёт за проверку домашек: сколько выходит в месяц по всем ученикам."""
    free = conn().execute("SELECT checks_free FROM tutors WHERE id=?",
                          (tutor_id,)).fetchone()
    if (free and free["checks_free"]) or CHECKS_SUSPENDED:
        # Проверка досталась бесплатно навсегда — счёта нет и быть не должно,
        # иначе эти репетиторы попали бы и в выручку админки, и в счёт к оплате.
        # То же, пока проверка приостановлена (см. CHECKS_SUSPENDED).
        return {"students": 0, "monthly": 0, "extras": 0, "extrasCost": 0,
                "total": 0, "items": [], "suspended": bool(CHECKS_SUSPENDED)}

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
    # считаются в базе. Цена за единицу зависит от провайдера — её ставит
    # server.py при старте (Claude: 1,04/0,16 ₽; Алиса: 1,5/0,25 ₽, оценка).
    msgs = c.execute("SELECT COALESCE(SUM(chat_used),0) FROM students "
                     "WHERE chat_period=?", (_period(),)).fetchone()[0]
    checks = c.execute("SELECT COALESCE(SUM(checks_used),0) FROM students "
                       "WHERE checks_period=?", (_period(),)).fetchone()[0]
    ai_cost = round(checks * AI_COST_CHECK + msgs * AI_COST_MSG, 1)

    return {
        "tutors": tutors, "verified": verified, "students": students,
        "activeWeek": active, "photos": photos, "homework": homework,
        "revenue": revenue, "baseRevenue": base_revenue,
        "checksRevenue": checks_revenue,
        "chatMessages": msgs, "checksUsed": checks,
        "aiCost": ai_cost,
        "profit": round(revenue * 0.97 - ai_cost),
        "errorsWeek": errors_summary()["count"],
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


def admin_standalone_students():
    """Ученики без репетитора — для админки. Личный код здесь виден
    сознательно: это единственный способ поддержки («потерял код,
    вот моя почта») для тех, у кого нет репетитора с панелью."""
    out = []
    for s in conn().execute(
            "SELECT * FROM students WHERE tutor_id IS NULL ORDER BY id DESC"):
        try:
            days = len(json.loads(s["activity"] or "{}"))
        except (ValueError, TypeError):
            days = 0
        keys = s.keys()
        out.append({
            "id": s["id"], "name": s["name"],
            "email": (s["email"] if "email" in keys else "") or "",
            "level": s["level"], "xp": s["xp"], "days": days,
            "words": len(json.loads(s["dictionary"] or "[]")),
            "createdAt": s["created_at"], "lastSeen": s["last_seen"],
            "restoreCode": s["restore_code"] or "",
        })
    return out


def admin_delete_student(student_id):
    """Удалить одиночку из админки (брошенные аккаунты). Только без
    репетитора: учеников репетитора удаляет он сам в панели."""
    row = get_student_by_id(student_id)
    if not row or row["tutor_id"]:
        return False
    _purge_student_rows(student_id)
    conn().execute("DELETE FROM students WHERE id=?", (student_id,))
    conn().commit()
    return True


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
    # tasksets — после homework: домашка ссылается на набор (foreign_keys=ON)
    for table in ("photo_homework", "homework", "notes_to_students", "students", "groups",
                  "tasksets"):
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


def notify_on(tutor_row, kind):
    """Включены ли у репетитора письма этого вида: 'work' — о новых
    работах на проверку, 'remind' — еженедельный дайджест по ученикам.
    Колонки нет (старая база до миграции) — считаем включённым: так
    было всегда."""
    col = "notify_" + kind
    keys = tutor_row.keys()
    if col not in keys or tutor_row[col] is None:
        return True
    return bool(tutor_row[col])


def set_notify(tutor_id, work=None, remind=None):
    """Переключатели писем. None — не трогать."""
    c = conn()
    if work is not None:
        c.execute("UPDATE tutors SET notify_work=? WHERE id=?", (1 if work else 0, tutor_id))
    if remind is not None:
        c.execute("UPDATE tutors SET notify_remind=? WHERE id=?", (1 if remind else 0, tutor_id))
    c.commit()


# ---------- напоминания репетитору ----------
#
# Обещание «напомню повторить» когда-то стояло в текстах сайта без
# механизма за ним — и было убрано. Механизм теперь такой: раз в сутки
# по каждому репетитору считаем, что стоит заметить, и не чаще раза в
# неделю шлём письмо — только если есть что сказать. Push на этом
# хостинге не сделать, а письмо есть у каждого.
#
# Пороги нарочно грубые. Письмо «у Пети три слова просрочено» — шум,
# после которого отписываются; «Петя не заходил девять дней, тридцать
# слов ждут» — повод написать ученику.

REMIND_CHECK_GAP = 24 * 3600         # считать не чаще раза в сутки
REMIND_SEND_GAP = 7 * 24 * 3600      # слать не чаще раза в неделю
# «Не заходил» — БОЛЬШЕ недели, то есть от 8 дней. Ровно 7 не считаем:
# ученик с одним занятием в неделю, который открывает сайт только
# накануне урока, ходит с шагом ровно в семь дней и попадал бы в письмо
# каждый раз. Та же граница, что у плашки «Не заходили 7+ дней» в панели.
REMIND_SILENT_DAYS = 8
# Дольше полутора месяцев — не «пропал», а ушёл. Такого ученика в письме
# не поминаем вовсе, иначе репетитор получал бы каждую неделю «Петя не
# заходит 190 дней, 300 слов ждут» про ребёнка, который давно бросил.
REMIND_SILENT_MAX = 45
# «Слова ждут» — не меньше стольких слов И не меньше такой доли всех
# слов с расписанием. Абсолютный порог один ловил бы прилежных: тот, кто
# ведёт 200 слов и повторяет через день, всегда держит десяток-другой
# просроченных — это норма, а не запущенность.
REMIND_OVERDUE_MIN = 10
REMIND_OVERDUE_PCT = 30
TRIAL_WARN_HOURS = 30                # письмо о конце триала — за сутки с небольшим

# Московское время для дат в письмах: сайт русский, а сервер и база
# живут в UTC — «завтра» по UTC в 23:00 по Москве уже «сегодня».
MSK = timezone(timedelta(hours=3))


def _claim(column, tutor_id, gap):
    """Взять право на действие одним условным UPDATE: из нескольких
    процессов хостинга, пришедших одновременно, его получит ровно один.
    Читать дату, сравнивать и потом писать нельзя — между чтением и
    записью второй процесс успевает прочитать то же самое (это ровно та
    гонка, из-за которой лимит частоты переехал в базу)."""
    edge = (datetime.now(timezone.utc) - timedelta(seconds=gap)).isoformat(timespec="seconds")
    c = conn()
    cur = c.execute(
        "UPDATE tutors SET %s=? WHERE id=? AND (%s IS NULL OR %s < ?)" % (column, column, column),
        (now(), tutor_id, edge))
    c.commit()
    return cur.rowcount == 1


def student_overdue(dictionary, today=None):
    """(просрочено, всего с расписанием). Просрочено — дата due уже
    прошла; сегодняшние не считаем, их ещё не поздно повторить сегодня."""
    today = today or datetime.now(MSK).date().isoformat()
    scheduled = [d for d in dictionary if isinstance(d, dict) and d.get("due")]
    overdue = sum(1 for d in scheduled if str(d["due"]) < today)
    return overdue, len(scheduled)


def reminder_digest(tutor_id):
    """Что стоит заметить репетитору по каждому ученику. Пустой список —
    сказать нечего, письма не будет.

    Ученик попадает в письмо, если давно не заходил ИЛИ запустил
    повторения. Кто зашёл вчера и держит повторения — не упоминается:
    письмо про проблемы, а не отчёт."""
    out = []
    today_msk = datetime.now(MSK).date()
    for s in conn().execute(
            "SELECT id, name, dictionary, last_seen, created_at FROM students"
            " WHERE tutor_id=? ORDER BY name", (tutor_id,)):
        try:
            dictionary = json.loads(s["dictionary"] or "[]")
        except (ValueError, TypeError):
            dictionary = []
        seen = _parse_ts(s["last_seen"]) or _parse_ts(s["created_at"])
        silent = (today_msk - seen.astimezone(MSK).date()).days if seen else None
        if silent is not None and silent > REMIND_SILENT_MAX:
            continue   # ушёл, а не пропал — см. REMIND_SILENT_MAX
        overdue, scheduled = student_overdue(dictionary, today_msk.isoformat())
        is_silent = silent is not None and silent >= REMIND_SILENT_DAYS
        neglected = (overdue >= REMIND_OVERDUE_MIN
                     and overdue * 100 >= REMIND_OVERDUE_PCT * scheduled)
        if not is_silent and not neglected:
            continue
        out.append({"id": s["id"], "name": s["name"],
                    "silentDays": silent if is_silent else 0,
                    "overdue": overdue})
    # Сначала те, кто пропал давнее всего; при равенстве — у кого больше слов
    out.sort(key=lambda x: (-x["silentDays"], -x["overdue"]))
    return out


def tutors_for_reminders():
    """Кому вообще имеет смысл писать: почта подтверждена, доступ жив
    (триал или оплата), письма не выключены. Истёкшим не пишем: их
    панель закрыта, и «Петя не заходил» им не поможет."""
    out = []
    for t in conn().execute("SELECT * FROM tutors WHERE email_verified=1"):
        if not notify_on(t, "remind"):
            continue
        if access_state(t) == "expired":
            continue
        out.append(t)
    return out


def claim_reminder_check(tutor_id):
    """Право посчитать дайджест этому репетитору — раз в сутки."""
    return _claim("remind_checked_at", tutor_id, REMIND_CHECK_GAP)


def claim_reminder_send(tutor_id):
    """Право отправить дайджест — раз в неделю."""
    return _claim("remind_sent_at", tutor_id, REMIND_SEND_GAP)


def tutors_trial_ending():
    """У кого пробный период кончается в ближайшие TRIAL_WARN_HOURS часов
    и кому об этом ещё не писали. Оплативших пропускаем: им триал
    неинтересен. Неподтверждённых — тоже: письмо уйдёт неизвестно кому."""
    out = []
    for t in conn().execute(
            "SELECT * FROM tutors WHERE email_verified=1 AND trial_warned_at IS NULL"
            " AND trial_ends_at IS NOT NULL"):
        if paid_left(t) > 0:
            continue
        hours = trial_left(t)
        if 0 < hours <= TRIAL_WARN_HOURS:
            out.append(t)
    return out


def claim_trial_warning(tutor_id):
    """Право отправить письмо о конце триала — один раз. Промежуток
    большой, потому что триал один: второго письма не бывает."""
    return _claim("trial_warned_at", tutor_id, 10 * 365 * 24 * 3600)


def trial_end_word(row):
    """«сегодня» / «завтра» / дата — когда по Москве кончается триал."""
    end = _parse_ts(row["trial_ends_at"]) if "trial_ends_at" in row.keys() else None
    if not end:
        return "завтра"
    end_day = end.astimezone(MSK).date()
    today = datetime.now(MSK).date()
    diff = (end_day - today).days
    if diff <= 0:
        return "сегодня"
    if diff == 1:
        return "завтра"
    months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля",
              "августа", "сентября", "октября", "ноября", "декабря"]
    return "%d %s" % (end_day.day, months[end_day.month - 1])


# ---------- лог ошибок ----------

# Сколько записей держим. Хватает, чтобы увидеть, что сломалось на этой
# неделе, и не даёт таблице расти бесконечно, если что-то падает на
# каждом запросе: старое подчищаем при каждой записи.
ERRORS_KEEP = 500


def log_error(endpoint, message, trace="", status=500,
              tutor_id=None, student_id=None, ip=None):
    """Записать ошибку. НИКОГДА не бросает: это вызывается из обработчика
    исключений, и вторая ошибка поверх первой оставила бы запрос без
    ответа вовсе — а ответ «у нас что-то отвалилось» ученику важнее,
    чем строчка в логе."""
    try:
        c = conn()
        c.execute(
            "INSERT INTO errors (created_at, endpoint, status, message, traceback,"
            " tutor_id, student_id, ip) VALUES (?,?,?,?,?,?,?,?)",
            (now(), str(endpoint or "")[:120], int(status or 500),
             str(message or "")[:1000], str(trace or "")[:8000],
             tutor_id, student_id, str(ip or "")[:64] or None),
        )
        # Уборка тем же запросом. Отдельного расписания на хостинге нет,
        # а раз в запись — дёшево: удаляем хвост за пределами ERRORS_KEEP.
        c.execute(
            "DELETE FROM errors WHERE id <= (SELECT id FROM errors"
            " ORDER BY id DESC LIMIT 1 OFFSET ?)", (ERRORS_KEEP,))
        c.commit()
    except Exception:
        try:
            conn().rollback()
        except Exception:
            pass


def recent_errors(limit=50):
    """Последние ошибки, свежие первыми, с именами — по числу в таблице
    владелец не поймёт, кому писать."""
    rows = conn().execute(
        "SELECT e.*, t.name AS tutor_name, s.name AS student_name"
        " FROM errors e"
        " LEFT JOIN tutors t ON t.id = e.tutor_id"
        " LEFT JOIN students s ON s.id = e.student_id"
        " ORDER BY e.id DESC LIMIT ?", (int(limit),)).fetchall()
    return [{
        "id": r["id"], "createdAt": r["created_at"], "endpoint": r["endpoint"],
        "status": r["status"], "message": r["message"], "traceback": r["traceback"],
        "tutorId": r["tutor_id"], "tutorName": r["tutor_name"] or "",
        "studentId": r["student_id"], "studentName": r["student_name"] or "",
        "ip": r["ip"] or "",
    } for r in rows]


def errors_summary(days=7):
    """Сколько ошибок за N дней и когда была последняя — для сводки."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")
    c = conn()
    count = c.execute("SELECT COUNT(*) FROM errors WHERE created_at >= ?",
                      (since,)).fetchone()[0]
    last = c.execute("SELECT created_at FROM errors ORDER BY id DESC LIMIT 1").fetchone()
    return {"days": days, "count": count, "last": last["created_at"] if last else None}


def clear_errors():
    conn().execute("DELETE FROM errors")
    conn().commit()
