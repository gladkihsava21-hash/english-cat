"""Поиск лид-изображения статьи и его лицензии.

Два запроса на слово:
  1. REST-сводка статьи — https://<lang>.wikipedia.org/api/rest_v1/page/summary/<title>
     Оттуда берём originalimage.source: это лид, то самое изображение из
     карточки статьи.
  2. Commons API с prop=imageinfo&iiprop=extmetadata — автор, лицензия,
     ссылка на страницу файла. Без этого шага картинку брать нельзя:
     атрибуция для CC BY обязательна.

Оба ответа кладутся в кэш через wordpipe.http_cache, повторный прогон
в сеть не ходит.

Лицензионный фильтр строгий: пропускаем только public domain, CC0, CC BY и
CC BY-SA. Всё остальное — NC, ND, GFDL-only, fair use, «лицензия не указана» —
отбрасывается, даже если картинка идеальная.
"""

import html
import json
import re
import urllib.parse

SUMMARY_SOURCE = "wiki-summary"
COMMONS_SOURCE = "commons-meta"

# Свободные лицензии. Проверяем машинное значение extmetadata.License.
_FREE_RE = re.compile(
    r"^(?:"
    r"pd(?:[-_].*)?"          # pd, pd-old, pd-us, pd-self...
    r"|cc[-_]?zero"
    r"|cc0(?:[-_].*)?"
    r"|cc[-_]pd[-_]mark.*"
    r"|cc[-_]by[-_]\d.*"      # cc-by-2.0, cc-by-4.0
    r"|cc[-_]by[-_]sa[-_]\d.*"  # cc-by-sa-3.0
    r"|cc[-_]sa[-_]\d.*"
    r")$"
)
# Явно несвободное — ловим по тексту, даже если машинное поле выглядит прилично.
_NONFREE_WORDS = (
    "fair use", "fairuse", "non-free", "nonfree", "noncommercial",
    "non-commercial", "no derivative", "noderiv", "-nc-", "-nd-",
    "all rights reserved", "©", "copyright", "trademark",
)

# Файлы, которые почти наверняка не фотография предмета: схемы, карты,
# гербы, логотипы, графики. По имени файла отсекается заметная часть мусора
# ещё до скачивания.
_BAD_NAME_RE = re.compile(
    r"(?:^|[\W_])(?:"
    r"map|maps|karte|mapa|carte"
    r"|logo|logotype|wordmark|emblem|seal|crest|coa|coat[\W_]of[\W_]arms|flag"
    r"|diagram|schema|scheme|schematic|chart|graph|plot|infographic"
    r"|icon|symbol|pictogram|sign"
    r"|timeline|distribution|range|density|statistics|stats"
    r"|anatomy|gray\d+|grays|anatomical|cross[\W_]section"
    r"|screenshot|poster|cover|stamp|banner"
    r")(?:[\W_]|$)",
    re.I,
)
# Категории Commons, по которым видно, что это не современная фотография.
# Живопись, гравюры, рисунки и снимки до ~1930 попадают под шаблоны PD-Art и
# PD-old: именно они и дают в лидах Википедии тёмные полотна XIX века вместо
# предмета. Ребёнку такая картинка слово не подсказывает, поэтому режем по
# метаданным, а не на глаз.
_ART_CAT_RE = re.compile(
    r"(?:"
    r"pd[\W_]?art"
    r"|pd[\W_]?old"
    r"|\bpaintings?\b|\bdrawings?\b|\bengravings?\b|\betchings?\b"
    r"|\blithographs?\b|\bwoodcuts?\b|\bsketch(?:es)?\b|\bfashion plates?\b"
    r"|\bin art\b|\billustrations of\b|\bwoodblock\b|\bcaricatures?\b"
    r"|\bpd shape\b|\bcoats? of arms\b"
    r"|\bsatellite (?:pictures?|images?|imagery)\b|\bmaps?\b|\bdiagrams?\b"
    r"|\bmanuscripts?\b|\bengraved\b"
    r"|\b1[5-9]\d{2}s? (?:paintings|drawings|works|photographs)\b"
    r"|\b1[5-9]th[\W_]century\b"
    r")",
    re.I,
)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


