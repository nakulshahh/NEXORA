import type { ParamDef, Params, SimSpec, Step } from "./engine.ts";
import type { GenericState } from "./generic.ts";

const SAMPLES: Record<string, string> = { ascii: "Nexora", accent: "café", cjk: "日本語", emoji: "hi 🙂" };
const params: ParamDef[] = [
  { key: "sample", label: "Text", kind: "select", options: [{ value: "ascii", label: "Nexora" }, { value: "accent", label: "café" }, { value: "cjk", label: "日本語" }, { value: "emoji", label: "hi 🙂" }] },
  { key: "enc", label: "Encoding", kind: "select", options: [{ value: "utf8", label: "UTF-8" }, { value: "utf16", label: "UTF-16 (little-endian)" }] },
  { key: "frame", label: "Framing", kind: "select", options: [{ value: "none", label: "Just the bytes" }, { value: "len", label: "4-byte length prefix" }], hint: "A receiver must know where a message ends." },
];
const defaults: Params = { sample: "accent", enc: "utf8", frame: "none" };

/** Encode one code point by hand so the lab shows the rules rather than hiding them behind TextEncoder. */
export function encodeCodePoint(cp: number, enc: string): number[] {
  if (enc === "utf16") {
    if (cp < 0x10000) return [cp & 0xff, cp >> 8];
    const v = cp - 0x10000, hi = 0xd800 + (v >> 10), lo = 0xdc00 + (v & 0x3ff);
    return [hi & 0xff, hi >> 8, lo & 0xff, lo >> 8];
  }
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 63)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63)];
}
const hex = (n: number) => n.toString(16).padStart(2, "0");

export function bytesScenario(p: Params): Step<GenericState>[] {
  const text = SAMPLES[String(p.sample)] ?? "", enc = String(p.enc), cps = Array.from(text).map((c) => c.codePointAt(0)!), out: Step<GenericState>[] = [];
  const bytes: { b: number; ch: number }[] = [];
  const total = cps.reduce((n, cp) => n + encodeCodePoint(cp, enc).length, 0);
  const state = (line: string, current: number): GenericState => ({
    title: "Bytes on the wire", line,
    cells: bytes.map((x) => ({ label: hex(x.b), sub: x.ch < 0 ? "length" : `char ${x.ch + 1}`, tone: x.ch === current ? "hit" : "field" })),
    metrics: [{ label: "Characters", value: String(cps.length) }, { label: "Bytes so far", value: String(bytes.length) }, { label: "Payload bytes", value: String(bytes.filter((x) => x.ch >= 0).length) }],
  });
  const framed = p.frame === "len";
  out.push({ id: "start", label: "Text is not bytes", explain: `"${text}" is ${cps.length} character${cps.length === 1 ? "" : "s"} (code points). A network or file only carries bytes, so an encoding must turn each code point into some of them.`, ms: 0, state: state("no bytes yet", -1) });
  if (framed) {
    [(total >>> 24) & 255, (total >>> 16) & 255, (total >>> 8) & 255, total & 255].forEach((b) => bytes.push({ b, ch: -1 }));
    out.push({ id: "len", label: `Length prefix: ${total}`, explain: `The sender writes the payload size first, as 4 bytes big-endian, so the receiver knows exactly how many bytes follow. Without it, a stream of bytes has no message boundaries.`, ms: 0, state: state(`len = ${total} -> ${bytes.map((x) => hex(x.b)).join(" ")}`, -1) });
  }
  cps.forEach((cp, i) => {
    const bs = encodeCodePoint(cp, enc); bs.forEach((b) => bytes.push({ b, ch: i }));
    const rule = enc === "utf16" ? (bs.length === 4 ? "Above U+FFFF, UTF-16 uses a surrogate pair: two 16-bit units." : "Code points up to U+FFFF fit in one 16-bit unit, written low byte first.") : bs.length === 1 ? "Below U+0080 UTF-8 is the same single byte as ASCII." : `UTF-8 uses ${bs.length} bytes here: a leading byte announcing the length, then continuation bytes starting with 10.`;
    out.push({ id: `c${i}`, label: `U+${cp.toString(16).toUpperCase().padStart(4, "0")} -> ${bs.length} byte${bs.length === 1 ? "" : "s"}`, explain: rule, ms: 0, state: state(`${String.fromCodePoint(cp)} -> ${bs.map(hex).join(" ")}`, i) });
  });
  out.push({ id: "sum", label: `${cps.length} characters = ${total} payload bytes`, explain: `Content-Length counts bytes, not characters: ${total} here. Truncating or measuring by character count breaks the moment the text leaves ASCII.`, ms: 0, state: state(`total ${bytes.length} bytes`, -1) });
  return out;
}
export const BYTES_SPEC: SimSpec<GenericState> = {
  id: "bytes", title: "Byte-level view", params, defaults, scenario: bytesScenario,
  simplifies: ["Only text encodings are shown; JSON, Protobuf and binary framing are covered in the lessons.", "No byte order mark and no normalisation (an e with an accent can be one code point or two).", "Characters are Unicode code points; what a reader sees as one glyph may be several."],
};
