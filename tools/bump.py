#!/usr/bin/env python3
"""Поднимает версию статики во всех местах разом.

Версия живёт в ЧЕТЫРЁХ местах: три html и sw.js. Пока их правили руками,
sw.js отставал — на момент написания скрипта в html стояло v=90, а
в service worker v=17, и список файлов в нём был двухмесячной давности:
половина существующих не перечислена, перечисленных больше нет.
Онлайн это не било (sw ходит «сначала сеть»), но офлайн ученик получал
код позапрошлой версии.

Запуск:
    python3 tools/bump.py         # следующая версия
    python3 tools/bump.py 95      # конкретная
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "tutor.html", "admin.html"]


def current():
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    found = [int(m) for m in re.findall(r"\?v=(\d+)", text)]
    return max(found) if found else 0


def assets_from_pages():
    """Список файлов берём из самих страниц, а не из головы: любой
    новый css/js попадает в офлайн-кэш сам, без отдельного напоминания."""
    seen = []
    for page in PAGES:
        text = (ROOT / page).read_text(encoding="utf-8")
        for path in re.findall(r'(?:href|src)="((?:css|js)/[^"?]+)', text):
            if path not in seen:
                seen.append(path)
    return seen


def main():
    ver = int(sys.argv[1]) if len(sys.argv) > 1 else current() + 1

    for page in PAGES:
        p = ROOT / page
        p.write_text(re.sub(r"\?v=\d+", f"?v={ver}", p.read_text(encoding="utf-8")),
                     encoding="utf-8")

    assets = assets_from_pages()
    # Без ?v= : обработчик fetch кладёт в кэш то, что реально запрошено,
    # вместе с версией. Предзагрузка нужна только чтобы первый офлайн
    # после установки не оказался пустым экраном.
    listing = "\n".join(f'  "./{a}",' for a in assets)
    sw = ROOT / "sw.js"
    text = sw.read_text(encoding="utf-8")
    text = re.sub(r'const CACHE = "savely-v\d+";', f'const CACHE = "savely-v{ver}";', text)
    text = re.sub(r"const ASSETS = \[.*?\];",
                  'const ASSETS = [\n  "./",\n  "./index.html",\n'
                  + listing
                  + '\n  "./manifest.json",\n  "./icon-192.png",\n];',
                  text, flags=re.S)
    sw.write_text(text, encoding="utf-8")

    print(f"версия: {ver}")
    print(f"страниц: {len(PAGES)}, файлов в офлайн-кэше: {len(assets)}")
    for a in assets:
        print("   ", a)


if __name__ == "__main__":
    main()
