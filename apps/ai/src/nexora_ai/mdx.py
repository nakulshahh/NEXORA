"""Parse NEXORA lesson MDX into plain structure. Not a general MDX parser: it understands exactly the components our
content schema allows (Callout, Seq, Sim, Exercise), which the web app's validator already enforces."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

_COMPONENT = re.compile(r"<(Callout|Seq|Sim|Exercise)\b")


@dataclass
class Exercise:
    id: str
    kind: str
    prompt: str
    explain: str


@dataclass
class Block:
    kind: str                 # paragraph | code | table | list | seq | callout
    text: str
    h2: str | None
    h3: str | None


@dataclass
class Lesson:
    chapter: str
    slug: str
    title: str
    summary: str
    order: int
    objectives: list[str]
    concepts: list[str]
    misconceptions: list[tuple[str, str]]
    blocks: list[Block]
    exercises: list[Exercise]
    sims: list[str] = field(default_factory=list)
    path: str = ""


def _parse_attrs(src: str, i: int) -> tuple[dict[str, object], int, bool]:
    """Parse JSX attributes starting at src[i] (just after the tag name). Returns (attrs, index after '>', self_closing)."""
    attrs: dict[str, object] = {}
    n = len(src)
    while i < n:
        while i < n and src[i].isspace():
            i += 1
        if src.startswith("/>", i):
            return attrs, i + 2, True
        if src[i] == ">":
            return attrs, i + 1, False
        m = re.compile(r"[A-Za-z_][\w-]*").match(src, i)
        if not m:
            raise ValueError(f"bad attribute at {src[i:i+30]!r}")
        name = m.group(0)
        i = m.end()
        if i < n and src[i] == "=":
            i += 1
            if src[i] == '"':
                j = src.index('"', i + 1)
                attrs[name] = src[i + 1 : j]
                i = j + 1
            elif src[i] == "{":
                depth, j, in_str, esc = 0, i, False, False
                while j < n:
                    c = src[j]
                    if in_str:
                        if esc:
                            esc = False
                        elif c == "\\":
                            esc = True
                        elif c == '"':
                            in_str = False
                    elif c == '"':
                        in_str = True
                    elif c == "{":
                        depth += 1
                    elif c == "}":
                        depth -= 1
                        if depth == 0:
                            break
                    j += 1
                attrs[name] = json.loads(src[i + 1 : j])
                i = j + 1
            else:
                raise ValueError("unsupported attribute value")
        else:
            attrs[name] = True
    raise ValueError("unterminated tag")


def _flatten_components(body: str) -> tuple[str, list[Exercise], list[str]]:
    """Replace components by plain text (Callout inner text, a readable form of Seq) or remove them (Sim, Exercise)."""
    exercises: list[Exercise] = []
    sims: list[str] = []
    out: list[str] = []
    pos = 0
    in_fence = False
    # Components inside code fences are examples, not components; walk line by line to know the fence state.
    lines = body.split("\n")
    offset = 0
    fence_ranges: list[tuple[int, int]] = []
    start = None
    for line in lines:
        if line.lstrip().startswith("```"):
            if start is None:
                start = offset
            else:
                fence_ranges.append((start, offset + len(line)))
                start = None
        offset += len(line) + 1

    def in_code(idx: int) -> bool:
        return any(a <= idx <= b for a, b in fence_ranges)

    for m in _COMPONENT.finditer(body):
        if m.start() < pos or in_code(m.start()):
            continue
        out.append(body[pos : m.start()])
        name = m.group(1)
        attrs, end, self_closing = _parse_attrs(body, m.end())
        if name == "Callout":
            close = body.index("</Callout>", end)
            out.append("\n\n" + body[end:close].strip() + "\n\n")
            pos = close + len("</Callout>")
        else:
            pos = end
            if name == "Seq":
                msgs = attrs.get("messages", [])
                parts = attrs.get("participants", [])
                lines_ = [f"{parts[x['from']]} to {parts[x['to']]}: {x['label']}" for x in msgs if isinstance(x, dict)]
                if lines_:
                    out.append("\n\nSequence of messages. " + ". ".join(lines_) + ".\n\n")
            elif name == "Sim":
                sims.append(str(attrs.get("id", "")))
            elif name == "Exercise":
                exercises.append(Exercise(str(attrs["id"]), str(attrs.get("kind", "")), str(attrs.get("prompt", "")), str(attrs.get("explain", ""))))
    out.append(body[pos:])
    return "".join(out), exercises, sims


_H = re.compile(r"^(#{2,3})\s+(.*\S)\s*$")


def blocks_from_markdown(text: str) -> list[Block]:
    blocks: list[Block] = []
    h2: str | None = None
    h3: str | None = None
    buf: list[str] = []
    kind = "paragraph"
    in_fence = False

    def flush() -> None:
        nonlocal buf, kind
        if buf:
            joined = "\n".join(buf).strip()
            if joined:
                blocks.append(Block(kind, joined, h2, h3))
        buf, kind = [], "paragraph"

    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            if not in_fence:
                flush()
                in_fence, kind = True, "code"
                buf.append(re.sub(r"^(\s*```)\w*.*$", r"\1", line))  # drop lang/file/mark attrs
            else:
                buf.append(line.strip())
                in_fence = False
                flush()
            continue
        if in_fence:
            buf.append(line)
            continue
        hm = _H.match(line)
        if hm:
            flush()
            if len(hm.group(1)) == 2:
                h2, h3 = hm.group(2), None
            else:
                h3 = hm.group(2)
            continue
        if not line.strip():
            flush()
            continue
        if not buf:
            kind = "table" if line.lstrip().startswith("|") else ("list" if re.match(r"\s*([-*]|\d+\.)\s", line) else "paragraph")
        buf.append(line)
    flush()
    return blocks


def _clean_inline(s: str) -> str:
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)        # links -> label
    s = re.sub(r"(\*\*|__)(.*?)\1", r"\2", s)             # bold
    s = re.sub(r"(?<!\w)\*(?!\s)(.*?)\*(?!\w)", r"\1", s)  # italics (simple)
    s = re.sub(r"`([^`]+)`", r"\1", s)                    # inline code keeps its text
    s = re.sub(r"</?[A-Za-z][^>]*>", "", s)               # stray tags
    return s


def parse_lesson(path: Path) -> Lesson:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        raise ValueError(f"{path}: missing frontmatter")
    _, fm, body = raw.split("---", 2)
    meta = yaml.safe_load(fm)
    flat, exercises, sims = _flatten_components(body)
    blocks = blocks_from_markdown(flat)
    for b in blocks:
        if b.kind != "code":
            b.text = _clean_inline(b.text)
    return Lesson(
        chapter=str(meta["chapter"]), slug=str(meta["slug"]), title=str(meta["title"]), summary=str(meta["summary"]),
        order=int(meta["order"]), objectives=[str(x) for x in meta.get("objectives", [])],
        concepts=[str(x) for x in meta.get("concepts", [])],
        misconceptions=[(str(m["belief"]), str(m["correction"])) for m in meta.get("misconceptions", [])],
        blocks=blocks, exercises=exercises, sims=sims, path=str(path),
    )


def load_lessons(lessons_dir: Path) -> list[Lesson]:
    return [parse_lesson(p) for p in sorted(lessons_dir.glob("*/*.mdx"))]
