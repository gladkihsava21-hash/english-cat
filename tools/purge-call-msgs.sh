#!/usr/bin/env bash
# Разовая зачистка: убрать сигналинг звонков из старых резервных копий.
#
# Зачем. В call_msgs лежат offer/answer/ice, а в них IP-адреса участников
# звонка. До v241 они не удалялись из базы никогда (чистка была привязана
# к board_id и срабатывала только при следующей записи в ту же доску),
# поэтому копии, снятые до починки, эти адреса содержат. Сама база уже
# чистая, а копии — нет.
#
# Ротация их не изживёт. deploy/backup.sh удаляет по маске
# «savely-*.db.gz» и только в ~/savely-backups: под неё не попадает ни
# один pre-deploy-*.db, а папку kotsaveli/savely-data ротация не смотрит
# вовсе.
#
# Запуск (скрипт живёт в tools/, а tools/ установщик вычищает из
# public_html — поэтому не «положить и запустить», а скормить по ssh):
#
#   ssh savely 'bash -s' < tools/purge-call-msgs.sh          # показать, что нашёл
#   ssh savely 'bash -s' < tools/purge-call-msgs.sh -- --go  # сделать
#
# Без --go ничего не меняет, только перечисляет файлы.
set -euo pipefail

GO=0
[[ "${1:-}" == "--go" || "${2:-}" == "--go" ]] && GO=1

SAFE="$HOME/savely-precleanup-$(date +%Y%m%d-%H%M%S)"

# VACUUM здесь обязателен, и это не про размер файла. Обычный DELETE
# помечает страницы свободными, но байты остаются лежать в файле: после
# «DELETE FROM call_msgs» все сорок с лишним ICE-кандидатов с IP
# по-прежнему читаются через strings. Удаляет их только перезапись базы.
purge() {
  sqlite3 "$1" "DELETE FROM call_msgs; VACUUM;"
}

count() {
  sqlite3 "$1" "select count(*) from call_msgs;" 2>/dev/null || echo 0
}

found=0
cleaned=0

for f in $(find "$HOME" -maxdepth 3 \( -name "*.db" -o -name "*.db.gz" \) \
             -not -path "*/before-savely-*" 2>/dev/null | sort); do
  # Живую базу не трогаем: её чистит сам сайт, и лезть в неё внешним
  # VACUUM во время урока незачем.
  [[ "$f" == *"/savely-data/savely.db" ]] && continue

  if [[ "$f" == *.gz ]]; then
    tmp=$(mktemp); gunzip -c "$f" > "$tmp" 2>/dev/null || { rm -f "$tmp"; continue; }
    n=$(count "$tmp")
    if [[ "$n" == "0" ]]; then rm -f "$tmp"; continue; fi
    found=$((found+1)); echo "  $n строк: $f"
    if [[ "$GO" == "1" ]]; then
      mkdir -p "$SAFE"; chmod 700 "$SAFE"
      cp "$f" "$SAFE/"                       # копия копии — до правки
      purge "$tmp"
      gzip -c "$tmp" > "$f"; chmod 600 "$f"
      cleaned=$((cleaned+1))
    fi
    rm -f "$tmp"
  else
    n=$(count "$f")
    if [[ "$n" == "0" ]]; then continue; fi
    found=$((found+1)); echo "  $n строк: $f"
    if [[ "$GO" == "1" ]]; then
      mkdir -p "$SAFE"; chmod 700 "$SAFE"
      cp "$f" "$SAFE/"
      purge "$f"; chmod 600 "$f"
      cleaned=$((cleaned+1))
    fi
  fi
done

echo "---"
if [[ "$found" == "0" ]]; then
  echo "Копий с сигналингом нет — чистить нечего."
  exit 0
fi
if [[ "$GO" == "0" ]]; then
  echo "Найдено файлов: $found. Ничего не менял."
  echo "Чтобы вычистить:  ssh savely 'bash -s' < tools/purge-call-msgs.sh -- --go"
  exit 0
fi

echo "Вычищено файлов: $cleaned"
echo "Копии до правки: $SAFE"
echo
# Проверяем именно СЫРЫЕ БАЙТЫ, а не count(*). Строк может быть ноль,
# а адреса лежать в освободившихся страницах — так ведёт себя DELETE без
# secure_delete. Живую базу и папку с копиями до правки исключаем: первую
# скрипт не трогает по смыслу, вторая для того и создана.
echo "Проверка — ищу IP-кандидаты в сырых байтах копий:"
left=$(find "$HOME" -maxdepth 3 -name "*.db" \
         -not -path "*/before-savely-*" \
         -not -path "*/savely-data/savely.db" \
         -not -path "$SAFE/*" -exec strings {} \; 2>/dev/null | grep -c "candidate:" || true)
if [[ "$left" == "0" ]]; then
  echo "  чисто: ни одного вхождения «candidate:»"
else
  echo "  ВНИМАНИЕ: осталось вхождений «candidate:» — $left. Разберись, прежде чем писать срок хранения в уведомление."
fi
