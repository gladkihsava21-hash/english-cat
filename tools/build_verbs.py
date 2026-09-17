#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Список английских глаголов из нашего же словаря — для js/grammarcheck.js.

Зачем. Проверка грамматики без нейросети должна уметь сказать «в
предложении нет сказуемого»: методист написала «Dialysis structural
medical procedure to clean your kidney» — пропущено is a, и разбор
промолчал. Чтобы такое ловить и при этом не врать, нужно знать, какие
слова бывают глаголами. Готового списка в проекте нет, а тянуть чужой —
это ещё одна лицензия и ещё один файл на 2 МБ.

Откуда берём. У каждого слова в js/words.js есть русский перевод, а
русский инфинитив всегда кончается на «ть», «ться» или «ти»: «buy —
покупать», «go — идти». Этого признака достаточно: он даёт несколько
тысяч глаголов ровно того словаря, по которому ученик и пишет.

Что НЕ делаем. Не угадываем часть речи по форме английского слова и не
чистим список руками: лишний глагол в списке — это всего лишь молчание
правила, а вот пропущенный глагол превратился бы в ложное обвинение.

Запуск: python3 tools/build_verbs.py   (пишет js/verbs.js)
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORDS_JS = os.path.join(ROOT, "js", "words.js")
IRREGULAR_JS = os.path.join(ROOT, "js", "irregular.js")
OUT_JS = os.path.join(ROOT, "js", "verbs.js")

