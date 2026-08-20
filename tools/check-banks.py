#!/usr/bin/env python3
"""Проверка банков заданий: грамматика и словообразование.

Запускается руками и из tools/bump.py. Ловит то, что ломает ученику
занятие молча: ответ, которого нет среди вариантов; предложение без
пропуска; дубли предложений (на них завязан pickFresh в exercises.js);
пустые разборы. Банки — обычные JS-файлы, поэтому читаем их через node.
"""
import json, subprocess, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVELS = {"A1", "A2", "B1", "B2", "C1"}

def load(expr, files):
    js = "".join(open(os.path.join(ROOT, f), encoding="utf-8").read() + "\n" for f in files)
    out = subprocess.run(["node", "-e", js + f"\nconsole.log(JSON.stringify({expr}))"],
                         capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"node не смог прочитать {files}: {out.stderr}")
    return json.loads(out.stdout)

bad = []

g = load("({GRAMMAR, GRAMMAR_TOPICS})", ["js/grammar.js"])
topics = {t["id"] for t in g["GRAMMAR_TOPICS"]}
seen = {}
for tid, tasks in g["GRAMMAR"].items():
    if tid not in topics:
        bad.append(f"grammar: тема {tid} не объявлена в GRAMMAR_TOPICS")
    for i, t in enumerate(tasks):
        where = f"grammar.{tid}[{i}]"
        if "___" not in t.get("s", ""): bad.append(f"{where}: нет пропуска ___ в «{t.get('s','')[:50]}»")
        if t.get("a") not in t.get("o", []): bad.append(f"{where}: ответ «{t.get('a')}» не входит в варианты {t.get('o')}")
        if len(set(t.get("o", []))) != len(t.get("o", [])): bad.append(f"{where}: варианты повторяются {t.get('o')}")
        if not t.get("ru", "").strip(): bad.append(f"{where}: пустой перевод")
        if not t.get("why", "").strip(): bad.append(f"{where}: пустой разбор")
        if t.get("lvl") not in LEVELS: bad.append(f"{where}: странный уровень {t.get('lvl')}")
        key = t.get("s", "").strip().lower()
        if key in seen: bad.append(f"{where}: дубль предложения с {seen[key]}")
        seen[key] = where

w = load("WORD_FORMS", ["js/wordform.js"])
seen = {}
for i, t in enumerate(w):
    where = f"wordform[{i}]"
    if "___" not in t.get("s", ""): bad.append(f"{where}: нет пропуска ___")
    for f in ("base", "a", "ru", "why", "grp"):
        if not str(t.get(f, "")).strip(): bad.append(f"{where}: пустое поле {f}")
    if t.get("lvl") not in LEVELS: bad.append(f"{where}: странный уровень {t.get('lvl')}")
    # Совпадение ответа с исходным словом — почти всегда опечатка.
    # Исключение — задания-ловушки «форма не меняется» (в экзамене такие
    # есть); они обязаны честно говорить об этом в разборе.
    if (t.get("a", "").strip().lower() == t.get("base", "").strip().lower()
            and "менять нечего" not in t.get("why", "")):
        bad.append(f"{where}: ответ совпадает с исходным словом «{t.get('a')}» (если это ловушка — скажи в why «менять нечего»)")
    key = t.get("s", "").strip().lower()
    if key in seen: bad.append(f"{where}: дубль предложения с {seen[key]}")
    seen[key] = where

if bad:
    print("\n".join(bad))
    sys.exit(f"\nБанки не в порядке: {len(bad)} проблем")
counts = {tid: len(tasks) for tid, tasks in g["GRAMMAR"].items()}
print(f"Грамматика: {sum(counts.values())} заданий по {len(counts)} темам "
      f"(мин. {min(counts.values())}, макс. {max(counts.values())}); "
      f"словообразование: {len(w)}. Всё чисто.")
