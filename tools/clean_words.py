#!/usr/bin/env python3
"""Чистка словаря после массового импорта.

ЧТО СЛУЧИЛОСЬ. Импорт из готового двуязычного массива (build_from_freedict.py)
раскладывал слова по уровням ПО ЧАСТОТНОСТИ. Для содержательных слов это
работает, а для служебных даёт катастрофу: у них первое значение в словаре
почти никогда не то, которым их употребляют.

    it   → вода          (первое значение в словарной статье)
    or   → золотой       (геральдический термин)
    see  → диоцез        (епархия, «Holy See»)
    can  → бидон, жбан   (существительное)
    do   → до, вечеринка (нота и «a do»)
    the  → чем + comp.

И это не редкие промахи, а ВЕРХУШКА частотного списка — то есть ровно то,
что видит новичок на уровне A1.

ДВА ПРАВИЛА, КОТОРЫЕ ЭТО ЗАКРЫВАЮТ

1. Служебные слова из импорта выбрасываются целиком. Артикли, местоимения,
   предлоги, союзы, вспомогательные глаголы — закрытый класс, их не учат
   карточками. «Знаешь слово the?» — бессмысленный вопрос.

2. Импортированные слова НЕ ПОПАДАЮТ в A1 и A2. Эти два уровня остаются за
   вычитанным ядром, где у каждого слова есть пример, определение и
   категория. Частотность — не то же самое, что уровень: statement и
   equipment частотны, но это не первые слова школьника.

Запуск:
    python3 tools/clean_words.py            # показать, что будет
    python3 tools/clean_words.py --apply
"""

import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "js/words.js"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# Закрытый класс: служебные слова английского. Их не учат как лексику —
# они осваиваются грамматикой и чтением, а не карточкой «слово ↔ перевод».
FUNCTION_WORDS = set("""
a an the this that these those
i you he she it we they me him her us them
my your his its our their mine yours hers ours theirs
myself yourself himself herself itself ourselves themselves
who whom whose which what where when why how
am is are was were be been being
do does did done doing
have has had having
will would shall should can could may might must
of in on at by for with from to into onto up down over under
out off about above below between through during before after
again further then once here there all any both each few more most
other some such no nor not only own same so than too very just
and or but if because as until while although though unless
one two three four five six seven eight nine ten
""".split())

# Мусорные переводы: остатки помет и разметки, которые не отсеялись.
BAD_TRANSLATION = re.compile(r"(comp\.|superl\.|\bсокр\b|^\W*$)", re.I)


def parse(src):
    """Разбираем на уровни, сохраняя исходные строки — так проще собрать
    файл обратно без потери форматирования."""
    out = {}
    for lvl in LEVELS:
        start = src.index(f"  {lvl}: [")
        end = src.index("\n  ],", start)
        block = src[start:end]
        rows = []
        for line in block.split("\n"):
            m = re.match(r'\s*\{\s*w:\s*"([^"]+)",\s*t:\s*"([^"]*)"', line)
            if m:
                rows.append({"line": line, "w": m.group(1), "t": m.group(2),
                             "full": "ex:" in line})
        out[lvl] = rows
    return out


def main():
    apply = "--apply" in sys.argv
    src = TARGET.read_text(encoding="utf-8")
    levels = parse(src)

    dropped_fn, dropped_junk, moved = [], [], []
    keep = {l: [] for l in LEVELS}

    for lvl in LEVELS:
        for rec in levels[lvl]:
            w = rec["w"].lower()
            # Правило 1: служебные слова — только если они пришли импортом.
            # Вычитанное ядро трогать нельзя: там у слова есть пример,
            # и «own — свой» с примером это нормальная карточка.
            if w in FUNCTION_WORDS and not rec["full"]:
                dropped_fn.append((rec["w"], rec["t"], lvl))
                continue
            if not rec["full"] and BAD_TRANSLATION.search(rec["t"]):
                dropped_junk.append((rec["w"], rec["t"], lvl))
                continue
            # Правило 2: импортированное не живёт в A1 и A2 — и не
            # переезжает ниже, а ВЫБРАСЫВАЕТСЯ.
            #
            # Сначала я их просто сдвигал в B1, но выборка показала, почему
            # так нельзя. Верхушка частотного списка — ровно тот участок,
            # где словарная статья даёт побочное значение:
            #   make → марка          think → обдумывание
            #   see  → диоцез         find  → находка, искание
            #   go   → го, очередь    place → дом, жилище
            # Плюс туда попадают не начальные формы, а словоформы:
            # days, said, used. Брак примерно в половине.
            #
            # Терять тут нечего: это слова, которые ученик к B1 давно знает,
            # а неверный перевод хуже отсутствующего — его выучат наизусть.
            if not rec["full"] and lvl in ("A1", "A2"):
                moved.append((rec["w"], lvl))
                continue
            keep[lvl].append(rec)

    print(f"ВЫБРОШЕНО служебных: {len(dropped_fn)}")
    for w, t, lvl in dropped_fn[:14]:
        print(f"   − {lvl}  {w:12} → {t[:40]}")
    print(f"\nВЫБРОШЕНО с мусорным переводом: {len(dropped_junk)}")
    for w, t, lvl in dropped_junk[:6]:
        print(f"   − {lvl}  {w:12} → {t[:40]}")
    print(f"\nВЫБРОШЕНО из верхушки частотности (A1/A2): {len(moved)}")
    for w, lvl in moved[:10]:
        print(f"   − {lvl}  {w}")

    print("\nСТАНЕТ:")
    total = 0
    for lvl in LEVELS:
        full = sum(1 for r in keep[lvl] if r["full"])
        print(f"  {lvl}: {len(keep[lvl]):5}  из них с примером: {full}")
        total += len(keep[lvl])
    print(f"  всего: {total}")

    if not apply:
        print("\nЭто предпросмотр. Запись: python3 tools/clean_words.py --apply")
        return

    backup = TARGET.with_suffix(f".js.bak-clean-{datetime.now():%H%M}")
    shutil.copy2(TARGET, backup)

    out = src
    # Идём с конца, чтобы индексы не съезжали
    for lvl in reversed(LEVELS):
        start = out.index(f"  {lvl}: [")
        end = out.index("\n  ],", start)
        head = out[start:out.index("\n", start) + 1]
        body = "\n".join(r["line"] for r in keep[lvl])
        out = out[:start] + head + body + out[end:]
    TARGET.write_text(out, encoding="utf-8")
    print(f"\nбэкап: {backup.name}\nзаписан {TARGET.name}")


if __name__ == "__main__":
    main()
