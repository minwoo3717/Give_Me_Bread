import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { scramSha256Verifier } from "@/lib/db/scram";
import { errorFields } from "@/lib/logger";

describe("errorFields", () => {
  it("never logs bound SQL parameters (they can contain password hashes)", () => {
    const secret = "scrypt$32768$8$3$c2FsdA==$aGFzaA==";
    const err = new DrizzleQueryError('update "admin_users" set "password_hash" = $1', [secret], {
      code: "57014",
      message: "canceling statement due to statement timeout",
    } as unknown as Error);
    const fields = errorFields(err);
    expect(JSON.stringify(fields)).not.toContain(secret);
    expect(fields).toMatchObject({ query: 'update "admin_users" set "password_hash" = $1', code: "57014" });
  });

  it("keeps message and stack for ordinary errors", () => {
    const fields = errorFields(new Error("boom"));
    expect(fields.err).toBe("boom");
    expect(fields.stack).toBeDefined();
  });
});

describe("scramSha256Verifier", () => {
  it("produces the RFC 5803 format Postgres stores as-is", () => {
    const v = scramSha256Verifier("app-password", 4096, Buffer.alloc(16, 1));
    expect(v).toMatch(/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(v).not.toContain("app-password");
  });
});
