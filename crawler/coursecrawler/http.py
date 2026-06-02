"""Polite HTTP client with on-disk caching and per-host rate limiting."""
from __future__ import annotations

import hashlib
import time
from pathlib import Path
from typing import Optional

import httpx

from . import config


class Fetcher:
    """A small wrapper around httpx with retries, rate limiting, and an HTML cache.

    The cache keys on URL and lets us iterate on parsing without re-hitting sites.
    """

    def __init__(self, use_cache: bool = True, delay_s: float = config.REQUEST_DELAY_S):
        config.ensure_dirs()
        self.use_cache = use_cache
        self.delay_s = delay_s
        self._last_request: dict[str, float] = {}
        self.client = httpx.Client(
            headers={"User-Agent": config.USER_AGENT},
            timeout=config.REQUEST_TIMEOUT_S,
            follow_redirects=True,
            http2=True,
        )

    def _cache_path(self, url: str) -> Path:
        key = hashlib.sha1(url.encode("utf-8")).hexdigest()
        return config.HTML_CACHE_DIR / f"{key}.html"

    def _throttle(self, url: str) -> None:
        host = httpx.URL(url).host or ""
        last = self._last_request.get(host)
        if last is not None:
            wait = self.delay_s - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
        self._last_request[host] = time.monotonic()

    def get(self, url: str, *, force: bool = False) -> Optional[str]:
        cache_path = self._cache_path(url)
        if self.use_cache and not force and cache_path.exists():
            return cache_path.read_text(encoding="utf-8", errors="replace")

        last_err: Optional[Exception] = None
        for attempt in range(config.MAX_RETRIES):
            try:
                self._throttle(url)
                resp = self.client.get(url)
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("Retry-After", "5"))
                    time.sleep(min(retry_after, 30))
                    continue
                resp.raise_for_status()
                text = resp.text
                if self.use_cache:
                    cache_path.write_text(text, encoding="utf-8")
                return text
            except Exception as e:  # noqa: BLE001 - we want to retry broadly
                last_err = e
                time.sleep(1.5 * (attempt + 1))
        print(f"  [http] FAILED {url}: {last_err}")
        return None

    def get_bytes(self, url: str) -> Optional[bytes]:
        try:
            self._throttle(url)
            resp = self.client.get(url)
            resp.raise_for_status()
            return resp.content
        except Exception as e:  # noqa: BLE001
            print(f"  [http] FAILED (bytes) {url}: {e}")
            return None

    def close(self) -> None:
        self.client.close()
