"""Категория слова — только из тех 30, что уже есть в js/words.js.

Три слоя, от точного к общему:
  1. Правила по «шапке» определения: «a person who…» → people, «a place where…»
     → places. Высокая точность, потому что Wiktionary пишет определения
     довольно шаблонно.
  2. Ключевые слова по категориям + словарь, автоматически надёрганный из
     определений 554 вручную размеченных слов (человеческая разметка как
     обучающая выборка).
  3. Запасной вариант по части речи: глагол → actions, прилагательное и
     наречие → qualities. Так размечена и существующая база, так что это не
     выдумка, а её правило.

Если ни один слой не сработал уверенно — категории нет, слово уходит на ручную
доработку, а не получает случайную метку.
"""

import re
from collections import Counter, defaultdict

# (категория, шаблон, для каких частей речи применять; None — для любых)
# Часть речи важна: «Tending to ask questions» — это про любопытного человека
# (character), а не про общение, хотя слово «ask» в определении есть.
NOUNS = ("Noun",)
VERBS = ("Verb",)
ADJ = ("Adjective", "Adverb")

HEAD_RULES = [
    ("people", r"\b(a |an )?(person|someone|somebody|one) who\b|\b(a )?(man|woman|boy|girl|child) who\b", NOUNS),
    ("people", r"\b(profession|occupation)\b", NOUNS),
    ("places", r"^(a |an |the )?(place|building|area|region|location|site|venue)\b|\bplace where\b", NOUNS),
    ("city", r"\b(town|city|urban|street|district|neighbourhood|neighborhood)\b", None),
    ("animals", r"\b(animal|mammal|bird|fish|insect|reptile|creature|species of)\b", None),
    ("nature", r"\b(plant|tree|flower|forest|mountain|ocean|sea|river|soil|rock|mineral)\b", None),
    ("weather", r"\b(weather|rain|snow|wind|storm|cloud|climate)\b", None),
    ("body", r"\b(body part|organ|limb|part of the body|muscle|bone|skin)\b", None),
    ("health", r"\b(illness|disease|medical|medicine|treatment|symptom|injury|healthy|patient)\b", None),
    ("food", r"\b(food|dish|meal|fruit|vegetable|drink|beverage|edible|to eat|cooking)\b", None),
    ("clothes", r"\b(garment|clothing|worn on|piece of clothing|shoe|dress worn)\b", None),
    ("feelings", r"\b(feeling|emotion|emotional state|state of mind|mood)\b", None),
    ("character", r"\b(tending to|inclined to|disposed to|of a person|someone's (nature|character)|"
                  r"having the quality of being)\b", ADJ),
    ("mind", r"\b(to think|to consider|to believe|to know|to understand|to remember|to imagine)\b", VERBS),
    ("mind", r"\b(thought|idea|belief|knowledge|memory|reasoning)\b", NOUNS),
    ("communication", r"\b(to say|to tell|to speak|to talk|to state|to express|to ask|to answer|"
                      r"to discuss|to explain|to announce|to declare|to argue|to confer|to persuade)\b", VERBS),
    ("communication", r"\b(speech|utterance|conversation|statement|message|remark)\b", NOUNS),
    ("money", r"\b(money|payment|price|cost|financial|economic|profit|debt|tax|salary|to pay)\b", None),
    ("work", r"\b(job|employment|workplace|employee|employer|career|business meeting)\b", None),
    ("school", r"\b(school|student|pupil|teacher|lesson|study|education|exam|university)\b", None),
    ("tech", r"\b(computer|software|electronic|digital|machine|device|internet|data|technology)\b", None),
    ("travel", r"\b(travel|journey|trip|vehicle|transport|airport|flight|luggage|tourist)\b", None),
    ("sports", r"\b(sport|game played|athlete|team|match|competition)\b", None),
    ("art", r"\b(art|music|painting|artistic|literature|poem|theatre|theater|film|song)\b", None),
    ("society", r"\b(society|government|political|law|legal|public|community|citizen|social)\b", None),
    ("home", r"\b(house|home|room|furniture|household|domestic|apartment)\b", None),
    ("family", r"\b(parent|mother|father|child of|sibling|relative|married|family)\b", None),
    ("time", r"\b(period of time|moment|season|duration|hour|day|month|year)\b", NOUNS),
    ("objects", r"^(a |an )?(tool|instrument|object|device|container|piece of equipment)\b|\b(used for|used to)\b", NOUNS),
    ("actions", r"^(an? |the )?(act|action|process|attempt|effort|method|way) (of|to)\b", NOUNS),
    ("change", r"\b(to become|to increase|to decrease|to grow|to change|to turn into|to convert)\b", VERBS),
]
HEAD_RULES = [(cat, re.compile(pattern, re.I), pos) for cat, pattern, pos in HEAD_RULES]

