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

# Перед копией снимаем протухший сигналинг звонков (offer/answer/ice —
# в них IP-адреса участников). Именно ДО копии, а не после: иначе эти
# адреса переедут в бэкап и переживут там тридцать дней, хотя в самой
# базе живут четыре минуты.
#
# Зовём db.sweep_call_msgs, а не свой DELETE: срок хранения задан
# константой CALL_TTL_SECONDS в db.py, и дублировать её здесь значит
# завести вторую правду, которая молча разойдётся с первой.
#
# Падение уборки не должно ронять бэкап — он тут главный. Поэтому
# || true: во время обновления сайта public_html может быть на середине
# git pull, и импорт не пройдёт.
CODE="$HOME/$SITE/public_html"
if [[ -f "$CODE/db.py" ]]; then
  SAVELY_DB="$DB" python3 -c "
import sys
sys.path.insert(0, '$CODE')
import db
print('  сигналинг звонков: удалено строк %d' % db.sweep_call_msgs())
" || echo "  уборку сигналинга пропустил (не смог импортировать db.py)"
fi

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

# Ротация старых копий. Всё, что старше KEEP_DAYS, удаляем.
#
# Маска здесь раньше была одна — «savely-*.db.gz», — и шапка скрипта
# честно обещала «хранит копии за 30 дней». На деле копии копились
# бессрочно: под маску не попадал ни один pre-deploy-*.db, а такую
# копию кладёт руками каждый деплой, и набралось их полсотни. То есть
# вся база — имена, почты, прогресс — лежала без срока в двух кучах.
# Не только тот сигналинг, ради которого всё затевалось.
#
# Маски перечислены поимённо, и это принципиально. Соблазн написать
# «savely*.db» велик, но такая маска задела бы саму savely.db: живую
# базу не должен трогать никакой find. По той же причине -maxdepth 1 —
# внутрь photos/ ротации лезть незачем.
rotate_old() {
  local dir="$1"; shift
  [[ -d "$dir" ]] || return 0
  local pat
  for pat in "$@"; do
    find "$dir" -maxdepth 1 -name "$pat" -mtime +$KEEP_DAYS -delete 2>/dev/null || true
  done
}

rotate_old "$DEST" "savely-*.db.gz" "photos-*.tar.gz" \
                   "pre-deploy-*.db" "pre-design-*.db" "savely-pre-*.db"

# Вторая куча — рядом с живой базой. Её не убирал вообще никто: ротация
# смотрела только в свою папку. daily-?.db не трогаем даже по возрасту:
# у той ротации свой механизм (семь файлов с перезаписью по дню недели),
# и удалять их отсюда значило бы драться с ним.
rotate_old "$DATA" "pre-deploy-*.db" "backup-*.db"

COUNT=$(find "$DEST" -name "savely-*.db.gz" | wc -l | tr -d ' ')
echo "Копия готова: $OUT.gz (всего копий: $COUNT)"
