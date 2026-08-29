#!/usr/bin/env python3
"""Собирает наборы слов для теста на уровень — js/leveltest.js.

Зачем отдельный набор. Тест берёт по шесть слов на уровень, и раньше брал
их случайно из всего банка: в A2 попадали «nowadays» и «illegal», в B1 —
«flute» и «vague». Внутри одного уровня слова расходятся по трудности
в разы, поэтому блок из шести случайных был лотереей: один прогон лёгкий,
другой зверский. Отсюда и жалоба — три попытки дали A2, C1 и B1.

Что делаем. Для каждого уровня берём САМЫЕ ЧАСТОТНЫЕ слова этого уровня:
именно их школьник встречает в жизни чаще всего, и знание такого слова
честно говорит о владении уровнем. Редкие слова из теста уходят —
они остаются в тренировках, где их и надо учить.

Частоты берём из того же кэша, что и остальной конвейер
(tools/cache/freq, OpenSubtitles 2018 + Google Books).

Запуск: python3 tools/build-leveltest.py
"""
import difflib
import json
import math
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "tools", "cache", "freq")
OUT = os.path.join(ROOT, "js", "leveltest.js")

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
PER_LEVEL = 60          # запас на уровень: тест берёт из него шесть



# Латиница → примерная кириллица. Нужна для одного: отсечь заимствования.
TRANSLIT = [
    ("tion", "шн"), ("sion", "жн"), ("ph", "ф"), ("ch", "ч"), ("sh", "ш"),
    ("th", "т"), ("ck", "к"), ("qu", "кв"), ("ee", "и"), ("oo", "у"),
    ("ou", "ау"), ("ea", "и"), ("ai", "эй"), ("ay", "эй"), ("ey", "ей"),
    ("x", "кс"), ("c", "к"), ("y", "и"), ("j", "дж"), ("g", "г"), ("h", "х"),
    ("a", "а"), ("b", "б"), ("d", "д"), ("e", "е"), ("f", "ф"), ("i", "и"),
    ("k", "к"), ("l", "л"), ("m", "м"), ("n", "н"), ("o", "о"), ("p", "п"),
    ("r", "р"), ("s", "с"), ("t", "т"), ("u", "у"), ("v", "в"), ("w", "в"),
    ("z", "з"), ("'", ""), ("-", ""),
]


def translit(word):
    out = word.lower()
    for a, b in TRANSLIT:
        out = out.replace(a, b)
    return out


def is_loanword(en, ru):
    """Заимствование: русский перевод — то же самое слово кириллицей.

    «login — логин», «espresso — эспрессо», «monopoly — монополия».
    Такие слова русский школьник понимает, не зная английского, поэтому
    в тесте они меряют не владение языком, а знакомство с вывесками."""
    if not ru:
        return False
    first = re.split(r"[,;(]", ru)[0].strip().lower().replace("ё", "е")
    if not first:
        return False
    guess = translit(en)
    # Сравниваем начала: окончания в русском свои («монополия» против
    # «монополи»), и требовать совпадения целиком бессмысленно.
    n = min(len(guess), len(first), 7)
    if n < 4:
        return False
    return difflib.SequenceMatcher(None, guess[:n], first[:n]).ratio() >= 0.75


def load_ranks():
    """Ранг слова: чем меньше, тем чаще встречается.

    Складываем два корпуса средним геометрическим — так же, как это делает
    tools/wordpipe/frequency.py при раздаче уровней. Слово, редкое в обоих,
    получает большой ранг и в тест не попадёт."""
    ranks = {}
    for name in os.listdir(CACHE):
        path = os.path.join(CACHE, name)
        order = {}
        with open(path, encoding="utf-8", errors="ignore") as f:
            for i, line in enumerate(f):
                parts = line.split()
                if not parts:
                    continue
                word = parts[0].lower()
                if word not in order:
                    order[word] = i + 1
        for w, r in order.items():
            ranks.setdefault(w, []).append(r)
    return {w: math.exp(sum(math.log(r) for r in rs) / len(rs))
            for w, rs in ranks.items()}


def words_by_level():
    """Слова сайта: читаем js/words.js через node, чтобы не разбирать JS руками."""
    # Через файл, а не через -e: словарь весит больше мегабайта,
    # и такой аргумент командная строка уже не принимает.
    src = os.path.join(ROOT, "js", "words.js")
    tmp = os.path.join(ROOT, "tools", "out", "_dump-words.js")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(open(src, encoding="utf-8").read())
        f.write("\nconsole.log(JSON.stringify(WORDS));\n")
    out = subprocess.run(["node", tmp], capture_output=True, text=True)
    os.remove(tmp)
    if out.returncode:
        sys.exit("не смог прочитать js/words.js: " + out.stderr[-400:])
    return json.loads(out.stdout)


