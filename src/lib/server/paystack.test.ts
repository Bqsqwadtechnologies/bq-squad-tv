import { describe, expect, it } from "vitest";
import { paystackEventDocumentId } from "./paystack";

describe("Paystack webhook event replay key", () => {
  it("returns the same opaque key for the same provider event", async () => {
    const first = await paystackEventDocumentId("evt_12345678");
    const second = await paystackEventDocumentId("evt_12345678");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("separates distinct provider events", async () => {
    expect(await paystackEventDocumentId("evt_12345678")).not.toBe(
      await paystackEventDocumentId("evt_87654321"),
    );
  });

  it("rejects empty or malformed event identifiers", async () => {
    await expect(paystackEventDocumentId("")).rejects.toThrow();
    await expect(paystackEventDocumentId("bad event id")).rejects.toThrow();
  });
});
