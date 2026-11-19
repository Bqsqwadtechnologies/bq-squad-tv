import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import type { Firestore } from "@/lib/server/firebase-admin";
import { createWorkerSignatureMessage, requireVideoWorker } from "@/lib/server/video-worker-auth";

const workerSecret = "unit-test-per-worker-secret-with-at-least-forty-eight-characters-000";

function fakeFirestore() {
  const documents = new Map<string, Record<string, unknown>>();
  return {
    documents,
    async getDoc(path: string) {
      return documents.get(path) ?? null;
    },
    docName(path: string) {
      return path;
    },
    async transact(
      paths: string[],
      callback: (docs: Array<Record<string, unknown> | null>) => {
        result: unknown;
        writes: Array<{ update?: { name: string; fields: Record<string, unknown> } }>;
      },
    ) {
      const result = callback(paths.map((path) => documents.get(path) ?? null));
      for (const write of result.writes) {
        if (!write.update) continue;
        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(write.update.fields)) {
          const field = value as Record<string, unknown>;
          fields[key] =
            field["stringValue"] ?? field["integerValue"] ?? field["booleanValue"] ?? null;
        }
        const path = write.update.name.split("/documents/").pop() ?? write.update.name;
        documents.set(path, fields);
      }
      return result.result;
    },
  };
}

async function signedRequest(timestamp: string, nonce: string) {
  const body = "{}";
  const path = "/api/public/v1/worker/jobs/claim";
  const message = await createWorkerSignatureMessage(timestamp, nonce, "POST", path, body);
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(workerSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Array.from(
    new Uint8Array(await webcrypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))),
  )
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return new Request("https://tv.example.test" + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bq-worker-id": "worker-one",
      "x-bq-worker-time": timestamp,
      "x-bq-worker-nonce": nonce,
      "x-bq-worker-signature": signature,
    },
    body,
  });
}

describe("per-worker request authentication", () => {
  it("accepts a valid signature once and rejects replayed nonces", async () => {
    const previous = process.env["VIDEO_WORKER_KEYS_JSON"];
    process.env["VIDEO_WORKER_KEYS_JSON"] = JSON.stringify({ "worker-one": workerSecret });
    const fs = fakeFirestore();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = "0123456789abcdef0123456789abcdef";
    try {
      await expect(
        requireVideoWorker(await signedRequest(timestamp, nonce), fs as unknown as Firestore),
      ).resolves.toBe("worker-one");
      await expect(
        requireVideoWorker(await signedRequest(timestamp, nonce), fs as unknown as Firestore),
      ).rejects.toThrow();
    } finally {
      if (previous === undefined) delete process.env["VIDEO_WORKER_KEYS_JSON"];
      else process.env["VIDEO_WORKER_KEYS_JSON"] = previous;
    }
  });
});
