#!/usr/bin/env python3
"""Точка входа для планировщика Timeweb, если он не умеет запускать bash.

В панели задача задаётся парой «интерпретатор + путь до файла», и список
интерпретаторов там свой. Если bash в нём есть — эта обёртка не нужна,
ставь сразу savely-daily-backup.sh. Если в списке только PHP и Python —
ставь этот файл: он ничего не делает сам, только зовёт тот же скрипт,
чтобы не завелось второй правды о том, как снимается копия.
"""
import os
import subprocess
import sys

SCRIPT = os.path.join(os.path.expanduser("~"), "savely-daily-backup.sh")
SITE = sys.argv[1] if len(sys.argv) > 1 else "kotsaveli"

if not os.path.exists(SCRIPT):
    sys.exit("Нет файла %s — его кладёт установщик сайта (deploy/timeweb-setup.sh)." % SCRIPT)

# Вывод не перехватываем: скрипт сам пишет и в журнал, и на экран.
sys.exit(subprocess.call(["/bin/bash", SCRIPT, SITE]))
