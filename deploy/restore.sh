#!/usr/bin/env bash
# Восстановление базы из резервной копии.
#   bash restore.sh                    — показать список копий
#   bash restore.sh 2026-08-11         — восстановить копию за эту дату
set -euo pipefail

SITE="${SITE:-kotsaveli}"
DATA="$HOME/$SITE/savely-data"
DEST="$HOME/savely-backups"
DATE="${1:-}"

if [[ -z "$DATE" ]]; then
  echo "Доступные копии:"
  ls -1 "$DEST"/savely-*.db.gz 2>/dev/null | sed 's|.*/savely-||; s|\.db\.gz$||; s|^|  |' || echo "  копий нет"
  echo
  echo "Восстановить:  bash $0 ГГГГ-ММ-ДД"
  exit 0
fi

SRC="$DEST/savely-$DATE.db.gz"
[[ -f "$SRC" ]] || { echo "Нет копии за $DATE"; exit 1; }

# Текущую базу не затираем, а откладываем: если копия окажется не той,
# вернуться будет некуда
SAFE="$DATA/savely.before-restore-$(date +%Y%m%d-%H%M%S).db"
[[ -f "$DATA/savely.db" ]] && cp "$DATA/savely.db" "$SAFE" && echo "Текущая база сохранена: $SAFE"

gunzip -c "$SRC" > "$DATA/savely.db"
chmod 600 "$DATA/savely.db"
echo "Восстановлена копия за $DATE."
echo "Теперь перезапустите приложение в панели хостинга."
