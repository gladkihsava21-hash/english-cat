#!/usr/bin/env bash
# Резервная копия базы. Запускать по расписанию раз в сутки.
#
# На Timeweb: панель → Crontab → добавить задачу
#   bash /home/c/ЛОГИН/kotsaveli/public_html/deploy/backup.sh kotsaveli
# каждый день в 4 утра.
#
# Хранит копии за 30 дней. База маленькая (десятки килобайт), место не жалко.
set -euo pipefail

SITE="${1:-kotsaveli}"
DATA="$HOME/$SITE/savely-data"
DB="$DATA/savely.db"
DEST="$HOME/savely-backups"
KEEP_DAYS=30

if [[ ! -f "$DB" ]]; then
  echo "Базы нет: $DB"
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$DEST"

STAMP=$(date +%Y-%m-%d)
OUT="$DEST/savely-$STAMP.db"

# .backup, а не cp: копирует консистентно даже если в этот момент идёт
# запись. Обычный cp может поймать базу на середине транзакции.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$OUT'"
else
  python3 - "$DB" "$OUT" <<'PY'
import sqlite3, sys
src, dst = sys.argv[1], sys.argv[2]
a = sqlite3.connect(src)
b = sqlite3.connect(dst)
with b:
    a.backup(b)
a.close(); b.close()
PY
fi

gzip -f "$OUT"
chmod 600 "$OUT.gz"

# Фото домашек копируем раз в неделю: их сильно больше по объёму,
# а потеря снимка тетради не так страшна, как потеря прогресса
if [[ "$(date +%u)" == "7" && -d "$DATA/photos" ]]; then
  tar -czf "$DEST/photos-$STAMP.tar.gz" -C "$DATA" photos 2>/dev/null || true
  chmod 600 "$DEST/photos-$STAMP.tar.gz" 2>/dev/null || true
fi

find "$DEST" -name "savely-*.db.gz" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
find "$DEST" -name "photos-*.tar.gz" -mtime +$KEEP_DAYS -delete 2>/dev/null || true

COUNT=$(find "$DEST" -name "savely-*.db.gz" | wc -l | tr -d ' ')
echo "Копия готова: $OUT.gz (всего копий: $COUNT)"