KEYWORDS = {
    "qualities": "quality characteristic having being not very extremely degree size shape colour color appearance",
    "mind": "think thought idea mind believe know knowledge understand remember memory learn imagine reason logic opinion consider doubt information fact truth search find solve problem question sense",
    "communication": "say tell speak talk word language message letter question answer discuss explain describe report announce inform agree agreement negotiate confer argue persuade suggest mention reply request warn complain promise conversation terms",
    "character": "personality behaviour behavior attitude honest kind brave polite rude selfish generous patient lazy loyal proud shy tending inclined manner temperament",
    "actions": "do make move take give put get run walk carry hold push pull build break create perform",
    "feelings": "feel emotion happy sad angry afraid love hate joy fear worry excited nervous calm surprise",
    "linkers": "however therefore although because moreover nevertheless conjunction connects clause sentence furthermore whereas",
    "money": "money pay price cost buy sell bank debt tax profit salary economy expensive cheap budget invest",
    "change": "change become increase decrease grow develop improve reduce transform turn convert replace",
    "society": "society people government law social public community country nation political citizen rights culture",
    "time": "time day night year month week hour minute season past future present early late duration",
    "food": "food eat drink meal bread meat fruit vegetable cook kitchen taste sweet dinner breakfast",
    "nature": "nature tree plant forest mountain river sea ocean sky earth stone flower grass wild",
    "school": "school study learn teacher student lesson class exam homework university subject knowledge",
    "travel": "travel journey trip road car train plane ticket hotel visit tourist map luggage abroad",
    "tech": "computer internet phone digital data software program device screen electric machine online",
    "home": "house home room door window furniture bed kitchen wall floor roof garden household",
    "clothes": "clothes wear shirt dress shoe coat hat trousers jacket fashion sleeve pocket",
    "work": "work job office company employee boss business career salary staff manager project professional",
    "sports": "sport game play team match player ball run jump swim race win competition training",
    "objects": "thing object tool box bag key paper bottle table chair item equipment container",
    "body": "body head hand arm leg eye ear face hair finger heart skin bone muscle",
    "weather": "weather rain snow sun wind cloud storm cold hot warm temperature fog ice",
    "people": "person people man woman child boy girl someone human individual worker doctor teacher friend",
    "health": "health ill sick doctor hospital medicine pain disease cure healthy patient treatment",
    "city": "city town street building shop market square bridge traffic park district urban",
    "animals": "animal dog cat bird fish horse cow insect wild pet tail species creature",
    "family": "family mother father parent son daughter brother sister child marriage wife husband relative",
    "places": "place area region location where site ground field space spot",
    "art": "art music paint picture draw song film theatre theater book poem story dance artist",
}
KEYWORDS = {cat: set(words.split()) for cat, words in KEYWORDS.items()}

# Запасной вариант по части речи. Не выдумка: существующая база размечена
# ровно так же — глаголы уходят в actions, прилагательные в qualities,
# служебные слова в linkers.
POS_FALLBACK = {
    "Verb": "actions",
    "Adjective": "qualities",
    "Adverb": "qualities",
    "Conjunction": "linkers",
    "Preposition": "linkers",
    "Determiner": "linkers",
    "Numeral": "linkers",
    "Particle": "linkers",
    "Pronoun": "linkers",
    "Interjection": "communication",
}

_STOP = set("""a an the of to in on for with and or as at by from is are be was were being been
that this these those which who whom whose what not no any some one it its such into out
up down over under about than then so if when while can may might will would more most very
much something someone anything person thing used usually especially often typically etc
""".split())


def _tokens(text):
    return [w for w in re.findall(r"[a-z]+", (text or "").lower()) if len(w) > 2 and w not in _STOP]


class Categorizer:
    def __init__(self, allowed, learned=None):
        self.allowed = list(allowed)
        self.allowed_set = set(allowed)
        self.learned = learned or {}

    @classmethod
    def from_existing(cls, existing, max_categories_per_token=3):
        """Достроить словарь по 554 размеченным вручную словам."""
        per_cat = defaultdict(Counter)
        token_cats = defaultdict(set)
        for word, meta in existing.words.items():
            cat = meta["cat"]
            if not cat:
                continue
            for tok in _tokens(meta["def"]) + [word]:
                per_cat[cat][tok] += 1
                token_cats[tok].add(cat)
        learned = {}
        for cat, counter in per_cat.items():
            learned[cat] = {
                tok for tok, n in counter.items()
                if n >= 2 and len(token_cats[tok]) <= max_categories_per_token
            }
        return cls(existing.categories, learned)

    def classify(self, word, definition, pos, example=""):
        """-> (категория|None, уверенность 0..1, как определили)"""
        text = " ".join([definition or "", example or ""])

        for cat, pattern, pos_filter in HEAD_RULES:
            if cat not in self.allowed_set:
                continue
            if pos_filter and pos not in pos_filter:
                continue
            if pattern.search(definition or ""):
                return cat, 0.9, "правило по определению"

        lemma = word.lower()
        tokens = set(_tokens(text)) | {lemma}
        scores = Counter()
        for cat in self.allowed:
            kw = KEYWORDS.get(cat, set())
            learned = self.learned.get(cat, set())
            scores[cat] += 2.0 * len(tokens & kw)
            scores[cat] += 1.0 * len(tokens & learned)
            # само слово в списке категории — сигнал сильнее любого другого:
            # если слово и есть "money", категория money не обсуждается
            if lemma in kw:
                scores[cat] += 4.0
            if lemma in learned:
                scores[cat] += 2.0
        ranked = scores.most_common(2)
        if ranked and ranked[0][1] >= 2.5:
            top_cat, top = ranked[0]
            second = ranked[1][1] if len(ranked) > 1 else 0.0
            if top - second >= 1.0:
                return top_cat, min(0.85, 0.45 + top / 12.0), "ключевые слова"

        fallback = POS_FALLBACK.get(pos)
        if fallback and fallback in self.allowed_set:
            return fallback, 0.5, "по части речи (%s)" % pos
        return None, 0.0, "не определилась"