# Служебные и модальные: в словаре их перевод не инфинитив («can — мочь»
# кончается на «чь»), а сказуемым они бывают чаще всех остальных.
EXTRA = """be am is are was were been being have has had having do does did
done doing can could may might must shall should will would let go goes went
gone going get gets got gotten say says said see sees saw seen know knows knew
known think thinks thought take takes took taken come comes came want wants
wanted use uses used find finds found give gives gave given tell tells told
work works worked call calls called try tries tried ask asks asked need needs
needed feel feels felt become becomes became leave leaves left put puts mean
means meant keep keeps kept let lets begin begins began seem seems seemed help
helps helped talk talks talked turn turns turned start starts started show
shows showed hear hears heard play plays played run runs ran move moves moved
like likes liked live lives lived believe believes believed hold holds held
bring brings brought happen happens happened write writes wrote provide
provides provided sit sits sat stand stands stood lose loses lost pay pays paid
meet meets met include includes included continue continues continued set sets
learn learns learned understand understands understood watch watches watched
follow follows followed stop stops stopped create creates created speak speaks
spoke read reads allow allows allowed add adds added spend spends spent grow
grows grew open opens opened walk walks walked win wins won offer offers
offered remember remembers remembered love loves loved consider considers
considered appear appears appeared buy buys bought wait waits waited serve
serves served die dies died send sends sent build builds built stay stays
stayed fall falls fell cut cuts reach reaches reached kill kills killed remain
remains remained
clean cleans cleaned cleaning study studies studied studying purify purifies
purified purifying transport transports transported transporting check checks
checked checking wash washes washed washing cook cooks cooked cooking fix fixes
fixed fixing carry carries carried carrying hope hopes hoped hoping visit
visits visited visiting travel travels travelled traveling enjoy enjoys enjoyed
enjoying prefer prefers preferred preferring explain explains explained
explaining decide decides decided deciding improve improves improved improving
protect protects protected protecting contain contains contained containing
require requires required requiring produce produces produced producing reduce
reduces reduced reducing measure measures measured measuring describe describes
described describing prevent prevents prevented preventing support supports
supported supporting develop develops developed developing increase increases
increased increasing affect affects affected affecting treat treats treated
treating collect collects collected collecting replace replaces replaced
replacing remove removes removed removing repeat repeats repeated repeating
teach teaches taught teaching train trains trained training practise practises
practised practising practice practices practiced practicing
answer answers answered answering plan plans planned planning rest rests rested
resting surprise surprises surprised surprising name names named naming place
places placed placing order orders ordered ordering question questions
questioned questioning end ends ended ending result results resulted resulting
change changes changed changing face faces faced facing hand hands handed
handing head heads headed heading land lands landed landing mind minds minded
minding part parts parted parting point points pointed pointing present
presents presented presenting record records recorded recording report reports
reported reporting respect respects respected respecting review reviews
reviewed reviewing ring rings rang rung ringing risk risks risked risking rule
rules ruled ruling sense senses sensed sensing shape shapes shaped shaping
share shares shared sharing ship ships shipped shipping shop shops shopped
shopping sign signs signed signing sound sounds sounded sounding stamp stamps
stamped stamping stay stays stayed staying step steps stepped stepping stick
sticks stuck sticking store stores stored storing stress stresses stressed
stressing style styles styled styling taste tastes tasted tasting test tests
tested testing time times timed timing touch touches touched touching trade
trades traded trading trip trips tripped tripping trust trusts trusted
trusting value values valued valuing view views viewed viewing voice voices
voiced voicing wave waves waved waving wish wishes wished wishing wonder
wonders wondered wondering worry worries worried worrying water waters watered
watering warm warms warmed warming count counts counted counting cause causes
caused causing claim claims claimed claiming cover covers covered covering
demand demands demanded demanding design designs designed designing display
displays displayed displaying doubt doubts doubted doubting drop drops dropped
dropping estimate estimates estimated estimating experience experiences
experienced experiencing fear fears feared fearing figure figures figured
figuring focus focuses focused focusing form forms formed forming function
functions functioned functioning guard guards guarded guarding guess guesses
guessed guessing impact impacts impacted impacting influence influences
influenced influencing interest interests interested interesting issue issues
issued issuing judge judges judged judging label labels labelled labeling limit
limits limited limiting link links linked linking list lists listed listing
mark marks marked marking match matches matched matching matter matters
mattered mattering model models modelled modeling note notes noted noting
number numbers numbered numbering object objects objected objecting pattern
patterns patterned patterning permit permits permitted permitting picture
pictures pictured picturing plant plants planted planting practice pressure
pressures pressured pressuring price prices priced pricing process processes
processed processing profit profits profited profiting progress progresses
progressed progressing project projects projected projecting purpose purposes
reason reasons reasoned reasoning reference references referenced referencing
register registers registered registering release releases released releasing
request requests requested requesting research researches researched
researching rise rises rose risen rising route routes routed routing sample
samples sampled sampling scale scales scaled scaling schedule schedules
scheduled scheduling search searches searched searching service services
serviced servicing shelter shelters sheltered sheltering signal signals
signalled signaling smell smells smelled smelling sort sorts sorted sorting
sound sources sourced sourcing spring springs sprang springing staff staffs
staffed staffing stage stages staged staging standard standards state states
stated stating stock stocks stocked stocking strike strikes struck striking
struggle struggles struggled struggling supply supplies supplied supplying
surface surfaces surfaced surfacing survey surveys surveyed surveying target
targets targeted targeting tie ties tied tying track tracks tracked tracking
transfer transfers transferred transferring treat trial trials trialled
trialing type types typed typing witness witnesses witnessed witnessing
upset upsets upsetting echo echoes echoed echoing quack quacks quacked quacking
spit spits spat spitting censor censors censored censoring leak leaks leaked
leaking scare scares scared scaring bark barks barked barking tempt tempts
tempted tempting shine shines shone shining lay lays laid laying flee flees
fled fleeing hike hikes hiked hiking boogie boogies boogied""".split()


def load_words():
    """Тройки (слово, перевод, толкование) из js/words.js — источника правды."""
    src = open(WORDS_JS, encoding="utf-8").read()
    out = []
    for m in re.finditer(r'\{\s*w:\s*"([^"]+)",\s*t:\s*"([^"]+)"(.*?)\}', src, re.S):
        d = re.search(r'def:\s*"((?:[^"\\]|\\.)*)"', m.group(3))
        out.append((m.group(1), m.group(2), d.group(1) if d else ""))
    return out


