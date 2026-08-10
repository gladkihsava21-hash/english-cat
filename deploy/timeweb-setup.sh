#!/usr/bin/env bash
# Установка Савелия на виртуальный хостинг Timeweb.
# Запускать в SSH-консоли панели:
#
#   bash <(curl -sL https://raw.githubusercontent.com/gladkihsava21-hash/english-cat/main/deploy/timeweb-setup.sh) kotsaveli
#
# Где kotsaveli — имя сайта из раздела «Сайты».
# Повторный запуск безопасен: это же и обновление.
set -euo pipefail

SITE="${1:-}"
REPO="https://github.com/gladkihsava21-hash/english-cat.git"

if [[ -z "$SITE" ]]; then
  echo "Укажи имя сайта. Доступные:"
  find "$HOME" -maxdepth 2 -name public_html -type d 2>/dev/null \
    | sed "s|$HOME/||; s|/public_html||" | sed 's/^/  /'
  echo
  echo "Пример:  bash $0 kotsaveli"
  exit 1
fi

DEST="$HOME/$SITE/public_html"
if [[ ! -d "$DEST" ]]; then
  echo "Папки $DEST нет. Проверь имя сайта в панели → «Сайты»."
  exit 1
fi

echo "==> Проверяю Python"
PY=""
for c in python3.12 python3.11 python3.10 python3.9 python3.8 python3.7 python3.6 python3; do
  if command -v "$c" >/dev/null 2>&1; then
    v=$("$c" -c 'import sys; print("%d%02d" % sys.version_info[:2])' 2>/dev/null || echo 0)
    if [[ "$v" -ge 306 ]]; then
      PY="$c"
      echo "    нашёл: $c ($("$c" -V 2>&1))"
      break
    fi
  fi
done
if [[ -z "$PY" ]]; then
  echo "!! Python 3.6+ не найден. В коде есть f-строки, на 3.4 он не запустится."
  echo "   Панель → «Сайты» → шестерёнка у $SITE → версия Python 3.10."
  exit 1
fi

echo "==> Сохраняю то, что уже лежит в папке сайта"
# Ничего не удаляем молча: вдруг там нужные файлы
if [[ -n "$(ls -A "$DEST" 2>/dev/null)" ]]; then
  BACKUP="$HOME/before-savely-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP"
  cp -a "$DEST/." "$BACKUP/" 2>/dev/null || true
  echo "    копия: $BACKUP"
  find "$DEST" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
fi

echo "==> Забираю код"
TMP="$HOME/.savely-tmp-$$"
rm -rf "$TMP"
git clone --depth 1 "$REPO" "$TMP" >/dev/null 2>&1
cp -a "$TMP"/. "$DEST"/
rm -rf "$TMP"
# В публичной папке нужен только сам сайт: истории git, инструкций
# и скриптов установки там делать нечего
rm -rf "$DEST/.git" "$DEST/deploy" "$DEST/__pycache__" \
       "$DEST/README.md" "$DEST/.gitignore"

echo "==> Папка для базы"
# Выше публичной папки: внутри неё Apache отдал бы базу по прямой ссылке
mkdir -p "$HOME/savely-data"
chmod 700 "$HOME/savely-data"

echo "==> Проверяю, что приложение поднимается"
cd "$DEST"
if ! "$PY" - <<'CHECK'
import os, sys
sys.path.insert(0, ".")
os.environ["SAVELY_DB"] = os.path.expanduser("~/savely-data/savely.db")
import wsgi

seen = {}
body = b"".join(wsgi.application(
    {"PATH_INFO": "/health", "REQUEST_METHOD": "GET"},
    lambda status, headers: seen.setdefault("status", status),
))
if not seen.get("status", "").startswith("200") or b"true" not in body.lower():
    sys.exit("ответ не тот: %s %s" % (seen.get("status"), body))
print("    ответ health:", body.decode())
CHECK
then
  echo "!! Приложение не запустилось — смотри ошибку выше."
  exit 1
fi

echo
echo "Файлы на месте. Осталось в панели:"
echo "  1. «Сайты» → шестерёнка у $SITE → версия Python 3.10"
echo "  2. Там же: тип приложения WSGI, файл wsgi.py, объект application"
echo "  3. «Домены и SSL» → выпустить бесплатный сертификат"
echo
echo "Потом открой https://твой-домен/health — должно вернуть {\"ok\": true}"
