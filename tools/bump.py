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
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "tutor.html", "admin.html", "board.html"]


def current():
    text = (ROOT / "index.html").read_text(encoding="utf-8")
    found = [int(m) for m in re.findall(r"\?v=(\d+)", text)]
    return max(found) if found else 0


# Файлы, которых НЕТ в разметке: они подгружаются кодом по требованию
# (ensureWords / ensurePhrases в js/util.js). В офлайн-кэш они всё равно
# обязаны попасть — иначе ученик в метро откроет тренировку и получит
# «не дозвонился до словаря». Это единственное место, где список нужно
# дополнить руками, поэтому оно и лежит наверху на виду.
# Файлы, которых нет в разметке: их подтягивает loadScriptOnce по месту.
# В офлайн-кэш они обязаны попасть всё равно — иначе в самолёте у ученика
# откроется упражнение без заданий.
# Словарь в офлайн-кэш кладём НЕ ВЕСЬ, и это осознанно.
#
# Он разрезан по уровням (tools/split-words.py), и целиком это 2,1 МБ.
# Класть все шесть кусков в предзагрузку значит качать их каждому, кто
# просто открыл сайт, — ровно то, от чего резали. При этом service worker
# кэширует всё, что реально запросили (сеть → копия в кэш), так что
# уровень ученика попадает в офлайн сам, при первом же упражнении.
#
# A1 и A2 всё же кладём заранее: с них начинают почти все, и они самые
# лёгкие (104 КБ в gzip на двоих). Ученик, поставивший сайт приложением и
# сразу ушедший в офлайн, получит хотя бы начальные уровни.
LAZY = ["js/words-A1.js", "js/words-A2.js",
        "js/phrases.js", "js/wordform.js", "js/grammar.js",
        "js/ipa.js", "js/grammarcheck.js", "js/leveltest.js", "js/irregular.js"]


def assets_from_pages():
    """Список файлов берём из самих страниц, а не из головы: любой
    новый css/js попадает в офлайн-кэш сам, без отдельного напоминания."""
    seen = []
    for page in PAGES:
        text = (ROOT / page).read_text(encoding="utf-8")
        for path in re.findall(r'(?:href|src)="((?:css|js)/[^"?]+)', text):
            if path not in seen:
                seen.append(path)
    for path in LAZY:
        if path not in seen:
            seen.append(path)
    return seen


def validate_state():
    """Не даём поднять версию, если новое поле состояния забыли добавить
    в миграцию. Такая ошибка не видна разработчику: у него в браузере
    свежее сохранение. Ломается она у вернувшегося ученика — белым
    экраном, и узнаёшь об этом от него."""
    script = ROOT / "tools" / "validate-state.py"
    if not script.exists():
        return True
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode == 0


def check_banks():
    """Банки заданий (грамматика, словообразование) — рукописные данные,
    и одна опечатка вида «ответа нет среди вариантов» превращает задание
    в нерешаемое. Ученик винит себя, а не нас."""
    script = ROOT / "tools" / "check-banks.py"
    if not script.exists():
        return True
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode == 0


def check_qr():
    """QR-код рисуем сами, без библиотек. Сломанный код выглядит нормально
    и не читается только телефоном ученика — поэтому его читают обратно
    детектором на каждой выкладке."""
    script = ROOT / "tools" / "check-qr.py"
    if not script.exists():
        return True
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode == 0


def split_words():
    """Резать словарь по уровням — на сборке, а не руками.

    js/words.js остаётся источником правды (на нём весь конвейер слов и
    проверка на мат), а браузеру едут куски по уровням. Если резать
    руками, куски однажды разойдутся с источником, и ученик получит
    словарь позавчерашней версии — молча, без единой ошибки в консоли."""
    script = ROOT / "tools" / "split-words.py"
    if not script.exists():
        return True
    r = subprocess.run([sys.executable, str(script)], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode == 0


def main():
    if not split_words():
        print()
        print("Версия НЕ поднята: словарь не разрезался по уровням.")
        return 1
    if not validate_state():
        print()
        print("Версия НЕ поднята: сначала почините миграцию состояния.")
        return 1
    if not check_banks():
        print()
        print("Версия НЕ поднята: сначала почините банки заданий.")
        return 1
    if not check_qr():
        print()
        print("Версия НЕ поднята: QR-код не читается.")
        return 1

    ver = int(sys.argv[1]) if len(sys.argv) > 1 else current() + 1

    for page in PAGES:
        p = ROOT / page
        text = p.read_text(encoding="utf-8")
        text = re.sub(r"\?v=\d+", f"?v={ver}", text)
        # Версия для файлов, которые подставляет код, а не разметка:
        # ролик на экране регистрации грузится из js/app.js, и без этого
        # он оставался в кэше браузера прежним — правку текста в ролике
        # зрители не видели неделю.
        text = re.sub(r'data-v="\d+"', f'data-v="{ver}"', text)
        p.write_text(text, encoding="utf-8")

    assets = assets_from_pages()
    # Без ?v= : обработчик fetch кладёт в кэш то, что реально запрошено,
    # вместе с версией. Предзагрузка нужна только чтобы первый офлайн
    # после установки не оказался пустым экраном.
    listing = "\n".join(f'  "./{a}",' for a in assets)
    sw = ROOT / "sw.js"
    text = sw.read_text(encoding="utf-8")
    text = re.sub(r'const CACHE = "savely-v\d+";', f'const CACHE = "savely-v{ver}";', text)
    text = re.sub(r"const ASSETS = \[.*?\];",
                  # ВСЕ страницы, а не только index.html. Раньше в кэш
                  # попадала одна главная, и sw.js на любой офлайн-переход
                  # отдавал её же: репетитор открывал панель без сети и
                  # видел детский сайт вместо своего кабинета.
                  'const ASSETS = [\n  "./",\n'
                  + "".join('  "./%s",\n' % pg for pg in PAGES)
                  + listing
                  # Корневые файлы assets_from_pages() не видит — она
                  # ищет только css/ и js/. Значок вкладки нужен и офлайн:
                  # без него установленное приложение показывает пустой
                  # квадрат вместо кота.
                  + '\n  "./manifest.json",\n  "./icon-192.png",'
                    '\n  "./favicon.svg",\n];',
                  text, flags=re.S)
    sw.write_text(text, encoding="utf-8")

    # Та же цифра в server.py: /health отдаёт её из ПАМЯТИ процесса, и по
    # ней сразу видно, перезапустилось приложение на хостинге или нет.
    # Файлы на диске об этом не говорят ничего — они обновляются всегда.
    sp = ROOT / "server.py"
    sp.write_text(re.sub(r"^ASSET_VERSION = \d+", f"ASSET_VERSION = {ver}",
                         sp.read_text(encoding="utf-8"), flags=re.M), encoding="utf-8")

    print(f"версия: {ver}")
    print(f"страниц: {len(PAGES)}, файлов в офлайн-кэше: {len(assets)}")
    for a in assets:
        print("   ", a)
    return 0


if __name__ == "__main__":
    sys.exit(main())
