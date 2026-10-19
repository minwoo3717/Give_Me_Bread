import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/**
 * SCRAM-SHA-256 verifier in the form PostgreSQL stores in pg_authid
 * (RFC 5803: SCRAM-SHA-256$<iter>:<salt>$<StoredKey>:<ServerKey>).
 *
 * CREATE/ALTER ROLE ... PASSWORD '<verifier>' stores it as-is, so the
 * cleartext never appears in SQL text, where a slow or failing statement
 * would copy it into the Postgres log (and from there to CloudWatch).
 * Passwords here are Terraform-generated ASCII, so SASLprep is a no-op.
 */
export function scramSha256Verifier(password: string, iterations = 4096, salt = randomBytes(16)): string {
  const salted = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
