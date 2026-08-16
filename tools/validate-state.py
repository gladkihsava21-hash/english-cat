#!/usr/bin/env python3
"""Проверка: все поля состояния ученика покрыты миграцией.

ЗАЧЕМ. Состояние ученика лежит в localStorage и приезжает с сервера.
Когда в код добавляют новое поле, объект по умолчанию в loadState()
получает его сразу — а вот сохранение, сделанное СТАРОЙ версией, о нём
не знает. Если поле не продублировано в блоке миграции, у вернувшегося
ученика оно окажется undefined.

Это не гипотетическая беда. Ровно так и случилось: в миграции не было
dictionary и recommendSeen, и старое сохранение роняло главный экран
целиком — белый экран вместо дашборда, потому что код звал
state.recommendSeen.push у несуществующего массива.

Заметить это глазами почти невозможно: у разработчика в браузере лежит
свежее сохранение, где все поля есть. Ломается только у того, кто не
заходил с прошлой версии. Поэтому проверка машинная и запускается
из tools/bump.py перед каждой выкладкой.

Запуск:
    python3 tools/validate-state.py
Возвращает 1, если найдено непокрытое поле.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "js", "app.js")

# Поля, которым миграция не нужна, и это осознанно.
# user и level — единственные, чьё отсутствие ЗНАЧИМО: по ним код решает,
# показать приветствие, тест или главную. Подставить им значение по
# умолчанию значило бы соврать про состояние ученика.
NO_MIGRATION_NEEDED = {"user", "level"}


def read_default_state(src):
    """Ключи объекта по умолчанию из loadState().

    Ищем присваивание вида `st = st || { ... };` — это единственное место,
    где состояние собирается с нуля.
    """
    m = re.search(r"st\s*=\s*st\s*\|\|\s*\{(.*?)\n\s*\};", src, re.S)
    if not m:
        return None, "не нашёл объект по умолчанию (`st = st || { … };`) в loadState()"
    body = m.group(1)
    # Комментарии выкидываем, иначе `// dictionary: …` посчитается полем
    body = re.sub(r"//[^\n]*", "", body)
    keys = re.findall(r"^\s*([A-Za-z_$][\w$]*)\s*:", body, re.M)
    return keys, None


def read_migrated(src):
    """Поля, которым миграция что-то присваивает: `st.X = st.X || …`
    или `st.X = …`. Второе тоже считается: важно, что поле трогают."""
    m = re.search(r"function loadState\(\)\s*\{(.*?)\n\}", src, re.S)
    if not m:
        return None, "не нашёл функцию loadState()"
    body = m.group(1)
    body = re.sub(r"//[^\n]*", "", body)
    return set(re.findall(r"\bst\.([A-Za-z_$][\w$]*)\s*=", body)), None


def main():
    if not os.path.exists(APP):
        print("Нет файла:", APP)
        return 1
    src = open(APP, encoding="utf-8").read()

    defaults, err = read_default_state(src)
    if err:
        print("Проверка состояния НЕ ПРОШЛА:", err)
        print("Если loadState() переписали — поправьте и этот скрипт,")
        print("иначе проверка молча перестанет что-либо проверять.")
        return 1

    migrated, err = read_migrated(src)
    if err:
        print("Проверка состояния НЕ ПРОШЛА:", err)
        return 1

    missing = [k for k in defaults
               if k not in migrated and k not in NO_MIGRATION_NEEDED]

    print("Состояние ученика: полей по умолчанию %d, покрыто миграцией %d"
          % (len(defaults), len(migrated)))

    if missing:
        print()
        print("НЕ ПОКРЫТЫ МИГРАЦИЕЙ:")
        for k in missing:
            print("   •", k)
        print()
        print("Что это значит: у ученика, который не заходил с прошлой версии,")
        print("это поле будет undefined — и код, который его читает, упадёт.")
        print()
        print("Как чинить: в loadState(), в блоке «миграция старых сохранений»,")
        print("добавьте строку вида")
        print("    st.%s = st.%s || <значение по умолчанию>;" % (missing[0], missing[0]))
        return 1

    print("Все поля покрыты — старое сохранение не сломается.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
