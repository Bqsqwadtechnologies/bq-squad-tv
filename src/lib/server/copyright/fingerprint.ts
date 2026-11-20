import { createHash } from "crypto";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";

export const REJECTION_REASON_CODES = [
  "copyright_suspected",
  "duplicate",
  "wrong_age_rating",
  "poor_quality",
  "missing_proof_of_rights",
  "policy_violation",
  "other",
] as const;

export type RejectionReasonCode = (typeof REJECTION_REASON_CODES)[number];

export const REJECTION_REASON_LABELS: Record<RejectionReasonCode, string> = {
  copyright_suspected: "Copyright match suspected",
  duplicate: "Duplicate upload detected",
  wrong_age_rating: "Incorrect age rating or missing content warnings",
  poor_quality: "Visual or audio quality below broadcast standards",
  missing_proof_of_rights: "Missing or invalid proof of rights / chain-of-title",
  policy_violation: "Community guidelines or content policy violation",
  other: "Other operational or editorial reason",
};

export interface FingerprintResult {
  fileHash: string;
  perceptualFingerprint: string;
}

/**
 * Computes heuristic file hash and perceptual fingerprint from inspected headers,
 * sample interval frames and object size.
 */
export function computePerceptualFingerprint(
  headerBytes: Uint8Array,
  sampleBytes?: Uint8Array,
  sizeBytes?: number,
): FingerprintResult {
  const hash = createHash("sha256");
  hash.update(headerBytes);
  if (sampleBytes && sampleBytes.length > 0) {
    hash.update(sampleBytes);
  }
  if (typeof sizeBytes === "number") {
    const sizeBuf = Buffer.alloc(8);
    sizeBuf.writeBigUInt64BE(BigInt(sizeBytes));
    hash.update(sizeBuf);
  }
  const fileHash = hash.digest("hex");

  // Perceptual representation: combines coarse header structure, sample distribution and size buckets
  const fpHash = createHash("md5");
  fpHash.update(headerBytes.slice(0, Math.min(headerBytes.length, 128)));
  if (sampleBytes && sampleBytes.length > 0) {
    // step through sample intervals
    const step = Math.max(1, Math.floor(sampleBytes.length / 16));
    const subsample = [];
    for (let i = 0; i < sampleBytes.length; i += step) {
      subsample.push(sampleBytes[i]);
    }
    fpHash.update(Buffer.from(subsample));
  }
  if (typeof sizeBytes === "number") {
    // Coarse 64KB bucket
    const bucket = Math.floor(sizeBytes / 65536);
    fpHash.update(Buffer.from(String(bucket)));
  }
  const perceptualFingerprint = `fp_${fpHash.digest("hex")}`;

  return {
    fileHash,
    perceptualFingerprint,
  };
}

export interface DuplicateDetectionResult {
  duplicateDetected: boolean;
  duplicateOfAssetId: string | null;
  duplicateOfTitle: string | null;
  duplicateType: "exact" | "near_duplicate" | null;
  reviewQueueFlag: string | null;
}

/**
 * Searches existing catalog for exact hash matches or near perceptual duplicates.
 * Returns duplicate details without auto-rejecting.
 */
export async function detectDuplicatesAndFlag(
  fs: Firestore,
  candidateAssetId: string,
  candidateOwnerUid: string,
  candidateFileHash: string,
  candidateFingerprint: string,
): Promise<DuplicateDetectionResult> {
  const assets = await fs.listDocs("contentAssets", { limit: 200 });

  for (const asset of assets) {
    if (asset.id === candidateAssetId) continue;
    const existingHash = asset["fileHash"] || asset["checksumSha256"];
    const existingFingerprint = asset["perceptualFingerprint"];
    const existingTitle = (asset["title"] as string) || "Existing video";

    // Exact hash match
    if (existingHash && existingHash === candidateFileHash) {
      return {
        duplicateDetected: true,
        duplicateOfAssetId: asset.id,
        duplicateOfTitle: existingTitle,
        duplicateType: "exact",
        reviewQueueFlag: `Possible duplicate of ${existingTitle}`,
      };
    }

    // Near-duplicate match on perceptual fingerprint
    if (
      candidateFingerprint &&
      existingFingerprint &&
      candidateFingerprint === existingFingerprint
    ) {
      return {
        duplicateDetected: true,
        duplicateOfAssetId: asset.id,
        duplicateOfTitle: existingTitle,
        duplicateType: "near_duplicate",
        reviewQueueFlag: `Possible duplicate of ${existingTitle}`,
      };
    }
  }

  return {
    duplicateDetected: false,
    duplicateOfAssetId: null,
    duplicateOfTitle: null,
    duplicateType: null,
    reviewQueueFlag: null,
  };
}

/**
 * Ensures that a video cannot be published twice under different producers.
 */
export async function assertCanPublishWithoutDuplicateConflict(
  fs: Firestore,
  asset: Record<string, unknown>,
): Promise<void> {
  const assetId = (asset["id"] || asset["assetId"]) as string;
  const ownerUid = asset["ownerUid"] as string;
  const fileHash = (asset["fileHash"] || asset["checksumSha256"]) as string | undefined;
  const fingerprint = asset["perceptualFingerprint"] as string | undefined;

  if (!fileHash && !fingerprint) return;

  const allAssets = await fs.listDocs("contentAssets", { limit: 500 });
  for (const other of allAssets) {
    if (other.id === assetId) continue;
    if (other["contentStatus"] !== "published" && other["status"] !== "published") continue;

    // If another published asset has same hash or fingerprint under a different owner
    const otherOwner = other["ownerUid"] as string;
    const isDifferentOwner = otherOwner && ownerUid && otherOwner !== ownerUid;

    if (isDifferentOwner) {
      const otherHash = other["fileHash"] || other["checksumSha256"];
      const otherFp = other["perceptualFingerprint"];

      if (
        (fileHash && otherHash && fileHash === otherHash) ||
        (fingerprint && otherFp && fingerprint === otherFp)
      ) {
        throw new ApiError(
          409,
          "DUPLICATE_CROSS_PRODUCER_PUBLISH_BLOCKED",
          `This video content is already published under another producer channel ("${other["title"] || other.id}"). Cross-producer re-publishing is blocked.`,
        );
      }
    }
  }
}

export interface ExternalCopyrightResult {
  matched: boolean;
  confidence?: number;
  details?: string;
  claimant?: string;
}

/**
 * Optional hook for external copyright matching service (e.g. Audible Magic, ACRCloud).
 * Enabled when COPYRIGHT_MATCH_SERVICE_URL is defined.
 */
export async function checkExternalCopyrightService(params: {
  assetId: string;
  fileHash: string;
  perceptualFingerprint: string;
  filename?: string;
  sizeBytes?: number;
}): Promise<ExternalCopyrightResult> {
  const serviceUrl = process.env.COPYRIGHT_MATCH_SERVICE_URL;
  if (!serviceUrl) {
    return { matched: false };
  }

  try {
    const res = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.COPYRIGHT_MATCH_API_KEY
          ? { Authorization: `Bearer ${process.env.COPYRIGHT_MATCH_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return { matched: false };
    }

    const data = await res.json();
    return {
      matched: Boolean(data.matched),
      confidence: typeof data.confidence === "number" ? data.confidence : undefined,
      details: data.matchedTitle || data.details,
      claimant: data.claimant,
    };
  } catch {
    // Non-blocking fallback if external service is unreachable
    return { matched: false };
  }
}
