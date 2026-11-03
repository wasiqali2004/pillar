import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const LEN = 32;
const MAXMEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, LEN, { N: n, r, p, maxmem: MAXMEM }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [kind, n, r, p, salt, key] = stored.split("$");
  if (kind !== "scrypt") return false;
  const expected = Buffer.from(key, "base64");
  const actual = await derive(password, Buffer.from(salt, "base64"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Spent when the email isn't found, so a miss takes as long as a wrong password. */
export async function burnPasswordCheck(password: string) {
  await derive(password, Buffer.alloc(16), N, R, P);
}

export const newToken = () => randomBytes(32).toString("base64url");

/** Only hashes of tokens are stored: reading the database doesn't give you a session. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
