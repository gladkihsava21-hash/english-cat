"""Wiktionary: определение по-английски + русский перевод + детектор многозначности.

Почему именно так.

Перевод — самое узкое место. REST-интерфейс Wiktionary раздел Translations не
отдаёт вообще, поэтому берём сырую вики-разметку через action=parse&prop=wikitext
и разбираем её сами. Это не «хак ради хака», а единственный из вариантов, который
даёт то, без чего нельзя гарантировать качество:

  * перевод привязан к КОНКРЕТНОМУ значению — блок {{trans-top|<пояснение>}}
    содержитгloss, по которому мы сверяем перевод с выбранным определением;
  * видно, к какой части речи относится блок переводов;
  * видно, сколько вообще у слова значений и этимологий.

ru.wiktionary отпадает: там английские слова описаны выборочно и без разметки
значений. Готовых открытых англо-русских словарей с лицензией и покрытием
уровня Wiktionary в свободном доступе нет.

Определение берём из REST /page/definition/<слово> — там чистый HTML, который
легко разобрать, тогда как определения в вики-разметке утонули в шаблонах.
"""

import html
import re
import unicodedata
import urllib.parse

WIKITEXT_URL = (
    "https://en.wiktionary.org/w/api.php"
    "?action=parse&page=%s&prop=wikitext&format=json&formatversion=2&redirects=0"
)
DEFINITION_URL = "https://en.wiktionary.org/api/rest_v1/page/definition/%s"

MAJOR_POS = ("Noun", "Verb", "Adjective", "Adverb")
POS_PRIORITY = ("Noun", "Verb", "Adjective", "Adverb")
NON_LEXICAL_POS = {
    "Proper noun", "Letter", "Symbol", "Punctuation mark", "Abbreviation",
    "Acronym", "Initialism", "Prefix", "Suffix", "Infix", "Interfix",
    "Contraction", "Romanization", "Diacritical mark", "Number", "Numeral symbol",
}
# Разрешённый список заголовков-частей речи. Именно список разрешённых, а не
# запрещённых: у Wiktionary десятки служебных секций (Troponyms, Hyponyms,
# Coordinate terms...), и стоит забыть одну — её примут за часть речи, а
# переводы глагола уедут под неё. Так «cut» получал перевод «резаный».
KNOWN_POS = {
    "Noun", "Verb", "Adjective", "Adverb", "Pronoun", "Preposition", "Conjunction",
    "Interjection", "Numeral", "Determiner", "Article", "Particle", "Postposition",
    "Proper noun", "Prefix", "Suffix", "Infix", "Interfix", "Circumfix", "Letter",
    "Symbol", "Phrase", "Proverb", "Contraction", "Abbreviation", "Acronym",
    "Initialism", "Participle", "Classifier", "Counter", "Number", "Root",
    "Combining form", "Romanization", "Punctuation mark", "Diacritical mark",
    "Adjectival noun", "Ideophone", "Syllable",
}

# «Это не слово, а форма другого слова» — такие в базу не нужны совсем.
FORM_OF_TEMPLATES = re.compile(
    r"\{\{\s*(en-)?(plural|past|simple past|past participle|present participle|"
    r"gerund|comparative|superlative|inflection|infl|form)[- ]?of\b", re.I
)
FORM_OF_TEXT = re.compile(
    r"^\s*\(?\s*(plural|simple past|past participle|present participle|gerund|"
    r"comparative|superlative|third-person singular|inflection|alternative (spelling|form|"
    r"letter-case form)|obsolete (spelling|form)|misspelling|eye dialect|archaic (spelling|form)|"
    r"synonym|initialism|abbreviation|acronym|clipping|contraction|nonstandard (spelling|form))\b",
    re.I,
)
PROPER_NAME_TEXT = re.compile(
    r"^\s*(a |an )?((male|female|unisex) )?(given name|surname|patronymic|"
    r"place in|city in|town in|village in|county in|river in|state of|province|"
    r"country in|municipality|island in|habitational)\b", re.I
)

_RU_TEMPLATE = re.compile(r"\{\{t{1,2}\+?(?:-check|\+check)?\|ru\|([^{}|]+)((?:\|[^{}|]*)*)\}\}")
_TRANS_TOP = re.compile(r"\{\{trans-top(?:-also|-see)?\s*\|([^}]*)\}\}")
_HEADING = re.compile(r"^(={2,6})\s*(.+?)\s*\1\s*$")
_STRESS = "́̀"


