import { ApiError, Firestore, encodeFields } from "./firebase-admin";
import { enforceRateLimit } from "./rate-limit";
import { writeAuditLog } from "./audit";

// ==========================================
// 1. PER-ROUTE RATE LIMIT CONFIGURATION
// ==========================================

export type RouteRateLimitConfig = {
  routeKey: string;
  label: string;
  maxRequests: number;
  windowSeconds: number;
  description: string;
};

export const DEFAULT_ROUTE_RATE_LIMITS: Record<string, RouteRateLimitConfig> = {
  auth_signin: {
    routeKey: "auth_signin",
    label: "Authentication Sign-In",
    maxRequests: 10,
    windowSeconds: 60,
    description: "Protection against brute force login and session initiation",
  },
  auth_mfa: {
    routeKey: "auth_mfa",
    label: "MFA & Step-Up Verification",
    maxRequests: 5,
    windowSeconds: 60,
    description: "Rate limit on TOTP code and one-time backup verification attempts",
  },
  public_api: {
    routeKey: "public_api",
    label: "General Public API",
    maxRequests: 60,
    windowSeconds: 60,
    description: "Global fallback rate limit for unauthenticated public endpoints",
  },
  stream_grant: {
    routeKey: "stream_grant",
    label: "Playback Stream Grants",
    maxRequests: 30,
    windowSeconds: 60,
    description: "Limits on viewing session token issuance per user",
  },
  video_upload: {
    routeKey: "video_upload",
    label: "Video Studio Uploads",
    maxRequests: 10,
    windowSeconds: 3600,
    description: "Hourly quota on high-bitrate video ingest and transcoding jobs",
  },
  wallet_topup: {
    routeKey: "wallet_topup",
    label: "Wallet Top-Up Initiation",
    maxRequests: 5,
    windowSeconds: 300,
    description: "Anti-velocity throttle for wallet credit checkout initiation",
  },
  live_chat: {
    routeKey: "live_chat",
    label: "Channel Live Chat",
    maxRequests: 20,
    windowSeconds: 60,
    description: "Throttle for real-time live chat room message dispatch",
  },
  search: {
    routeKey: "search",
    label: "Content & Catalog Search",
    maxRequests: 40,
    windowSeconds: 60,
    description: "Per-IP limit for high-concurrency faceted search queries",
  },
  export: {
    routeKey: "export",
    label: "Tamper Audit & Data Exports",
    maxRequests: 3,
    windowSeconds: 3600,
    description: "Hourly quota on cryptographically signed data bundle exports",
  },
  actor_lookup: {
    routeKey: "actor_lookup",
    label: "Security Actor Identity Lookup",
    maxRequests: 10,
    windowSeconds: 60,
    description: "Throttle for sensitive actor identity de-anonymization lookups",
  },
};

const ABUSE_SETTINGS_DOC = "config/abuseRateLimits";

export async function getRouteRateLimits(
  fs: Firestore,
): Promise<Record<string, RouteRateLimitConfig>> {
  const doc = await fs.getDoc(ABUSE_SETTINGS_DOC);
  if (!doc) {
    return { ...DEFAULT_ROUTE_RATE_LIMITS };
  }
  const custom = (doc["limits"] || {}) as Record<string, Partial<RouteRateLimitConfig>>;
  const merged: Record<string, RouteRateLimitConfig> = { ...DEFAULT_ROUTE_RATE_LIMITS };
  for (const [key, def] of Object.entries(DEFAULT_ROUTE_RATE_LIMITS)) {
    const override = custom[key];
    if (override) {
      merged[key] = {
        ...def,
        maxRequests:
          typeof override.maxRequests === "number" && override.maxRequests > 0
            ? Math.floor(override.maxRequests)
            : def.maxRequests,
        windowSeconds:
          typeof override.windowSeconds === "number" && override.windowSeconds > 0
            ? Math.floor(override.windowSeconds)
            : def.windowSeconds,
      };
    }
  }
  return merged;
}

