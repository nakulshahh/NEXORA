"""Optional external knowledge sources: approved articles, documentation, permitted transcripts.

NEXORA ships none. The loader exists so adding one is a file, not a code change, and so that it is impossible to ingest
third-party text without recording where it came from and under what permission:

    packages/content/sources/<name>.md
    ---
    kind: article | doc | transcript
    title: ...
    url: https://...
    license: CC-BY-4.0            # or "permission-granted: <who, when>" for transcripts
    permission: "Written permission from the author, 2026-11-20"   # required for transcript, article
    ---
    body in Markdown (## headings are respected)

A file missing url / license (or permission for articles and transcripts) is rejected, loudly.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml


@dataclass
class Source:
    key: str
    kind: str
    title: str
    url: str
    license: str
    body: str


class SourceError(ValueError):
    pass


def load_sources(directory: Path) -> list[Source]:
    out: list[Source] = []
    if not directory.exists():
        return out
    for p in sorted(directory.glob("*.md")):
        raw = p.read_text(encoding="utf-8")
        if not raw.startswith("---"):
            raise SourceError(f"{p.name}: missing frontmatter")
        _, fm, body = raw.split("---", 2)
        meta = yaml.safe_load(fm) or {}
        kind = meta.get("kind")
        if kind not in ("article", "doc", "transcript"):
            raise SourceError(f"{p.name}: kind must be article, doc or transcript")
        for req in ("title", "url", "license"):
            if not meta.get(req):
                raise SourceError(f"{p.name}: '{req}' is required for external sources")
        if kind in ("article", "transcript") and not meta.get("permission"):
            raise SourceError(f"{p.name}: '{kind}' sources need a 'permission' line stating who allowed this and when")
        out.append(Source(f"source:{p.stem}", kind, str(meta["title"]), str(meta["url"]), str(meta["license"]), body.strip()))
    return out
