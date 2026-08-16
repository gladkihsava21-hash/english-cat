#!/usr/bin/env python3
"""Демо-база для разработки: боевые данные без живых людей.

Зачем. Разрабатывать на пустой базе — значит не видеть половины экранов:
список учеников пустой, прогресса нет, домашек нет, и любая вёрстка
«на много данных» проверяется вслепую. А работать на боевой копии с
настоящими именами детей нельзя.

Что делает:
  • читает боевую базу ТОЛЬКО НА ЧТЕНИЕ (открывает в режиме ro);
  • копирует структуру и данные в demo.db;
  • заменяет всё, по чему можно узнать человека.

Что заменяется:
  имена репетиторов и учеников  → Мария, Иван и т. д.
  почты                         → tutor1@example.com
  хеши паролей                  → один и тот же заглушечный
  токены, коды приглашения,     → новые случайные
    коды восстановления
  заметки репетитора об учениках → вычищаются (там пишут о ребёнке живым
                                   языком, это самое личное в базе)
  файлы фотографий              → имена заменяются, сами файлы не копируются
  идентификаторы устройств, IP   → вычищаются
  адрес комнаты видеоурока      → вычищается

Что НЕ заменяется: словари, прогресс, даты, очки, награды, тарифы —
ради них всё и затевается.

Запуск:
    python3 tools/export-demo.py                      # из локальной savely.db
    python3 tools/export-demo.py путь/к/боевой.db     # из копии боевой

Результат: demo.db рядом с проектом. Пускать так:
    SAVELY_DB=demo.db python3 server.py
"""

import os
import secrets
import shutil
import sqlite3
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Имена для замены. Русские и распространённые: демо должно выглядеть
# правдоподобно, иначе на нём не заметишь, что длинное имя ломает вёрстку.
TUTOR_NAMES = ["Мария", "Ольга", "Наталья", "Елена", "Ирина", "Анна",
               "Татьяна", "Светлана", "Юлия", "Екатерина"]
STUDENT_NAMES = ["Иван", "Пётр", "Артём", "Софья", "Максим", "Алиса",
                 "Дмитрий", "Полина", "Егор", "Варвара", "Матвей", "Ева",
                 "Тимофей", "Кира", "Никита", "Василиса", "Лев", "Дарья",
                 "Марк", "Александра"]


def open_readonly(path):
    """Боевую базу открываем так, что записать в неё невозможно физически,
    а не «мы постараемся не писать»."""
    uri = "file:%s?mode=ro" % os.path.abspath(path).replace("?", "%3f")
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def main():
    src_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "savely.db")
    dst_path = os.path.join(ROOT, "demo.db")

    if not os.path.exists(src_path):
        print("Нет базы:", src_path)
        return 1

    # Копируем через .backup, а не cp: согласованный снимок даже под записью
    src = open_readonly(src_path)
    if os.path.exists(dst_path):
        os.remove(dst_path)
    dst = sqlite3.connect(dst_path)
    with dst:
        src.backup(dst)
    src.close()
    dst.row_factory = sqlite3.Row

    def cols(table):
        return {r["name"] for r in dst.execute("PRAGMA table_info(%s)" % table)}

    # ---------- репетиторы ----------
    tut = dst.execute("SELECT id FROM tutors ORDER BY id").fetchall()
    tcols = cols("tutors")
    for i, row in enumerate(tut):
        sets, vals = [], []

        def put(col, value):
            if col in tcols:
                sets.append("%s=?" % col)
                vals.append(value)

        put("name", TUTOR_NAMES[i % len(TUTOR_NAMES)])
        put("email", "tutor%d@example.com" % (i + 1))
        # Один и тот же заглушечный хеш: войти по нему нельзя (соль не
        # подходит), а поле не пустое — код на это рассчитывает.
        put("pass_hash", "demo")
        put("pass_salt", "demo")
        put("token", secrets.token_urlsafe(24))
        put("invite_code", "DEMO%02d" % (i + 1))
        put("recovery_code", secrets.token_hex(4).upper())
        put("verify_code", None)
        put("reset_code", None)
        put("device_id", None)
        put("signup_ip", None)
        put("lesson_url", "")
        dst.execute("UPDATE tutors SET %s WHERE id=?" % ", ".join(sets), vals + [row["id"]])

    # ---------- ученики ----------
    stu = dst.execute("SELECT id FROM students ORDER BY id").fetchall()
    scols = cols("students")
    for i, row in enumerate(stu):
        sets, vals = [], []

        def put(col, value):
            if col in scols:
                sets.append("%s=?" % col)
                vals.append(value)

        put("name", STUDENT_NAMES[i % len(STUDENT_NAMES)])
        put("token", secrets.token_urlsafe(24))
        put("restore_code", "DEMO-%04d" % (i + 1))
        # Заметка репетитора — самое личное, что есть в базе: там пишут
        # «пропускает вторники», «стесняется говорить вслух». Вычищаем.
        put("note", "")
        dst.execute("UPDATE students SET %s WHERE id=?" % ", ".join(sets), vals + [row["id"]])

    # ---------- фотографии тетрадей ----------
    # Сами файлы в демо не копируются: это снимки чужих тетрадей.
    # Записи оставляем — по ним рисуется экран проверки.
    if dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='photo_homework'").fetchone():
        pcols = cols("photo_homework")
        for i, row in enumerate(dst.execute("SELECT id FROM photo_homework").fetchall()):
            sets, vals = [], []
            if "file_name" in pcols:
                sets.append("file_name=?"); vals.append("demo-%d.jpg" % (i + 1))
            if "comment" in pcols:
                sets.append("comment=?"); vals.append("")
            if sets:
                dst.execute("UPDATE photo_homework SET %s WHERE id=?" % ", ".join(sets),
                            vals + [row["id"]])

    # ---------- служебное ----------
    for table in ("admin_sessions", "rate_hits"):
        if dst.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                       (table,)).fetchone():
            dst.execute("DELETE FROM %s" % table)

    dst.commit()

    # ---------- проверяем, что личного не осталось ----------
    leaks = []
    for r in dst.execute("SELECT name, email FROM tutors"):
        if r["name"] not in TUTOR_NAMES:
            leaks.append("имя репетитора: " + str(r["name"]))
        if not str(r["email"] or "").endswith("@example.com"):
            leaks.append("почта: " + str(r["email"]))
    for r in dst.execute("SELECT name, note FROM students"):
        if r["name"] not in STUDENT_NAMES:
            leaks.append("имя ученика: " + str(r["name"]))
        if (r["note"] or "").strip():
            leaks.append("заметка об ученике не вычищена")

    tn = dst.execute("SELECT COUNT(*) FROM tutors").fetchone()[0]
    sn = dst.execute("SELECT COUNT(*) FROM students").fetchone()[0]
    dst.close()

    if leaks:
        os.remove(dst_path)
        print("Что-то не обезличилось, демо-база УДАЛЕНА:")
        for x in leaks:
            print("  •", x)
        return 1

    print("demo.db готова: репетиторов %d, учеников %d" % (tn, sn))
    print("Прогресс, словари и даты на месте — имена, почты, токены и заметки заменены.")
    print()
    print("Запуск на ней:")
    print("    SAVELY_DB=demo.db python3 server.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
