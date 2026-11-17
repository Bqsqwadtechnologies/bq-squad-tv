import { ApiError, Firestore } from "./firebase-admin";

const encoder = new TextEncoder();
const MAX_CLOCK_SKEW_SECONDS = 300;

function toBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}
function fromHex(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new ApiError(401, "WORKER_AUTH_INVALID", "The worker authorization is invalid.");
  return Uint8Array.from(value.match(/.{2}/g) ?? [], pair => Number.parseInt(pair, 16));
}
async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", toBuffer(encoder.encode(value))));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}
async function workerKey(workerId: string): Promise<CryptoKey> {
  const configured = process.env["VIDEO_WORKER_KEYS_JSON"] ?? "";
  if (configured) {
    let keys: Record<string, unknown>;
    try {
      const parsed = JSON.parse(configured) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
      keys = parsed as Record<string, unknown>;
    } catch {
      throw new ApiError(503, "WORKER_AUTH_NOT_CONFIGURED", "The processing service is not configured.");
    }
    const secret = keys[workerId];
    if (typeof secret !== "string" || secret.length < 48) {
      throw new ApiError(401, "WORKER_AUTH_INVALID", "The worker authorization is invalid.");
    }
    return crypto.subtle.importKey("raw", toBuffer(encoder.encode(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  }
  const master = process.env["STREAMING_HMAC_SECRET"] ?? "";
  if (master.length < 32 || workerId !== "legacy-shared") {
    throw new ApiError(503, "WORKER_AUTH_NOT_CONFIGURED", "The processing service is not configured.");
  }
  console.warn("Legacy shared video worker key used; configure per-worker credentials.");
  const key = await crypto.subtle.importKey("raw", toBuffer(encoder.encode(master)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", key, toBuffer(encoder.encode("BQ-SQWAD-TV:VIDEO-WORKER:V1")));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
}

export async function createWorkerSignatureMessage(
  timestamp: string,
  nonce: string,
  method: string,
  pathname: string,
  body: string,
): Promise<string> {
  return [timestamp, nonce, method.toUpperCase(), pathname, await sha256(body)].join("\n");
}

/** Worker requests are bound to method, path, timestamp, nonce and exact body bytes. */
export async function requireVideoWorker(request: Request, fs: Firestore): Promise<string> {
  const workerId = request.headers.get("x-bq-worker-id") ?? "legacy-shared";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(workerId)) {
    throw new ApiError(401, "WORKER_AUTH_INVALID", "The worker authorization is invalid.");
  }
  const disabled = await fs.getDoc("videoWorkerRegistry/" + workerId);
  if (disabled?.["disabled"] === true) throw new ApiError(403, "WORKER_DISABLED", "This processing worker is disabled.");
  const timestamp = request.headers.get("x-bq-worker-time") ?? "";
  const nonce = request.headers.get("x-bq-worker-nonce") ?? "";
  const signature = request.headers.get("x-bq-worker-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{32}$/i.test(nonce)) {
    throw new ApiError(401, "WORKER_AUTH_INVALID", "The worker authorization is invalid.");
  }
  const issuedAt = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(now - issuedAt) > MAX_CLOCK_SKEW_SECONDS) {
    throw new ApiError(401, "WORKER_AUTH_EXPIRED", "The worker authorization has expired.");
  }
  const body = await request.clone().text();
  if (body.length > 8 * 1024 * 1024) throw new ApiError(413, "WORKER_REQUEST_TOO_LARGE", "The worker request is too large.");
  const url = new URL(request.url);
  const message = await createWorkerSignatureMessage(timestamp, nonce, request.method, url.pathname, body);
  const valid = await crypto.subtle.verify("HMAC", await workerKey(workerId), toBuffer(fromHex(signature)), toBuffer(encoder.encode(message)));
  if (!valid) throw new ApiError(401, "WORKER_AUTH_INVALID", "The worker authorization is invalid.");
  await fs.transact(["videoWorkerNonces/" + workerId + "_" + nonce], docs => {
    if (docs[0]) throw new ApiError(409, "WORKER_NONCE_REPLAYED", "The worker request has already been used.");
    return {
      result: undefined,
      writes: [{
        update: {
          name: fs.docName("videoWorkerNonces/" + workerId + "_" + nonce),
          fields: {
            createdAt: { stringValue: new Date().toISOString() },
            expiresAt: { stringValue: new Date(now * 1000 + 10 * 60_000).toISOString() },
          },
          },
        currentDocument: { exists: false },
      }],
    };
  });
  return workerId;
}
