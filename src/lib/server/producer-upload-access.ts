import { ApiError, type Firestore } from "./firebase-admin";
import { requireChannelPermission } from "./channel-access";
import { resolvePlatformAccess } from "./roles";

export async function requireAuthorizedChannelUpload(
  fs: Firestore,
  channelId: string,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
): Promise<void> {
  const channel = await fs.getDoc("channels/" + channelId);
  if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
  const ownerUid = channel["ownerUid"];
  if (ownerUid === "platform") {
    const access = await resolvePlatformAccess(
      fs,
      user.uid,
      user.email,
      user.customClaims,
      user.emailVerified === true,
    );
    if (!access.isZillionaireOwner && !access.adminModules.includes("content") && !access.adminModules.includes("channels")) {
      throw new ApiError(403, "ZILLIONAIRE_SCOPE_REQUIRED", "This account is not authorised to upload to platform channels.");
    }
    return;
  }
  if (typeof ownerUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(ownerUid)) {
    throw new ApiError(409, "CHANNEL_OWNER_INVALID", "This channel does not have a valid owner.");
  }
  const producer = await fs.getDoc("producers/" + ownerUid);
  if (producer?.["planStatus"] !== "ACTIVE" || producer["verificationStatus"] !== "APPROVED") {
    throw new ApiError(403, "PRODUCER_VERIFICATION_REQUIRED", "The channel owner must have an active, verified producer account before uploads are accepted.");
  }
  await requireChannelPermission(fs, channelId, user.uid, "video.upload");
}
