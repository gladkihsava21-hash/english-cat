#!/usr/bin/env python3
"""Сервер Савелия: статика + API (репетиторы, ученики, домашка) + чат через Claude CLI.

Запуск:  python3 server.py
Сайт:    http://localhost:4210
Панель:  http://localhost:4210/tutor.html
"""
import json
import os
import re
import shutil
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

import db

PORT = 4210
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

def build_prompt(payload):
    prof = payload.get("profile") or {}
    dic = (prof.get("dictionary") or [])[:40]
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
    for m in (payload.get("history") or [])[-12:]:
        role = "Ученик: " if m.get("who") == "user" else "Савелий: "
        lines.append(role + str(m.get("text", ""))[:500])
    lines += ["", FORMAT]
    return "\n".join(lines)


def ask_claude(payload):
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
        if not name or not email or len(password) < 6:
            return {"ok": False, "error": "Заполни имя, email и пароль от 6 символов."}
        row = db.create_tutor(name, email, password)
        if not row:
            return {"ok": False, "error": "Такой email уже зарегистрирован."}
        return {"ok": True, "token": row["token"], "tutor": db.tutor_public(row)}

    @staticmethod
    def tutor_login(h, p):
        row = db.login_tutor(str(p.get("email", "")), str(p.get("password", "")))
        if not row:
            return {"ok": False, "error": "Неверный email или пароль."}
        return {"ok": True, "token": row["token"], "tutor": db.tutor_public(row)}

    @staticmethod
    def tutor_students(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        hw = db.list_homework(tutor["id"])
        students = []
        for s in db.list_students(tutor["id"]):
            students.append(db.student_public(s, db.homework_for_student(hw, s)))
        return {
            "ok": True,
            "tutor": db.tutor_public(tutor),
            "students": students,
            "groups": [db.group_public(g) for g in db.list_groups(tutor["id"])],
            "homework": [{
                "id": x["id"], "title": x["title"],
                "studentId": x["student_id"], "groupId": x["group_id"],
                "words": json.loads(x["words"] or "[]"),
                "dueDate": x["due_date"], "createdAt": x["created_at"],
            } for x in hw],
        }

    @staticmethod
    def tutor_student_detail(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        row = db.get_student_by_id(int(p.get("studentId") or 0))
        if not row or row["tutor_id"] != tutor["id"]:
            return {"ok": False, "error": "not_found"}
        hw = db.homework_for_student(db.list_homework(tutor["id"]), row)
        return {"ok": True, "student": db.student_public(row, hw, detail=True)}

    @staticmethod
    def tutor_student_note(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        db.set_student_note(tutor["id"], int(p.get("studentId") or 0), p.get("note") or "")
        return {"ok": True}

    # --- группы ---

    @staticmethod
    def group_create(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        name = str(p.get("name", "")).strip()
        if not name:
            return {"ok": False, "error": "Введите название группы."}
        row = db.create_group(tutor["id"], name, p.get("color"))
        return {"ok": True, "group": db.group_public(row)}

    @staticmethod
    def group_update(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        db.update_group(tutor["id"], int(p.get("id") or 0), p.get("name"), p.get("color"))
        return {"ok": True}

    @staticmethod
    def group_delete(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        db.delete_group(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    @staticmethod
    def group_assign(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        gid = p.get("groupId")
        db.set_student_group(tutor["id"], int(p.get("studentId") or 0),
                             int(gid) if gid else None)
        return {"ok": True}

    @staticmethod
    def tutor_homework_create(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        words = p.get("words") or []
        if not isinstance(words, list) or not words:
            return {"ok": False, "error": "Добавь хотя бы одно слово."}
        clean = []
        for w in words:
            if isinstance(w, dict) and w.get("w"):
                clean.append({
                    "w": str(w.get("w"))[:60],
                    "t": str(w.get("t", ""))[:100],
                    "ex": str(w.get("ex", ""))[:200],
                    "level": str(w.get("level", ""))[:4],
                })
        if not clean:
            return {"ok": False, "error": "Слова не распознаны."}
        sid, gid = p.get("studentId"), p.get("groupId")
        row = db.create_homework(
            tutor["id"], str(p.get("title", "")), clean,
            student_id=int(sid) if sid else None,
            group_id=int(gid) if gid else None,
            due_date=str(p.get("dueDate") or "") or None,
        )
        return {"ok": True, "id": row["id"]}

    @staticmethod
    def tutor_homework_archive(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        db.archive_homework(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    @staticmethod
    def tutor_student_delete(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
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
    def student_join(h, p):
        tutor = db.get_tutor_by_code(p.get("code"))
        if not tutor:
            return {"ok": False, "error": "Такой ссылки не существует."}
        name = str(p.get("name", "")).strip()
        if not name:
            return {"ok": False, "error": "Введи имя."}
        row = db.create_student(tutor["id"], name)
        return {"ok": True, "token": row["token"], "tutorName": tutor["name"]}

    @staticmethod
    def student_sync(h, p):
        row = db.sync_student(p.get("token"), p.get("state") or {})
        if not row:
            return {"ok": False, "error": "unknown_student"}
        hw = db.homework_for_student(db.list_homework(row["tutor_id"]), row)
        tasks = [{
            "id": x["id"],
            "title": x["title"],
            "words": json.loads(x["words"] or "[]"),
            "dueDate": x["due_date"],
        } for x in hw]
        return {
            "ok": True,
            "homework": tasks,
            "leaderboard": db.leaderboard(row),
        }

    # --- чат ---

    @staticmethod
    def chat(h, p):
        try:
            return ask_claude(p)
        except Exception as e:
            msg = str(e)
            return {"ok": False,
                    "error": "not_logged_in" if "not_logged_in" in msg else msg[:200]}


ROUTES = {
    "/api/tutor/register": Api.tutor_register,
    "/api/tutor/login": Api.tutor_login,
    "/api/tutor/students": Api.tutor_students,
    "/api/tutor/student": Api.tutor_student_detail,
    "/api/tutor/student/note": Api.tutor_student_note,
    "/api/tutor/student/delete": Api.tutor_student_delete,
    "/api/tutor/homework": Api.tutor_homework_create,
    "/api/tutor/homework/archive": Api.tutor_homework_archive,
    "/api/tutor/group/create": Api.group_create,
    "/api/tutor/group/update": Api.group_update,
    "/api/tutor/group/delete": Api.group_delete,
    "/api/tutor/group/assign": Api.group_assign,
    "/api/join": Api.join_info,
    "/api/student/join": Api.student_join,
    "/api/student/sync": Api.student_sync,
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
        try:
            self._send_json(handler(self, payload))
        except Exception as e:
            self._send_json({"ok": False, "error": str(e)[:200]}, 500)

    def end_headers(self):
        # при разработке браузер не должен кэшировать css/js —
        # иначе правки не видны до ручной очистки кэша
        if self.path.endswith((".css", ".js", ".html")) or self.path == "/":
            self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            self._send_json({"ok": True})
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
        if name in ("", "index.html", "tutor.html", "manifest.json", "sw.js",
                    "icon-192.png", "icon-512.png", "favicon.ico"):
            return True
        if ".." in name or name.startswith("."):
            return False
        allowed_dir = name.startswith("css/") or name.startswith("js/")
        allowed_ext = name.endswith((".css", ".js"))
        return allowed_dir and allowed_ext

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
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
