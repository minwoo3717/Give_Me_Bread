import { describe, expect, it } from "vitest";
import { hashPassword, validateNewPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("correct horse battery stapler", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-1234"), hashPassword("same-password-1234")]);
    expect(a).not.toBe(b);
  });

  it("treats malformed hashes as a failed login, not a crash", async () => {
    expect(await verifyPassword("whatever", "")).toBe(false);
    expect(await verifyPassword("whatever", "bcrypt$foo")).toBe(false);
  });

  it("normalizes Unicode so the same Korean password always matches", async () => {
    const composed = "비밀번호-휘낭시에-2026"; // NFC
    const decomposed = composed.normalize("NFD");
    const hash = await hashPassword(composed);
    expect(await verifyPassword(decomposed, hash)).toBe(true);
  });
});

describe("validateNewPassword", () => {
  it("requires 12+ characters", () => {
    expect(validateNewPassword("short")).not.toBeNull();
    expect(validateNewPassword("long-enough-pass")).toBeNull();
  });
});
