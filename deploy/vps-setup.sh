#!/bin/bash
# Первичная настройка VPS (Ubuntu 24.04) для wordcat.ru — одним прогоном.
# Запуск НА СЕРВЕРЕ под root:  bash vps-setup.sh
#
# Что получается: nginx раздаёт статику и проксирует /api на наш server.py
# (stdlib, без gunicorn и прочих зависимостей — тот же файл, что локально),
# приложение живёт под systemd, база в /opt/wordcat/data, бэкап по крону.
set -euo pipefail

DOMAIN="wordcat.ru"
REPO="https://github.com/gladkihsava21-hash/english-cat.git"
APP=/opt/wordcat/app
DATA=/opt/wordcat/data

echo "== пакеты =="
apt-get update -qq
apt-get install -y -qq nginx python3 git certbot python3-certbot-nginx ufw >/dev/null

echo "== пользователь и каталоги =="
id -u wordcat >/dev/null 2>&1 || useradd -r -m -d /opt/wordcat -s /usr/sbin/nologin wordcat
mkdir -p "$APP" "$DATA" /opt/wordcat/backups

echo "== код =="
if [ -d "$APP/.git" ]; then git -C "$APP" pull -q; else git clone -q "$REPO" "$APP"; fi
chown -R wordcat:wordcat /opt/wordcat

echo "== systemd =="
cp "$APP/deploy/wordcat.service" /etc/systemd/system/wordcat.service
systemctl daemon-reload
systemctl enable --now wordcat

echo "== nginx =="
cp "$APP/deploy/wordcat-nginx.conf" /etc/nginx/sites-available/wordcat
sed -i "s/__DOMAIN__/$DOMAIN/g" /etc/nginx/sites-available/wordcat
ln -sf /etc/nginx/sites-available/wordcat /etc/nginx/sites-enabled/wordcat
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "== файрвол =="
ufw allow OpenSSH >/dev/null; ufw allow "Nginx Full" >/dev/null
ufw --force enable >/dev/null

echo "== бэкап по крону: ежедневно 04:00, храним 14 =="
cat > /etc/cron.d/wordcat-backup <<'CRON'
0 4 * * * wordcat python3 -c "import sqlite3,time; s=sqlite3.connect('/opt/wordcat/data/savely.db'); d=sqlite3.connect('/opt/wordcat/backups/savely-'+time.strftime('%Y%m%d')+'.db'); s.backup(d)" && ls -t /opt/wordcat/backups/savely-*.db | tail -n +15 | xargs -r rm
CRON

echo
echo "ГОТОВО. Дальше:"
echo "1) положить базу:   scp savely-*.db root@IP:/opt/wordcat/data/savely.db && chown wordcat:wordcat /opt/wordcat/data/savely.db && systemctl restart wordcat"
echo "2) проверить по IP: curl http://IP/health"
echo "3) переключить A-запись $DOMAIN на IP этого сервера"
echo "4) когда DNS доехал: certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect -m support@$DOMAIN --agree-tos -n"