def _strip_stress(text):
    decomposed = unicodedata.normalize("NFD", text)
    cleaned = "".join(ch for ch in decomposed if ch not in _STRESS)
    return unicodedata.normalize("NFC", cleaned)


def _unlink(text):
    text = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", text)
    text = re.sub(r"\[\[([^\]]*)\]\]", r"\1", text)
    return text


def clean_russian(term):
    """Привести русский термин из вики-разметки к словарному виду."""
    term = _strip_stress(_unlink(term)).strip()
    term = re.sub(r"\s+", " ", term)
    term = term.strip(" ,;.")
    if not term:
        return None
    if not re.search(r"[а-яёА-ЯЁ]", term):
        return None
    # латиница внутри = транслит/мусор
    if re.search(r"[A-Za-z]", term):
        return None
    if len(term) > 40 or term.count(" ") > 3:
        return None
    return term.lower()


# --- разбор вики-разметки ------------------------------------------------

class Entry:
    """Разобранная английская часть статьи Wiktionary."""

    def __init__(self, word):
        self.word = word
        self.pos_list = []            # части речи по порядку
        self.etymology_count = 0
        self.senses = []              # [{"pos":..., "gloss":..., "ru":[термины]}]
        self.is_form_of = False
        self.has_english = False
        self.trans_see = False

    # -- многозначность --
    def major_pos(self):
        seen, out = set(), []
        for p in self.pos_list:
            if p in MAJOR_POS and p not in seen:
                seen.add(p)
                out.append(p)
        return out

    def lexical_pos(self):
        return [p for p in self.pos_list if p not in NON_LEXICAL_POS]

    def senses_for(self, pos):
        return [s for s in self.senses if s["pos"] == pos and s["ru"]]

    def primary_pos(self):
        """Первая значимая часть речи В ПОРЯДКЕ СТАТЬИ.

        Wiktionary ставит главное значение первым (reliable — сначала
        прилагательное, редкое существительное потом), поэтому порядок
        документа надёжнее любого нашего приоритета.
        """
        majors = self.major_pos()
        if majors:
            return majors[0]
        lex = self.lexical_pos()
        return lex[0] if lex else None


def parse_wikitext(word, wikitext):
    entry = Entry(word)
    if not wikitext:
        return entry

    # английский раздел
    m = re.search(r"^==\s*English\s*==\s*$", wikitext, re.M)
    if not m:
        return entry
    rest = wikitext[m.end():]
    nxt = re.search(r"^==\s*[^=].*?\s*==\s*$", rest, re.M)
    english = rest[: nxt.start()] if nxt else rest
    entry.has_english = True

    # Слово — только форма другого слова, если ВСЕ его определения такие.
    # Наивная проверка «есть шаблон form-of» выбрасывает неправильные глаголы:
    # run — это и инфинитив, и причастие прошедшего времени от самого себя.
    def_lines = [l for l in english.splitlines() if re.match(r"^#[^*:#]", l)]
    if def_lines:
        form_lines = [l for l in def_lines if FORM_OF_TEMPLATES.search(l)]
        entry.is_form_of = len(form_lines) == len(def_lines)
    # Переводы вынесены на подстраницу <слово>/translations. Шаблон называется
    # по-разному: {{trans-see}} и {{see translation subpage|Verb}}.
    if re.search(r"\{\{\s*(trans-see|see translation subpage)\b", english):
        entry.trans_see = True
    entry.etymology_count = len(re.findall(r"^={3,5}\s*Etymology \d+\s*={3,5}\s*$", english, re.M))

    current_pos = None
    trans_gloss = None
    in_trans = False

    for line in english.splitlines():
        head = _HEADING.match(line.strip())
        if head:
            title = head.group(2).strip()
            base = re.sub(r"\s*\d+$", "", title)
            if base == "Translations":
                in_trans = True
                trans_gloss = None
            elif base in KNOWN_POS:
                in_trans = False
                current_pos = base
                entry.pos_list.append(base)
            else:
                # служебная секция: переводы кончились, но часть речи прежняя
                in_trans = False
            continue

        if "{{trans-top" in line:
            in_trans = True
            tm = _TRANS_TOP.search(line)
            raw = tm.group(1) if tm else ""
            trans_gloss = _unlink(raw.split("|")[0]).strip()
        if not in_trans:
            continue

        stripped = line.strip()
        if not (stripped.startswith("* Russian") or stripped.startswith("*Russian")):
            continue
        terms = []
        for raw_term, params in _RU_TEMPLATE.findall(stripped):
            cleaned = clean_russian(raw_term)
            if not cleaned:
                continue
            aspect = ""
            if re.search(r"\|impf\b", params):
                aspect = "impf"
            elif re.search(r"\|pf\b", params):
                aspect = "pf"
            terms.append({"t": cleaned, "aspect": aspect})
        if not terms:
            continue
        # несовершенный вид — словарная форма русского глагола
        terms.sort(key=lambda t: 0 if t["aspect"] == "impf" else (2 if t["aspect"] == "pf" else 1))
        entry.senses.append(
            {"pos": current_pos or "?", "gloss": trans_gloss or "", "ru": [t["t"] for t in terms]}
        )

    return entry


