"""Частотные списки английских слов и раздача уровней A1..C2.

Источники (оба открытые, без ключей):
  1. hermitdave/FrequencyWords, en_50k.txt — частоты по корпусу субтитров
     OpenSubtitles 2018 (CC BY-SA 4.0). Основной: субтитры отражают живой
     разговорный язык, а это ровно то, что нужно школьнику.
  2. norvig.com/ngrams/count_1w.txt — частоты по Google Books (1/3 млн слов).
     Вспомогательный: книжный корпус вытягивает вверх «письменную» лексику,
     которой мало в субтитрах (research, therefore, significant).

Итоговый ранг — среднее геометрическое доступных рангов. Слово, редкое в обоих
корпусах, получает высокий ранг и, соответственно, высокий уровень.
"""

import math
import re

SUBS_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt"
BOOKS_URL = "https://norvig.com/ngrams/count_1w.txt"

# Границы рангов между уровнями. Значения не выдуманы: посчитаны калибровкой по
# 554 словам из js/words.js (см. calibrate() и --calibrate в build_words.py).
DEFAULT_BANDS = [
    ("A1", 900),
    ("A2", 2000),
    ("B1", 4200),
    ("B2", 8000),
    ("C1", 15000),
    ("C2", None),  # всё, что реже
]

_WORD_RE = re.compile(r"^[a-z]+$")


class Frequency:
    def __init__(self, ranks, bands=None, sources=()):
        self.ranks = ranks               # word -> объединённый ранг (1 = самое частое)
        self.bands = bands or DEFAULT_BANDS
        self.sources = list(sources)
        self.ordered = sorted(ranks, key=lambda w: ranks[w])

    def rank(self, word):
        return self.ranks.get(word.lower())

    def level(self, word):
        r = self.rank(word)
        if r is None:
            return "C2"
        for name, upper in self.bands:
            if upper is None or r <= upper:
                return name
        return "C2"

    def candidates(self, skip_top=0, min_len=3, max_len=14):
        """Слова по возрастанию ранга — самые нужные идут первыми."""
        out = []
        for i, w in enumerate(self.ordered):
            if i < skip_top:
                continue
            if not (min_len <= len(w) <= max_len):
                continue
            out.append(w)
        return out

    def calibrate(self, level_words):
        """Пересчитать границы по уже размеченной вручную базе.

        level_words: {"A1": [слова], ...}. Граница между соседними уровнями —
        среднее геометрическое их медианных рангов. Это честнее, чем круглые
        числа: база сделана человеком и знает, что для школьника «трудно».
        """
        medians = {}
        for level, words in level_words.items():
            rs = sorted(r for r in (self.rank(w) for w in words) if r)
            if len(rs) >= 5:
                medians[level] = rs[len(rs) // 2]
        order = ["A1", "A2", "B1", "B2", "C1", "C2"]
        present = [l for l in order if l in medians]
        if len(present) < 4:
            return None, medians
        bands = []
        for i, level in enumerate(order[:-1]):
            nxt = order[i + 1]
            if level in medians and nxt in medians and medians[nxt] > medians[level]:
                bands.append((level, int(round(math.sqrt(medians[level] * medians[nxt])))))
            else:
                bands.append((level, dict(DEFAULT_BANDS)[level]))
        bands.append(("C2", None))
        # монотонность на случай кривых медиан
        fixed, prev = [], 0
        for name, upper in bands:
            if upper is not None:
                upper = max(upper, prev + 100)
                prev = upper
            fixed.append((name, upper))
        return fixed, medians


def _parse_two_column(text, sep=None):
    out = {}
    for line in text.splitlines():
        parts = line.split(sep) if sep else line.split()
        if len(parts) < 2:
            continue
        word = parts[0].strip().lower()
        if not _WORD_RE.match(word):
            continue
        try:
            count = int(parts[1])
        except ValueError:
            continue
        if word not in out:
            out[word] = count
    return out


def _ranks_from_counts(counts):
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    return {w: i + 1 for i, (w, _) in enumerate(ordered)}


def load(fetcher, use_books=True):
    sources = []
    subs_text = fetcher.get_bytes(SUBS_URL, "freq", "en_50k")
    subs = _ranks_from_counts(_parse_two_column(subs_text)) if subs_text else {}
    if subs:
        sources.append("OpenSubtitles en_50k (%d слов)" % len(subs))

    books = {}
    if use_books:
        books_text = fetcher.get_bytes(BOOKS_URL, "freq", "count_1w")
        if books_text:
            books_counts = _parse_two_column(books_text, sep="\t")
            # книжный список огромный (333k) — хвост нам не нужен
            books = _ranks_from_counts(books_counts)
            books = {w: r for w, r in books.items() if r <= 60000}
            sources.append("Google Books count_1w (top 60k)")

    if not subs and not books:
        raise RuntimeError("не удалось загрузить ни один частотный список")

    combined = {}
    for word in set(subs) | set(books):
        rs = [r for r in (subs.get(word), books.get(word)) if r]
        combined[word] = int(round(math.exp(sum(math.log(r) for r in rs) / len(rs))))
    # пересжимаем в плотный ранг 1..N
    return Frequency(_ranks_from_counts({w: -r for w, r in combined.items()}), sources=sources)
