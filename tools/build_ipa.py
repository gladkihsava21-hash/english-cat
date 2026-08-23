#!/usr/bin/env python3
"""Транскрипция к словам: CMUdict → js/ipa.js.

Зачем. Методист попросила показывать английскую транскрипцию рядом
с переводом: без неё ученик читает новое слово так, как оно пишется,
и запоминает неправильное звучание. Озвучка эту дыру не закрывает —
её нет в части браузеров, и на слух школьник всё равно не запишет.

Почему CMUdict, а не свои правила. Английское чтение правилами не
описывается: read/read, though/through/tough. Любой самодельный
преобразователь врал бы на самых частых словах — а неверная
транскрипция хуже, чем никакой. CMUdict — словарь Университета
Карнеги — Меллона, 134 тысячи слов, лицензия BSD-2 (свободная,
достаточно упоминания). Указан в credits.html.

Что делает: скачивает (или берёт локальную копию) cmudict.dict,
переводит ARPAbet в МФА и оставляет только те слова, которые есть
в нашей базе, — иначе файл весил бы мегабайты ради слов, которые
ученик никогда не увидит.

Запуск:  python3 tools/build_ipa.py [путь-к-cmudict.dict]
         (без аргумента скачивает с github)
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict"
OUT = os.path.join(ROOT, "js", "ipa.js")

# ARPAbet → МФА. Ударение в CMUdict помечено цифрой у гласной:
# 1 — основное, 2 — второстепенное, 0 — безударная.
ARPA = {
    "AA": "ɑ", "AE": "æ", "AH": "ʌ", "AO": "ɔ", "AW": "aʊ", "AY": "aɪ",
    "EH": "e", "ER": "ɜr", "EY": "eɪ", "IH": "ɪ", "IY": "iː", "OW": "oʊ",
    "OY": "ɔɪ", "UH": "ʊ", "UW": "uː",
    "B": "b", "CH": "tʃ", "D": "d", "DH": "ð", "F": "f", "G": "ɡ",
    "HH": "h", "JH": "dʒ", "K": "k", "L": "l", "M": "m", "N": "n",
    "NG": "ŋ", "P": "p", "R": "r", "S": "s", "SH": "ʃ", "T": "t",
    "TH": "θ", "V": "v", "W": "w", "Y": "j", "Z": "z", "ZH": "ʒ",
}
# Безударные гласные звучат иначе: about [əˈbaʊt], а не [ʌˈbaʊt];
# конечное -y в city — короткое [i], а не долгое [iː].
UNSTRESSED = {"AH": "ə", "IH": "ɪ", "ER": "ər", "IY": "i"}


def to_ipa(phones):
    """ARPAbet-строка → МФА со знаком ударения перед ударным слогом."""
    out = []
    # Второстепенное ударение в коротких словах только мешает: школьные
    # словари пишут hospital как [ˈhɒspɪtl], а не [ˈhɒˌspɪtl]. Оставляем
    # его там, где оно действительно помогает прочесть слово, — от четырёх
    # слогов (understand, university).
    syllables = sum(1 for p in phones if re.match(r"^[A-Z]+[0-2]$", p))
    keep_secondary = syllables >= 4
    for ph in phones:
        m = re.match(r"^([A-Z]+)([0-2])?$", ph)
        if not m:
            return ""
        base, stress = m.group(1), m.group(2)
        if base not in ARPA:
            return ""
        sym = ARPA[base]
        if stress == "0" and base in UNSTRESSED:
            sym = UNSTRESSED[base]
        if stress == "2" and not keep_secondary:
            stress = "0"
        if stress in ("1", "2"):
            # Знак ударения ставится перед слогом, но границы слогов
            # CMUdict не размечает. Отступаем от ударной гласной влево
            # ровно настолько, насколько согласные могут НАЧИНАТЬ слог:
            # in-crease, а не i-nkrease. Без этого ограничения знак
            # уезжал внутрь стечения согласных — [ˌɪˈnkriːs].
            j = len(out)
            cluster = []
            while j > 0 and out[j - 1] not in ("ˈ", "ˌ") and not _is_vowel(out[j - 1]):
                if not _valid_onset([out[j - 1]] + cluster):
                    break
                cluster.insert(0, out[j - 1])
                j -= 1
            out.insert(j, "ˈ" if stress == "1" else "ˌ")
        out.append(sym)
    return "".join(out)


def _is_vowel(sym):
    return any(v in sym for v in "ɑæʌɔaeɜɪioʊuə")


# Стечения согласных, с которых английское слово (и слог) может начинаться.
# Список закрытый: всё, чего в нём нет, слог начинать не может, значит
# граница слога проходит правее и знак ударения туда не заходит.
_ONSET_2 = {
    "pl", "bl", "kl", "ɡl", "fl", "sl", "pr", "br", "tr", "dr", "kr", "ɡr",
    "fr", "θr", "ʃr", "sp", "st", "sk", "sm", "sn", "sw", "tw", "dw", "kw",
    "ɡw", "θw", "sf", "hj", "pj", "bj", "kj", "fj", "vj", "mj", "nj", "lj",
}
_ONSET_3 = {"spl", "spr", "str", "skr", "skw", "spj", "stj", "skj"}


def _valid_onset(cluster):
    """Может ли эта цепочка согласных начинать слог."""
    key = "".join(cluster)
    if len(cluster) == 1:
        return True
    if len(cluster) == 2:
        return key in _ONSET_2
    if len(cluster) == 3:
        return key in _ONSET_3
    return False


def our_words():
    """Слова из нашей базы: словарь и пары синонимов.

    Читаем через node — файлы это JS, а не данные. Скрипт кладём во
    временный файл, а не в `node -e`: словарь весит больше мегабайта,
    и командная строка такого размера не проходит (Argument list too long).
    """
    tmp = os.path.join(ROOT, "tools", "_ipa_scan.js")
    with open(tmp, "w", encoding="utf-8") as f:
        for name in ("js/words.js", "js/levels.js"):
            f.write(open(os.path.join(ROOT, name), encoding="utf-8").read())
            f.write("\n")
        f.write("""
