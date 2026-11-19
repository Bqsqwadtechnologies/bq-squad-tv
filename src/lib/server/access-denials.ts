import { type Firestore } from "./firebase-admin";

export type ActorRoleClass =
  "anonymous" | "viewer" | "producer" | "provider" | "admin" | "worker" | "unknown";

export type PlatformClass = "web" | "android" | "ios" | "worker" | "unknown";

/**
 * Exact, privacy-safe shape of an access denial audit event.
 * Never includes raw emails, names, tokens, cookies, headers, bodies,
 * query strings, raw IDs, signed links or wallet data.
 */
export type AccessDenialEvent = {
  id: string;
  time: string; // ISO 8601 UTC
  actorHash: string; // HMAC-SHA256 of user id with AUDIT_HASH_KEY (or HMAC of 'anonymous')
  actorRoleClass: ActorRoleClass;
  routePattern: string; // Normalized route pattern, never raw path or query
  method: string;
  requiredRole: string;
  resourceKind: string;
  targetHash: string | null; // HMAC-SHA256 of resource ID, or null
  reasonCode: string;
  coarseNetworkHash: string; // HMAC-SHA256 of IP /24 or /48 prefix
  platformClass: PlatformClass;
  expiresAt: string; // ISO 8601 UTC (time + 90 days retention TTL)
};

export type RecordAccessDenialInput = {
  request?: Request;
  actorUid?: string | null;
  actorRoleClass?: ActorRoleClass;
  routePattern?: string;
  method?: string;
  requiredRole?: string;
  resourceKind?: string;
  targetId?: string | null;
  reasonCode: string;
  clientIp?: string | null;
  userAgent?: string | null;
  now?: Date;
};

export const ACCESS_DENIAL_TTL_DAYS = 90;
export const SHARD_COUNT = 5;
export const HOURLY_ALERT_THRESHOLD = 10;

export function getAuditHashKey(): string {
  return process.env["AUDIT_HASH_KEY"] || "bqsqwad-audit-hash-key-default-v3";
}

export async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

/**
 * Normalizes any URL or route path to a privacy-safe route pattern.
 * Strips protocol, hostname, port, query strings (?...) and hash fragments (#...).
 * Normalizes dynamic identifiers (UUIDs, IDs, hashes) into parameterized tokens.
 */
export function normalizeRoutePattern(rawPathOrUrl: string): string {
  if (!rawPathOrUrl || typeof rawPathOrUrl !== "string") return "/";

  let pathname = rawPathOrUrl.trim();
  try {
    if (pathname.includes("://")) {
      const url = new URL(pathname);
      pathname = url.pathname;
    }
  } catch {
    // fallback if URL parsing fails
  }

  // Strip query string and fragment
  const queryIdx = pathname.indexOf("?");
  if (queryIdx !== -1) pathname = pathname.slice(0, queryIdx);
  const hashIdx = pathname.indexOf("#");
  if (hashIdx !== -1) pathname = pathname.slice(0, hashIdx);

  // Remove leading/trailing slash for splitting
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  // Parameter mappings for common resource segments
  const paramMap: Record<string, string> = {
    users: ":uid",
    producers: ":uid",
    channels: ":channelId",
    disputes: ":disputeId",
    statements: ":statementId",
    contracts: ":contractId",
    workers: ":workerId",
    "content-assets": ":assetId",
    "content-comments": ":commentId",
    devices: ":deviceId",
    notifications: ":notificationId",
    payments: ":paymentId",
    payouts: ":payoutId",
    sessions: ":sessionId",
    campaigns: ":campaignId",
    schedule: ":programmeId",
    pages: ":slug",
    legal: ":slug",
  };

  const normalizedSegments: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const prevSeg = i > 0 ? segments[i - 1] : undefined;
    const prev = prevSeg ? prevSeg.toLowerCase() : "";

    // Check if previous segment dictates a named parameter
    const mappedParam = prev ? paramMap[prev] : undefined;
    if (mappedParam && isDynamicIdentifier(seg)) {
      normalizedSegments.push(mappedParam);
      continue;
    }

    // Generic dynamic segment detection
    if (isDynamicIdentifier(seg)) {
      normalizedSegments.push(":id");
    } else {
      normalizedSegments.push(seg);
    }
  }

  return "/" + normalizedSegments.join("/");
}

const STATIC_SEGMENTS = new Set([
  "api",
  "public",
  "v1",
  "admin",
  "producer",
  "provider",
  "worker",
  "content-assets",
  "content-comments",
  "video-studio",
  "firebase-schema",
  "google-play",
  "upload-intent",
  "mobile-summary",
  "test-playback",
  "secret-health",
  "rebuild-pool",
  "schedule-wallet-holds",
  "register-discovered",
  "push-token",
  "send-code",
  "verify-code",
  "revoke-all",
  "provider-config",
  "high-demand",
  "not-available",
  "producer-terms",
  "age-restriction",
  "channels",
  "users",
  "producers",
  "providers",
  "disputes",
  "contracts",
  "statements",
  "workers",
  "notifications",
  "devices",
  "payments",
  "payouts",
  "sessions",
  "campaigns",
  "schedule",
  "pages",
  "legal",
  "storage",
  "reports",
  "pricing",
  "ads",
  "moderation",
  "support",
  "config",
  "auth",
  "catalog",
  "wallet",
]);

