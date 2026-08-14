#!/usr/bin/env python3
"""Отбраковка и слияние новых слов в js/words.js.

Конвейер (build_words.py) отдаёт кандидатов; здесь — последний фильтр перед
живыми учениками и само слияние. Вынесено отдельно от конвейера сознательно:
конвейер решает «нашёл ли я данные», этот скрипт — «можно ли это показывать
ребёнку». Второе меняется чаще первого и не должно требовать пересборки.

Запуск:
    python3 tools/merge_words.py            # показать, что будет сделано
    python3 tools/merge_words.py --apply    # записать js/words.js
"""

import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NEW = ROOT / "tools/out/words-new.json"
TARGET = ROOT / "js/words.js"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]

# --- Отбраковка -----------------------------------------------------------
# Каждое правило — с причиной: через месяц без неё непонятно, почему слова нет,
# и оно возвращается обратно следующим прогоном.

REJECT_EXAMPLE = [
    # Призывы и лозунги. Ловим формой, а не списком стран: подставить можно
    # любое название, и список никогда не будет полным.
    (re.compile(r"\b(abolish|down with|long live|overthrow|smash the)\b", re.I),
     "лозунг в примере"),
    # Политика: сайту 11-летних детей она не нужна ни в каком изводе, а
    # родитель, увидевший её в домашке, звонит репетитору, а не нам.
    (re.compile(r"\b(politic\w*|regime|dictator|puppet|communis\w*|fascis\w*)\b", re.I),
     "политика в примере"),
    # Реальные политики и государства в примере устаревают и датируют базу.
    (re.compile(r"\b(Bouteflika|Putin|Trump|Stalin|Hitler|Lenin)\b"),
     "имя политика в примере"),
    (re.compile(r"\b(shoot|shot|kill|murder|weapon|gun)\b", re.I),
     "насилие в примере"),
]

# Слово само по себе не годится для школьного словаря.
#
# Фильтр примеров этого НЕ ловит: пример может быть безупречным, а слово
# всё равно не для одиннадцатилетнего. Так в базу и попали nudity
# («Нудисты считают наготу нормальной» — грамматически безукоризненно)
# и straitjacket. Проверять надо и перевод тоже, а не только пример.
REJECT_WORD_RE = re.compile(
    # \b обязателен СЛЕВА у каждой основы. Без него «попытка» ловится
    # по «пытка», «наводка» — по «водк», «проказник» — по «казн»,
    # «показной» — тоже по «казн». Проверено: без границы терялось
    # обычное слово try.
    r"(\bнагот|\bсекс|\bэроти|\bпорно|\bмастурб|\bгениталь|"
    r"\bтруп|\bубий|\bказн[ьи]|\bпытк[аи]\b|\bсмирительн|"
    r"\bнаркот|\bалкогол|\bпьян|\bводк|\bпроститу|\bизнасил|"
    r"\bсуицид|\bсамоубий|\bаборт|\bфашист|\bнацист|\bгитлер|\bсталин)",
    re.I)

REJECT_WORD = {
    "charlotte": "имя собственное: пример про человека, а не про шарлотку",
    "jersey":    "имя собственное: пример про штат Нью-Джерси и реалити-шоу",
    "feminist":  "перевод-прилагательное при существительном в примере, тема спорная для детей",
}

# Перевод неверен по существу — правим, а не выбрасываем: слово нужное.
FIX_TRANSLATION = {
    "neighborhood": "район, окрестности",   # было «соседство» — это отношение, а не место
}

# Пример негодный, но слово нужное: без примера карточка живёт, часть
# упражнений его просто не предложит. Выбрасывать слово целиком из-за одного
# примера — терять то, чего в базе и так не хватает.
DROP_EXAMPLE = {
    "own":         "«Свой к своему по своё» — архаичная пословица, ребёнку непонятна",
    "border":      "«Abolish borders!» — лозунг",
    "corporation": "«This corporation is a political puppet» — политика",
    "rally":       "«Bouteflika banned political rallies» — политика и имя политика",
}


