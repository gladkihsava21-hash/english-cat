"""Скачивание файла и приведение к плитке 480×480 WebP.

Викимедиа прямо просит не отдавать свои адреса в вёрстку чужих сайтов, поэтому
файл скачивается один раз в кэш (tools/cache/img-src/) и дальше живёт у нас.
Кэш бинарный, мимо http_cache.Fetcher, но лимит запросов и User-Agent берём
у него же — чтобы к upload.wikimedia.org ходил один вежливый поток.
"""

import hashlib
import os
import urllib.error
import urllib.request

from PIL import Image, ImageFilter, ImageOps

DOWNLOAD_SOURCE = "upload"
TILE = 480
QUALITY_LADDER = (78, 72, 66, 60, 54, 48, 42)
MAX_BYTES = 40 * 1024


def fetch_file(fetcher, url, cache_dir, key, min_interval=0.5, timeout=60):
    """Байты файла: из кэша или из сети. Возвращает (bytes|None, ошибка|None)."""
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in key)[:48]
    path = os.path.join(cache_dir, DOWNLOAD_SOURCE, "%s.%s" % (safe, digest))
    if os.path.exists(path) and not fetcher.refresh:
        fetcher.stats["cache_hits"] = fetcher.stats.get("cache_hits", 0) + 1
        with open(path, "rb") as fh:
            return fh.read(), None
    if fetcher.offline:
        return None, "offline: файла нет в кэше"

    fetcher.limiter(DOWNLOAD_SOURCE, min_interval).wait()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": fetcher.user_agent})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as exc:
        fetcher.stats["errors"] = fetcher.stats.get("errors", 0) + 1
        return None, "HTTP %s" % exc.code
    except Exception as exc:
        fetcher.stats["errors"] = fetcher.stats.get("errors", 0) + 1
        return None, repr(exc)

    fetcher.stats["network"] = fetcher.stats.get("network", 0) + 1
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp%d" % os.getpid()
    with open(tmp, "wb") as fh:
        fh.write(raw)
    os.replace(tmp, path)
    return raw, None


def square_crop(img, size=TILE):
    """Квадрат из центра, но по вертикали чуть выше середины.

    У вертикальных фотографий предмет обычно в верхней половине кадра
    (человек, дерево, бутылка), поэтому строгий центр срезает главное и
    оставляет ноги и асфальт. Берём отступ сверху в 35% лишней высоты.
    """
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = int((h - side) * 0.35) if h > w else (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    return img.resize((size, size), Image.LANCZOS)


def to_webp(raw, dest, size=TILE, max_bytes=MAX_BYTES, ladder=QUALITY_LADDER):
    """Байты -> квадратный WebP. Возвращает (вес, качество) или (None, ошибка)."""
    import io
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            # прозрачность на белом: плитка в карточке всё равно на светлом фоне
            img = img.convert("RGBA")
            flat = Image.new("RGB", img.size, (255, 255, 255))
            flat.paste(img, mask=img.split()[-1])
            img = flat
        else:
            img = img.convert("RGB")
    except Exception as exc:
        return None, "не открылось: %r" % exc

    tile = square_crop(img, size)
    os.makedirs(os.path.dirname(dest), exist_ok=True)

    def encode(image, quality):
        buf = io.BytesIO()
        image.save(buf, "WEBP", quality=quality, method=6)
        return buf.getvalue()

    last = None
    for quality in ladder:
        data = encode(tile, quality)
        last = (data, quality)
        if len(data) <= max_bytes:
            break
    else:
        # Мелкая фактура (витрина, толпа, листва) не сжимается качеством:
        # WebP честно кодирует шум. Слегка размываем — на 480×480 глазом
        # незаметно, а вес падает вдвое.
        for radius in (0.4, 0.7, 1.1):
            soft = tile.filter(ImageFilter.GaussianBlur(radius))
            data = encode(soft, ladder[-1])
            last = (data, ladder[-1])
            if len(data) <= max_bytes:
                break

    data, quality = last
    tmp = dest + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, dest)
    return len(data), quality


def folder_bytes(path):
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            try:
                total += os.path.getsize(os.path.join(root, name))
            except OSError:
                pass
    return total
