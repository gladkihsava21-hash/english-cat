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

# --- отбраковка ПРИМЕРОВ -------------------------------------------------
# Аудитория — школьники, часть младше 12. Список широкий намеренно: слово может
# быть нужным (war, free, drug), а вот предложение про него Tatoeba выдаст
# какое угодно. Если все примеры отсеялись, слово уходит на ручную доработку,
# где пример допишут руками, — из базы оно не пропадает.
_BLOCK_EN_GROUPS = {
    "насилие и смерть": """
        kill murder slay assassinate execute massacre suicide die dead death dying
        corpse body-bag funeral grave coffin bury burial mourn widow orphan
        blood bloody wound stab strangle beat torture hurt harm abuse victim
    """,
    "оружие и война": """
        gun rifle pistol shotgun bullet weapon bomb missile grenade explode explosion
        war battle army soldier troop invade invasion attack enemy hostage terrorist
        terror nuclear tank warship airstrike militia rebel
    """,
    "политика и конфликты": """
        tibet israel palestine gaza ukraine crimea taiwan kosovo chechnya syria iraq
        iran afghanistan vietnam korea communist communism fascist nazi hitler stalin
        lenin putin trump dictator regime revolution protest riot sanction occupation
        independence separatist refugee deport genocide holocaust apartheid
    """,
    "религия": """
        god jesus christ christian christianity muslim islam islamic allah muhammad
        jew jewish judaism buddha buddhist hindu church mosque synagogue temple pray
        prayer bible quran koran torah sin soul heaven hell devil satan angel priest
        monk baptize holy sacred worship atheist
    """,
    "алкоголь, курение, наркотики": """
        drug cocaine heroin marijuana cannabis opium narcotic addict addiction overdose
        drunk drunken alcohol alcoholic beer wine vodka whiskey rum brandy booze liquor
        cigarette cigar smoke smoking tobacco vape casino gamble gambling bet lottery
    """,
    "секс и ругательства": """
        sex sexy sexual porn nude naked penis vagina breast erotic orgasm virgin
        prostitute brothel rape incest pregnant abortion condom
        damn hell fuck shit crap piss ass asshole bitch bastard whore slut dick cock
        idiot moron stupid dumb jerk
    """,
    "болезни и травмы": """
        cancer tumour tumor disease illness infect infection virus plague epidemic
        pandemic diabetes stroke paralyse paralyze disabled blind deaf coma surgery
        amputate injury injure accident crash collision drown suffocate poison
    """,
    "преступления": """
        steal theft thief rob robbery burglar kidnap smuggle fraud bribe corrupt
        prison jail arrest police-raid criminal gang mafia
    """,
    "прочее тяжёлое": """
        divorce cheat betray hate hatred racism racist slave slavery starve famine
        poverty homeless bankrupt bankruptcy fire-victim earthquake tsunami hurricane
    """,
}

# Русские основы — проверяются по началу слова (в русском словоизменение
# суффиксальное, поэтому основы достаточно).
SENTENCE_BLOCK_RU = sorted(set("""
убил убить убива убийств смерт умер умир мертв труп похорон могил хорон вдов сирот
кровь кровав ранен ране изби пыта мучил жертв
оруж ружь пистолет пуля пуле бомб взрыв ракет граната война войн воен солдат арм
враг нападени захват заложник террор ядерн танк повстан
тибет израил палестин газа украин крым тайван сири ирак иран афган вьетнам корея
коммунист фашист нацист гитлер сталин ленин путин диктатор режим революци протест
бунт санкци оккупац сепаратист беженец геноцид холокост
бог божь иисус христ христиан мусульман ислам аллах еврей иуде будд индуист
церков мечет синагог молит молись библи коран тора грех душа рай ад дьявол сатан
ангел свящ монах крест свят поклон атеист
наркот кокаин героин марихуан опиум зависим передозиров
пьян пьёт алкогол пиво вино водк виски ром коньяк выпивк спирт
сигарет сигар кури курен табак казино азартн ставк лотере
секс порно голый обнажён эротич оргазм девствен проститут бордел изнасил инцест
беремен аборт презерватив
чёрт блин хрен дурак идиот тупой глуп придурок сволоч
рак опухол болезн зараз инфекц вирус чума эпидеми пандеми диабет инсульт паралич
инвалид слеп глух кома операци ампут травм ранени авари столкнов утону задох отрав
воров украл кража вор ограбл грабит похищ контрабанд мошенн взятк коррупц
тюрьм арест преступ банда мафи
развод изменил предал ненавис ненавид расизм расист раб рабств голод нищет бездомн
банкрот землетрясен цунами ураган пожар
""".split()))

