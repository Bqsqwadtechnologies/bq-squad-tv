import crypto from "node:crypto";
import { ApiError, Firestore } from "./firebase-admin";
import { resolvePlatformAccess } from "./roles";

export type PreviewTargetType = "asset" | "channel";

export interface PreviewGrantPayload {
  targetType: PreviewTargetType;
  targetId: string;
  granteeUid: string;
  role: "producer" | "provider" | "operator" | "owner";
  exp: number; // Unix timestamp in seconds
  iat?: number;
  isPreview: true;
}

function getPreviewSecret(): string {
  const secret = process.env["SESSION_SECRET"] || process.env["WEB_SESSION_SECRET"];
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new ApiError(500, "MISSING_PREVIEW_SECRET", "Preview signing secret is not configured.");
    }
    return "bqsqwad-preview-grant-secret-default";
  }
  return secret;
}

export function generatePreviewToken(
  payload: PreviewGrantPayload,
  customSecret?: string
): string {
  const secret = customSecret || getPreviewSecret();
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `prev_${payloadB64}.${sig}`;
}

export function verifyPreviewToken(
  token: string,
  customSecret?: string
): PreviewGrantPayload {
  if (!token || !token.startsWith("prev_")) {
    throw new ApiError(401, "INVALID_PREVIEW_TOKEN", "Malformed preview token.");
  }
  const body = token.slice("prev_".length);
  const parts = body.split(".");
  if (parts.length !== 2) {
    throw new ApiError(401, "INVALID_PREVIEW_TOKEN", "Invalid preview token structure.");
  }
  const [payloadB64, sig] = parts;
  const secret = customSecret || getPreviewSecret();
  const expectedSig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new ApiError(401, "INVALID_PREVIEW_TOKEN", "Invalid preview token signature.");
  }

  let payload: PreviewGrantPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "INVALID_PREVIEW_TOKEN", "Cannot decode preview grant token.");
  }

  if (!payload.isPreview || !payload.targetId || !payload.exp) {
    throw new ApiError(401, "INVALID_PREVIEW_TOKEN", "Invalid preview token payload.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) {
    throw new ApiError(403, "PREVIEW_EXPIRED", "This private preview link has expired.");
  }

  return payload;
}

/**
 * Creates a short-lived cryptographically signed private preview grant (Rule N27).
 * Ensures caller is either owner of the title/channel, authorized partner, or platform operator.
 */
export async function createPrivatePreviewGrant(
  fs: Firestore,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
  targetType: PreviewTargetType,
  targetId: string,
): Promise<{ previewToken: string; expiresAt: string; streamUrl?: string; previewPath: string }> {
  let isAuthorized = false;
  let role: "producer" | "provider" | "operator" | "owner" = "producer";
  let streamUrl = "";
  let previewPath = "";

  if (targetType === "asset") {
    const asset = await fs.getDoc(`contentAssets/${targetId}`);
    if (!asset) {
      throw new ApiError(404, "ASSET_NOT_FOUND", "Content title not found.");
    }
    const ownerUid = String(asset["ownerUid"] || asset["producerUid"] || "");
    if (ownerUid === user.uid) {
      isAuthorized = true;
      role = "producer";
    }
    streamUrl = String(asset["hlsMasterUrl"] || asset["masterPlaylistUrl"] || asset["streamUrl"] || "");
    previewPath = `/content/${targetId}?preview=true`;
  } else {
    const channel = await fs.getDoc(`channels/${targetId}`);
    if (!channel) {
      throw new ApiError(404, "CHANNEL_NOT_FOUND", "Channel not found.");
    }
    const partnerId = String(channel["partnerId"] || channel["ownerUid"] || "");
    const allowedEmails = Array.isArray(channel["allowedEmails"]) ? (channel["allowedEmails"] as string[]) : [];
    if (partnerId === user.uid || (user.email && allowedEmails.includes(user.email))) {
      isAuthorized = true;
      role = "provider";
    }
    streamUrl = String(channel["streamUrl"] || "");
    const slug = String(channel["slug"] || targetId);
    previewPath = `/channels/${slug}?preview=true`;
  }

  // Resolve platform permissions from the same verified identity and module
  // grants used by the Zillionaire dashboard. Do not depend on a duplicate,
  // optional consoleAccounts document to recognise the real platform owner.
  if (!isAuthorized) {
    const access = await resolvePlatformAccess(
      fs,
      user.uid,
      user.email,
      user.customClaims,
      user.emailVerified === true,
    );
    if (
      access.isZillionaireOwner ||
      access.zillionaireModules.includes("content") ||
      access.zillionaireModules.includes("video")
    ) {
      isAuthorized = true;
      role = access.isZillionaireOwner ? "owner" : "operator";
    }
  }

  if (!isAuthorized) {
    throw new ApiError(403, "UNAUTHORIZED_PREVIEW", "You do not own this content and cannot preview it.");
  }
  if (!streamUrl) {
    throw new ApiError(
      409,
      "PREVIEW_NOT_READY",
      "This video is still processing. A private preview will be available when its playback manifest is ready.",
    );
  }

  // Short-lived: 15 minutes TTL
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 15 * 60;
  const expiresAt = new Date(exp * 1000).toISOString();

  const payload: PreviewGrantPayload = {
    targetType,
    targetId,
    granteeUid: user.uid,
    role,
    exp,
    iat: now,
    isPreview: true,
  };

  const previewToken = generatePreviewToken(payload);

  return {
    previewToken,
    expiresAt,
    streamUrl,
    previewPath: `${previewPath}&previewToken=${encodeURIComponent(previewToken)}`,
  };
}
