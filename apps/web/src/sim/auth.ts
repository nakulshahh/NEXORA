import type { ParamDef, Params, SimSpec, Step } from "./engine.ts";
import type { GenericState } from "./generic.ts";

const params: ParamDef[] = [
  { key: "mode", label: "Credential", kind: "select", options: [{ value: "session", label: "Server session (opaque id)" }, { value: "jwt", label: "JWT (self-contained)" }] },
  { key: "revocation", label: "Revocation", kind: "select", options: [{ value: "none", label: "None extra" }, { value: "denylist", label: "Denylist checked every request" }] },
  { key: "ttl", label: "JWT lifetime", kind: "range", min: 5, max: 60, step: 5, unit: "min", hint: "Also the longest a copied JWT stays valid." },
  { key: "replay", label: "Stolen copy replayed after logout", kind: "range", min: 1, max: 55, step: 1, unit: "min" },
];
const defaults: Params = { mode: "session", revocation: "none", ttl: 15, replay: 5 };

export function authScenario(p: Params): Step<GenericState>[] {
  const jwt = p.mode === "jwt", deny = p.revocation === "denylist", ttl = Number(p.ttl), replay = Number(p.replay), out: Step<GenericState>[] = [];
  const logoutAt = 2, replayAt = logoutAt + replay;
  let lookups = 0, store = "empty";
  const st = (line: string, client: string, tone: GenericState["cells"][number]["tone"], serverTone: GenericState["cells"][number]["tone"] = "idle"): GenericState => ({
    title: "Where the state lives", line,
    cells: [{ label: "Browser", sub: client, tone }, { label: jwt ? "Server keeps" : "Session store", sub: jwt ? (deny ? `denylist: ${store}` : "nothing") : store, tone: serverTone }],
    metrics: [{ label: "Store lookups", value: String(lookups) }, { label: "Stateless?", value: jwt && !deny ? "yes" : "no" }],
  });
  out.push({ id: "login", label: "t=0 Log in", explain: jwt ? `The server signs a token containing the user id and an expiry at ${ttl} min. It stores nothing: whoever holds a valid token is the user.` : "The server creates a random session id, stores it with the user id, and sends the id in a cookie. The id means nothing without the store.", ms: 0, state: ((): GenericState => { if (!jwt) { store = "sid=ab12 -> user 7"; lookups++; } return st("login ok", jwt ? "token eyJ... (exp +" + ttl + "m)" : "cookie sid=ab12", "hit", jwt ? "idle" : "hit"); })() });
  out.push({ id: "req", label: "t=1 Normal request", explain: jwt ? `The server verifies the signature and expiry with its key: no database read.${deny ? " The denylist is checked too, so this one is a lookup." : ""}` : "The server looks the id up in the store to learn who this is: one lookup per request.", ms: 0, state: ((): GenericState => { if (!jwt || deny) lookups++; return st("authenticated as user 7", jwt ? "token eyJ..." : "cookie sid=ab12", "visit", "visit"); })() });
  out.push({ id: "logout", label: `t=${logoutAt} User logs out`, explain: jwt ? (deny ? "The token id is added to the denylist until its expiry, so the server can reject it. That is state again." : "Nothing can be deleted: the token is just bytes the client holds. The browser forgets it, but a copy elsewhere is still a valid token.") : "The server deletes the session record. Every copy of the cookie is now worthless, immediately.", ms: 0, state: ((): GenericState => { if (!jwt) { store = "empty"; lookups++; } else if (deny) { store = "jti 91 revoked"; lookups++; } return st("logged out", "credential discarded", "idle", jwt && !deny ? "idle" : "evict"); })() });
  const ok = jwt ? (deny ? false : replayAt < ttl) : false;
  out.push({ id: "replay", label: `t=${replayAt} Attacker replays a stolen copy`, explain: ok ? `Still accepted: the token expires at ${ttl} min and nothing on the server knows it was logged out. This is the cost of statelessness; short lifetimes shorten the exposure.` : jwt && !deny ? `Rejected only because the token has already expired (${replayAt} min is past its ${ttl} min lifetime).` : "Rejected: the server has a record of the revocation. The price was a lookup on every request.", ms: 0, state: ((): GenericState => { if (!jwt || deny) lookups++; return st(ok ? "ACCEPTED (stolen copy works)" : "rejected 401", "attacker holds a copy", ok ? "bad" : "hit", jwt && !deny ? "idle" : "visit"); })() });
  out.push({ id: "sum", label: "What it cost", explain: jwt && !deny ? "No store, no lookups, easy horizontal scaling and no instant revocation. Real systems pair short-lived access tokens with a revocable refresh token." : "A store lookup per request buys instant revocation. That is the trade: central state for control.", ms: 0, state: st(`${lookups} store lookups in total`, jwt ? "token" : "cookie", "idle", "idle") });
  return out;
}
export const AUTH_SPEC: SimSpec<GenericState> = {
  id: "auth", title: "Session vs JWT", params, defaults, scenario: authScenario,
  simplifies: ["Signature verification is assumed instant and always correct; algorithm confusion and key rotation are out of scope.", "A single user, a single device and one attacker copy; no refresh tokens.", "Times are minutes on an idealised shared clock; real clocks skew.", "A denylist is shown as a store lookup per request; real ones are usually cached."],
};
