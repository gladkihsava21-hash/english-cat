#!/usr/bin/env python3
"""Разрезать js/words.js на файлы по уровням.

Зачем. Словарь весит 2,1 МБ (690 КБ в gzip) и едет ЦЕЛИКОМ при первом
заходе в любое упражнение. Из них 283 КБ — уровень C2, который русскому
школьнику не нужен вовсе. На слабом мобильном это минута с лишним
пустого экрана, замерено.

Ученику нужны свой уровень, всё что ниже и один следующий — так подбирают
слова trainPool и levelPool. Для A2 это 198 КБ вместо 690.

js/words.js остаётся источником правды: на нём работает весь конвейер
слов (tools/build_words.py, clean_words.py, check_words.py) и проверка на
мат в check-banks.py. Резка выполняется на сборке (tools/bump.py), чтобы
куски не разошлись с источником.

Запуск руками:  python3 tools/split-words.py
"""
import io
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "js", "words.js")
HEAD = """// СГЕНЕРИРОВАНО tools/split-words.py из js/words.js — руками не править.
// Правки вносятся в js/words.js, куски пересобирает tools/bump.py.
//
// Уровень %s: %d слов. Грузится по требованию (ensureWords в js/util.js):
// ученику едут его уровень, всё что ниже и один следующий, а не весь
// словарь целиком.
(window.WORDS = window.WORDS || {}).%s = """


def run_node(js, what):
    """Выполнить кусок JS и забрать JSON со stdout.

    Через временный файл, а не node -e: словарь весит два мегабайта, и
    аргументом командной строки такое не передать — ядро отвечает
    «Argument list too long». На этом же спотыкался check-banks.py."""
    import tempfile
    fd, path = tempfile.mkstemp(suffix=".js")
    try:
        with io.open(fd, "w", encoding="utf-8") as f:
            f.write(js)
        out = subprocess.run(["node", path], capture_output=True, text=True)
    finally:
        os.unlink(path)
    if out.returncode:
        sys.exit("node не смог прочитать %s: %s" % (what, out.stderr[:400]))
    return json.loads(out.stdout)


def load():
    """Читаем словарь через node: свой парсер JS писать незачем."""
    js = io.open(SRC, encoding="utf-8").read()
    return run_node(js + "\nprocess.stdout.write(JSON.stringify(WORDS))", "js/words.js")


def dump_entry(rec):
    """Одна запись в том же виде, что в исходнике: порядок полей сохраняем,
    иначе diff между сборками будет шумом на весь файл."""
    parts = []
    for k in ("w", "t", "ex", "exr", "def", "cat"):
        if k in rec and rec[k] not in (None, ""):
            parts.append('%s: %s' % (k, json.dumps(rec[k], ensure_ascii=False)))
    # поля сверх известных не теряем
    for k in sorted(rec):
        if k not in ("w", "t", "ex", "exr", "def", "cat"):
            parts.append('%s: %s' % (k, json.dumps(rec[k], ensure_ascii=False)))
    return "  { " + ", ".join(parts) + " },"


def main():
    words = load()
    written = []
    for lvl, items in words.items():
        if not re.fullmatch(r"[A-C][12]", lvl):
            sys.exit("странный уровень в словаре: %r" % lvl)
        body = "[\n" + "\n".join(dump_entry(r) for r in items) + "\n];\n"
        text = (HEAD % (lvl, len(items), lvl)) + body
        path = os.path.join(ROOT, "js", "words-%s.js" % lvl)
        old = io.open(path, encoding="utf-8").read() if os.path.exists(path) else None
        if old != text:
            io.open(path, "w", encoding="utf-8").write(text)
        written.append((lvl, len(items), len(text.encode("utf-8"))))

    # Куски обязаны читаться и складываться обратно в исходный словарь —
    # иначе ученик получит битый файл, а мы узнаем об этом от него.
    check = "".join(
        io.open(os.path.join(ROOT, "js", "words-%s.js" % lvl), encoding="utf-8").read()
        for lvl, _, _ in written)
    back = run_node("var window={};" + check
                    + "\nprocess.stdout.write(JSON.stringify(window.WORDS))",
                    "разрезанный словарь")
    if back != words:
        for lvl in words:
            if back.get(lvl) != words[lvl]:
                sys.exit("уровень %s после разрезки не совпал с исходником" % lvl)
        sys.exit("разрезанный словарь не совпал с исходником")

    total = sum(s for _, _, s in written)
    print("Словарь разрезан: " + ", ".join(
        "%s %d слов (%d КБ)" % (l, n, s // 1024) for l, n, s in written))
    print("всего %d КБ; собранное обратно совпадает с js/words.js" % (total // 1024))


main()
