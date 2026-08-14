"""Чтение js/words.js — ТОЛЬКО НА ЧТЕНИЕ.

Файл никогда не изменяется. Нужен для трёх вещей:
  * список уже имеющихся слов (чтобы не дублировать);
  * список допустимых категорий (новых не выдумываем);
  * разметка «уровень → слова» для калибровки частотных границ и обучения
    классификатора категорий на человеческой работе.
"""

import os
import re

WORD_RE = re.compile(
    r'\{\s*w:\s*"((?:[^"\\]|\\.)*)"'          # w
    r'\s*,\s*t:\s*"((?:[^"\\]|\\.)*)"'        # t
    r'.*?def:\s*"((?:[^"\\]|\\.)*)"'          # def
    r'\s*,\s*cat:\s*"((?:[^"\\]|\\.)*)"',     # cat
    re.S,
)
LEVEL_RE = re.compile(r'^\s{2}([A-C][12]):\s*\[', re.M)


class ExistingBase:
    def __init__(self, words, by_level, categories):
        self.words = words              # {слово: {"t","def","cat","level"}}
        self.by_level = by_level        # {"A1": [слова]}
        self.categories = categories    # упорядоченный список категорий

    @property
    def word_set(self):
        return set(self.words)


def load(path):
    if not os.path.exists(path):
        raise RuntimeError("не найден %s" % path)
    with open(path, "r", encoding="utf-8") as fh:
        source = fh.read()

    # границы уровневых массивов, чтобы приписать каждому слову его уровень
    bounds = [(m.group(1), m.start()) for m in LEVEL_RE.finditer(source)]
    bounds.append(("__end__", len(source)))

    words, by_level = {}, {}
    for i in range(len(bounds) - 1):
        level, start = bounds[i]
        end = bounds[i + 1][1]
        chunk = source[start:end]
        level_words = []
        for w, t, definition, cat in WORD_RE.findall(chunk):
            key = w.strip().lower()
            if not key or key in words:
                continue
            words[key] = {"t": t, "def": definition, "cat": cat, "level": level}
            level_words.append(key)
        by_level[level] = level_words

    categories = []
    for meta in words.values():
        if meta["cat"] and meta["cat"] not in categories:
            categories.append(meta["cat"])
    return ExistingBase(words, by_level, sorted(categories))
