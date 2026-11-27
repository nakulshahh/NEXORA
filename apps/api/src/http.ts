import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";

/** An error whose message is safe to show to the client. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const notFound = (what = "Not found") => new HttpError(404, "not_found", what);

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new HttpError(400, "invalid_request", first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request");
  }
  return r.data;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: { code: err.code, message: err.message } }); return; }
  if (err instanceof ZodError) { res.status(400).json({ error: { code: "invalid_request", message: "Invalid request" } }); return; }
  // body-parser errors carry a status (413 too large, 400 bad JSON)
  const status = typeof err?.status === "number" && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) req.log?.error({ err }, "unhandled error");
  res.status(status).json({ error: { code: status === 500 ? "internal" : "bad_request", message: status === 500 ? "Something went wrong" : "Bad request" } });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Not found" } });
};
