import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const VALID = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * One id per request, shared by every hop. A well-formed inbound `X-Request-Id` is kept (so a caller or load balancer
 * can correlate); anything else is replaced, because the value is written into logs and a forged one could split lines
 * or collide with a real id. The id is echoed on the response and forwarded to the AI service.
 */
export function genReqId(req: IncomingMessage, res: ServerResponse): string {
  const inbound = req.headers["x-request-id"];
  const id = typeof inbound === "string" && VALID.test(inbound) ? inbound : randomUUID();
  res.setHeader("X-Request-Id", id);
  return id;
}