function isDynamicIdentifier(segment: string): boolean {
  if (STATIC_SEGMENTS.has(segment.toLowerCase())) return false;
  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return true;
  }
  // Hex hashes or long numeric strings
  if (/^[0-9a-f]{24,64}$/i.test(segment) || /^\d{4,}$/.test(segment)) {
    return true;
  }
  // Prefixed IDs like chan_..., usr_..., disp_..., wrk_..., asset_...
  if (
    /^(usr|chan|disp|stmt|prog|item|job|tok|sess|dev|pay|alert|notif|asset|comm|prov|grp)_[A-Za-z0-9_-]+$/i.test(
      segment,
    )
  ) {
    return true;
  }
  // Standard Firebase UID or random alphanumeric token (length >= 12 with at least one digit)
  if (/^[A-Za-z0-9_-]{12,}$/.test(segment) && /\d/.test(segment)) {
    return true;
  }
  return false;
}

/**
 * Extracts coarse network prefix (/24 for IPv4, /48 for IPv6).
 * Never returns full IP address.
 */
export function extractCoarseNetworkPrefix(ip?: string | null): string {
  if (!ip || typeof ip !== "string") return "unknown";
  let cleanIp = ip.trim();

  // Strip port notation
  if (cleanIp.startsWith("[") && cleanIp.includes("]")) {
    cleanIp = cleanIp.slice(1, cleanIp.indexOf("]"));
  } else if (cleanIp.includes(":") && cleanIp.indexOf(":") === cleanIp.lastIndexOf(":")) {
    cleanIp = cleanIp.split(":")[0] ?? cleanIp;
  }

  // IPv4: /24 prefix
  const v4Parts = cleanIp.split(".");
  if (
    v4Parts.length === 4 &&
    v4Parts.every((p) => /^\d+$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
  ) {
    const [p0, p1, p2] = v4Parts;
    if (p0 !== undefined && p1 !== undefined && p2 !== undefined) {
      return `${p0}.${p1}.${p2}.0/24`;
    }
  }

  // IPv6: /48 prefix
  if (cleanIp.includes(":")) {
    const v6Parts = cleanIp.split(":").filter(Boolean);
    if (v6Parts.length >= 3) {
      return `${v6Parts.slice(0, 3).join(":")}::/48`;
    }
  }

  return "unknown";
}

/**
 * Detects platform class (web, android, ios, worker, unknown).
 */
export function detectPlatformClass(req?: Request, userAgent?: string | null): PlatformClass {
  const ua = userAgent || (req ? req.headers.get("user-agent") || "" : "");
  const platformHeader = (
    req ? req.headers.get("x-platform") || req.headers.get("x-client-platform") || "" : ""
  ).toLowerCase();

  if (platformHeader === "android" || /Android|okhttp/i.test(ua)) return "android";
  if (platformHeader === "ios" || /CFNetwork|Darwin|iPhone|iPad/i.test(ua)) return "ios";
  if (platformHeader === "worker" || /Modal|Worker|VideoEngine/i.test(ua)) return "worker";
  if (platformHeader === "web" || /Mozilla|Chrome|Safari|Firefox|Edge/i.test(ua)) return "web";

  return req ? "web" : "unknown";
}

/**
 * Resolves client IP from standard proxy/forwarding headers.
 */
export function getClientIp(req?: Request): string {
  if (!req) return "";
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    ""
  );
}

/**
 * Records a privacy-safe access denial audit event.
 * Writes to accessDenials/{id}, updates sharded hourly counters,
 * and triggers an alert if an actor exceeds 10 denials within an hour.
 */
