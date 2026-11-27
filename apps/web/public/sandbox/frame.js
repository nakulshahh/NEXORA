// Runs inside <iframe sandbox="allow-scripts"> (opaque origin). Served with its own CSP header (see next.config.ts):
// default-src 'none'; script-src 'self' 'unsafe-eval'  -> no network, no images, no nested frames, no inline script.
addEventListener("message", function (e) {
  if (e.source !== parent) return;
  var d = e.data || {}, n = 0;
  var con = { log: function (v) { if (n++ < 200) parent.postMessage({ nonce: d.nonce, type: "log", text: String(v).slice(0, 500) }, "*"); } };
  try { new Function("console", String(d.code))(con); } catch (err) { parent.postMessage({ nonce: d.nonce, type: "error", text: String(err).slice(0, 300) }, "*"); }
});
parent.postMessage({ type: "hello" }, "*");
