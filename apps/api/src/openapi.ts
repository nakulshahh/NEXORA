import { z } from "zod";
import { MergeBody, ProgressDoc } from "./progress/model.js";

const json = (schema: unknown) => ({ "application/json": { schema } });
const Credentials = z.object({ email: z.email(), password: z.string().min(1).max(128) });
const Register = Credentials.extend({ displayName: z.string().min(1).max(80).optional() });
const schema = (s: z.ZodType) => z.toJSONSchema(s, { target: "draft-2020-12", io: "input", unrepresentable: "any" });

const err = (description: string) => ({ description, content: json({ $ref: "#/components/schemas/Error" }) });
const cookieAuth = [{ cookieAuth: [] }];
const okUser = { description: "Signed in", content: json({ $ref: "#/components/schemas/UserEnvelope" }) };

export const openApiDocument = {
  openapi: "3.1.0",
  info: { title: "NEXORA API", version: "0.5.0", description: "Auth, sessions and learning progress. Cookie-based; state-changing requests must send an allowed `Origin` header and JSON bodies." },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: { cookieAuth: { type: "apiKey", in: "cookie", name: "nx_sid" } },
    schemas: {
      Error: { type: "object", required: ["error"], properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } } } },
      User: { type: "object", required: ["id", "email", "displayName", "emailVerified", "hasPassword"], properties: { id: { type: "string", format: "uuid" }, email: { type: "string" }, displayName: { type: ["string", "null"] }, emailVerified: { type: "boolean" }, hasPassword: { type: "boolean" } } },
      UserEnvelope: { type: "object", required: ["user"], properties: { user: { $ref: "#/components/schemas/User" } } },
      Credentials: schema(Credentials),
      Register: schema(Register),
      Progress: schema(ProgressDoc),
      MergeBody: schema(MergeBody),
    },
  },
  paths: {
    "/healthz": { get: { summary: "Liveness", responses: { 200: { description: "Process is up" } } } },
    "/readyz": { get: { summary: "Readiness (checks the database)", responses: { 200: { description: "Ready" }, 503: { description: "Database unreachable" } } } },
    "/api/auth/providers": { get: { summary: "Which sign-in methods are configured", responses: { 200: { description: "Methods" } } } },
    "/api/auth/register": { post: { summary: "Create an email/password account and sign in", requestBody: { required: true, content: json({ $ref: "#/components/schemas/Register" }) }, responses: { 201: okUser, 400: err("Invalid input or weak password"), 409: err("Email already registered"), 429: err("Rate limited") } } },
    "/api/auth/login": { post: { summary: "Sign in with email and password", requestBody: { required: true, content: json({ $ref: "#/components/schemas/Credentials" }) }, responses: { 200: okUser, 401: err("Incorrect email or password (same message for unknown email)"), 429: err("Rate limited") } } },
    "/api/auth/password/forgot": { post: { summary: "Email a single-use reset link (same answer whether or not the address has an account)", requestBody: { required: true, content: json({ type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } }) }, responses: { 200: { description: "Accepted" }, 400: err("Invalid email"), 429: err("Rate limited") } } },
    "/api/auth/password/reset": { post: { summary: "Set a new password with the emailed token; signs out all sessions", requestBody: { required: true, content: json({ type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string", maxLength: 128 } } }) }, responses: { 200: { description: "Password changed" }, 400: err("Invalid or expired token, or weak password"), 429: err("Rate limited") } } },
    "/api/auth/logout": { post: { summary: "Sign out this browser", responses: { 204: { description: "Done" } } } },
    "/api/auth/logout-all": { post: { summary: "Sign out everywhere", security: cookieAuth, responses: { 204: { description: "Done" }, 401: err("Not signed in") } } },
    "/api/auth/me": { get: { summary: "Current user, or null", responses: { 200: { description: "User or null" } } } },
    "/api/auth/sessions": { get: { summary: "List your active sessions", security: cookieAuth, responses: { 200: { description: "Sessions" }, 401: err("Not signed in") } } },
    "/api/auth/sessions/{id}": { delete: { summary: "Revoke one of your sessions", security: cookieAuth, parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }], responses: { 204: { description: "Revoked" }, 401: err("Not signed in"), 404: err("No such session of yours (also returned for other users' sessions)") } } },
    "/api/auth/account": { delete: { summary: "Delete your account and all data", security: cookieAuth, responses: { 204: { description: "Deleted" }, 401: err("Not signed in") } } },
    "/api/auth/oauth/{provider}/start": { get: { summary: "Begin OAuth sign-in (redirects to the provider)", parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string", enum: ["github", "google"] } }, { name: "next", in: "query", schema: { type: "string" } }], responses: { 302: { description: "Redirect to provider" }, 404: err("Provider not configured") } } },
    "/api/auth/oauth/{provider}/callback": { get: { summary: "OAuth redirect target", parameters: [{ name: "provider", in: "path", required: true, schema: { type: "string" } }], responses: { 302: { description: "Redirect into the web app (success or error)" } } } },
    "/api/progress": {
      get: { summary: "Your progress document", security: cookieAuth, responses: { 200: { description: "Progress", content: json({ type: "object", properties: { progress: { $ref: "#/components/schemas/Progress" } } }) }, 401: err("Not signed in") } },
      delete: { summary: "Reset your progress", security: cookieAuth, responses: { 204: { description: "Reset" }, 401: err("Not signed in") } },
    },
    "/api/progress/merge": { post: { summary: "Merge a progress document into your account (monotonic, idempotent)", security: cookieAuth, requestBody: { required: true, content: json({ $ref: "#/components/schemas/MergeBody" }) }, responses: { 200: { description: "Merged progress" }, 400: err("Invalid document"), 401: err("Not signed in") } } },
  },
} as const;