export async function updateRouteRateLimit(
  fs: Firestore,
  routeKey: string,
  updates: { maxRequests: number; windowSeconds: number },
  actorUid: string,
  reason: string,
): Promise<RouteRateLimitConfig> {
  const def = DEFAULT_ROUTE_RATE_LIMITS[routeKey];
  if (!def) {
    throw new ApiError(400, "INVALID_ROUTE_KEY", `Unknown route key: ${routeKey}`);
  }
  if (!Number.isSafeInteger(updates.maxRequests) || updates.maxRequests < 1 || updates.maxRequests > 10000) {
    throw new ApiError(400, "INVALID_RATE_LIMIT", "maxRequests must be between 1 and 10,000.");
  }
  if (!Number.isSafeInteger(updates.windowSeconds) || updates.windowSeconds < 1 || updates.windowSeconds > 86400) {
    throw new ApiError(400, "INVALID_WINDOW_SECONDS", "windowSeconds must be between 1 and 86,400.");
  }
  const currentLimits = await getRouteRateLimits(fs);
  const updatedEntry: RouteRateLimitConfig = {
    ...def,
    maxRequests: updates.maxRequests,
    windowSeconds: updates.windowSeconds,
  };
  const allLimits = { ...currentLimits, [routeKey]: updatedEntry };

  await fs.setDoc(ABUSE_SETTINGS_DOC, {
    limits: allLimits,
    updatedAt: new Date().toISOString(),
    updatedBy: actorUid,
  });

  await writeAuditLog(fs, {
    actorUid,
    action: "security.rate_limit_updated",
    targetType: "rate_limit",
    targetId: routeKey,
    reason,
    metadata: {
      routeKey,
      previousMaxRequests: currentLimits[routeKey]?.maxRequests,
      newMaxRequests: updates.maxRequests,
      previousWindowSeconds: currentLimits[routeKey]?.windowSeconds,
      newWindowSeconds: updates.windowSeconds,
    },
  });

  return updatedEntry;
}

export async function enforceConfigurableRateLimit(
  fs: Firestore,
  routeKey: string,
  identifier: string,
): Promise<void> {
  const limits = await getRouteRateLimits(fs);
  const config = limits[routeKey] || DEFAULT_ROUTE_RATE_LIMITS[routeKey] || {
    routeKey,
    label: routeKey,
    maxRequests: 60,
    windowSeconds: 60,
    description: "Default limit",
  };
  await enforceRateLimit(fs, `route-limit:${routeKey}:${identifier}`, {
    limit: config.maxRequests,
    windowMs: config.windowSeconds * 1000,
  });
}

// ==========================================
// 2. DEVICE & IP REPUTATION LIST
// ==========================================

export type ReputationStatus = "allowed" | "greylisted" | "blacklisted";
export type ReputationTargetType = "ip" | "device";

