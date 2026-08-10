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
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import urllib.request
from urllib.parse import urlparse

import db

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

    @staticmethod
    def tutor_message(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
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
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        db.archive_message(tutor["id"], int(p.get("id") or 0))
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
                "tutorName": tutor["name"] if tutor else ""}

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
        if not name:
            return {"ok": False, "error": "Введи имя."}
        row = db.create_student(tutor["id"], name)
        return {"ok": True, "token": row["token"], "tutorName": tutor["name"],
                "restoreCode": row["restore_code"]}

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
        msgs = db.messages_for_student(db.list_messages(row["tutor_id"]), row)
        return {
            "ok": True,
            "homework": tasks,
            "leaderboard": db.leaderboard(row),
            "messages": [{"id": m["id"], "text": m["text"], "createdAt": m["created_at"]}
                         for m in msgs[:5]],
        }

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

        try:
            result = check_homework_photo(
                blob, media, level=row["level"] or "A1", task_title=task_title)
            db.set_photo_check(photo["id"], "done", result)
        except Exception as e:
            reason = str(e)
            status = "no_ai" if "no_api_key" in reason else "failed"
            db.set_photo_check(photo["id"], status, None)
            if status == "failed":
                import traceback; traceback.print_exc()

        return {"ok": True, "photo": db.photo_public(db.get_photo(photo["id"]))}

    @staticmethod
    def student_photo_list(h, p):
        row = db.get_student_by_token(p.get("token"))
        if not row:
            return {"ok": False, "error": "unknown_student"}
        return {"ok": True,
                "photos": [db.photo_public(x) for x in db.photos_for_student(row["id"])]}

    @staticmethod
    def tutor_photo_list(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        return {"ok": True,
                "photos": [db.photo_public(x, for_tutor=True)
                           for x in db.photos_for_tutor(tutor["id"])]}

    @staticmethod
    def tutor_photo_seen(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
        db.mark_photo_seen(tutor["id"], int(p.get("id") or 0))
        return {"ok": True}

    @staticmethod
    def tutor_photo_archive(h, p):
        tutor = db.get_tutor_by_token(p.get("token"))
        if not tutor:
            return {"ok": False, "error": "unauthorized"}
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

    # --- чат ---

    @staticmethod
    def chat(h, p):
        try:
            return ask_claude(p)
        except Exception as e:
            msg = str(e)
            return {"ok": False,
                    "error": "not_logged_in" if "not_logged_in" in msg else msg[:200]}


# ---------- проверка фото домашки ----------

ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
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
    "/api/student/photo": Api.student_photo_upload,
    "/api/student/photo/list": Api.student_photo_list,
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
        try:
            self._send_json(handler(self, payload))
        except (ValueError, TypeError, KeyError):
            # неверные типы в запросе — это ошибка клиента, а не сервера;
            # текст исключения наружу не отдаём
            self._send_json({"ok": False, "error": "Некорректные данные запроса."}, 400)
        except Exception:
            import traceback; traceback.print_exc()
            self._send_json({"ok": False, "error": "Внутренняя ошибка сервера."}, 500)

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
    ThreadingHTTPServer((HOST or "127.0.0.1", PORT), Handler).serve_forever()
