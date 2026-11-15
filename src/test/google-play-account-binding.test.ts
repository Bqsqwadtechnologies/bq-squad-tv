import { describe, expect, it } from "vitest";
import { googlePlayAccountId } from "@/lib/server/google-play";

describe("Google Play purchase account binding", () => {
  it("uses a stable 64-character SHA-256 account identifier", async () => {
    const first = await googlePlayAccountId("firebase-user-123");
    const second = await googlePlayAccountId("firebase-user-123");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not reuse the same account identifier for different Firebase users", async () => {
    const first = await googlePlayAccountId("firebase-user-123");
    const second = await googlePlayAccountId("firebase-user-456");
    expect(first).not.toBe(second);
  });
});
