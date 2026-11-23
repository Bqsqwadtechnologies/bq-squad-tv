import { ApiError, type Firestore } from "./firebase-admin";
import { requireChannelPermission } from "./channel-access";
import { resolvePlatformAccess } from "./roles";

export async function requireAuthorizedChannelUpload(
  fs: Firestore,
  channelId: string,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
): Promise<void> {
  const channel = await fs.getDoc("channels/" + channelId);
  if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
  const ownerUid = channel["ownerUid"];
  // Legacy Zillionaire-created live channels were stamped with the owner UID
  // despite being platform channels. Do not require a personal producer record.
  const platformOwned =
    ownerUid === "platform" ||
    (channel["type"] === "platform" && channel["deliveryMode"] === "live_hls");
  if (platformOwned) {
    const access = await resolvePlatformAccess(
      fs,
      user.uid,
      user.email,
      user.customClaims,
      user.emailVerified === true,
    );
    if (
      !access.isZillionaireOwner &&
      !access.adminModules.includes("content") &&
      !access.adminModules.includes("channels") &&
      !access.adminModules.includes("video")
    ) {
      throw new ApiError(
        403,
        "ZILLIONAIRE_SCOPE_REQUIRED",
        "This account is not authorised to upload to platform channels.",
      );
    }
    return;
  }
  if (typeof ownerUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) {
    throw new ApiError(409, "CHANNEL_OWNER_INVALID", "This channel does not have a valid owner.");
  }
  const producer = await fs.getDoc("producers/" + ownerUid);
  if (producer?.["planStatus"] !== "ACTIVE" || producer["verificationStatus"] !== "APPROVED") {
    throw new ApiError(
      403,
      "PRODUCER_VERIFICATION_REQUIRED",
      "The channel owner must have an active, verified producer account before uploads are accepted.",
    );
  }

  // A legacy producer approval flag is not sufficient: publishing requires the
  // current KYC case itself to have reached the approved state.
  const kycProfile = await fs.getDoc("kycProfiles/" + ownerUid);
  if (kycProfile?.["kycStatus"] !== "approved") {
    throw new ApiError(
      403,
      "KYC_NOT_APPROVED",
      "Complete identity verification and wait for approval before uploading or publishing content.",
    );
  }

  await requireChannelPermission(fs, channelId, user.uid, "video.upload");
}


/**
 * Resolve the hidden platform library channel used by the Zillionaire upload
 * studio. Owners and explicitly delegated content/video/channel operators can
 * upload without selecting a broadcast channel. Producer uploads must still
 * provide one of their own authorised channels.
 */
export async function ensurePlatformLibraryChannel(
  fs: Firestore,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
): Promise<string> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  const canManagePlatformContent =
    access.isZillionaireOwner ||
    access.zillionaireModules.includes("content") ||
    access.zillionaireModules.includes("channels") ||
    access.zillionaireModules.includes("video");
  if (!canManagePlatformContent) {
    throw new ApiError(
      403,
      "ZILLIONAIRE_SCOPE_REQUIRED",
      "Only authorised platform content operators can upload to the BQ SQWAD TV library.",
    );
  }

  const channelId = "bq_sqwad_library";
  const path = "channels/" + channelId;
  const existing = await fs.getDoc(path);
  if (existing) {
    if (existing["ownerUid"] !== "platform" || existing["isSystemLibrary"] !== true) {
      throw new ApiError(
        409,
        "PLATFORM_LIBRARY_CHANNEL_CONFLICT",
        "The platform media library channel is not configured safely.",
      );
    }
    return channelId;
  }

  const now = new Date().toISOString();
  const libraryChannel = {
    channelId,
    slug: "bq-sqwad-library",
    title: "BQ SQWAD TV Media Library",
    name: "BQ SQWAD TV Media Library",
    description: "Private internal catalogue channel for platform-owned movies, videos and series episodes.",
    ownerUid: "platform",
    createdBy: user.uid,
    type: "platform",
    channelType: "on_demand",
    category: "library",
    deliveryMode: "bq_hosted",
    status: "ACTIVE",
    published: false,
    isSystemLibrary: true,
    visibility: "private",
    currency: "NGN",
    ratePerMinuteMinor: 0,
    adultOnly: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await fs.setDoc(path, libraryChannel, { mustNotExist: true });
  } catch (error) {
    // A concurrent first upload may have created the same reserved document.
    const raced = await fs.getDoc(path);
    if (!raced || raced["ownerUid"] !== "platform" || raced["isSystemLibrary"] !== true) {
      throw error;
    }
  }
  return channelId;
}
