#!/usr/bin/env bash
# Обновление уже установленного сайта: забрать новый код и перезапустить.
#   bash /opt/savely/deploy/update.sh
set -euo pipefail

APP_DIR=/opt/savely
cd "$APP_DIR"

echo "==> Забираем свежий код"
git pull --ff-only

chown -R www-data:www-data "$APP_DIR"
systemctl restart savely
sleep 2

if systemctl is-active --quiet savely; then
  echo "Готово, сайт обновлён."
else
  echo "!! Сервис не поднялся. Смотрите: journalctl -u savely -n 50"
  exit 1
fi
