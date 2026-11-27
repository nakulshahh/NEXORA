import { parse, type Node as AcornNode } from "acorn";
import type { Op } from "@/sim/eventloop";

/**
 * Compiles a small, whitelisted subset of JavaScript into the event-loop model's `Op[]`.
 *
 * This is both the playground's input language and its first security layer: only the shapes below are accepted, with
 * literal arguments only, so no accepted program can read variables, call other functions, loop, or reach the network.
 * Everything else is rejected with the line and a reason (never silently ignored, never "best effort").
 *
 *   program   := (asyncDecl | stmt)*
 *   asyncDecl := async function NAME() { (stmt | await ARG;)* }          (no params, no return)
 *   stmt      := console.log(LITERAL) | setTimeout(fn[, NUMBER]) | setImmediate(fn) | process.nextTick(fn)
 *              | queueMicrotask(fn) | Promise.resolve().then(fn) | NAME()      (NAME is an async function above)
 *   fn        := () => { stmt* } | () => stmt | function () { stmt* }
 *   ARG       := null | undefined | LITERAL | Promise.resolve()
 */
export interface ParseError { line: number; col: number; message: string }
export type Parsed =
  | { ok: true; program: Op[]; nodeOnly: string[]; maxDelay: number }
  | { ok: false; errors: ParseError[] };

export const LIMITS = { source: 4000, ops: 200, delay: 2000, depth: 8 } as const;
type N = AcornNode & Record<string, any>;
class Reject extends Error { constructor(public node: N | null, message: string) { super(message); } }

