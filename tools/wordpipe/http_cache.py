"""HTTP-слой: вежливый rate limit, ретраи, постоянный кэш на диске.

Ключевые свойства:
  * на каждый источник — свой минимальный интервал между запросами (глобальный,
    даже если работает несколько потоков);
  * User-Agent с названием проекта и контактом (требование Wikimedia);
  * ответы (включая 404) кладутся на диск, повторный прогон их не перезапрашивает;
  * режим offline — работать только из кэша.
"""

import gzip
import hashlib
import json
import os
import random
import re
import threading
import time
import urllib.error
import urllib.request

from . import PROJECT_UA


class RateLimiter:
    """Глобальный ограничитель: не чаще одного запроса раз в min_interval секунд.

    Лок отпускается до sleep, поэтому потоки выстраиваются в очередь, а не
    блокируют друг друга целиком.
    """

    def __init__(self, min_interval):
        self.min_interval = float(min_interval)
        self._lock = threading.Lock()
        self._next_at = 0.0

    def wait(self):
        with self._lock:
            now = time.monotonic()
            start = max(now, self._next_at)
            self._next_at = start + self.min_interval
        delay = start - now
        if delay > 0:
            time.sleep(delay)

    def penalise(self, seconds):
        """Отодвинуть следующий запрос (после 429/5xx)."""
        with self._lock:
            self._next_at = max(self._next_at, time.monotonic() + float(seconds))


class FetchResult:
    __slots__ = ("status", "body", "from_cache", "error")

    def __init__(self, status, body, from_cache=False, error=None):
        self.status = status
        self.body = body
        self.from_cache = from_cache
        self.error = error

    @property
    def ok(self):
        return self.status == 200 and self.body is not None

    def json(self):
        if not self.ok:
            return None
        try:
            return json.loads(self.body)
        except (ValueError, TypeError):
            return None


_UNSAFE = re.compile(r"[^a-zA-Z0-9._-]+")


class Fetcher:
    def __init__(
        self,
        cache_dir,
        user_agent=PROJECT_UA,
        timeout=30,
        max_retries=3,
        offline=False,
        refresh=False,
    ):
        self.cache_dir = cache_dir
        self.user_agent = user_agent
        self.timeout = timeout
        self.max_retries = max_retries
        self.offline = offline
        self.refresh = refresh
        self._limiters = {}
        self._limiters_lock = threading.Lock()
        self.stats = {"cache_hits": 0, "network": 0, "errors": 0}
        self._stats_lock = threading.Lock()

    # --- служебное -----------------------------------------------------
    def limiter(self, source, min_interval):
        with self._limiters_lock:
            lim = self._limiters.get(source)
            if lim is None:
                lim = RateLimiter(min_interval)
                self._limiters[source] = lim
            return lim

    def _bump(self, key):
        with self._stats_lock:
            self.stats[key] = self.stats.get(key, 0) + 1

    def _cache_path(self, source, key):
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
        safe = _UNSAFE.sub("_", key)[:48]
        return os.path.join(self.cache_dir, source, digest[:2], "%s.%s.json" % (safe, digest[:10]))

    def _read_cache(self, path):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return None

    def _write_cache(self, path, payload):
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            tmp = path + ".tmp%d" % os.getpid()
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False)
            os.replace(tmp, path)
        except OSError:
            pass

    # --- основное ------------------------------------------------------
    def get(self, url, source, key=None, min_interval=1.0, accept="application/json"):
        key = key or url
        path = self._cache_path(source, key)

        if not self.refresh:
            cached = self._read_cache(path)
            if cached is not None:
                self._bump("cache_hits")
                return FetchResult(cached.get("status"), cached.get("body"), from_cache=True)

        if self.offline:
            return FetchResult(0, None, error="offline: нет в кэше")

        limiter = self.limiter(source, min_interval)
        last_error = None
        for attempt in range(self.max_retries + 1):
            limiter.wait()
            try:
                req = urllib.request.Request(
                    url,
                    headers={
                        "User-Agent": self.user_agent,
                        "Accept": accept,
                        "Accept-Encoding": "gzip",
                    },
                )
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    if resp.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                    body = raw.decode("utf-8", "replace")
                self._bump("network")
                self._write_cache(path, {"url": url, "status": 200, "body": body, "ts": int(time.time())})
                return FetchResult(200, body)
            except urllib.error.HTTPError as exc:
                if exc.code in (404, 400):
                    # отрицательный кэш: слова нет — второй раз не спрашиваем
                    self._bump("network")
                    self._write_cache(path, {"url": url, "status": exc.code, "body": None, "ts": int(time.time())})
                    return FetchResult(exc.code, None)
                last_error = "HTTP %s" % exc.code
                if exc.code in (429, 500, 502, 503, 504):
                    retry_after = exc.headers.get("Retry-After") if exc.headers else None
                    try:
                        pause = float(retry_after)
                    except (TypeError, ValueError):
                        pause = min(60.0, (2 ** attempt) * 2.0 + random.random())
                    limiter.penalise(pause)
                    continue
                break
            except Exception as exc:  # таймауты, DNS, обрывы
                last_error = repr(exc)
                limiter.penalise(min(30.0, (2 ** attempt) + random.random()))
                continue

        self._bump("errors")
        return FetchResult(0, None, error=last_error)

    def get_bytes(self, url, source, key, min_interval=2.0):
        """Скачивание крупного файла (частотные списки) с кэшем в отдельном файле."""
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]
        path = os.path.join(self.cache_dir, source, "%s.%s.txt" % (_UNSAFE.sub("_", key)[:40], digest))
        if os.path.exists(path) and not self.refresh:
            self._bump("cache_hits")
            with open(path, "r", encoding="utf-8", errors="replace") as fh:
                return fh.read()
        if self.offline:
            return None
        self.limiter(source, min_interval).wait()
        try:
            req = urllib.request.Request(url, headers={"User-Agent": self.user_agent, "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=max(self.timeout, 60)) as resp:
                raw = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    raw = gzip.decompress(raw)
            text = raw.decode("utf-8", "replace")
        except Exception:
            self._bump("errors")
            return None
        self._bump("network")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        return text