# Страны, национальности и «горячие» топонимы. Блокируем целиком, а не только
# в конфликтном контексте: словарной карточке страна не нужна вообще, а отличить
# «I'm from Japan» от «Free Tibet!» списком слов надёжно нельзя.
COUNTRIES = """
afghanistan africa african albania algeria america american angola arab arabia
argentina armenia asia asian australia austria azerbaijan bangladesh belarus belgium
bolivia bosnia brazil britain british bulgaria burma cambodia cameroon canada
catalonia chechnya chile china chinese colombia congo croatia cuba cyprus czech
denmark dutch egypt england english estonia ethiopia europe european finland france
french georgia german germany greece greek haiti holland honduras hungary iceland
india indian indonesia iran iraq ireland irish israel israeli italian italy japan
japanese jordan kashmir kazakhstan kenya korea korean kosovo kurdish kurdistan kuwait
latvia lebanon libya lithuania macedonia malaysia mexican mexico moldova mongolia
morocco myanmar nepal netherlands nicaragua nigeria norway pakistan palestine panama
paraguay persia peru philippines poland polish portugal portuguese romania russia
russian rwanda scotland serbia siberia singapore slovakia slovenia somalia spain
spanish sudan sweden swedish swiss switzerland syria taiwan tajikistan tanzania
thailand tibet tunisia turkey turkish ukraine ukrainian uruguay uzbekistan venezuela
vietnam wales welsh yemen yugoslavia zimbabwe
crimea donbas gaza jerusalem chernobyl hiroshima nagasaki auschwitz
""".split()

# Лозунги: «Free Tibet!», «Long live the revolution!». Ловятся формой, а не
# словарём, потому что подставить можно любое название.
SLOGAN = re.compile(
    r"^\s*(free|save|support|boycott|stop|defend|liberate|down with|long live|viva|"
    r"god bless|remember)\b[^.?]*!\s*$",
    re.I,
)

# Имена из Tatoeba: не блокируем, но пример без них лучше.
TATOEBA_NAMES = re.compile(
    r"\b(Tom|Mary|John|Ann|Anne|Bob|Ken|Mike|Nancy|Jim|Bill|Jack|Alice|Emily|Sam)\b"
)


def _expand_en(word):
    """Словоформы для точного сравнения.

    Именно точного: наивная проверка «начинается на war» отбрасывает warm,
    ward и warn — совершенно безобидные школьные слова.
    """
    forms = {word, word + "s", word + "es", word + "ed", word + "ing"}
    if word.endswith("e"):
        # «+d» только для слов на -e, иначе war порождает ward
        forms.update({word + "d", word[:-1] + "ing", word[:-1] + "ed"})
    if word.endswith("y") and len(word) > 2:
        forms.update({word[:-1] + "ies", word[:-1] + "ied"})
    return forms


SENTENCE_BLOCK_EN = {}
for _group, _words in _BLOCK_EN_GROUPS.items():
    for _w in _words.split():
        SENTENCE_BLOCK_EN.setdefault(_w.replace("-", " "), _group)
for _w in COUNTRIES:
    SENTENCE_BLOCK_EN.setdefault(_w, "страны и национальности")

# Безобидные омографы: индейка, полировать, фарфор, перец — их блокировать не за что.
HOMOGRAPH_ALLOW = set("turkey polish china chile chili".split())

# Если слово нельзя показать ребёнку в ПРИМЕРЕ, то и карточкой оно быть не может:
# «murder — убивать» с примером «Цезарь был убит» школьнику незачем. Раньше
# такие слова проходили, потому что формы самого заголовка из проверки примера
# исключаются (иначе у war никогда не нашлось бы примера).
HEADWORD_BLOCK |= set(SENTENCE_BLOCK_EN) - HOMOGRAPH_ALLOW

