"""Запись результатов. js/words.js НИКОГДА не трогаем — пишем только в tools/out.

  words-new.js      — готовые слова в формате базы, объект WORDS_NEW
  words-new.json    — то же в JSON, удобно смотреть глазами и диффать
  manual-review.tsv — на ручную доработку, открывается в Excel/Numbers
  manual-review.json— то же с полными данными
  skipped.json      — что и почему не взяли вообще
  report.json       — сводка прогона
"""

import json
import os

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
FIELDS = ["w", "t", "ex", "exr", "def", "cat"]


def _js_string(value):
    # JSON-строка — валидный литерал JS; отдельно чиним переводы строк U+2028/29
    return json.dumps(value, ensure_ascii=False).replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def _js_record(record):
    parts = ["%s: %s" % (field, _js_string(record.get(field, ""))) for field in FIELDS]
    return "{ " + ", ".join(parts) + " }"


def write_js(path, by_level, meta):
    lines = [
        "// Сгенерировано tools/build_words.py — НЕ редактировать руками.",
        "// %s" % meta.get("generated", ""),
        "// Источники: %s" % meta.get("sources", ""),
        "// Слов: %d. Формат совпадает с js/words.js." % meta.get("total", 0),
        "//",
        "// Подключение (после js/words.js), когда проверишь содержимое:",
        "//   <script src=\"tools/out/words-new.js\"></script>",
        "//   Object.keys(WORDS_NEW).forEach(function (lvl) {",
        "//     WORDS[lvl] = (WORDS[lvl] || []).concat(WORDS_NEW[lvl]);",
        "//   });",
        "const WORDS_NEW = {",
    ]
    for level in LEVELS:
        records = by_level.get(level, [])
        lines.append("  %s: [" % level)
        for record in records:
            lines.append("    %s," % _js_record(record))
        lines.append("  ],")
    lines.append("};")
    lines.append("")
    _write(path, "\n".join(lines))


def write_json(path, payload):
    _write(path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")


def write_review_tsv(path, rows):
    header = [
        "слово", "уровень", "ранг", "часть речи", "перевод(черновик)", "варианты перевода",
        "пример", "перевод примера", "определение", "категория", "чего не хватает",
    ]
    out = ["\t".join(header)]
    for row in rows:
        partial = row["partial"]
        variants = partial.get("t_alt") or []
        if partial.get("t_variants"):
            variants = ["%s → %s" % (v["gloss"][:40], "/".join(v["ru"])) for v in partial["t_variants"]]
        out.append("\t".join(_cell(x) for x in [
            row["word"],
            partial.get("level", ""),
            partial.get("rank", ""),
            partial.get("pos", ""),
            partial.get("t", ""),
            "; ".join(variants),
            partial.get("ex", "") or partial.get("ex_hint", ""),
            partial.get("exr", ""),
            partial.get("def", ""),
            partial.get("cat", ""),
            "; ".join(row["reasons"]),
        ]))
    _write(path, "\n".join(out) + "\n")


def _cell(value):
    return str(value if value is not None else "").replace("\t", " ").replace("\n", " ")


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)