# --- сопоставление значения и перевода ------------------------------------

_STOP = set("""a an the of to in on for with and or as at by from is are be been being it its
this that these those which who whom whose what not no any some one two more most very much
something someone anything person thing used usually especially often typically etc such
into out up down over under about than then so if when while can may might will would
""".split())


def _content_words(text):
    return {w for w in re.findall(r"[a-z]+", (text or "").lower()) if len(w) > 2 and w not in _STOP}


def match_sense(definition, senses):
    """Выбрать значение, чей gloss совпадает с определением.

    Возвращает (значение, score). Это и есть защита от классической ошибки
    «train → шлейф платья»: у Wiktionary первый блок переводов далеко не всегда
    соответствует первому (главному) определению.
    """
    if not senses:
        return None, 0.0
    if len(senses) == 1:
        return senses[0], 1.0
    dwords = _content_words(definition)
    best, best_score = None, 0.0
    for sense in senses:
        gwords = _content_words(sense["gloss"])
        if not gwords or not dwords:
            continue
        overlap = dwords & gwords
        score = len(overlap) / float(min(len(gwords), 5))
        if score > best_score:
            best, best_score = sense, score
    return best, best_score


def translations_diverge(senses, limit=4):
    """Разные значения переводятся принципиально разными словами?"""
    heads = []
    for sense in senses[:limit]:
        if sense["ru"]:
            heads.append(sense["ru"][0].split()[0][:4])
    uniq = set(heads)
    return len(uniq) > 1 and len(heads) > 1


def mentions(term, text):
    """Русский термин (с учётом склонения) встречается в тексте?

    Короткие слова сверяем целиком с запасом на окончание, длинные — по основе.
    Разница принципиальна: наивная проверка «первые 4 буквы» считает, что «трен»
    (перевод train — шлейф платья) есть в «тренировки», и подтверждает заведомо
    неверную карточку.
    """
    if not term or not text:
        return False
    haystack = _strip_stress(text).lower()
    words = [w for w in re.findall(r"[а-яё]+", _strip_stress(term).lower()) if len(w) >= 4]
    if not words:
        return False
    word = max(words, key=len)
    if len(word) <= 5:
        return re.search(r"\b%s\w{0,3}\b" % re.escape(word), haystack) is not None
    stem = word[: max(5, len(word) - 3)]
    return re.search(r"\b%s" % re.escape(stem), haystack) is not None


def example_sense(senses, chosen, exr):
    """Какое значение подтверждает перевод примера: выбранное, другое или никакое."""
    if not exr:
        return "none"
    if chosen and any(mentions(t, exr) for t in chosen["ru"]):
        return "chosen"
    for sense in senses:
        if sense is chosen:
            continue
        if any(mentions(t, exr) for t in sense["ru"]):
            return "other"
    return "none"


# --- REST-определения ------------------------------------------------------

_LABEL_SPAN = re.compile(r"<span class=\"usage-label-sense\".*?</span>", re.S)
_DROP_BLOCK = re.compile(r"<(style|script)\b[^>]*>.*?</\1>", re.S | re.I)
_CSS_LEFTOVER = re.compile(r"\.mw-parser-output[^{]*\{[^}]*\}")
_TAG = re.compile(r"<[^>]+>")


