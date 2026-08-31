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
#   bash ~/savely-daily-backup.sh kotsaveli
#
# Путь именно такой: установщик копирует этот файл в домашнюю папку, а
# саму tools/ вычищает из public_html — оттуда её снесло бы следующее
# обновление вместе с задачей в расписании.
#
# Проверить руками, что работает:
#   bash tools/daily-backup.sh kotsaveli && ls -la ~/savely-backups
set -euo pipefail

SITE="${1:-kotsaveli}"
DATA="$HOME/$SITE/savely-data"
DB="$DATA/savely.db"
DEST="$HOME/savely-backups"
KEEP_DAYS=30      # для разовых копий: сама ротация «семь дней» их не касается

if [[ ! -f "$DB" ]]; then
  echo "Базы нет: $DB" >&2
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

SIZE=$(du -k "$OUT" | cut -f1)
echo "Копия за день $DOW: $OUT (${SIZE} КБ)"
echo "Всего копий в ротации: $(find "$DEST" -name 'daily-?.db' | wc -l | tr -d ' ') из 7"
