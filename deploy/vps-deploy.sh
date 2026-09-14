#!/bin/bash
# Выкладка на VPS с мака одной командой:  bash deploy/vps-deploy.sh root@IP
# (замена timeweb-setup.sh: git pull на сервере + рестарт приложения)
set -euo pipefail
HOST="${1:?нужен адрес, например root@1.2.3.4}"
ssh "$HOST" "python3 -c \"import sqlite3,time; s=sqlite3.connect('/opt/wordcat/data/savely.db'); d=sqlite3.connect('/opt/wordcat/backups/pre-deploy-'+time.strftime('%Y%m%d-%H%M')+'.db'); s.backup(d)\" \
  && git -C /opt/wordcat/app pull -q && systemctl restart wordcat && systemctl reload nginx"
sleep 2
curl -s --max-time 15 https://wordcat.ru/health; echo
