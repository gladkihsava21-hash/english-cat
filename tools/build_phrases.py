#!/usr/bin/env python3
"""Сборка трёх наборов фраз: phrasal verbs, idioms, collocations.

Роли поделены так же, как в build_words.py: этот скрипт собирает данные и
складывает их в tools/out/, а решение «можно ли это показывать ребёнку»
принимает merge_phrases.py. js/phrases.js отсюда не пишется никогда.

Откуда что берётся:
    фраза, перевод, буквальный перевод, уровень, категория — tools/wordpipe/phrasedata.py
                                                             (курируется руками, см. там же почему)
    определение по-английски                               — en.wiktionary REST
    пример и его перевод                                   — tatoeba.org
    сверка перевода                                        — раздел Translations en.wiktionary

Примеры:
    python3 tools/build_phrases.py --limit 20      # проверочный прогон
    python3 tools/build_phrases.py                 # полный
    python3 tools/build_phrases.py --offline       # пересобрать из кэша
    python3 tools/build_phrases.py --sample 40     # показать выборку глазами
"""

import argparse
import datetime
import os
import random
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from wordpipe import PROJECT_UA, emit, http_cache, phrasedata, phrases

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
OUT_DIR = os.path.join(TOOLS_DIR, "out")
KINDS = ["phrasal", "idiom", "colloc"]
LEVELS = emit.LEVELS


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--limit", type=int, default=0, help="обработать только N фраз каждого типа")
    p.add_argument("--kind", choices=KINDS, help="только один тип")
    p.add_argument("--workers", type=int, default=4)
    p.add_argument("--wiktionary-delay", type=float, default=0.4)
    p.add_argument("--tatoeba-delay", type=float, default=1.2)
    p.add_argument("--prefer-wiktionary-def", action="store_true",
                   help="брать определение Wiktionary вместо своего (см. комментарий в build_one)")
    p.add_argument("--offline", action="store_true", help="только кэш, в сеть не ходить")
    p.add_argument("--refresh", action="store_true", help="игнорировать кэш")
    p.add_argument("--sample", type=int, default=0, help="показать N готовых записей после прогона")
    p.add_argument("--seed", type=int, default=20260815)
    p.add_argument("--out", default=OUT_DIR)
    return p.parse_args(argv)


