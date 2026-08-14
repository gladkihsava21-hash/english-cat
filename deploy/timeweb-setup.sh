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
rm -rf "$TMP"; mkdir -p "$TMP"

fetch() {  # $1 — адрес, $2 — куда сохранить
  if command -v curl >/dev/null 2>&1; then curl -sL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"
  else echo "!! Нет ни curl, ни wget."; return 1; fi
}

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 "$REPO" "$TMP/repo" >/dev/null 2>&1
  SRC="$TMP/repo"
else
  # На шаред-хостинге git бывает не установлен — берём архивом
  echo "    git не найден, качаю архивом"
  fetch "${REPO%.git}/archive/refs/heads/main.tar.gz" "$TMP/main.tar.gz"
  tar -xzf "$TMP/main.tar.gz" -C "$TMP"
  SRC="$TMP/english-cat-main"
fi

if [[ ! -f "$SRC/wsgi.py" ]]; then
  echo "!! Код не скачался — проверь, есть ли на сервере интернет."
  rm -rf "$TMP"; exit 1
fi

cp -a "$SRC"/. "$DEST"/
# В публичной папке нужен только сам сайт: истории git, инструкций
# и скриптов установки там делать нечего
echo "==> Скрипты обслуживания"
# Кладём в домашнюю папку, а не в public_html: оттуда их вычищает
# следующее же обновление, и задача в cron перестала бы работать
for f in backup.sh restore.sh; do
  if [[ -f "$SRC/deploy/$f" ]]; then
    cp "$SRC/deploy/$f" "$HOME/savely-$f"
    chmod 700 "$HOME/savely-$f"
  fi
done
echo "    $HOME/savely-backup.sh"

# В публичной папке остаётся только сам сайт. Всё остальное отсюда убираем:
# статику nginx отдаёт ДО Apache, то есть любой .py и .tsv в public_html
# скачивается по прямой ссылке как обычный текстовый файл.
#   tools/     — конвейер сборки словаря и картинок: исходники, отчёты,
#                контактные листы и manual-review.tsv на 44 КБ. Сайту не нужен
#                ни один из них, а весит он больше самого сайта.
#   *.bak-*    — бэкапы словаря рядом с js/words.js.
rm -rf "$DEST/.git" "$DEST/deploy" "$DEST/__pycache__" "$DEST/tools" \
       "$DEST/README.md" "$DEST/DESIGN.md" "$DEST/.gitignore"
find "$DEST" -name "*.bak-*" -delete 2>/dev/null || true
rm -rf "$TMP"

echo "==> Папка для базы"
# Ровно там, где её ждёт wsgi.py: на уровень выше публичной папки.
# Внутри public_html Apache отдал бы базу по прямой ссылке.
DATA="$(dirname "$DEST")/savely-data"
mkdir -p "$DATA"
chmod 700 "$DATA"
echo "    $DATA"

echo "==> Проверяю, что приложение поднимается"
cd "$DEST"
if ! "$PY" - <<'CHECK'
import os, sys
sys.path.insert(0, ".")
import wsgi  # путь к базе wsgi.py определяет сам — проверяем ровно то,
             # что будет работать под mod_wsgi

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
echo "База: $DATA/savely.db"
echo "Копия перед обновлением:  cp $DATA/savely.db ~/savely-backup.db"
echo
echo "Файлы на месте. Осталось в панели:"
echo "  1. «Сайты» → шестерёнка у $SITE → версия Python 3.10"
echo "  2. Там же: тип приложения WSGI, файл wsgi.py, объект application"
echo "  3. «Домены и SSL» → выпустить бесплатный сертификат"
echo
echo "Потом открой https://твой-домен/health — должно вернуть {\"ok\": true}"