class Candidate:
    """Одна найденная картинка со всей сопутствующей юридической обвязкой."""

    __slots__ = ("word", "lang", "article", "article_url", "filename",
                 "license", "license_short", "license_url", "author",
                 "credit", "descriptionurl", "width", "height", "mime",
                 "size", "restrictions")

    def __init__(self, **kw):
        for slot in self.__slots__:
            setattr(self, slot, kw.get(slot))

    @property
    def aspect(self):
        if not self.width or not self.height:
            return 1.0
        return max(self.width, self.height) / float(min(self.width, self.height))


def _strip_html(value):
    if not value:
        return ""
    text = _TAG_RE.sub(" ", value)
    text = html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _parse_title(spec):
    """'ru:Магазин' -> ('ru', 'Магазин'); 'Apple' -> ('en', 'Apple')."""
    if len(spec) > 3 and spec[2] == ":" and spec[:2].isalpha():
        return spec[:2], spec[3:]
    return "en", spec


def summary(fetcher, spec, delay=0.3):
    """Сводка статьи. Возвращает (lang, title, dict) или (lang, title, None)."""
    lang, title = _parse_title(spec)
    url = "https://%s.wikipedia.org/api/rest_v1/page/summary/%s" % (
        lang, urllib.parse.quote(title.replace(" ", "_"), safe=""))
    res = fetcher.get(url, SUMMARY_SOURCE, key="sum_%s_%s" % (lang, title),
                      min_interval=delay)
    if not res.ok:
        return lang, title, None
    try:
        return lang, title, json.loads(res.body)
    except (ValueError, TypeError):
        return lang, title, None


def lead_file(data):
    """Имя файла на Commons из сводки.

    Отдаём только то, что лежит в /wikipedia/commons/: файлы из локальных
    разделов (/wikipedia/en/) — это почти всегда fair use, их брать нельзя.
    """
    if not data or data.get("type") == "disambiguation":
        return None, "статья-неоднозначность"
    src = (data.get("originalimage") or {}).get("source") \
        or (data.get("thumbnail") or {}).get("source")
    if not src:
        return None, "у статьи нет лид-изображения"
    src = src.split("?")[0]
    if "/wikipedia/commons/" not in src:
        return None, "файл не с Commons (вероятно fair use)"
    name = urllib.parse.unquote(src.rsplit("/", 1)[-1])
    # thumb-путь: .../thumb/f/fd/Orange_juice_1.jpg/330px-Orange_juice_1.jpg
    if "/thumb/" in src:
        name = urllib.parse.unquote(src.split("/thumb/")[1].split("/")[2])
    return name, None


def file_info(fetcher, filename, delay=0.4):
    """extmetadata файла с Commons."""
    url = ("https://commons.wikimedia.org/w/api.php?action=query&format=json"
           "&prop=imageinfo&iiprop=extmetadata%7Curl%7Csize%7Cmime&titles="
           + urllib.parse.quote("File:" + filename, safe=""))
    res = fetcher.get(url, COMMONS_SOURCE, key="cm_%s" % filename, min_interval=delay)
    if not res.ok:
        return None
    try:
        pages = json.loads(res.body)["query"]["pages"]
    except (ValueError, KeyError, TypeError):
        return None
    for page in pages.values():
        info = (page.get("imageinfo") or [None])[0]
        if info:
            return info
    return None


def license_ok(info):
    """(годится, причина отказа). Строго: PD / CC0 / CC BY / CC BY-SA."""
    meta = info.get("extmetadata") or {}

    def val(key):
        return (meta.get(key) or {}).get("value") or ""

    machine = _strip_html(val("License")).lower().strip()
    short = _strip_html(val("LicenseShortName"))
    terms = _strip_html(val("UsageTerms"))
    haystack = (" ".join([machine, short, terms])).lower()

    if not machine and not short:
        return False, "лицензия не указана"
    for bad in _NONFREE_WORDS:
        if bad in haystack:
            return False, "несвободная лицензия (%s)" % (short or machine)
    if machine and _FREE_RE.match(machine):
        pass
    elif short.lower().startswith("public domain") or "cc0" in haystack:
        pass
    else:
        return False, "лицензия вне белого списка (%s)" % (short or machine)

    restrictions = _strip_html(val("Restrictions"))
    if restrictions:
        return False, "ограничения на использование (%s)" % restrictions
    return True, None