def bad_example(rec):
    ex = rec.get("ex") or ""
    for rx, why in REJECT_EXAMPLE:
        hit = rx.search(ex)
        if not hit:
            continue
        # Формы самого слова разрешены: иначе у «shoot» примера не будет
        # никогда, а слово в базе нужное. Отбрасываем только тогда, когда
        # сработало на ЧУЖОМ слове.
        if hit.group(0).lower() == rec["w"].lower():
            continue
        return why
    return None


def clean(words):
    kept, dropped, fixed = {}, [], []
    for lvl in LEVELS:
        kept[lvl] = []
        for rec in words.get(lvl, []):
            key = rec["w"].lower()
            if key in REJECT_WORD:
                dropped.append((rec["w"], lvl, REJECT_WORD[key]))
                continue
            # Проверяем ПЕРЕВОД и определение, а не только пример
            blob = " ".join(str(rec.get(f) or "") for f in ("t", "def", "exr"))
            hit = REJECT_WORD_RE.search(blob)
            if hit:
                dropped.append((rec["w"], lvl, f"не для детской аудитории: «{hit.group(0)}»"))
                continue
            why = bad_example(rec)
            if why and key not in DROP_EXAMPLE:
                dropped.append((rec["w"], lvl, why))
                continue
            rec = dict(rec)
            if key in FIX_TRANSLATION:
                fixed.append((rec["w"], rec["t"], FIX_TRANSLATION[key]))
                rec["t"] = FIX_TRANSLATION[key]
            if key in DROP_EXAMPLE:
                fixed.append((rec["w"], "пример убран", DROP_EXAMPLE[key]))
                rec.pop("ex", None)
                rec.pop("exr", None)
            kept[lvl].append(rec)
    return kept, dropped, fixed


# --- Слияние --------------------------------------------------------------

def js_string(s):
    """Строка для JS: экранируем кавычку и обратный слэш. Перевод строки в
    данных не встречается, но если появится — пусть ломается заметно."""
    return '"' + str(s).replace("\\", "\\\\").replace('"', '\\"') + '"'


def render(rec):
    parts = [f"w: {js_string(rec['w'])}", f"t: {js_string(rec['t'])}"]
    for f in ("ex", "exr", "def", "cat"):
        if rec.get(f):
            parts.append(f"{f}: {js_string(rec[f])}")
    return "    { " + ", ".join(parts) + " },"


def existing_words(src):
    return {m.lower() for m in re.findall(r'\{\s*w:\s*"([^"]+)"', src)}


def main():
    apply = "--apply" in sys.argv
    words = json.loads(NEW.read_text(encoding="utf-8"))["words"]
    kept, dropped, fixed = clean(words)

    src = TARGET.read_text(encoding="utf-8")
    have = existing_words(src)

    added = {}
    for lvl in LEVELS:
        added[lvl] = [r for r in kept[lvl] if r["w"].lower() not in have]

    print("ОТБРАКОВКА")
    for w, lvl, why in dropped:
        print(f"  − {w:16} {lvl}  {why}")
    print("\nПРАВКИ")
    for w, was, now in fixed:
        print(f"  ~ {w:16} {was} → {now}")

    print("\nСЛИЯНИЕ")
    total_before = len(have)
    for lvl in LEVELS:
        print(f"  {lvl}: +{len(added[lvl])}")
    total_add = sum(len(v) for v in added.values())
    print(f"  было {total_before}, добавляем {total_add}, станет {total_before + total_add}")

    if not apply:
        print("\nЭто предпросмотр. Для записи: python3 tools/merge_words.py --apply")
        return

    backup = TARGET.with_suffix(f".js.bak-{datetime.now():%Y%m%d-%H%M}")
    shutil.copy2(TARGET, backup)
    print(f"\nбэкап: {backup.name}")

    out = src
    for lvl in LEVELS:
        if not added[lvl]:
            continue
        block = "\n".join(render(r) for r in added[lvl])
        # Вставляем перед закрывающей скобкой уровня. Ищем начало уровня и
        # первую строку «  ],» после него — структура файла ровная, парсер
        # ради одной вставки заводить незачем.
        start = out.index(f"  {lvl}: [")
        end = out.index("\n  ],", start)
        out = out[:end] + "\n" + block + out[end:]
    TARGET.write_text(out, encoding="utf-8")
    print(f"записан {TARGET.name}")


if __name__ == "__main__":
    main()
