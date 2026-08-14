"""Tatoeba: пара «английское предложение + русский перевод».

Tatoeba ищет по подстроке и охотно возвращает однокоренные слова
(negotiate → «Negotiations ended inconclusively»), поэтому каждое предложение
проверяется отдельно: слово должно стоять там как отдельное слово (допускаются
обычные словоформы), предложение — короткое, целое и безопасное для ребёнка.
"""

import re
import urllib.parse

from . import filters

SEARCH_URL = "https://tatoeba.org/en/api_v0/search?from=eng&to=rus&query=%s&limit=%d"

MAX_EN = 90     # требование ТЗ
MIN_EN = 8      # «I agree.» — нормальный пример для школьника
MAX_RU = 120

_CYR = re.compile(r"[а-яёА-ЯЁ]")
_LAT = re.compile(r"[A-Za-z]")


def inflections(word):
    """Простые словоформы, которые считаем тем же словом."""
    w = word.lower()
    forms = {w, w + "s", w + "ed", w + "ing", w + "es", w + "d"}
    if w.endswith("e"):
        forms.update({w[:-1] + "ing", w + "d", w[:-1] + "ed"})
    if w.endswith("y") and len(w) > 2 and w[-2] not in "aeiou":
        forms.update({w[:-1] + "ies", w[:-1] + "ied"})
    if len(w) > 3 and w[-1] not in "aeiouwxy" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        forms.update({w + w[-1] + "ing", w + w[-1] + "ed"})
    return forms


def _tokens(text):
    return re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())


def score_sentence(word, en, ru, guard):
    """Оценка пары. None — пара не годится."""
    en = (en or "").strip()
    ru = (ru or "").strip()
    if not en or not ru:
        return None, "нет перевода"
    if not (MIN_EN <= len(en) <= MAX_EN):
        return None, "длина английского предложения"
    if len(ru) > MAX_RU:
        return None, "длина русского перевода"
    if not _CYR.search(ru):
        return None, "перевод не по-русски"
    if _LAT.search(re.sub(r"\b(Tom|Mary|John|Ann|Bob|Ken|Mike|Nancy|Jim|Bill)\b", "", ru)):
        return None, "латиница в переводе"
    if _CYR.search(en):
        return None, "кириллица в английском"
    if not en[0].isupper() or not en.endswith((".", "!", "?")):
        return None, "предложение не целое"
    if en.count('"') % 2 or "..." in en:
        return None, "обрывок предложения"

    toks = _tokens(en)
    if len(toks) < 2:
        return None, "слишком короткое"
    forms = inflections(word)
    if not (forms & set(toks)):
        return None, "слова нет в предложении"

    blocked = guard.check(en, ru)
    if blocked:
        return None, blocked

    ru_words = len(re.findall(r"[а-яёА-ЯЁ]+", ru))
    if ru_words < 2 and len(toks) > 4:
        return None, "перевод подозрительно короткий"

    score = 0.0
    if word.lower() in toks:
        score += 3.0                      # ровно исходная форма — лучше всего
    score += max(0.0, (60 - len(en)) / 30.0)   # короче = понятнее школьнику
    if len(toks) <= 8:
        score += 1.0
    if en.endswith("."):
        score += 0.5
    if not filters.TATOEBA_NAMES.search(en):
        score += 1.5                      # пример без «Tom» и «Mary» нагляднее
    return score, None


def fetch_pair(fetcher, word, guard, min_interval, limit=20, confirm=None):
    """confirm — функция (русский текст) -> bool: подтверждает ли перевод примера
    выбранное значение. Такие примеры получают заметный бонус: карточка, где
    перевод слова и перевод примера говорят об одном и том же, честнее.
    """
    url = SEARCH_URL % (urllib.parse.quote(word), limit)
    res = fetcher.get(url, "tatoeba", key="tat:%s:%d" % (word, limit), min_interval=min_interval)
    if not res.ok:
        return None, "Tatoeba недоступна (%s)" % (res.error or res.status)
    data = res.json()
    if not data:
        return None, "Tatoeba вернула не JSON"
    results = data.get("results") or []
    if not results:
        return None, "нет предложений в Tatoeba"

    best, best_score, last_reason = None, -1.0, "подходящих предложений нет"
    for item in results:
        en = item.get("text")
        translations = item.get("translations") or []
        flat = [t for group in translations for t in (group or [])]
        for tr in flat:
            if (tr.get("lang") or "rus") != "rus":
                continue
            score, reason = score_sentence(word, en, tr.get("text"), guard)
            if score is None:
                last_reason = reason
                continue
            if confirm and confirm(tr.get("text")):
                score += 6.0
            if score > best_score:
                best, best_score = {"ex": en.strip(), "exr": tr["text"].strip()}, score
            break
    if best is None:
        return None, last_reason
    return best, None
