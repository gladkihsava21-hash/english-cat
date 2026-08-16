#!/usr/bin/env bash
# Ежедневная копия базы с ротацией по дням недели.
#
# Отличие от deploy/backup.sh: тот делает копию с датой и хранит 30 дней —
# это архив. Этот держит ровно семь файлов, по одному на день недели,
# и седьмой перезаписывает первый. Место не растёт никогда, а «вчера»
# и «неделю назад» всегда под рукой.
#
# Ставится в расписание один раз:
#   Timeweb → панель → Crontab → добавить задачу, каждый день в 4:00
#   bash ~/kotsaveli/public_html/tools/daily-backup.sh kotsaveli
#
# Проверить руками, что работает:
#   bash tools/daily-backup.sh kotsaveli && ls -la ~/savely-backups
set -euo pipefail

SITE="${1:-kotsaveli}"
DATA="$HOME/$SITE/savely-data"
DB="$DATA/savely.db"
DEST="$HOME/savely-backups"

if [[ ! -f "$DB" ]]; then
  echo "Базы нет: $DB" >&2
  exit 1
fi

mkdir -p "$DEST"
chmod 700 "$DEST"

# %u — день недели числом: 1 понедельник … 7 воскресенье.
# Имя файла от даты не зависит, поэтому ротация получается сама собой.
DOW=$(date +%u)
OUT="$DEST/daily-$DOW.db"

# .backup, а не cp: копирует согласованно, даже если прямо сейчас идёт
# запись. Обычный cp может поймать базу на середине транзакции — такая
# копия открывается, но часть данных в ней потеряна, и узнаете вы об
# этом ровно тогда, когда она понадобится.
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

chmod 600 "$OUT"

# Проверяем, что копия читается. Молчаливо битый бэкап хуже отсутствующего:
# на него рассчитывают.
if ! python3 -c "
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
n = c.execute('select count(*) from tutors').fetchone()[0]
m = c.execute('select count(*) from students').fetchone()[0]
print('  проверка: репетиторов %d, учеников %d' % (n, m))
" "$OUT"; then
  echo "!! Копия не читается, удаляю: $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

SIZE=$(du -k "$OUT" | cut -f1)
echo "Копия за день $DOW: $OUT (${SIZE} КБ)"
echo "Всего копий в ротации: $(find "$DEST" -name 'daily-?.db' | wc -l | tr -d ' ') из 7"