def main():
    if not os.path.isdir(CACHE):
        sys.exit("нет кэша частот (tools/cache/freq) — запусти сначала tools/build_words.py")
    ranks = load_ranks()
    words = words_by_level()

    # Список CEFR-J — авторитет по учебной лексике A1..B2. Слово, которого
    # там нет, в тест не идёт: так отсекается мусор из субтитров («li»,
    # «phi») и случайные формы, которым частотность выдала высокий уровень.
    cefrj_path = os.path.join(ROOT, "tools", "wordpipe", "cefrj.json")
    cefrj = set()
    if os.path.exists(cefrj_path):
        cefrj = {w.lower() for w in json.load(open(cefrj_path, encoding="utf-8"))["words"]}

    # У CEFR-J нет C1 и C2 — там своя проверка: слово должно быть в нашем
    # банке с определением и не быть формой более простого слова.
    all_lower = {w["w"].lower() for lvl in LEVELS for w in words.get(lvl, [])}

    def is_inflection(token):
        """«studying», «recognized», «filled» — формы слов, которые ученик
        и так знает. В тесте они меряют не словарь, а грамматику."""
        for suf, cut in (("ing", 3), ("ed", 2), ("es", 2), ("s", 1), ("ly", 2)):
            if token.endswith(suf) and len(token) - cut >= 3:
                stem = token[:-cut]
                if stem in all_lower or (stem + "e") in all_lower:
                    return True
        return False

    # Мат и взрослая лексика в тест не попадают никогда. Список общий
    # на проект (tools/wordpipe/blocklist.py): раньше словарь чистили
    # руками, а этот сборщик приносил «suck» и «kinky» обратно.
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    from wordpipe.blocklist import is_blocked

    picked = {}
    for lvl in LEVELS:
        pool = []
        for w in words.get(lvl, []):
            token = w["w"].lower()
            # Составные и многословные в тест не берём: «знаю/не знаю»
            # про них отвечают неуверенно, и ответ мало о чём говорит.
            if not re.fullmatch(r"[a-z][a-z'-]{2,}", token):
                continue
            if lvl in ("A1", "A2", "B1", "B2"):
                if cefrj and token not in cefrj:
                    continue
            else:
                if len(token) < 5 or not (w.get("def") or "").strip():
                    continue
            if is_inflection(token):
                continue
            # Причастия и герундии: «entitled», «suspended» — это про
            # грамматику, а не про словарь.
            if token.endswith("ed") or token.endswith("ing"):
                continue
            if is_loanword(token, w.get("t", "")):
                continue
            if is_blocked(token, in_test=True):
                continue
            r = ranks.get(token)
            if r is None:
                continue
            pool.append((r, w["w"]))
        pool.sort()
        picked[lvl] = [w for _, w in pool[:PER_LEVEL]]
        print(f"  {lvl}: из {len(words.get(lvl, []))} слов отобрано {len(picked[lvl])}"
              f"  ({', '.join(picked[lvl][:6])}…)")

    thin = [l for l in LEVELS if len(picked[l]) < 20]
    if thin:
        sys.exit(f"мало слов для уровней {thin} — тест станет предсказуемым")

    body = ",\n".join(
        '  %s: [%s]' % (lvl, ", ".join(json.dumps(w) for w in picked[lvl]))
        for lvl in LEVELS)
    text = (
        "// Слова для теста на уровень. Файл СОБИРАЕТСЯ скриптом\n"
        "// tools/build-leveltest.py — руками не править.\n"
        "//\n"
        "// Здесь по %d самых частотных слов каждого уровня. Тест берёт из них\n"
        "// шесть на уровень. Раньше он брал шесть случайных из всего банка,\n"
        "// и блок выходил лотереей: рядом с «hotel» попадался «flute», рядом\n"
        "// с «money» — «vague». Один и тот же ученик получал то A2, то C1.\n"
        "//\n"
        "// Редкие слова никуда не делись — они остались в тренировках.\n"
        "// В тесте им не место: тест меряет уровень, а не везение.\n"
        "const LEVEL_TEST_WORDS = {\n%s,\n};\n" % (PER_LEVEL, body))
    open(OUT, "w", encoding="utf-8").write(text)
    size = os.path.getsize(OUT)
    print(f"\nзаписано {OUT} ({size // 1024} КБ)")


if __name__ == "__main__":
    main()