# Инфинитив кончается на «ть» после ГЛАСНОЙ: покупать, учиться, петь.
# Проверка по гласной обязательна: «однородность», «новость», «жизнь»
# тоже кончаются на «ть»/«нь», и без неё в глаголы попадала половина
# существительных на -ость (так uniformity и стал «глаголом»).
RU_INF = re.compile(r"[аеёиоуыэюя](ть|ться|тся)$")


def is_verb_translation(t):
    """Русский перевод — инфинитив? «покупать», «учиться»."""
    for part in re.split(r"[,;/()]", t):
        for w in part.strip().lower().rstrip(".").split():
            if len(w) > 3 and RU_INF.search(w):
                return True
    return False


def is_verb_definition(d):
    """Английское толкование начинается с «to …» — так Wiktionary подаёт
    глаголы: «transport — To carry or bear from one place to another»."""
    return bool(re.match(r"\s*to\s+[a-z]", str(d or ""), re.I))


def forms(base):
    """Формы, которые ученик реально пишет: -s, -es, -ed, -ing, -ies."""
    out = {base}
    if base.endswith("y") and len(base) > 2 and base[-2] not in "aeiou":
        out |= {base[:-1] + "ies", base[:-1] + "ied"}
    elif base.endswith(("s", "sh", "ch", "x", "z", "o")):
        out.add(base + "es")
    else:
        out.add(base + "s")
    if base.endswith("e"):
        out |= {base + "d", base[:-1] + "ing"}
    else:
        out |= {base + "ed", base + "ing"}
    # Удвоение согласной: stop → stopped, run → running. Без него самые
    # ходовые формы не попадали в список.
    if (len(base) > 2 and base[-1] not in "aeiouwxy"
            and base[-2] in "aeiou" and base[-3] not in "aeiou"):
        out |= {base + base[-1] + "ed", base + base[-1] + "ing"}
    return out


def irregular_forms():
    """Три формы неправильных глаголов — их «-ed» не образуется."""
    try:
        src = open(IRREGULAR_JS, encoding="utf-8").read()
    except OSError:
        return set()
    out = set()
    for v, p, pp in re.findall(r'\{ v: "([^"]+)", p: "([^"]+)", pp: "([^"]+)"', src):
        for cell in (v, p, pp):
            for one in re.split(r"[,/]", cell):
                one = one.strip().lower()
                if one:
                    out |= forms(one) if one == v else {one}
    return out


def main():
    verbs = set()
    for w, t, d in load_words():
        w = w.strip().lower()
        if " " in w or not re.fullmatch(r"[a-z'-]+", w):
            continue                      # фразы и выражения — не сюда
        if is_verb_translation(t) or is_verb_definition(d):
            verbs |= forms(w)
    verbs |= irregular_forms()
    for w in EXTRA:
        verbs |= forms(w) if w.isalpha() else {w}
    verbs = sorted(v for v in verbs if len(v) > 1)

    lines, line = [], "  "
    for v in verbs:
        if len(line) + len(v) > 96:
            lines.append(line.rstrip())
            line = "  "
        line += v + " "
    if line.strip():
        lines.append(line.rstrip())
    body = "\n".join(lines)
    text = ("// Сгенерировано tools/build_verbs.py — руками не править.\n"
            "// Английские глаголы во всех школьных формах: те слова словаря,\n"
            "// чей русский перевод — инфинитив, плюс неправильные и служебные.\n"
            "// Нужен js/grammarcheck.js, чтобы отличать предложение без\n"
            "// сказуемого от предложения с редким глаголом.\n"
            "const EN_VERBS = new Set(`\n" + body + "\n`.split(/\\s+/).filter(Boolean));\n")
    with open(OUT_JS, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("глаголов (со всеми формами): %d → %s" % (len(verbs), os.path.relpath(OUT_JS, ROOT)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