def author_of(info):
    meta = info.get("extmetadata") or {}
    for key in ("Artist", "Attribution", "Credit"):
        text = _strip_html((meta.get(key) or {}).get("value"))
        if text and len(text) < 220:
            return text
    return "Wikimedia Commons"


def looks_unusable(filename, info):
    """Отсев схем, карт, логотипов и слишком мелких/узких файлов до скачивания."""
    stem = filename.rsplit(".", 1)[0]
    if _BAD_NAME_RE.search(stem):
        return "по имени файла это схема/карта/логотип"
    meta = info.get("extmetadata") or {}
    cats = _strip_html((meta.get("Categories") or {}).get("value", "")).replace("|", " | ")
    hit = _ART_CAT_RE.search(cats)
    if hit:
        return "не современное фото: категория Commons «%s»" % hit.group(0)
    mime = info.get("mime") or ""
    if mime == "image/svg+xml" or filename.lower().endswith(".svg"):
        return "SVG — это рисунок или схема, не фотография"
    if mime and not mime.startswith("image/"):
        return "не изображение (%s)" % mime
    if filename.lower().endswith((".gif", ".tif", ".tiff")):
        return "формат %s" % filename.rsplit(".", 1)[-1]
    w, h = info.get("width") or 0, info.get("height") or 0
    if w and h:
        if min(w, h) < 320:
            return "слишком мелкий оригинал (%dx%d)" % (w, h)
        if max(w, h) / float(min(w, h)) > 2.2:
            return "панорама %dx%d — квадратная обрезка потеряет сюжет" % (w, h)
    return None


def find(fetcher, word, titles, summary_delay=0.3, commons_delay=0.4):
    """Первый годный кандидат по списку заголовков.

    Возвращает (Candidate | None, [причины отказа по каждому заголовку]).
    """
    reasons = []
    for spec in titles:
        lang, title, data = summary(fetcher, spec, delay=summary_delay)
        if data is None:
            reasons.append("%s: статья не найдена" % spec)
            continue
        filename, why = lead_file(data)
        if not filename:
            reasons.append("%s: %s" % (spec, why))
            continue
        info = file_info(fetcher, filename, delay=commons_delay)
        if not info:
            reasons.append("%s: нет данных о файле %s" % (spec, filename))
            continue
        why = looks_unusable(filename, info)
        if why:
            reasons.append("%s: %s (%s)" % (spec, why, filename))
            continue
        ok, why = license_ok(info)
        if not ok:
            reasons.append("%s: %s (%s)" % (spec, why, filename))
            continue
        meta = info.get("extmetadata") or {}
        return Candidate(
            word=word,
            lang=lang,
            article=title,
            article_url="https://%s.wikipedia.org/wiki/%s"
                        % (lang, urllib.parse.quote(title.replace(" ", "_"))),
            filename=filename,
            license=_strip_html((meta.get("License") or {}).get("value")),
            license_short=_strip_html((meta.get("LicenseShortName") or {}).get("value")),
            license_url=_strip_html((meta.get("LicenseUrl") or {}).get("value")),
            author=author_of(info),
            credit=_strip_html((meta.get("Credit") or {}).get("value"))[:200],
            descriptionurl=info.get("descriptionurl"),
            width=info.get("width"),
            height=info.get("height"),
            mime=info.get("mime"),
            size=info.get("size"),
            restrictions="",
        ), reasons
    return None, reasons


def download_url(filename, width=1000):
    """Special:FilePath отдаёт готовый thumbnail нужной ширины.

    Викимедиа просит не хотлинкать и не тянуть оригиналы на десятки мегабайт;
    этот адрес — штатный способ забрать файл разумного размера один раз.
    """
    return ("https://commons.wikimedia.org/wiki/Special:FilePath/%s?width=%d"
            % (urllib.parse.quote(filename.replace(" ", "_"), safe=""), width))