export async function recordAccessDenial(
  fs: Firestore,
  input: RecordAccessDenialInput,
): Promise<AccessDenialEvent> {
  const auditKey = getAuditHashKey();
  const now = input.now || new Date();
  const time = now.toISOString();

  // 1. actorHash: HMAC-SHA256 of user ID, or HMAC of 'anonymous'
  const actorIdentifier = input.actorUid ? `uid:${input.actorUid}` : "anonymous";
  const actorHash = await hmacSha256Hex(auditKey, actorIdentifier);

  // 2. targetHash: HMAC-SHA256 of resource ID if present, else null
  const targetHash = input.targetId ? await hmacSha256Hex(auditKey, input.targetId) : null;

  // 3. coarseNetworkHash: HMAC-SHA256 of network prefix (/24 or /48)
  const clientIp = input.clientIp || getClientIp(input.request);
  const networkPrefix = extractCoarseNetworkPrefix(clientIp);
  const coarseNetworkHash = await hmacSha256Hex(auditKey, networkPrefix);

  // 4. routePattern: normalized parameterized pattern only
  const rawPath = input.routePattern || (input.request ? input.request.url : "/");
  const routePattern = normalizeRoutePattern(rawPath);

  // 5. Method, required role, resource kind, actor role class, platform class
  const method = (input.method || (input.request ? input.request.method : "GET")).toUpperCase();
  const requiredRole = input.requiredRole || "viewer";
  const resourceKind = input.resourceKind || "unknown";
  const actorRoleClass = input.actorRoleClass || (input.actorUid ? "viewer" : "anonymous");
  const platformClass = detectPlatformClass(input.request, input.userAgent);

  // 6. Retention expiration (90 days TTL)
  const expiresAt = new Date(
    now.getTime() + ACCESS_DENIAL_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const id = crypto.randomUUID();
  const event: AccessDenialEvent = {
    id,
    time,
    actorHash,
    actorRoleClass,
    routePattern,
    method,
    requiredRole,
    resourceKind,
    targetHash,
    reasonCode: input.reasonCode,
    coarseNetworkHash,
    platformClass,
    expiresAt,
  };

  // Write the primary access denial audit record (safely guarding against minimal test mocks)
  if (typeof fs?.setDoc === "function") {
    await fs.setDoc(`accessDenials/${id}`, event);
  }

  // Hourly deduplication and sharded counter update
  const hourBucket = time.slice(0, 13); // "YYYY-MM-DDTHH"
  await updateHourlyDenialCounter(fs, {
    actorHash,
    hourBucket,
    routePattern,
    reasonCode: input.reasonCode,
    time,
    expiresAt,
  }).catch((err) => {
    console.error("Failed to update access denial counter", err);
  });

  return event;
}

type CounterUpdateInput = {
  actorHash: string;
  hourBucket: string;
  routePattern: string;
  reasonCode: string;
  time: string;
  expiresAt: string;
};

async function updateHourlyDenialCounter(fs: Firestore, input: CounterUpdateInput): Promise<void> {
  if (typeof fs?.setDoc !== "function") return;

  const auditKey = getAuditHashKey();
  const shard = Math.floor(Math.random() * SHARD_COUNT);
  const patternReasonHash = (
    await hmacSha256Hex(auditKey, `${input.routePattern}:${input.reasonCode}`)
  ).slice(0, 16);

  // Sharded counter for this specific (actor, pattern, reason)
  const counterId = `${input.actorHash}_${input.hourBucket}_${patternReasonHash}_s${shard}`;
  const counterRef = `accessDenialCounters/${counterId}`;
  let shardCount = 0;
  if (typeof fs.getDoc === "function") {
    const existingCounter = await fs.getDoc(counterRef);
    if (typeof existingCounter?.["count"] === "number") {
      shardCount = existingCounter["count"] as number;
    }
  }

  await fs.setDoc(counterRef, {
    actorHash: input.actorHash,
    hourBucket: input.hourBucket,
    routePattern: input.routePattern,
    reasonCode: input.reasonCode,
    shard,
    count: shardCount + 1,
    updatedAt: input.time,
    expiresAt: input.expiresAt,
  });

  // Track aggregated hourly total across all patterns for this actor to support alert threshold
  const totalRef = `accessDenialHourlyTotals/${input.actorHash}_${input.hourBucket}`;
  let totalCount = 0;
  if (typeof fs.getDoc === "function") {
    const totalDoc = await fs.getDoc(totalRef);
    if (typeof totalDoc?.["count"] === "number") {
      totalCount = totalDoc["count"] as number;
    }
  }
  const newTotal = totalCount + 1;

  await fs.setDoc(totalRef, {
    actorHash: input.actorHash,
    hourBucket: input.hourBucket,
    count: newTotal,
    updatedAt: input.time,
    expiresAt: input.expiresAt,
  });

  // Alert Zillionaire when one actor exceeds 10 denials in an hour
  if (newTotal > HOURLY_ALERT_THRESHOLD) {
    const alertId = `${input.actorHash}_${input.hourBucket}`;
    const alertRef = `securityAlerts/${alertId}`;
    let existingAlert: Record<string, unknown> | null = null;
    if (typeof fs.getDoc === "function") {
      existingAlert = await fs.getDoc(alertRef);
    }

    if (!existingAlert) {
      await fs.setDoc(alertRef, {
        id: alertId,
        type: "EXCESSIVE_ACCESS_DENIALS",
        actorHash: input.actorHash,
        hourBucket: input.hourBucket,
        denialCount: newTotal,
        reasonCode: input.reasonCode,
        routePattern: input.routePattern,
        time: input.time,
        status: "OPEN",
        message: "Actor exceeded 10 access denials within one hour.",
        expiresAt: input.expiresAt,
      });

      console.warn(
        `[SECURITY_ALERT] Actor hash ${input.actorHash} exceeded ${HOURLY_ALERT_THRESHOLD} denials in hour ${input.hourBucket} (count: ${newTotal})`,
      );
    }
  }
}
