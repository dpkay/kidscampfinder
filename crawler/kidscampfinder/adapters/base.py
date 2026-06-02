"""Adapter base class."""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterator

from ..http import Fetcher
from ..models import Course


class Adapter(ABC):
    #: stable source key, e.g. "feriennet:ferienplausch" or "jugendsportcamps"
    source: str = "base"

    def __init__(self, fetcher: Fetcher):
        self.fetcher = fetcher

    @abstractmethod
    def fetch(self) -> Iterator[Course]:
        """Yield fully-normalized Course objects (with occasions attached)."""
        raise NotImplementedError
