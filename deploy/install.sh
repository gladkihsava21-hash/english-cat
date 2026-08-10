#!/usr/bin/env bash
# Установка «Савелия» на чистый Ubuntu/Debian VPS.
#
# Запуск на сервере от root:
#   bash install.sh ваш-домен.ru ваш@email.ru
#
# Что делает: ставит python/nginx/certbot, разворачивает проект в /opt/savely,
# поднимает systemd-сервис, настраивает HTTPS. Повторный запуск безопасен.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
REPO="${REPO:-https://github.com/gladkihsava21-hash/english-cat.git}"
APP_DIR=/opt/savely

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Использование: bash install.sh домен.ru почта@для-ssl.ru"
  exit 1
fi

echo "==> Пакеты"
apt-get update -qq
apt-get install -y -qq python3 python3-venv git nginx certbot python3-certbot-nginx curl

echo "==> Код проекта"
if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

# Данные учеников живут вне репозитория, чтобы git pull их не трогал
mkdir -p /var/lib/savely
chown -R www-data:www-data /var/lib/savely "$APP_DIR"

echo "==> Служба"
cat > /etc/systemd/system/savely.service <<UNIT
[Unit]
Description=Savely — кот-репетитор английского
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$APP_DIR
Environment=SAVELY_DB=/var/lib/savely/savely.db
Environment=SAVELY_HOST=127.0.0.1
ExecStart=/usr/bin/python3 $APP_DIR/server.py
Restart=always
RestartSec=3
# сервер не должен писать никуда, кроме своей папки с данными
ProtectSystem=strict
ReadWritePaths=/var/lib/savely
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now savely
systemctl restart savely

echo "==> Nginx"
cat > /etc/nginx/sites-available/savely <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 12M;   # фото домашки

    location / {
        proxy_pass http://127.0.0.1:4210;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 180s;   # проверка домашки нейросетью небыстрая
    }
}
NGINX
ln -sf /etc/nginx/sites-available/savely /etc/nginx/sites-enabled/savely
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> HTTPS"
# без сертификата не работают ни микрофон, ни установка на телефон
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || {
  echo "!! Certbot не смог получить сертификат."
  echo "   Проверьте, что домен $DOMAIN уже указывает на IP этого сервера."
}

echo
echo "Готово."
echo "  Сайт ученика:     https://$DOMAIN"
echo "  Панель репетитора: https://$DOMAIN/tutor.html"
echo "  Логи:  journalctl -u savely -f"
echo "  Обновление:  bash $APP_DIR/deploy/update.sh"
