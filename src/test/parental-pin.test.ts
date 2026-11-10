import { describe, expect, it } from "vitest";
import { hashParentalPin, verifyParentalPin } from "@/lib/server/parental-pin";

describe("parental PIN hashing", () => {
  it("creates salted PBKDF2 hashes with an explicit version", async () => {
    const first = await hashParentalPin("2468");
    const second = await hashParentalPin("2468");

    expect(first.version).toBe(2);
    expect(first.salt).toHaveLength(32);
    expect(first.hash).not.toBe(second.hash);
    expect(first.salt).not.toBe(second.salt);
    await expect(verifyParentalPin("2468", "user-1", first)).resolves.toBe(true);
    await expect(verifyParentalPin("0000", "user-1", first)).resolves.toBe(false);
  });

  it("continues to verify legacy UID-bound SHA-256 hashes", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("bq-sqwad-tv:parental-pin:user-1:2468"),
    );
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

    await expect(verifyParentalPin("2468", "user-1", { hash })).resolves.toBe(true);
    await expect(verifyParentalPin("2468", "user-2", { hash })).resolves.toBe(false);
  });

  it("rejects unsupported versions and malformed salted records", async () => {
    await expect(verifyParentalPin("2468", "user-1", { hash: "00", version: 3 })).resolves.toBe(false);
    await expect(verifyParentalPin("2468", "user-1", { hash: "00", version: 2, salt: "bad" })).resolves.toBe(false);
  });
});
