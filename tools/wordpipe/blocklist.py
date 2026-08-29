"""Слова, которых не должно быть в детском тренажёре.

Один список на весь проект. До него каждый сборщик фильтровал по-своему,
то есть никак: мат вычищали из словаря руками (v159, 126 слов), а тест
на уровень собирался отдельным скриптом и приносил «suck» и «kinky»
обратно. Владелец увидел их при регистрации — и был прав.

Что сюда входит и что нет
-------------------------
Входит: брань, оскорбления, сексуальная и телесно-физиологическая
лексика, наркотики. То, что родитель не хочет видеть на экране ребёнка
и о чём не спросят на ОГЭ.

НЕ входит обычная школьная лексика, даже если тема невесёлая: war, death,
enemy, weapon, fight, blood, kill, murder, prison — они встречаются
в учебниках, книгах и на экзамене, и вычищать их значило бы обеднять
словарь ради ложного приличия.

Спорные случаи решаются в пользу исключения из ТЕСТА, но не всегда
из словаря: ученик, который сам добавил слово, вправе его учить.
"""

# Брань и оскорбления
PROFANITY = """
arse arsehole ass asshole bastard bitch bollocks bugger bullshit crap cunt
damn dick dickhead dumbass fag faggot fuck fucker fucking goddamn jerk
motherfucker nigger piss prick pussy retard shit shitty slut son-of-a-bitch
twat wanker whore
"""

# Сексуальное и телесно-физиологическое
SEXUAL = """
anus arousal boner bosom brothel buttock condom cum cunnilingus dildo
ejaculate erection foreplay genital genitalia hooker horny incest
intercourse kinky lust masturbate masturbation nipple orgasm orgy penis
pimp porn porno pornography prostitute prostitution pubic scrotum semen
sexual sexuality sexy sperm striptease stripper testicle threesome tit
tits vagina viagra vulva wank
"""

# Наркотики и одурманивание
DRUGS = """
booze cannabis cocaine crackhead hashish heroin junkie lsd marijuana meth
methamphetamine narcotic opium stoned
"""
# Сюда СОЗНАТЕЛЬНО не входят joint, pot, weed, dope: в нашем словаре они
# переведены как «совместный», «кастрюля», «сорняк», «клёвый» — обычные
# школьные значения. Блокировать слово из-за наркосленга, которого у нас
# нет ни в переводе, ни в примере, значит обеднять словарь ради приличия,
# которое никто не нарушал.

# Отдельно: слова, у которых приличное значение есть, но в тесте
# «знаю / не знаю» ученик подумает не о нём. В словаре они остаются.
TEST_ONLY = """
suck sucks blow screw balls sex erotic escort climax virgin nude naked
"""

BLOCKED = {w for w in (PROFANITY + SEXUAL + DRUGS).split()}
BLOCKED_IN_TEST = BLOCKED | {w for w in TEST_ONLY.split()}


def is_blocked(token, in_test=False):
    """Слово запрещено? Сверка по точному совпадению, без вхождений:
    иначе «class» отсеялся бы из-за «ass», а «Sussex» — из-за «sex»."""
    t = (token or "").strip().lower()
    return t in (BLOCKED_IN_TEST if in_test else BLOCKED)