def clean_definition(raw):
    text = _DROP_BLOCK.sub(" ", raw or "")     # <style> с вёрсткой Wiktionary
    text = _LABEL_SPAN.sub(" ", text)
    text = _TAG.sub("", text)
    text = _CSS_LEFTOVER.sub(" ", text)
    text = html.unescape(text)
    text = text.replace("’", "'").replace(" ", " ")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^\((?:[^()]{0,40})\)\s*", "", text)  # (transitive), (figuratively)
    text = re.sub(r"\s*\[[^\]]*\]\s*$", "", text)
    return text.strip(" ;:,")


def pick_definition(payload, pos, min_len=12, max_len=130):
    """Первое пригодное определение нужной части речи.

    Отбрасывает служебные статьи («plural of ...», «given name»), слишком
    длинные и слишком короткие определения.
    """
    if not payload:
        return None, "нет ответа REST"
    groups = payload.get("en") or []
    ordered = [g for g in groups if g.get("partOfSpeech") == pos] or groups
    reason = "нет пригодного определения"
    for group in ordered:
        gpos = group.get("partOfSpeech")
        if gpos in NON_LEXICAL_POS:
            continue
        for item in group.get("definitions") or []:
            text = clean_definition(item.get("definition"))
            if not text:
                continue
            if FORM_OF_TEXT.match(text):
                reason = "словоформа другого слова"
                continue
            if PROPER_NAME_TEXT.match(text):
                reason = "имя собственное"
                continue
            if len(text) > max_len:
                short = re.split(r"[;:]|\s+\(", text)[0].strip(" ,;:")
                if min_len <= len(short) <= max_len:
                    text = short
                else:
                    reason = "определение слишком длинное"
                    continue
            if len(text) < min_len:
                reason = "определение слишком короткое"
                continue
            if not text.endswith((".", "!", "?")):
                text += "."
            examples = [clean_definition(e) for e in (item.get("examples") or [])]
            return (
                {"text": text[0].upper() + text[1:], "pos": gpos,
                 "examples": [e for e in examples if e]},
                None,
            )
    return None, reason


def pos_with_translations(entry):
    """Часть речи, для которой реально есть русские переводы.

    У многозначных статей Wiktionary переводы есть не у каждой части речи, и
    брать определение от одной, а перевод от другой — прямой путь к кривой
    карточке. Поэтому берём первую значимую часть речи, у которой перевод есть.
    """
    for pos in entry.major_pos():
        if entry.senses_for(pos):
            return pos
    return entry.primary_pos()


def load_entry(fetcher, word, min_interval):
    """Статья + при необходимости подстраница /translations.

    У самых частотных глаголов (take, run, put) раздел переводов вынесен на
    отдельную страницу шаблоном {{trans-see}}. Без неё как раз самые нужные
    слова остались бы без перевода.
    """
    wikitext, err = fetch_wikitext(fetcher, word, min_interval)
    if err:
        return None, err
    entry = parse_wikitext(word, wikitext)
    needs_subpage = entry.has_english and (entry.trans_see or not entry.senses)
    if needs_subpage:
        sub_text, sub_err = fetch_wikitext(fetcher, "%s/translations" % word, min_interval)
        if not sub_err and sub_text:
            sub = parse_wikitext(word, sub_text)
            known = {(s["pos"], s["gloss"], tuple(s["ru"])) for s in entry.senses}
            for sense in sub.senses:
                if (sense["pos"], sense["gloss"], tuple(sense["ru"])) not in known:
                    entry.senses.append(sense)
    return entry, None


def fetch_wikitext(fetcher, word, min_interval):
    url = WIKITEXT_URL % urllib.parse.quote(word)
    res = fetcher.get(url, "wiktionary-wikitext", key="wt:" + word, min_interval=min_interval)
    if not res.ok:
        return None, ("страницы нет" if res.status == 404 else "ошибка запроса: %s" % (res.error or res.status))
    data = res.json() or {}
    if "error" in data:
        return None, "страницы нет"
    return ((data.get("parse") or {}).get("wikitext") or ""), None


def fetch_definition(fetcher, word, min_interval):
    url = DEFINITION_URL % urllib.parse.quote(word)
    res = fetcher.get(url, "wiktionary-def", key="def:" + word, min_interval=min_interval)
    if not res.ok:
        return None, ("статьи нет" if res.status == 404 else "ошибка запроса: %s" % (res.error or res.status))
    return res.json(), None