const out = new Set();
for (const lvl of Object.keys(WORDS)) for (const w of WORDS[lvl]) out.add(w.w.toLowerCase());
if (typeof SYNONYMS !== "undefined")
  for (const s of SYNONYMS) { out.add(s.w); out.add(s.syn); out.add(s.ant); }
console.log(JSON.stringify([...out]));
""")
    try:
        r = subprocess.run(["node", tmp], capture_output=True, text=True)
        if r.returncode:
            sys.exit("node не смог прочитать словарь: " + r.stderr[:400])
        return set(json.loads(r.stdout))
    finally:
        os.remove(tmp)


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else None
    if path:
        raw = open(path, encoding="utf-8", errors="replace").read()
    else:
        print("Скачиваю CMUdict…")
        raw = urllib.request.urlopen(SRC, timeout=120).read().decode("utf-8", "replace")

    need = our_words()
    print(f"Слов в нашей базе: {len(need)}")

    ipa = {}
    for line in raw.splitlines():
        line = line.split("#")[0].strip()
        if not line:
            continue
        parts = line.split()
        word = parts[0].lower()
        # «word(2)» — второй вариант произношения, берём только первый
        if "(" in word:
            continue
        if word not in need or word in ipa:
            continue
        got = to_ipa(parts[1:])
        if got:
            ipa[word] = got

    miss = len(need) - len(ipa)
    body = json.dumps(ipa, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    header = f'''// Транскрипция слов (МФА). СОБРАНО АВТОМАТИЧЕСКИ — не править руками:
// файл перезаписывается tools/build_ipa.py.
//
// Источник — CMU Pronouncing Dictionary (Carnegie Mellon University,
// лицензия BSD-2), американский вариант произношения. Атрибуция стоит
// в credits.html, как и у остальных внешних данных.
//
// Здесь только те слова, что есть в нашей базе: полный словарь — это
// 134 тысячи строк ради слов, которых ученик никогда не увидит.
// Покрытие на момент сборки: {len(ipa)} из {len(need)} (нет транскрипции
// у {miss} — в основном это выражения из нескольких слов).
const IPA = {body};
'''
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(header)
    size = os.path.getsize(OUT) / 1024
    print(f"js/ipa.js: {len(ipa)} слов, {size:.0f} КБ (без транскрипции: {miss})")


if __name__ == "__main__":
    main()