export function parseProgram(src: string): Parsed {
  if (src.length > LIMITS.source) return { ok: false, errors: [{ line: 1, col: 0, message: `Program is longer than ${LIMITS.source} characters.` }] };
  let ast: N;
  try { ast = parse(src, { ecmaVersion: 2022, sourceType: "script", locations: true }) as N; }
  catch (e) { const x = e as { message: string; loc?: { line: number; column: number } }; return { ok: false, errors: [{ line: x.loc?.line ?? 1, col: x.loc?.column ?? 0, message: `Syntax error: ${x.message.replace(/ \(\d+:\d+\)$/, "")}` }] }; }

  const nodeOnly = new Set<string>(); let maxDelay = 0, count = 0;
  const asyncFns = new Map<string, N>();
  const line = (n: N) => n.loc!.start.line;
  const bad = (n: N, why: string): never => { throw new Reject(n, why); };

  const isMember = (c: N, obj: string, prop: string) => c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier" && c.object.name === obj && c.property.name === prop;
  const literal = (a: N): string => {
    if (a.type === "Literal" && (typeof a.value === "string" || typeof a.value === "number" || typeof a.value === "boolean")) return String(a.value);
    if (a.type === "TemplateLiteral" && a.expressions.length === 0) return a.quasis[0].value.cooked as string;
    if (a.type === "UnaryExpression" && a.operator === "-" && a.argument.type === "Literal" && typeof a.argument.value === "number") return String(-a.argument.value);
    return bad(a, "Only literal values (a string, number, or template with no ${}) are supported here.");
  };
  const fnBody = (f: N, depth: number, stack: string[]): Op[] => {
    if (f.type !== "ArrowFunctionExpression" && f.type !== "FunctionExpression") return bad(f, "Pass a function written inline: () => { ... }");
    if (f.async) bad(f, "Async callbacks are not supported; use an async function declaration and call it.");
    if (f.generator) bad(f, "Generators are not supported.");
    if (f.params.length) bad(f, "Callbacks with parameters are not supported.");
    if (f.body.type === "BlockStatement") return block(f.body.body, depth, stack);
    return [call(f.body, depth, stack)].flat();
  };
  const tick = () => { if (++count > LIMITS.ops) throw new Reject(null, `Programs are limited to ${LIMITS.ops} operations.`); };

  // Returns ops for one call expression.
  function call(e: N, depth: number, stack: string[]): Op[] {
    if (depth > LIMITS.depth) bad(e, `Callbacks nested deeper than ${LIMITS.depth} levels are not supported.`);
    if (e.type === "AwaitExpression") bad(e, "`await` is only supported as a statement directly inside an async function.");
    if (e.type !== "CallExpression") return bad(e, `Unsupported expression (${e.type}). Use console.log, setTimeout, setImmediate, process.nextTick, queueMicrotask, Promise.resolve().then, or call an async function.`);
    tick();
    const c = e.callee as N, a = e.arguments as N[], ln = line(e);
    if (isMember(c, "console", "log")) { if (a.length !== 1) bad(e, "console.log takes exactly one literal argument here."); return [{ op: "log", text: literal(a[0]!), line: ln }]; }
    if (c.type === "Identifier" && c.name === "setTimeout") {
      if (a.length < 1 || a.length > 2) bad(e, "setTimeout(fn, delayMs) takes a function and an optional number.");
      let delay = 0;
      if (a[1]) { const v = a[1]; if (v.type !== "Literal" || typeof v.value !== "number" || !(v.value >= 0)) bad(v, "The delay must be a non-negative number literal."); delay = v.value as number; if (delay > LIMITS.delay) bad(v, `Delays above ${LIMITS.delay} ms are not supported.`); }
      maxDelay = Math.max(maxDelay, delay);
      return [{ op: "timeout", delay, body: fnBody(a[0]!, depth + 1, stack), line: ln }];
    }
    if (c.type === "Identifier" && c.name === "setImmediate") { nodeOnly.add("setImmediate"); if (a.length !== 1) bad(e, "setImmediate(fn) takes one function."); return [{ op: "immediate", body: fnBody(a[0]!, depth + 1, stack), line: ln }]; }
    if (isMember(c, "process", "nextTick")) { nodeOnly.add("process.nextTick"); if (a.length !== 1) bad(e, "process.nextTick(fn) takes one function."); return [{ op: "tick", body: fnBody(a[0]!, depth + 1, stack), line: ln }]; }
    if (c.type === "Identifier" && c.name === "queueMicrotask") { if (a.length !== 1) bad(e, "queueMicrotask(fn) takes one function."); return [{ op: "micro", via: "queueMicrotask", body: fnBody(a[0]!, depth + 1, stack), line: ln }]; }
    if (c.type === "MemberExpression" && !c.computed && c.property.name === "then") {
      const o = c.object as N;
      if (o.type === "CallExpression" && isMember(o.callee, "Promise", "resolve") && o.arguments.length === 0) { if (a.length !== 1) bad(e, ".then takes one function."); return [{ op: "micro", via: "then", body: fnBody(a[0]!, depth + 1, stack), line: ln }]; }
      bad(e, "Only Promise.resolve().then(fn) is supported; chained .then() calls are not modelled.");
    }
    if (c.type === "Identifier" && asyncFns.has(c.name)) {
      if (a.length) bad(e, "Async functions take no arguments here.");
      if (stack.includes(c.name)) bad(e, `${c.name} calls itself, which is not supported.`);
      return inlineAsync(c.name, depth, stack);
    }
    return bad(e, `Unsupported call. Use console.log, setTimeout, setImmediate, process.nextTick, queueMicrotask, Promise.resolve().then, or call an async function declared in this program.`);
  }

  // `await` pauses only the async function: ops before the first await run now, the rest becomes a microtask, repeatedly.
  function inlineAsync(name: string, depth: number, stack: string[]): Op[] {
    const body = asyncFns.get(name)!.body.body as N[]; const st = [...stack, name];
    const go = (i: number): Op[] => {
      const out: Op[] = [];
      for (; i < body.length; i++) {
        const s = body[i]!;
        if (s.type === "ExpressionStatement" && s.expression.type === "AwaitExpression") {
          awaitArg(s.expression.argument);
          tick(); out.push({ op: "micro", via: "await", body: go(i + 1), line: line(s) });
          return out;
        }
        out.push(...stmt(s, depth, st));
      }
      return out;
    };
    return go(0);
  }
  function awaitArg(a: N) {
    if (a.type === "Identifier" && a.name === "undefined") return;
    if (a.type === "Literal") return;
    if (a.type === "CallExpression" && isMember(a.callee, "Promise", "resolve") && a.arguments.length === 0) return;
    bad(a, "Only `await null`, `await undefined`, `await <literal>` and `await Promise.resolve()` are supported.");
  }

  function stmt(s: N, depth: number, stack: string[]): Op[] {
    if (s.type === "EmptyStatement") return [];
    if (s.type === "FunctionDeclaration") return bad(s, "Declare async functions at the top level of the program.");
    if (s.type !== "ExpressionStatement") return bad(s, `Unsupported statement (${s.type}). Loops, variables, conditionals and imports are not supported.`);
    return call(s.expression, depth, stack);
  }
  function block(list: N[], depth: number, stack: string[]): Op[] { return list.flatMap((s) => stmt(s, depth, stack)); }

  const errors: ParseError[] = [];
  const top = ast.body as N[];
  try {
    for (const s of top) if (s.type === "FunctionDeclaration") {
      if (!s.async) bad(s, "Only async function declarations are supported (they model `await`).");
      if (s.params.length) bad(s, "Async functions take no parameters here.");
      if (s.generator) bad(s, "Generators are not supported.");
      if (asyncFns.has(s.id.name)) bad(s, `${s.id.name} is declared twice.`);
      asyncFns.set(s.id.name, s);
    }
    const program: Op[] = [];
    for (const s of top) { if (s.type === "FunctionDeclaration") continue; program.push(...stmt(s, 0, [])); }
    // statements inside async functions that are never called are still validated
    for (const [name, f] of asyncFns) { const st = [name]; for (const s of f.body.body as N[]) { if (s.type === "ExpressionStatement" && s.expression.type === "AwaitExpression") awaitArg(s.expression.argument); else stmt(s, 0, st); } }
    if (!program.length) return { ok: false, errors: [{ line: 1, col: 0, message: "Nothing to run: add a console.log, a timer, or a promise." }] };
    return { ok: true, program, nodeOnly: [...nodeOnly].sort(), maxDelay };
  } catch (e) {
    if (e instanceof Reject) { errors.push({ line: e.node ? line(e.node) : 1, col: e.node ? e.node.loc!.start.column : 0, message: e.message }); return { ok: false, errors }; }
    throw e;
  }
}