export type ReputationEntry = {
  id: string;
  targetType: ReputationTargetType;
  targetValue: string;
  status: ReputationStatus;
  reason: string;
  riskScore: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export async function checkReputation(
  fs: Firestore,
  input: { clientIp?: string; deviceFingerprint?: string },
): Promise<{ allowed: boolean; status: ReputationStatus; reason?: string; riskScore: number }> {
  // Check IP
  if (input.clientIp) {
    const ipDoc = await fs.getDoc(`ipDeviceReputation/ip_${input.clientIp.replace(/[/:.]/g, "_")}`);
    if (ipDoc) {
      const status = ipDoc["status"] as ReputationStatus;
      const expiresAt = ipDoc["expiresAt"] ? Date.parse(ipDoc["expiresAt"] as string) : null;
      if (!expiresAt || expiresAt > Date.now()) {
        if (status === "blacklisted") {
          return {
            allowed: false,
            status: "blacklisted",
            reason: (ipDoc["reason"] as string) || "IP is blacklisted.",
            riskScore: (ipDoc["riskScore"] as number) || 100,
          };
        }
        if (status === "greylisted") {
          return {
            allowed: true,
            status: "greylisted",
            reason: (ipDoc["reason"] as string) || "IP is greylisted.",
            riskScore: (ipDoc["riskScore"] as number) || 50,
          };
        }
      }
    }
  }

  // Check Device
  if (input.deviceFingerprint) {
    const devDoc = await fs.getDoc(
      `ipDeviceReputation/dev_${input.deviceFingerprint.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64)}`,
    );
    if (devDoc) {
      const status = devDoc["status"] as ReputationStatus;
      const expiresAt = devDoc["expiresAt"] ? Date.parse(devDoc["expiresAt"] as string) : null;
      if (!expiresAt || expiresAt > Date.now()) {
        if (status === "blacklisted") {
          return {
            allowed: false,
            status: "blacklisted",
            reason: (devDoc["reason"] as string) || "Device is blacklisted.",
            riskScore: (devDoc["riskScore"] as number) || 100,
          };
        }
        if (status === "greylisted") {
          return {
            allowed: true,
            status: "greylisted",
            reason: (devDoc["reason"] as string) || "Device is greylisted.",
            riskScore: (devDoc["riskScore"] as number) || 50,
          };
        }
      }
    }
  }

  return { allowed: true, status: "allowed", riskScore: 0 };
}

export async function setReputationEntry(
  fs: Firestore,
  input: {
    targetType: ReputationTargetType;
    targetValue: string;
    status: ReputationStatus;
    reason: string;
    riskScore?: number;
    ttlHours?: number;
    actorUid: string;
  },
): Promise<ReputationEntry> {
  const sanitizedVal = input.targetValue.trim();
  if (!sanitizedVal || sanitizedVal.length > 200) {
    throw new ApiError(400, "INVALID_TARGET_VALUE", "Target value must be between 1 and 200 characters.");
  }
  const cleanId =
    input.targetType === "ip"
      ? `ip_${sanitizedVal.replace(/[/:.]/g, "_")}`
      : `dev_${sanitizedVal.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64)}`;
  const now = new Date();
  const expiresAt =
    typeof input.ttlHours === "number" && input.ttlHours > 0
      ? new Date(now.getTime() + input.ttlHours * 3600_000).toISOString()
      : null;

  const entry: ReputationEntry = {
    id: cleanId,
    targetType: input.targetType,
    targetValue: sanitizedVal,
    status: input.status,
    reason: input.reason.trim(),
    riskScore: typeof input.riskScore === "number" ? Math.max(0, Math.min(100, input.riskScore)) : 80,
    expiresAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: input.actorUid,
  };

  await fs.setDoc(`ipDeviceReputation/${cleanId}`, entry);

  await writeAuditLog(fs, {
    actorUid: input.actorUid,
    action: "security.reputation_set",
    targetType: input.targetType,
    targetId: sanitizedVal,
    reason: input.reason,
    metadata: {
      status: input.status,
      riskScore: entry.riskScore,
      expiresAt,
    },
  });

  return entry;
}

export async function removeReputationEntry(
  fs: Firestore,
  entryId: string,
  actorUid: string,
  reason: string,
): Promise<void> {
  const existing = await fs.getDoc(`ipDeviceReputation/${entryId}`);
  if (!existing) {
    throw new ApiError(404, "ENTRY_NOT_FOUND", "Reputation entry not found.");
  }
  await fs.deleteDoc(`ipDeviceReputation/${entryId}`);
  await writeAuditLog(fs, {
    actorUid,
    action: "security.reputation_removed",
    targetType: (existing["targetType"] as string) || "reputation",
    targetId: (existing["targetValue"] as string) || entryId,
    reason,
  });
}

export async function listReputationEntries(
  fs: Firestore,
  options?: { targetType?: ReputationTargetType; status?: ReputationStatus; limit?: number },
): Promise<ReputationEntry[]> {
  const filters: Array<{ field: string; op: "EQUAL"; value: unknown }> = [];
  if (options?.targetType) {
    filters.push({ field: "targetType", op: "EQUAL", value: options.targetType });
  }
  if (options?.status) {
    filters.push({ field: "status", op: "EQUAL", value: options.status });
  }
  const queryOpts: { filters?: typeof filters; limit: number } = { limit: options?.limit || 100 };
  if (filters.length) queryOpts.filters = filters;
  const docs = await fs.query("ipDeviceReputation", queryOpts);

  return docs.map((d) => ({
    id: d.__id,
    targetType: (d["targetType"] as ReputationTargetType) || "ip",
    targetValue: (d["targetValue"] as string) || "",
    status: (d["status"] as ReputationStatus) || "allowed",
    reason: (d["reason"] as string) || "",
    riskScore: typeof d["riskScore"] === "number" ? d["riskScore"] : 0,
    expiresAt: (d["expiresAt"] as string) || null,
    createdAt: (d["createdAt"] as string) || "",
    updatedAt: (d["updatedAt"] as string) || "",
    createdBy: (d["createdBy"] as string) || "",
  }));
}

// ==========================================
// 3. BOT & CREDENTIAL-STUFFING PROTECTION
// ==========================================

export async function evaluateSigninSecurity(
  fs: Firestore,
  input: {
    clientIp: string;
    accountIdentifier: string;
    userAgent?: string;
    deviceFingerprint?: string;
  },
): Promise<{ allowed: boolean; riskScore: number; reason?: string; flags: string[] }> {
  const flags: string[] = [];
  let score = 0;

  // 1. Reputation Check
  const rep = await checkReputation(fs, {
    clientIp: input.clientIp,
    ...(input.deviceFingerprint ? { deviceFingerprint: input.deviceFingerprint } : {}),
  });
  if (!rep.allowed) {
    throw new ApiError(
      403,
      "BLOCKED_NETWORK_ADDRESS",
      "Access from this network location or device has been restricted.",
    );
  }
  if (rep.status === "greylisted") {
    score += rep.riskScore;
    flags.push("GREYLISTED_IP");
  }

  // 2. Automated Bot Client Signatures
  const ua = input.userAgent || "";
  const botPattern = /curl|python-requests|postman|puppeteer|selenium|headless|phantomjs|aiohttp|wget|httpclient/i;
  if (!ua || botPattern.test(ua)) {
    score += 40;
    flags.push("AUTOMATED_CLIENT_SIGNATURE");
  }

  // 3. Credential-Stuffing Burst Check (multiple distinct accounts targeted by same IP)
  const ipKey = input.clientIp.replace(/[/:.]/g, "_").slice(0, 64);
  const now = Date.now();
  const burstPath = `signinBursts/${ipKey}`;

  try {
    const burstData = await fs.getDoc(burstPath);
    let attemptsCount = 1;
    let distinctAccounts = [input.accountIdentifier];
    const windowStart =
      burstData && typeof burstData["windowStart"] === "number"
        ? (burstData["windowStart"] as number)
        : now;

    if (burstData && now - windowStart < 900_000) {
      // 15-minute sliding window
      attemptsCount = (Number(burstData["attemptsCount"]) || 0) + 1;
      const prevAccounts = Array.isArray(burstData["distinctAccounts"])
        ? (burstData["distinctAccounts"] as string[])
        : [];
      const set = new Set([...prevAccounts, input.accountIdentifier]);
      distinctAccounts = Array.from(set);

      if (distinctAccounts.length >= 3) {
        score += 55;
        flags.push("CREDENTIAL_STUFFING_PATTERN");
      }
      if (attemptsCount > 15) {
        score += 35;
        flags.push("HIGH_FREQUENCY_LOGIN_BURST");
      }
    }

    await fs.setDoc(burstPath, {
      attemptsCount,
      distinctAccounts: distinctAccounts.slice(0, 20),
      windowStart: now - windowStart < 900_000 ? windowStart : now,
      lastAttemptAt: new Date(now).toISOString(),
    });
  } catch (e) {
    // Non-blocking fallback
  }

  if (score >= 70) {
    throw new ApiError(
      429,
      "CREDENTIAL_STUFFING_BLOCKED",
      "Excessive automated login attempts detected. Access temporarily restricted.",
    );
  }

  return {
    allowed: true,
    riskScore: score,
    flags,
    ...(flags.length ? { reason: flags.join(", ") } : {}),
  };
}

// ==========================================
// 4. PAYMENT FRAUD RULES
// ==========================================

export async function evaluatePaymentFraud(
  fs: Firestore,
  input: {
    uid: string;
    amountMinor: number;
    currency: string;
    clientIp: string;
    ipCountry?: string | null;
    cardCountry?: string | null;
    deviceFingerprint?: string;
  },
): Promise<{
  allowed: boolean;
  riskScore: number;
  holdCreated: boolean;
  holdId?: string;
  flags: string[];
}> {
  const flags: string[] = [];
  let score = 0;

  // 1. IP / Device Reputation Check
  const rep = await checkReputation(fs, {
    clientIp: input.clientIp,
    ...(input.deviceFingerprint ? { deviceFingerprint: input.deviceFingerprint } : {}),
  });
  if (!rep.allowed) {
    throw new ApiError(
      403,
      "PAYMENT_NETWORK_BLOCKED",
      "Payments from this network location or device are restricted.",
    );
  }

  // 2. Velocity Check: Recent top-ups by this user
  try {
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const recentPayments = await fs.query("payments", {
      filters: [
        { field: "uid", op: "EQUAL", value: input.uid },
        { field: "createdAt", op: "GREATER_THAN", value: oneHourAgo },
      ],
      limit: 10,
    });

    if (recentPayments.length >= 5) {
      score += 45;
      flags.push("PAYMENT_VELOCITY_EXCEEDED");
    }

    // 3. Repeated Failed Top-Ups Check
    const failedPayments = recentPayments.filter(
      (p) => p["status"] === "initialize_failed" || p["status"] === "failed",
    );
    if (failedPayments.length >= 3) {
      score += 50;
      flags.push("REPEATED_FAILED_TOPUPS");
    }
  } catch (e) {
    // Graceful fallback
  }

  // 4. Country Mismatch
  if (input.ipCountry && input.cardCountry && input.ipCountry !== input.cardCountry) {
    score += 35;
    flags.push(`COUNTRY_MISMATCH_${input.ipCountry}_VS_${input.cardCountry}`);
    if (input.amountMinor > 20_000_00) {
      // Over ₦20,000 equivalent with country mismatch
      score += 30;
      flags.push("HIGH_VALUE_COUNTRY_MISMATCH");
    }
  }

  if (score >= 65) {
    // Create automatic security hold
    const hold = await createSecurityHold(fs, {
      targetType: "payment",
      targetId: input.uid,
      reason: `Automated payment fraud trigger: ${flags.join("; ")}`,
      riskScore: score,
      metadata: {
        amountMinor: input.amountMinor,
        currency: input.currency,
        clientIp: input.clientIp,
        ipCountry: input.ipCountry,
        cardCountry: input.cardCountry,
        flags,
      },
    });

    throw new ApiError(
      403,
      "PAYMENT_FRAUD_HOLD",
      "This payment has been placed on temporary hold for security review. Our verification team will review it shortly.",
    );
  }

  return {
    allowed: true,
    riskScore: score,
    holdCreated: false,
    flags,
  };
}

// ==========================================
// 5. WALLET ANOMALY FREEZE
// ==========================================

export async function evaluateWalletAnomalyAndFreeze(
  fs: Firestore,
  input: {
    uid: string;
    currentBalanceMinor: number;
    requestedDebitMinor: number;
    dailySpendMinor: number;
    dailyLimitMinor?: number;
    reason: string;
  },
): Promise<{ anomalyDetected: boolean; frozen: boolean; reason?: string }> {
  let anomaly = false;
  let anomalyReason = "";

  // 1. Negative Balance Attempt
  if (input.currentBalanceMinor < input.requestedDebitMinor) {
    anomaly = true;
    anomalyReason = "Attempted debit exceeds available wallet balance.";
  }
  // 2. Daily Spend Limit Breach
  else if (
    typeof input.dailyLimitMinor === "number" &&
    input.dailyLimitMinor > 0 &&
    input.dailySpendMinor + input.requestedDebitMinor > input.dailyLimitMinor
  ) {
    anomaly = true;
    anomalyReason = "Transaction breaches configured maximum daily spend limits.";
  }
  // 3. Catastrophic Drain Anomaly (>80% wallet drain on balance >= ₦50,000)
  else if (
    input.currentBalanceMinor >= 50_000_00 &&
    input.requestedDebitMinor >= Math.floor(input.currentBalanceMinor * 0.8)
  ) {
    anomaly = true;
    anomalyReason = "Rapid catastrophic wallet liquidation detected (>80% balance drain).";
  }

  if (anomaly) {
    const nowIso = new Date().toISOString();
    // Freeze the wallet in Firestore
    const existingWallet = await fs.getDoc(`wallets/${input.uid}`);
    await fs.setDoc(`wallets/${input.uid}`, {
      ...(existingWallet || {}),
      status: "frozen",
      frozenReason: anomalyReason,
      frozenAt: nowIso,
      updatedAt: nowIso,
    });

    // Create automatic security hold in review queue
    await createSecurityHold(fs, {
      targetType: "wallet",
      targetId: input.uid,
      reason: `Wallet anomaly freeze: ${anomalyReason}`,
      riskScore: 90,
      metadata: {
        currentBalanceMinor: input.currentBalanceMinor,
        requestedDebitMinor: input.requestedDebitMinor,
        dailySpendMinor: input.dailySpendMinor,
        dailyLimitMinor: input.dailyLimitMinor,
        originalReason: input.reason,
      },
    });

    await writeAuditLog(fs, {
      actorUid: input.uid,
      action: "wallet.anomaly_frozen",
      targetType: "wallet",
      targetId: input.uid,
      reason: anomalyReason,
      metadata: {
        currentBalanceMinor: input.currentBalanceMinor,
        requestedDebitMinor: input.requestedDebitMinor,
      },
    });

    throw new ApiError(
      403,
      "WALLET_ANOMALY_FROZEN",
      "Your wallet has been temporarily frozen due to irregular transaction activity. An owner review has been opened.",
    );
  }

  return { anomalyDetected: false, frozen: false };
}

// ==========================================
// 6. REFERRAL-ABUSE DETECTION
// ==========================================

export async function evaluateReferralAbuse(
  fs: Firestore,
  input: {
    referrerUid: string;
    refereeUid: string;
    clientIp: string;
    deviceFingerprint?: string;
  },
): Promise<{ valid: boolean; abuseScore: number; reasons: string[]; holdCreated: boolean }> {
  const reasons: string[] = [];
  let score = 0;

  // 1. Self-referral
  if (input.referrerUid === input.refereeUid) {
    return {
      valid: false,
      abuseScore: 100,
      reasons: ["SELF_REFERRAL_FORBIDDEN"],
      holdCreated: false,
    };
  }

  // 2. Same Device Fingerprint
  if (input.deviceFingerprint) {
    const referrerProfile = await fs.getDoc(`users/${input.referrerUid}`);
    if (
      referrerProfile &&
      referrerProfile["lastDeviceFingerprint"] === input.deviceFingerprint
    ) {
      score += 60;
      reasons.push("IDENTICAL_DEVICE_FINGERPRINT");
    }
  }

  // 3. IP Velocity Check (more than 3 referrals from identical IP in 24 hours)
  try {
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const recentReferrals = await fs.query("referrals", {
      filters: [
        { field: "clientIp", op: "EQUAL", value: input.clientIp },
        { field: "createdAt", op: "GREATER_THAN", value: dayAgo },
      ],
      limit: 10,
    });
    if (recentReferrals.length >= 3) {
      score += 50;
      reasons.push("IP_REFERRAL_BURST_EXCEEDED");
    }
  } catch (e) {
    // Non-blocking fallback
  }

  // 4. Circular Referral (referee previously referred referrer)
  try {
    const circularDoc = await fs.getDoc(`referrals/${input.refereeUid}_${input.referrerUid}`);
    if (circularDoc) {
      score += 100;
      reasons.push("CIRCULAR_REFERRAL_DETECTED");
    }
  } catch (e) {
    // Non-blocking fallback
  }

  let holdCreated = false;
  if (score >= 80) {
    await createSecurityHold(fs, {
      targetType: "referral",
      targetId: `${input.referrerUid}:${input.refereeUid}`,
      reason: `Referral fraud detected: ${reasons.join(", ")}`,
      riskScore: score,
      metadata: {
        referrerUid: input.referrerUid,
        refereeUid: input.refereeUid,
        clientIp: input.clientIp,
        deviceFingerprint: input.deviceFingerprint,
      },
    });
    holdCreated = true;
  }

  return {
    valid: score < 60,
    abuseScore: score,
    reasons,
    holdCreated,
  };
}

// ==========================================
// 7. COMMENT & CHAT SPAM SCORING
// ==========================================

export function scoreChatSpam(
  content: string,
  context?: {
    recentMessages?: string[];
    lastMessageTimeMs?: number;
    nowMs?: number;
  },
): { spamScore: number; isSpam: boolean; isSevere: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const now = context?.nowMs ?? Date.now();

  // 1. Fast repetition burst (< 1200ms)
  if (
    typeof context?.lastMessageTimeMs === "number" &&
    now - context.lastMessageTimeMs < 1200
  ) {
    score += 30;
    reasons.push("BURST_SPEED");
  }

  // 2. Duplicate Message
  const cleanContent = content.trim().toLowerCase();
  if (
    context?.recentMessages &&
    context.recentMessages.some((m) => m.trim().toLowerCase() === cleanContent)
  ) {
    score += 50;
    reasons.push("DUPLICATE_MESSAGE");
  }

  // 3. Excessive Caps (>70% uppercase and len >= 10)
  const letters = content.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 10) {
    const upperCount = Array.from(letters).filter((c) => c >= "A" && c <= "Z").length;
    if (upperCount / letters.length > 0.7) {
      score += 20;
      reasons.push("EXCESSIVE_CAPS");
    }
  }

  // 4. Phishing / Spam / Scam Keywords
  const spamRegex =
    /crypto|bitcoin|eth\b|free money|giveaway|investment scheme|earn ₦|telegram|whatsapp me|\bt\.me\/|\bwa\.me\/|dm for cash|gift card/i;
  if (spamRegex.test(content)) {
    score += 50;
    reasons.push("SPAM_KEYWORDS");
  }

  // 5. Unauthorized External Links
  const linkRegex = /(https?:\/\/|www\.)/i;
  if (linkRegex.test(content)) {
    score += 35;
    reasons.push("UNAUTHORIZED_LINK");
  }

  // 6. Character Flood (5+ identical consecutive chars)
  if (/(.)\1{4,}/.test(content)) {
    score += 25;
    reasons.push("CHARACTER_FLOOD");
  }

  return {
    spamScore: score,
    isSpam: score >= 50,
    isSevere: score >= 80,
    reasons,
  };
}

