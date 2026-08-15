"""Точка входа для обычного хостинга (Timeweb и любой другой mod_wsgi).

На виртуальном хостинге нельзя держать свой процесс-сервер: Apache сам
вызывает `application` на каждый запрос. Вся логика при этом общая с
server.py — здесь только переходник, чтобы не разъезжались две версии API.

Настройка на Timeweb описана в deploy/TIMEWEB.md
"""

import json
import os
import sys
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

# Виртуальное окружение подключаем прямо здесь: mod_wsgi не читает
# директивы из .htaccess, другого места просто нет.
#
# Самому проекту venv не нужен — он обходится стандартной библиотекой.
# Блок оставлен на случай, если окружение всё же создадут.
_VENV_DIR = os.environ.get("SAVELY_VENV") or os.path.join(os.path.dirname(HERE), "venv")
_activate = os.path.join(_VENV_DIR, "bin", "activate_this.py")
if os.path.exists(_activate):
    with open(_activate) as f:
        exec(f.read(), {"__file__": _activate})
elif os.path.isdir(_VENV_DIR):
    # модуль venv, в отличие от пакета virtualenv, activate_this.py не создаёт —
    # подключаем site-packages руками, иначе окружение просто не увидят
    import glob
    for _sp in glob.glob(os.path.join(_VENV_DIR, "lib", "python*", "site-packages")):
        if _sp not in sys.path:
            sys.path.insert(0, _sp)

# База обязана лежать ВЫШЕ публичной папки. Внутри неё Apache отдал бы
# файл по прямой ссылке вместе с хешами паролей и токенами репетитора.
_DATA = os.path.join(os.path.dirname(HERE), "savely-data")
os.environ.setdefault("SAVELY_DB", os.path.join(_DATA, "savely.db"))
os.makedirs(_DATA, exist_ok=True)

import db      # noqa: E402  (импорт только после SAVELY_DB)
import server  # noqa: E402

db.init()

MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".ico": "image/x-icon",
}

CORS = [("Access-Control-Allow-Origin", "*")]


def _json(start_response, obj, status="200 OK"):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    start_response(status, [
        ("Content-Type", "application/json; charset=utf-8"),
        ("Content-Length", str(len(body))),
    ] + CORS)
    return [body]


def _not_found(start_response):
    body = b"Not Found"
    start_response("404 Not Found", [
        ("Content-Type", "text/plain; charset=utf-8"),
        ("Content-Length", str(len(body))),
    ])
    return [body]


def _static(path, start_response):
    """Запасная отдача файлов. Обычно их забирает Apache напрямую,
    но если запрос дошёл сюда — белый список тот же, что и в server.py."""
    name = path.lstrip("/") or "index.html"
    if not server.Handler._servable(path):
        return _not_found(start_response)

    full = os.path.normpath(os.path.join(HERE, name))
    # normpath не спасает от симлинков и «..» в исходном пути — проверяем итог
    if not full.startswith(HERE + os.sep) or not os.path.isfile(full):
        return _not_found(start_response)

    with open(full, "rb") as f:
        body = f.read()
    ext = os.path.splitext(full)[1]
    headers = [
        ("Content-Type", MIME.get(ext, "application/octet-stream")),
        ("Content-Length", str(len(body))),
    ]
    if ext in (".css", ".js", ".html"):
        headers.append(("Cache-Control", "no-store, must-revalidate"))
    start_response("200 OK", headers)
    return [body]


def application(environ, start_response):
    path = environ.get("PATH_INFO") or "/"
    method = environ.get("REQUEST_METHOD", "GET")

    if method == "OPTIONS":
        start_response("204 No Content", [
            ("Access-Control-Allow-Methods", "POST, GET, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type"),
        ] + CORS)
        return [b""]

    if path == "/health":
        # Берём из server, а не читаем файл: нужна версия кода В ПАМЯТИ,
        # а на диске он к этому моменту уже новый. Нет атрибута вовсе —
        # значит в памяти сборка старше этой проверки.
        return _json(start_response, {
            "ok": True,
            "version": getattr(server, "ASSET_VERSION", "старая сборка"),
        })

    if method == "POST":
        handler = server.ROUTES.get(path)
        if not handler:
            return _json(start_response, {"ok": False, "error": "not_found"}, "404 Not Found")
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
            payload = json.loads(environ["wsgi.input"].read(length) or b"{}")
        except Exception:
            return _json(start_response, {"ok": False, "error": "bad_json"}, "400 Bad Request")
        who = environ.get("HTTP_X_REAL_IP") or environ.get("REMOTE_ADDR") or "?"
        # Тот же ключ, что и в server.py: обработчику сюда передаётся None
        # вместо соединения, и адрес ему больше взять неоткуда.
        # ПРИСВАИВАЕМ, а не дополняем: иначе клиент пришлёт свой "_ip".
        payload["_ip"] = who
        if not server.rate_ok(path, who):
            return _json(start_response,
                         {"ok": False, "error": "Слишком быстро — притормози. Через полминуты снова можно."},
                         "429 Too Many Requests")
        try:
            return _json(start_response, handler(None, payload))
        except (ValueError, TypeError, KeyError):
            # кривые типы в запросе — вина клиента; текст исключения не отдаём
            return _json(start_response,
                         {"ok": False, "error": "Запрос не разобрал. Обнови страницу и попробуй ещё раз."},
                         "400 Bad Request")
        except Exception:
            traceback.print_exc(file=environ.get("wsgi.errors", sys.stderr))
            return _json(start_response,
                         {"ok": False, "error": "У нас что-то отвалилось — это точно не ты. Попробуй через минуту."},
                         "500 Internal Server Error")

    return _static(path, start_response)
