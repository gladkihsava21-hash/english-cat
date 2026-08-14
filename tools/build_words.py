#!/usr/bin/env python3
"""Расширение словарной базы english-cat: 554 -> 3000+ слов.

Только стандартная библиотека Python 3. js/words.js читается, но НИКОГДА не
переписывается — результат кладётся в tools/out/.

Примеры:
    # проверочный прогон на 200 словах
    python3 tools/build_words.py --limit 200

    # полный прогон
    python3 tools/build_words.py --target 3000

    # пересобрать выдачу из кэша, без единого сетевого запроса
    python3 tools/build_words.py --limit 200 --offline

    # показать 20 случайных готовых слов из последнего прогона
    python3 tools/build_words.py --sample 20 --offline --limit 200
"""

import argparse
import datetime
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from wordpipe import PROJECT_UA, categorize, emit, existing, filters, frequency, http_cache, pipeline

TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(TOOLS_DIR)
WORDS_JS = os.path.join(PROJECT_DIR, "js", "words.js")
CACHE_DIR = os.path.join(TOOLS_DIR, "cache")
OUT_DIR = os.path.join(TOOLS_DIR, "out")


def parse_args(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--limit", type=int, default=0, help="сколько слов-кандидатов обработать (0 = пока не наберём --target)")
    p.add_argument("--target", type=int, default=0, help="сколько готовых слов нужно набрать")
    p.add_argument("--skip-top", type=int, default=100, help="пропустить N самых частых слов (the, of, a...)")
    p.add_argument("--per-level", type=int, default=0,
                   help="брать по N кандидатов на каждый уровень A1..C2 и чередовать их — "
                        "чтобы база пополнялась на всех уровнях, а не только на A1")
    p.add_argument("--stride", type=int, default=1,
                   help="брать каждое N-е слово — выборка по всему диапазону частот, "
                        "чтобы честно оценить долю годного на полном прогоне")
    p.add_argument("--workers", type=int, default=4, help="потоков (лимит запросов всё равно общий)")
    p.add_argument("--wiktionary-delay", type=float, default=0.4)
    p.add_argument("--tatoeba-delay", type=float, default=1.2)
    p.add_argument("--max-senses", type=int, default=4, help="больше значений — на ручную доработку")
    p.add_argument("--strict-pos", action="store_true", help="считать омонимом любое слово с двумя частями речи (строже, слов будет меньше)")
    p.add_argument("--offline", action="store_true", help="только кэш, в сеть не ходить")
    p.add_argument("--refresh", action="store_true", help="игнорировать кэш и перекачать")
    p.add_argument("--no-books", action="store_true", help="не использовать частоты Google Books")
    p.add_argument("--sample", type=int, default=0, help="показать N готовых слов после прогона")
    p.add_argument("--seed", type=int, default=20260814)
    p.add_argument("--out", default=OUT_DIR)
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv or sys.argv[1:])
    random.seed(args.seed)
    started = time.time()

    base = existing.load(WORDS_JS)
    print("Существующая база: %d слов, %d категорий, уровни %s"
          % (len(base.words), len(base.categories),
             ", ".join("%s:%d" % (l, len(base.by_level.get(l, []))) for l in emit.LEVELS)))

    fetcher = http_cache.Fetcher(CACHE_DIR, user_agent=PROJECT_UA, offline=args.offline, refresh=args.refresh)
    print("Загружаю частотные списки...")
    freq = frequency.load(fetcher, use_books=not args.no_books)
    print("  " + "; ".join(freq.sources))

    bands, medians = freq.calibrate(base.by_level)
    if bands:
        freq.bands = bands
        print("  границы уровней по вашей базе (медианный ранг): %s"
              % ", ".join("%s<=%s" % (n, u if u else "∞") for n, u in bands))
        print("  медианы: %s" % ", ".join("%s=%s" % (k, v) for k, v in sorted(medians.items())))
    else:
        print("  калибровка не удалась, беру границы по умолчанию")

    # --- отбор кандидатов ---
    existing_words = base.word_set
    candidates, prefiltered = [], {"уже есть": 0, "словоформа": 0, "прочее": 0}
    for word in freq.candidates(skip_top=args.skip_top):
        ok, reason = filters.acceptable_headword(word, existing_words)
        if not ok:
            key = "уже есть" if reason == "уже есть в базе" else "прочее"
            prefiltered[key] += 1
            continue
        if filters.looks_inflected(word, freq):
            prefiltered["словоформа"] += 1
            continue
        candidates.append(word)

    limit = args.limit or (args.target * 3 if args.target else 200)
    if args.per_level:
        # Раскладываем кандидатов по уровням и берём с каждого поровну, чередуя.
        # Иначе прогон по частотному списку сверху вниз даёт одни A1, а ученики
        # у нас в основном B1 — им из такой базы тренироваться нечем.
        buckets = {level: [] for level in emit.LEVELS}
        for word in candidates:
            buckets[freq.level(word)].append(word)
        print("  кандидатов по уровням: %s"
              % ", ".join("%s:%d" % (l, len(buckets[l])) for l in emit.LEVELS))
        picked = {l: buckets[l][: args.per_level] for l in emit.LEVELS}
        todo = []
        for i in range(args.per_level):
            for level in emit.LEVELS:
                if i < len(picked[level]):
                    todo.append(picked[level][i])
        todo = todo[:limit] if args.limit else todo
    elif args.stride > 1:
        todo = candidates[:: args.stride][:limit]
    else:
        todo = candidates[:limit]
    print("Кандидатов после фильтров: %d (отсеяно: %s). Беру %d."
          % (len(candidates), ", ".join("%s %d" % (k, v) for k, v in prefiltered.items()), len(todo)))

    ctx = {
        "fetcher": fetcher,
        "freq": freq,
        "categorizer": categorize.Categorizer.from_existing(base),
        "config": pipeline.Config(
            wiktionary_delay=args.wiktionary_delay,
            tatoeba_delay=args.tatoeba_delay,
            workers=args.workers,
            max_senses=args.max_senses,
            strict_pos=args.strict_pos,
        ),
    }

    counters = {"accepted": 0, "review": 0, "skipped": 0}

    def progress(done, total, outcome):
        counters[outcome.status] += 1
        if done % 10 == 0 or done == total:
            elapsed = time.time() - started
            rate = done / elapsed if elapsed else 0
            sys.stdout.write("\r  %d/%d  готово:%d  ручная:%d  мимо:%d  %.2f сл/с   "
                             % (done, total, counters["accepted"], counters["review"],
                                counters["skipped"], rate))
            sys.stdout.flush()

    print("Обработка (%d потоков, Wiktionary раз в %.2fс, Tatoeba раз в %.2fс)..."
          % (args.workers, args.wiktionary_delay, args.tatoeba_delay))
    results = pipeline.run(todo, ctx, progress=progress)
    print()

    accepted = [r for r in results if r.status == "accepted"]
    review = [r for r in results if r.status == "review"]
    skipped = [r for r in results if r.status == "skipped"]
    if args.target:
        accepted = accepted[: args.target]

    by_level = {level: [] for level in emit.LEVELS}
    for r in accepted:
        by_level.setdefault(r.level, []).append(r.record)

    elapsed = time.time() - started
    meta = {
        "generated": datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "sources": "en.wiktionary.org (CC BY-SA), tatoeba.org (CC BY 2.0 FR), "
                   "OpenSubtitles/hermitdave + Google Books/Norvig",
        "total": len(accepted),
    }
    emit.write_js(os.path.join(args.out, "words-new.js"), by_level, meta)
    emit.write_json(os.path.join(args.out, "words-new.json"),
                    {"meta": meta, "words": {l: by_level.get(l, []) for l in emit.LEVELS}})
    review_rows = [{"word": r.word, "reasons": r.reasons, "partial": r.partial} for r in review]
    emit.write_review_tsv(os.path.join(args.out, "manual-review.tsv"), review_rows)
    emit.write_json(os.path.join(args.out, "manual-review.json"), review_rows)
    emit.write_json(os.path.join(args.out, "skipped.json"),
                    [{"word": r.word, "reasons": r.reasons} for r in skipped])

    reason_stats = {}
    for r in review + skipped:
        for reason in r.reasons:
            key = reason.split(":")[0].split("(")[0].strip()
            reason_stats[key] = reason_stats.get(key, 0) + 1
    report = {
        "meta": meta,
        "processed": len(results),
        "accepted": len(accepted),
        "review": len(review),
        "skipped": len(skipped),
        "accept_rate": round(len(accepted) / float(len(results) or 1), 3),
        "by_level": {l: len(by_level.get(l, [])) for l in emit.LEVELS},
        "reasons": dict(sorted(reason_stats.items(), key=lambda kv: -kv[1])),
        "http": fetcher.stats,
        "seconds": round(elapsed, 1),
        "levels_bands": [[n, u] for n, u in freq.bands],
    }
    emit.write_json(os.path.join(args.out, "report.json"), report)

    print("\nИтог за %.0f с: готово %d, на ручную доработку %d, не взято %d (доля годного %.0f%%)"
          % (elapsed, len(accepted), len(review), len(skipped), 100 * report["accept_rate"]))
    print("По уровням: %s" % ", ".join("%s:%d" % (l, len(by_level.get(l, []))) for l in emit.LEVELS))
    print("Запросов: сеть %d, кэш %d, ошибок %d" % (fetcher.stats["network"], fetcher.stats["cache_hits"], fetcher.stats["errors"]))
    print("Топ причин: %s" % ", ".join("%s×%d" % (k, v) for k, v in list(report["reasons"].items())[:6]))
    print("Файлы: %s" % args.out)

    if args.sample and accepted:
        print("\n--- выборка %d готовых слов ---" % args.sample)
        for r in random.sample(accepted, min(args.sample, len(accepted))):
            rec = r.record
            print("[%s] %-14s %-24s %s" % (r.level, rec["w"], rec["t"], rec["cat"]))
            print("      def: %s" % rec["def"])
            print("      ex : %s" % rec["ex"])
            print("      exr: %s" % rec["exr"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
