import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import { createWorkerSignatureMessage } from "@/lib/server/video-worker-auth";

describe("Python and TypeScript worker signature compatibility", () => {
  it("matches the shared fixed HMAC-SHA256 vector", async () => {
    const timestamp = "1794850000";
    const nonce = "0123456789abcdef0123456789abcdef";
    const method = "post";
    const path = "/api/public/v1/worker/jobs/claim";
    const body = '{"claimToken":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}';
    const secret = "unit-test-worker-secret-with-more-than-48-characters-000000";
    const message = await createWorkerSignatureMessage(timestamp, nonce, method, path, body);
    const key = await webcrypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = Array.from(
      new Uint8Array(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))),
    )
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    expect(signature).toBe("97912dd55a4cb7b448da4c8bb30d9873ca76e6af398c861cd50a9eb1b4597cf6");
  });
});