def build_one(seed, kind, ctx):
    """seed: (фраза, перевод, буквально, категория, уровень, запасное определение)."""
    phrase, ru, literal, cat, level, fallback_def = seed
    fetcher = ctx["fetcher"]
    notes = []

    record = {
        "w": phrase,
        "t": ru,
        "def": "",
        "cat": cat,
        "level": level,
        "kind": kind,
        "parts": phrases.parts(phrase),
    }
    if kind != "colloc":
        record["literal"] = literal

    # 1. Слова фразы — по детскому фильтру
    bad = phrases.blocked_tokens(phrase)
    if bad:
        notes.append("недетское слово во фразе: %s" % ", ".join(bad))

    # 2. Определение.
    #    По умолчанию берём своё, а определение Wiktionary используем как
    #    независимую проверку значения. Причина в двух вещах сразу:
    #      * REST отдаёт ПЕРВОЕ определение статьи, а у фразового глагола их
    #        3–6, и первое часто не то («get up» → «to ascend or climb»);
    #      * формулировки Wiktionary рассчитаны на взрослого («Ill or gloomy,
    #        especially from a cold or flu»), а тут школьник.
    #    Ключом --prefer-wiktionary-def поведение переключается на обратное.
    wik_def, def_err = phrases.fetch_definition(fetcher, phrase, ctx["wiktionary_delay"])
    def_agrees = phrases.definition_agrees(fallback_def, wik_def)
    if ctx["prefer_wiktionary_def"] and wik_def:
        record["def"] = wik_def
        def_source = "wiktionary"
    else:
        record["def"] = fallback_def
        def_source = "своё"
    if wik_def and def_agrees is False:
        notes.append("определение Wiktionary про другое значение: %s" % wik_def)

    # 3. Сверка перевода с Wiktionary
    variants, var_err = phrases.russian_variants(fetcher, phrase, ctx["wiktionary_delay"])
    agrees = phrases.translation_agrees(ru, variants)
    if agrees is False:
        notes.append("перевод расходится с Wiktionary: %s" % "; ".join(variants[:4]))

    # 4. Пример
    guard = phrases.guard_for(phrase)
    pair, pair_err = phrases.fetch_example(fetcher, phrase, guard, ctx["tatoeba_delay"], ours=ru)
    if pair:
        record["ex"] = pair["ex"]
        record["exr"] = pair["exr"]
        if not pair["confirmed"]:
            notes.append("пример не подтверждён переводом — проверить значение")
    else:
        notes.append("примера нет: %s" % pair_err)

    return {
        "record": record,
        "notes": notes,
        "def_source": def_source,
        "wik_def": wik_def or "",
        "wik_def_err": def_err,
        "def_agrees": def_agrees,
        "wik_ru": variants,
        "wik_err": var_err,
        "agrees": agrees,
        "blocked": bad,
        "has_example": bool(pair),
        "example_confirmed": bool(pair and pair["confirmed"]),
    }


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    random.seed(args.seed)
    started = time.time()

    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=PROJECT_UA,
                                 offline=args.offline, refresh=args.refresh)
    ctx = {
        "fetcher": fetcher,
        "wiktionary_delay": args.wiktionary_delay,
        "tatoeba_delay": args.tatoeba_delay,
        "prefer_wiktionary_def": args.prefer_wiktionary_def,
    }

    jobs = []
    seen = set()
    for kind, seeds in phrasedata.SETS:
        if args.kind and kind != args.kind:
            continue
        taken = 0
        for seed in seeds:
            key = seed[0].lower()
            if key in seen:
                print("дубль в списке-семени, пропускаю: %s" % seed[0])
                continue
            seen.add(key)
            jobs.append((seed, kind))
            taken += 1
            if args.limit and taken >= args.limit:
                break

    print("Фраз в работе: %d (%s)"
          % (len(jobs), ", ".join("%s:%d" % (k, sum(1 for _, kk in jobs if kk == k)) for k in KINDS)))
    print("Источники: en.wiktionary (определение, сверка перевода), tatoeba (пример).")

    results = []
    lock = threading.Lock()
    done = [0]

    def work(job):
        seed, kind = job
        try:
            out = build_one(seed, kind, ctx)
        except Exception as exc:                      # один кривой ответ не роняет прогон
            out = {"record": {"w": seed[0], "t": seed[1], "cat": seed[3], "level": seed[4],
                              "kind": kind, "parts": phrases.parts(seed[0]), "def": seed[5]},
                   "notes": ["внутренняя ошибка: %r" % exc], "def_source": "своё",
                   "wik_def": "", "wik_def_err": None, "def_agrees": None,
                   "wik_ru": [], "wik_err": None, "agrees": None, "blocked": [],
                   "has_example": False, "example_confirmed": False}
        out["kind"] = kind
        with lock:
            results.append(out)
            done[0] += 1
            if done[0] % 10 == 0 or done[0] == len(jobs):
                elapsed = time.time() - started
                sys.stdout.write("\r  %d/%d  %.2f фр/с   " % (done[0], len(jobs), done[0] / (elapsed or 1)))
                sys.stdout.flush()
        return out

    if args.workers <= 1:
        for job in jobs:
            work(job)
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            list(pool.map(work, jobs))
    print()

    order = {seed[0]: i for i, (seed, _) in enumerate(jobs)}
    results.sort(key=lambda r: order.get(r["record"]["w"], 1 << 30))

    by_kind = {k: [] for k in KINDS}
    for r in results:
        by_kind[r["kind"]].append(r["record"])

    # --- сводка ---
    stats = {}
    for kind in KINDS:
        rows = [r for r in results if r["kind"] == kind]
        if not rows:
            continue
        checked = [r for r in rows if r["wik_ru"]]
        with_def = [r for r in rows if r["wik_def"]]
        stats[kind] = {
            "всего": len(rows),
            "с примером": sum(1 for r in rows if r["has_example"]),
            "пример подтверждён переводом": sum(1 for r in rows if r["example_confirmed"]),
            "статья есть в Wiktionary": len(with_def),
            "определение вики про то же значение": sum(1 for r in with_def if r["def_agrees"] is True),
            "определение вики про другое значение": sum(1 for r in with_def if r["def_agrees"] is False),
            "перевод сверен с Wiktionary": len(checked),
            "перевод совпал": sum(1 for r in checked if r["agrees"] is True),
            "перевод разошёлся": sum(1 for r in checked if r["agrees"] is False),
            "заблокированные слова": sum(1 for r in rows if r["blocked"]),
            "по уровням": {lvl: sum(1 for r in rows if r["record"]["level"] == lvl) for lvl in LEVELS},
        }

    payload = {
        "meta": {
            "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            "sources": "en.wiktionary.org (CC BY-SA), tatoeba.org (CC BY 2.0 FR); "
                       "перевод и буквальный перевод — tools/wordpipe/phrasedata.py",
            "total": len(results),
        },
        "stats": stats,
        "phrases": {k: by_kind[k] for k in KINDS},
    }
    emit.write_json(os.path.join(args.out, "phrases-new.json"), payload)

    # Файл для чтения глазами: именно по нему считается доля годного.
    verdict = {True: "совпал", False: "РАЗОШЁЛСЯ", None: "нечем"}
    header = ["тип", "уровень", "фраза", "наш перевод", "переводы Wiktionary", "сверка перевода",
              "буквально", "наше определение", "определение Wiktionary", "сверка определения",
              "пример", "перевод примера", "пример подтверждён", "замечания"]
    lines = ["\t".join(header)]
    for r in results:
        rec = r["record"]
        lines.append("\t".join(str(x).replace("\t", " ").replace("\n", " ") for x in [
            r["kind"], rec["level"], rec["w"], rec["t"],
            "; ".join(r["wik_ru"][:5]), verdict[r["agrees"]],
            rec.get("literal", ""), rec["def"], r["wik_def"], verdict[r["def_agrees"]],
            rec.get("ex", ""), rec.get("exr", ""),
            "да" if r["example_confirmed"] else ("нет" if r["has_example"] else ""),
            "; ".join(r["notes"]),
        ]))
    emit._write(os.path.join(args.out, "phrases-check.tsv"), "\n".join(lines) + "\n")

    print("\nИтог за %.0f с" % (time.time() - started))
    for kind in KINDS:
        if kind not in stats:
            continue
        s = stats[kind]
        print("  %-8s всего %3d | пример %3d (подтверждён %d) | статья в вики %3d | перевод: совпал %3d, разошёлся %3d, нечем %3d"
              % (kind, s["всего"], s["с примером"], s["пример подтверждён переводом"],
                 s["статья есть в Wiktionary"],
                 s["перевод совпал"], s["перевод разошёлся"],
                 s["всего"] - s["перевод сверен с Wiktionary"]))
        print("           определение вики: то же значение %3d, другое %3d, статьи нет %3d"
              % (s["определение вики про то же значение"], s["определение вики про другое значение"],
                 s["всего"] - s["статья есть в Wiktionary"]))
        print("           по уровням: %s"
              % ", ".join("%s:%d" % (l, n) for l, n in s["по уровням"].items() if n))
    print("Запросов: сеть %d, кэш %d, ошибок %d"
          % (fetcher.stats["network"], fetcher.stats["cache_hits"], fetcher.stats["errors"]))
    print("Файлы: %s/phrases-new.json, %s/phrases-check.tsv" % (args.out, args.out))

    if args.sample:
        print("\n--- выборка %d записей ---" % args.sample)
        for r in random.sample(results, min(args.sample, len(results))):
            rec = r["record"]
            print("[%s %s] %-30s %s" % (rec["level"], r["kind"][:6], rec["w"], rec["t"]))
            if rec.get("literal"):
                print("      букв: %s" % rec["literal"])
            print("      def : %s" % rec["def"])
            if rec.get("ex"):
                print("      ex  : %s || %s" % (rec["ex"], rec["exr"]))
            if r["wik_ru"]:
                print("      вики: %s" % "; ".join(r["wik_ru"][:5]))
            if r["notes"]:
                print("      !   : %s" % "; ".join(r["notes"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
