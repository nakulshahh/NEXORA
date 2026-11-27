import { hash, verify } from "@node-rs/argon2";

/**
 * Argon2id with the OWASP minimum profile (19 MiB, 2 passes, 1 lane). Parameters are encoded in the hash string,
 * so they can be raised later without a migration: old hashes still verify and can be re-hashed on login.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTIONS);

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try { return await verify(stored, password); } catch { return false; }
}

// A real hash to compare against when the email is unknown, so "no such user" costs the same time as "wrong password".
let dummy: Promise<string> | undefined;
export async function dummyVerify(password: string): Promise<void> {
  dummy ??= hashPassword("not-a-real-password");
  await verifyPassword(await dummy, password);
}

const COMMON = new Set(["password", "password1", "1234567890", "qwertyuiop", "iloveyou12", "letmein123", "admin12345", "welcome123"]);
/** Length over composition rules (NIST 800-63B). Returns an error message, or null if acceptable. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 128) return "Use at most 128 characters.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common.";
  if (password.toLowerCase() === email.toLowerCase()) return "Password must not equal your email.";
  return null;
}