# Служебные слова закрытого класса: предлоги, местоимения, определители,
# союзы, вспомогательные и модальные глаголы. Робот делает из них негодные
# карточки — «off → вон» с примером «Shove off! / С глаз долой!» ничему не
# учит. В существующей базе такие слова размечены руками (категория linkers),
# руками их и надо добавлять.
FUNCTION_WORDS = set("""
the this that these those
i you he she it we they me him her us them
my your his its our their mine yours hers ours theirs
myself yourself himself herself itself ourselves yourselves themselves
all any both each either neither every few many most much none one other others
several some such another enough
and but nor yet for so if then than because while although though unless until
whether since as
at by from into of off on onto out over under upon with within without about
above across after against along among around before behind below beneath beside
between beyond down during except inside near outside past through throughout
toward towards underneath onto per via
be am is are was were been being
have has had having do does did doing
will would shall should can could may might must ought
not very too just only also still even
""".split())

# Неправильные формы: префильтр по суффиксам их не ловит (said, went, taken),
# а Wiktionary даёт им отдельные редкие значения — так «said» превращается
# в «упомянутый».
# Только те формы, которые не являются одновременно самостоятельным словом.
# put, read, run, set, left, thought, found — не в списке: у них есть свои
# значения (левый, мысль), и с ними разберётся фильтр определений «form of».
IRREGULAR_FORMS = set("""
said went gone done made got gotten came seen saw took taken knew known
brought bought caught taught kept meant met paid sold sent sang slept spoke spoken
spent stole told understood woke wore worn won wrote written began begun broke
broken chose chosen drank drunk drove driven ate eaten fell fallen flew flown
forgot forgotten froze frozen gave given grew grown hid hidden rode ridden rang
rung rose risen sank shook shaken shone showed shown shrank slid sprang stuck
stung struck swam swore swept swum threw thrown knelt crept dealt fought fled
flung forbade laid leapt lent lain sat stood
""".split())

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
    # словоформы того же: drugs, killing, wounded
    for _suffix in ("s", "es", "ed", "ing", "d"):
        if w.endswith(_suffix) and w[: -len(_suffix)] in HEADWORD_BLOCK:
            return False, "недетская лексика"
    if w in FUNCTION_WORDS:
        return False, "служебное слово"
    if w in IRREGULAR_FORMS:
        return False, "неправильная форма другого слова"
    if re.search(r"(.)\1\1", w):
        return False, "похоже на опечатку"
    return True, None


class SentenceGuard:
    """Проверка примера на пригодность для детского сайта.

    Формы самого изучаемого слова из проверки исключаются: иначе у слова «war»
    примера не найдётся никогда, а слово школьное и нужное.
    """

    def __init__(self, word, forms):
        own = {f.lower() for f in forms} | {word.lower()}
        self.word = word.lower()
        patterns, self.reasons = [], {}
        for bad, group in SENTENCE_BLOCK_EN.items():
            if bad in own:
                continue
            for form in _expand_en(bad):
                if form in own:
                    continue
                patterns.append(re.escape(form))
                self.reasons[form] = (bad, group)
        self.en_re = re.compile(r"\b(%s)\b" % "|".join(sorted(patterns, key=len, reverse=True)), re.I)
        own_ru_safe = ()
        self.ru_stems = [s for s in SENTENCE_BLOCK_RU if s not in own_ru_safe]

    def check(self, en, ru):
        """-> причина отбраковки или None."""
        if SLOGAN.match(en):
            return "не для детей [лозунг]: %s" % en[:30]
        hit = self.en_re.search(en)
        if hit:
            bad, group = self.reasons.get(hit.group(1).lower(), (hit.group(1), "?"))
            return "не для детей [%s]: %s" % (group, bad)
        low_ru = ru.lower().replace("ё", "е")
        for stem in self.ru_stems:
            if stem.replace("ё", "е") in low_ru:
                return "не для детей (в переводе): %s" % stem
        return None


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
