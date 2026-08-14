"""Фильтры пригодности: что вообще не берём в детский словарь.

Два уровня строгости, и это принципиально.

  * HEADWORD_BLOCK — слова, которых в базе быть не должно вообще: мат,
    сексуальное, наркотики, самоповреждение, физиология.
  * SENTENCE_BLOCK — лексика, которой не место в ПРИМЕРЕ. Она шире: «war»,
    «death», «hate» школьные программы проходят, поэтому такое слово попасть в
    базу может, но пример «He killed his enemy» ребёнку показывать незачем.
    Формы самого изучаемого слова из проверки исключаются — иначе у слова «war»
    примера не найдётся никогда.
"""

import re

HEADWORD_BLOCK = set("""
sex sexy sexual porn porno nude naked penis vagina breast boob nipple erotic orgasm
whore slut bitch bastard damn fuck fucking shit crap piss ass asshole dick cock pussy
rape raped rapist incest brothel prostitute prostitution pregnancy abortion
suicide corpse gore mutilate behead torture
cocaine heroin marijuana weed cannabis opium overdose junkie
vodka whiskey booze brothel casino
nazi jihad
""".split())

# Проверяется по началу слова: 'kill' ловит killed/killing/killer.
SENTENCE_BLOCK = sorted(set("""
sex sexy sexual porn nude naked penis vagina erotic whore slut bitch bastard damn fuck
shit crap piss asshole rape kill murder suicide corpse dead die dies died dying death
blood bloody gun shoot shot rifle pistol bomb bullet weapon war soldier enemy hostage
drug cocaine heroin marijuana drunk drunken alcohol beer wine vodka whiskey booze
cigarette smoking tobacco casino gambling hate torture abuse victim terrorist prison
jail divorce cancer tumour tumor funeral grave coffin hell devil satan idiot moron
stupid damned crash accident dangerous poison steal stole thief robbery
убил убить убийств смерт умер умир труп кровь пьян водк пиво вино сигарет наркот оруж
война войн солдат бомб самоуб тюрьм ненавис изнасил проститут дурак идиот сдох похорон
могил рак опухол развод авари ворова украл вор яд
""".split()))

_LATIN = re.compile(r"^[a-z]+$")


def acceptable_headword(word, existing, min_len=3, max_len=14):
    w = word.lower()
    if not _LATIN.match(w):
        return False, "не буквенное слово"
    if not (min_len <= len(w) <= max_len):
        return False, "длина слова"
    if w in existing:
        return False, "уже есть в базе"
    if w in HEADWORD_BLOCK:
        return False, "недетская лексика"
    if re.search(r"(.)\1\1", w):
        return False, "похоже на опечатку"
    return True, None


def sentence_blocklist(word, forms):
    """Блок-лист примера с исключением форм самого слова."""
    own = {f.lower() for f in forms} | {word.lower()}
    return [bad for bad in SENTENCE_BLOCK if bad not in own]


_SUFFIXES = (
    ("ing", ["", "e"]),
    ("ed", ["", "e"]),
    ("es", [""]),
    ("s", [""]),
    ("ly", [""]),
)


def looks_inflected(word, freq):
    """Дешёвая отбраковка словоформ до похода в сеть.

    'wanted' отбрасываем, если 'want' встречается в корпусе заметно чаще:
    Wiktionary всё равно опознал бы это как форму, но так мы экономим запрос.
    """
    rank = freq.rank(word)
    if rank is None:
        return False
    for suffix, replacements in _SUFFIXES:
        if not word.endswith(suffix) or len(word) - len(suffix) < 3:
            continue
        stem = word[: -len(suffix)]
        candidates = [stem + r for r in replacements]
        if len(stem) > 3 and stem[-1] == stem[-2]:
            candidates.append(stem[:-1])
        for cand in candidates:
            stem_rank = freq.rank(cand)
            if stem_rank and stem_rank < rank:
                return True
    return False
