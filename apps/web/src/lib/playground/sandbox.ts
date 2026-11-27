/**
 * Runs an already-validated program in the browser, isolated three ways:
 *  1. the program was accepted by `parseProgram`, whose whitelist allows no variable access, no other calls, no loops;
 *  2. it runs in an <iframe sandbox="allow-scripts"> with no allow-same-origin: an opaque origin with no cookies,
 *     no storage and no access to the parent's DOM;
 *  3. the frame is a separate document (public/sandbox/frame.html) served with its own CSP header `default-src 'none';
 *     script-src 'self' 'unsafe-eval'`, so fetch, XHR, WebSocket, images and nested frames are all blocked. It is a URL,
 *     not srcdoc, on purpose: srcdoc frames inherit the page's CSP, which would force `unsafe-eval` onto the whole app.
 * Layers 2 and 3 are defence in depth: the parser is the first line, and nothing here is "the sandbox is enough, so
 * accept anything". The parent times the run out and removes the frame.
 */
export const SANDBOX_URL = "/sandbox/frame.html";

export interface SandboxResult { lines: string[]; error: string | null; unavailable: boolean }

/** `waitMs` is how long to let timers fire before collecting output (the caller knows the longest delay). */
export function runInSandbox(code: string, waitMs: number): Promise<SandboxResult> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve({ lines: [], error: null, unavailable: true });
    const nonce = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.setAttribute("aria-hidden", "true"); frame.tabIndex = -1; frame.title = "sandbox";
    frame.style.cssText = "position:fixed;bottom:0;right:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
    const lines: string[] = []; let error: string | null = null; let done = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); window.removeEventListener("message", onMsg); frame.remove(); resolve({ lines, error, unavailable: false }); };
    function onMsg(e: MessageEvent) {
      if (e.source !== frame.contentWindow) return;
      const d = e.data as { type?: string; nonce?: string; text?: string } | null;
      if (!d) return;
      if (d.type === "hello") { frame.contentWindow!.postMessage({ nonce, code }, "*"); timer = setTimeout(finish, Math.min(3000, Math.max(150, waitMs + 150))); return; }
      if (d.nonce !== nonce) return;
      if (d.type === "log" && typeof d.text === "string") lines.push(d.text);
      else if (d.type === "error" && typeof d.text === "string") error = d.text;
    }
    window.addEventListener("message", onMsg);
    frame.src = SANDBOX_URL;
    document.body.appendChild(frame);
    setTimeout(() => { if (!timer) { error = "The sandbox did not start."; finish(); } }, 2000);   // never hang the page
  });
}
