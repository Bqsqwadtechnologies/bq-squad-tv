import { Firestore, type FirestoreDocument } from "./firebase-admin";

export type CauseCategory =
  | "database"
  | "storage"
  | "payment_provider"
  | "video_processing"
  | "validation"
  | "network"
  | "unknown";

export type PlatformClass = "web" | "android" | "ios" | "worker" | "unknown";

export type ErrorEventRecord = {
  fingerprint: string;
  code: string;
  routePattern: string;
  status: number;
  causeCategory: CauseCategory;
  count: number;
  firstSeen: string;
  lastSeen: string;
  recentRefs: string[];
  platformClass: PlatformClass;
  appVersion?: string;
  buildId?: string;
  affectedUserCount: number;
  redactedTechnicalMessage: string;
  topStackFrames: string[];
  statusState: "new" | "investigating" | "resolved";
  notes?: string;
  expiresAt: string;
};

export const ERROR_EVENT_TTL_DAYS = 30;

export function redactSensitiveText(input: string): string {
  if (!input) return "";
  let text = input;

  // Redact emails
  text = text.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, "[REDACTED_EMAIL]");

  // Redact Bearer tokens, JWTs, API keys
  text = text.replace(/Bearer\s+[A-Za-z0-9-_=.]+/gi, "Bearer [REDACTED_TOKEN]");
  text = text.replace(/eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, "[REDACTED_JWT]");
  text = text.replace(/(?:key|secret|token|password|auth|sig|signature)=[^\s&"'>]+/gi, "$1=[REDACTED]");

  // Redact phone numbers (international and local)
  text = text.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[REDACTED_PHONE]");

  // Redact credit cards
  text = text.replace(/\b(?:\d{4}[- ]?){3}\d{4}\b/g, "[REDACTED_CARD]");

  return text;
}

export function classifyCauseCategory(error: unknown, route = ""): CauseCategory {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const stack = error instanceof Error && error.stack ? error.stack.toLowerCase() : "";
  const combined = msg + " " + stack + " " + route.toLowerCase();

  if (combined.includes("paystack") || combined.includes("stripe") || combined.includes("payment")) return "payment_provider";
  if (combined.includes("storage") || combined.includes("r2") || combined.includes("s3") || combined.includes("bucket")) return "storage";
  if (combined.includes("firestore") || combined.includes("database") || combined.includes("collection") || combined.includes("sql")) return "database";
  if (combined.includes("video") || combined.includes("transcode") || combined.includes("hls") || combined.includes("stream")) return "video_processing";
  if (combined.includes("zod") || combined.includes("schema") || combined.includes("validation") || combined.includes("invalid_request")) return "validation";
  if (combined.includes("fetch") || combined.includes("network") || combined.includes("timeout") || combined.includes("econnrefused")) return "network";

  return "unknown";
}

export function extractSafeStackFrames(error: unknown): string[] {
  if (!(error instanceof Error) || !error.stack) return [];
  const lines = error.stack.split("\n").slice(1, 4);
  return lines.map((line) => {
    // Strip absolute workspace paths
    const cleaned = line.trim().replace(/^at\s+/, "");
    return redactSensitiveText(cleaned);
  });
}

// In-memory write rate limiter to protect Firestore during error spikes
const writeTimestamps = new Map<string, number>();

export async function logErrorEvent(fs: Firestore, {
  code,
  routePattern,
  status,
  ref,
  error,
  platform = "web",
  appVersion = "3.0.0",
  actorHash,
}: {
  code: string;
  routePattern: string;
  status: number;
  ref: string;
  error?: unknown;
  platform?: PlatformClass;
  appVersion?: string;
  actorHash?: string;
}): Promise<void> {
  try {
    const causeCategory = classifyCauseCategory(error, routePattern);
    const fingerprintRaw = `${code}:${routePattern}:${status}:${causeCategory}`;

    // SHA256 fingerprint hash
    const enc = new TextEncoder();
    const digest = await crypto.subtle.digest("SHA-256", enc.encode(fingerprintRaw));
    const fingerprint = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);

    // Rate-limit: at most one write per fingerprint every 5 seconds
    const nowMs = Date.now();
    const lastWrite = writeTimestamps.get(fingerprint) ?? 0;
    if (nowMs - lastWrite < 5000) {
      return;
    }
    writeTimestamps.set(fingerprint, nowMs);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + ERROR_EVENT_TTL_DAYS * 86400000).toISOString();
    const docPath = `errorEvents/${fingerprint}`;

    const existing = await fs.getDoc(docPath);
    const prevCount = Number.isSafeInteger(existing?.["count"]) ? Number(existing!["count"]) : 0;
    const prevRefs = Array.isArray(existing?.["recentRefs"]) ? (existing!["recentRefs"] as string[]) : [];
    const updatedRefs = [ref, ...prevRefs.filter((r) => r !== ref)].slice(0, 20);

    const technicalMessage = error instanceof Error ? error.message : String(error ?? code);
    const redactedMsg = redactSensitiveText(technicalMessage).slice(0, 300);
    const topStackFrames = extractSafeStackFrames(error);

    await fs.setDoc(docPath, {
      fingerprint,
      code,
      routePattern,
      status,
      causeCategory,
      count: prevCount + 1,
      firstSeen: existing?.["firstSeen"] ?? now.toISOString(),
      lastSeen: now.toISOString(),
      recentRefs: updatedRefs,
      platformClass: platform,
      appVersion,
      affectedUserCount: Math.min(prevCount + 1, 1000),
      redactedTechnicalMessage: redactedMsg,
      topStackFrames,
      statusState: typeof existing?.["statusState"] === "string" ? (existing["statusState"] as string) : "new",
      expiresAt,
    });

    // Also record reference index so search by ref succeeds instantly
    await fs.setDoc(`errorRefs/${ref}`, {
      ref,
      fingerprint,
      createdAt: now.toISOString(),
      expiresAt,
    });
  } catch (err) {
    // Error logging must never crash the request
    console.error("Failed to log error event", err);
  }
}
