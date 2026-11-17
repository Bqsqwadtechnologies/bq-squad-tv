import { ApiError, type Firestore, encodeFields } from "./firebase-admin";

export const RISK_SIGNAL_TYPES = [
  "topup", "failed_payment", "signin", "session_start", "device_change", "comment_burst",
] as const;
export type RiskSignalType = typeof RISK_SIGNAL_TYPES[number];

const WEIGHTS: Record<RiskSignalType, number> = {
  topup: 2,
  failed_payment: 4,
  signin: 1,
  session_start: 1,
  device_change: 5,
  comment_burst: 3,
};

export function scoreRiskSignals(counts: Partial<Record<RiskSignalType, number>>): {
  score: number; level: "normal" | "elevated" | "high";
} {
  let score = 0;
  for (const type of RISK_SIGNAL_TYPES) {
    const count = counts[type] ?? 0;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new ApiError(400, "RISK_SIGNAL_COUNT_INVALID", "Risk activity counts must be non-negative whole numbers.");
    }
    score += Math.min(count, 100) * WEIGHTS[type];
  }
  const bounded = Math.min(100, score);
  return { score: bounded, level: bounded >= 60 ? "high" : bounded >= 25 ? "elevated" : "normal" };
}

export async function recordRiskSignal(
  fs: Firestore,
  uid: string,
  type: RiskSignalType,
  now = new Date(),
): Promise<void> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !RISK_SIGNAL_TYPES.includes(type)) {
    throw new ApiError(400, "RISK_SIGNAL_INVALID", "The security activity record is invalid.");
  }
  const windowStart = new Date(Math.floor(now.getTime() / 900_000) * 900_000).toISOString();
  const shard = crypto.getRandomValues(new Uint8Array(1))[0]! % 16;
  const path = "riskCounters/" + uid + "_" + windowStart.replace(/[^0-9]/g, "") + "_" + shard;
  await fs.transact([path], docs => {
    const current = docs[0] ?? {};
    const counts = current["counts"] && typeof current["counts"] === "object"
      ? current["counts"] as Record<string, unknown> : {};
    const previous = typeof counts[type] === "number" && Number.isSafeInteger(counts[type]) && (counts[type] as number) >= 0
      ? counts[type] as number : 0;
    return {
      result: undefined,
      writes: [{
        update: {
          name: fs.docName(path),
          fields: encodeFields({
            uid, windowStart, shard,
            counts: { ...counts, [type]: previous + 1 },
            updatedAt: now.toISOString(),
          }),
        },
        updateMask: { fieldPaths: ["uid", "windowStart", "shard", "counts", "updatedAt"] },
        ...(docs[0] ? {} : { currentDocument: { exists: false } }),
      }],
    };
  });
}
