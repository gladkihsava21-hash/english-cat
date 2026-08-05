#!/usr/bin/env python3
# Сервер Савелия: статика + /api/chat через Claude Code CLI.
# Работает от подписки (claude /login), API-ключ не нужен.
import json
import os
import re
import shutil
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 4210
ROOT = os.path.dirname(os.path.abspath(__file__))
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")

# чат — только разговор, инструменты коту не нужны
NO_TOOLS = "Bash,Edit,Write,Read,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite"

PERSONA = (
    "Ты — Савелий, рыжий кот-репетитор английского языка на учебном сайте. "
    "Характер: добрый, весёлый, слегка вредный кот; уместно вставляешь «мяу», «мур» и кошачьи шутки, но без перебора. "
    "Отвечаешь по-русски, коротко (обычно 1–4 предложения), без markdown-заголовков и списков. "
    "Твоя работа: расширять словарный запас ученика. Предлагай новые английские слова его уровня "
    "(слово — перевод — короткий пример), объясняй значения и оттенки, проверяй слова из его словаря, "
    "отвечай на вопросы про английский. Предлагая слово, выбирай то, которого ещё нет в словаре ученика. "
    "Если ученик просит добавить слово (или соглашается на твоё предложение) — верни его в add_word. "
    "Если ты проверял слово и ученик только что ответил — оцени ответ и верни результат в mark."
)

FORMAT = (
    "Ответь СТРОГО одним JSON-объектом, без пояснений и без ```-ограждений: "
    '{"reply": "текст ответа Савелия", '
    '"add_word": null или {"w": "английское слово", "t": "перевод", "ex": "короткий пример по-английски"}, '
    '"mark": null или {"w": "проверявшееся слово", "correct": true/false}}'
)


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


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/api/chat":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length) or b"{}")
            resp = ask_claude(payload)
        except Exception as e:
            msg = str(e)
            resp = {"ok": False,
                    "error": "not_logged_in" if "not_logged_in" in msg else msg[:200]}
        body = json.dumps(resp, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print(f"Савелий слушает на http://localhost:{PORT} (claude: {CLAUDE})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