// ==========================================
// 8. SECURITY HOLDS & OWNER REVIEW QUEUE
// ==========================================

export type SecurityHold = {
  id: string;
  targetType: "user" | "wallet" | "payment" | "chat" | "referral";
  targetId: string;
  reason: string;
  riskScore: number;
  status: "pending" | "released" | "confirmed_ban";
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  reviewedBy?: string | null;
  reviewReason?: string | null;
  reviewedAt?: string | null;
};

export async function createSecurityHold(
  fs: Firestore,
  input: {
    targetType: SecurityHold["targetType"];
    targetId: string;
    reason: string;
    riskScore: number;
    metadata?: Record<string, unknown>;
    actorUid?: string;
  },
): Promise<SecurityHold> {
  const id = `hold_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = new Date().toISOString();

  const hold: SecurityHold = {
    id,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    riskScore: Math.max(0, Math.min(100, input.riskScore)),
    status: "pending",
    metadata: input.metadata || {},
    createdAt: now,
    updatedAt: now,
    reviewedBy: null,
    reviewReason: null,
    reviewedAt: null,
  };

  await fs.setDoc(`securityHolds/${id}`, hold);

  if (input.actorUid) {
    await writeAuditLog(fs, {
      actorUid: input.actorUid,
      action: "security.hold_created",
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: { holdId: id, riskScore: hold.riskScore },
    });
  }

  return hold;
}

export async function listSecurityHolds(
  fs: Firestore,
  options?: { status?: string; targetType?: string; limit?: number },
): Promise<{ holds: SecurityHold[]; pendingCount: number }> {
  const filters: Array<{ field: string; op: "EQUAL"; value: unknown }> = [];
  if (options?.status && options.status !== "ALL") {
    filters.push({ field: "status", op: "EQUAL", value: options.status });
  }
  if (options?.targetType && options.targetType !== "ALL") {
    filters.push({ field: "targetType", op: "EQUAL", value: options.targetType });
  }

  const allPending = await fs.query("securityHolds", {
    filters: [{ field: "status", op: "EQUAL", value: "pending" }],
    limit: 500,
  });

  const queryOpts: { filters?: typeof filters; limit: number } = { limit: options?.limit || 100 };
  if (filters.length) queryOpts.filters = filters;
  const docs = await fs.query("securityHolds", queryOpts);

  const holds: SecurityHold[] = docs.map((d) => ({
    id: d.__id,
    targetType: (d["targetType"] as SecurityHold["targetType"]) || "user",
    targetId: (d["targetId"] as string) || "",
    reason: (d["reason"] as string) || "",
    riskScore: typeof d["riskScore"] === "number" ? d["riskScore"] : 0,
    status: (d["status"] as SecurityHold["status"]) || "pending",
    metadata: (d["metadata"] as Record<string, unknown>) || {},
    createdAt: (d["createdAt"] as string) || "",
    updatedAt: (d["updatedAt"] as string) || "",
    reviewedBy: (d["reviewedBy"] as string) || null,
    reviewReason: (d["reviewReason"] as string) || null,
    reviewedAt: (d["reviewedAt"] as string) || null,
  }));

  // Sort holds descending by createdAt
  holds.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return { holds, pendingCount: allPending.length };
}

export async function resolveSecurityHold(
  fs: Firestore,
  input: {
    holdId: string;
    action: "RELEASE" | "CONFIRM_BAN";
    reason: string;
    actorUid: string;
  },
): Promise<SecurityHold> {
  const hold = await fs.getDoc(`securityHolds/${input.holdId}`);
  if (!hold) {
    throw new ApiError(404, "HOLD_NOT_FOUND", "Security hold record not found.");
  }

  const rawTarget = hold["targetType"];
  const targetType: SecurityHold["targetType"] =
    rawTarget === "wallet" || rawTarget === "payment" || rawTarget === "chat" || rawTarget === "referral"
      ? rawTarget
      : "user";
  const targetId = (hold["targetId"] as string) || "";
  const nowIso = new Date().toISOString();

  if (input.action === "RELEASE") {
    // If it was a wallet hold, unfreeze the wallet
    if (targetType === "wallet") {
      const wallet = await fs.getDoc(`wallets/${targetId}`);
      if (wallet && wallet["status"] === "frozen") {
        await fs.setDoc(`wallets/${targetId}`, {
          ...wallet,
          status: "active",
          frozenReason: null,
          unfrozenAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    const updatedHold: SecurityHold = {
      id: String(hold["__id"] || input.holdId),
      targetType,
      targetId,
      reason: (hold["reason"] as string) || "",
      riskScore: typeof hold["riskScore"] === "number" ? hold["riskScore"] : 0,
      status: "released",
      metadata: (hold["metadata"] as Record<string, unknown>) || {},
      createdAt: (hold["createdAt"] as string) || "",
      updatedAt: nowIso,
      reviewedBy: input.actorUid,
      reviewReason: input.reason,
      reviewedAt: nowIso,
    };

    await fs.setDoc(`securityHolds/${input.holdId}`, updatedHold);

    await writeAuditLog(fs, {
      actorUid: input.actorUid,
      action: "security.hold_released",
      targetType,
      targetId,
      reason: input.reason,
      metadata: { holdId: input.holdId },
    });

    return updatedHold;
  } else {
    // CONFIRM_BAN
    if (targetType === "wallet") {
      const existingW = await fs.getDoc(`wallets/${targetId}`);
      await fs.setDoc(`wallets/${targetId}`, {
        ...(existingW || {}),
        status: "suspended",
        suspendedReason: input.reason,
        updatedAt: nowIso,
      });
    } else if (targetType === "user") {
      const existingU = await fs.getDoc(`users/${targetId}`);
      await fs.setDoc(`users/${targetId}`, {
        ...(existingU || {}),
        status: "banned",
        bannedReason: input.reason,
        bannedAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // If hold metadata contained an IP or device, add to blacklist reputation
    const meta = (hold["metadata"] || {}) as Record<string, unknown>;
    if (typeof meta["clientIp"] === "string" && meta["clientIp"]) {
      await setReputationEntry(fs, {
        targetType: "ip",
        targetValue: meta["clientIp"],
        status: "blacklisted",
        reason: `Confirmed ban from security hold: ${input.reason}`,
        riskScore: 100,
        actorUid: input.actorUid,
      });
    }

    const updatedHold: SecurityHold = {
      id: String(hold["__id"] || input.holdId),
      targetType,
      targetId,
      reason: (hold["reason"] as string) || "",
      riskScore: typeof hold["riskScore"] === "number" ? hold["riskScore"] : 0,
      status: "confirmed_ban",
      metadata: (hold["metadata"] as Record<string, unknown>) || {},
      createdAt: (hold["createdAt"] as string) || "",
      updatedAt: nowIso,
      reviewedBy: input.actorUid,
      reviewReason: input.reason,
      reviewedAt: nowIso,
    };

    await fs.setDoc(`securityHolds/${input.holdId}`, updatedHold);

    await writeAuditLog(fs, {
      actorUid: input.actorUid,
      action: "security.hold_confirmed_ban",
      targetType,
      targetId,
      reason: input.reason,
      metadata: { holdId: input.holdId },
    });

    return updatedHold;
  }
}
