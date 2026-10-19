import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt from Node's standard library: no native add-on to build for
// linux/arm64, and it works the same in the Next.js server and the bundled
// create-admin script. Parameters follow the OWASP Password Storage Cheat
// Sheet (N=2^15, r=8, p=3 => ~32 MiB per hash), which keeps a burst of
// concurrent logins well inside a 1 GiB Fargate task.
const PARAMS = { N: 2 ** 15, r: 8, p: 3 } as const;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
const MAX_MEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 12;

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returns `scrypt$N$r$p$<salt b64>$<hash b64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEM });
  return ["scrypt", PARAMS.N, PARAMS.r, PARAMS.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAX_MEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Each verification holds ~32 MiB and a libuv thread for a few hundred ms.
// Capping concurrency per process keeps a login burst from starving page
// rendering; callers treat "busy" as "try again shortly".
const MAX_CONCURRENT_VERIFICATIONS = 4;
let activeVerifications = 0;

export async function verifyPasswordLimited(password: string, stored: string): Promise<boolean | "busy"> {
  if (activeVerifications >= MAX_CONCURRENT_VERIFICATIONS) return "busy";
  activeVerifications++;
  try {
    return await verifyPassword(password, stored);
  } finally {
    activeVerifications--;
  }
}

// Verified against when the email does not exist, so a wrong email and a
// wrong password take the same time and cannot be told apart.
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}

export function validateNewPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  if (password.length > 256) return "비밀번호가 너무 깁니다.";
  return null;
}
