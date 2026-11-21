import { requireZillionaireUnlock } from "./zillionaire-access";
import { ApiError, Firestore } from "./firebase-admin";
import { requireUser } from "./api";
import { type VerifiedUser } from "./firebase-auth";
import {
  resolvePlatformAccess,
  requirePlatformRole,
  requireZillionaireModule,
  requireProviderAccess,
  type PlatformAccess,
  type ZillionaireModule,
} from "./roles";
import { requireVideoWorker } from "./video-worker-auth";
import {
  getChannelAccess,
  hasChannelPermission,
  type ChannelAccess,
  CHANNEL_ROLE_TEMPLATES,
} from "./channel-access";

export type ViewerContext = {
  user: VerifiedUser;
  fs: Firestore;
  access: PlatformAccess;
};

export type ZillionaireContext = ViewerContext & {
  module: ZillionaireModule;
};

export type ProducerContext = ViewerContext & {
  producerUid: string;
};

export type ProviderContext = ViewerContext & {
  providerId: string;
};

export type WorkerContext = {
  workerId: string;
  fs: Firestore;
};

export type ChannelPermissionContext = {
  channelId: string;
  uid: string;
  role: string;
  permissions: string[];
  user?: VerifiedUser;
  fs: Firestore;
  access?: PlatformAccess;
  isPublicReadOnly?: boolean;
};

/**
 * Authenticated viewer with an active, unbanned account and a verified session.
 */
export async function requireViewer(
  request: Request,
  existingFs?: Firestore,
): Promise<ViewerContext> {
  const user = await requireUser(request);
  const fs = existingFs || (await Firestore.create());
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  return { user, fs, access };
}

/** Identity-protected viewer. Email verification is mandatory before wallet, playback, or account-data access. */
export async function requireVerifiedViewer(
  request: Request,
  existingFs?: Firestore,
): Promise<ViewerContext> {
  const ctx = await requireViewer(request, existingFs);
  if (!ctx.user.emailVerified) {
    throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before continuing.");
  }
  return ctx;
}

/**
 * Primary Zillionaire owner or delegated module member.
 */
export async function requireZillionaire(
  request: Request,
  module: ZillionaireModule = "overview",
  existingFs?: Firestore,
): Promise<ZillionaireContext> {
  const ctx = await requireViewer(request, existingFs);
  const access = await requireZillionaireModule(ctx.fs, ctx.user, module);
  if (access.isZillionaireOwner) {
    await requireZillionaireUnlock(request, ctx.user.uid, ctx.fs);
  }
  return { ...ctx, module };
}

/**
 * Active producer with an active plan and approved verification.
 */
export async function requireProducer(
  request: Request,
  existingFs?: Firestore,
): Promise<ProducerContext> {
  const ctx = await requireViewer(request, existingFs);
  await requirePlatformRole(ctx.fs, ctx.user, "producer");
  return { ...ctx, producerUid: ctx.user.uid };
}

/**
 * Active provider user tied to a licensed channel provider organisation.
 */
export async function requireProvider(
  request: Request,
  targetProviderId?: string,
  existingFs?: Firestore,
): Promise<ProviderContext> {
  const ctx = await requireViewer(request, existingFs);
  const provAccess = await requireProviderAccess(ctx.fs, ctx.user, targetProviderId);
  return { ...ctx, access: provAccess, providerId: provAccess.providerId };
}

/**
 * Signed worker request (Modal / background maintenance tasks).
 */
export async function requireWorker(
  request: Request,
  existingFs?: Firestore,
): Promise<WorkerContext> {
  const fs = existingFs || (await Firestore.create());
  const workerId = await requireVideoWorker(request, fs);
  return { workerId, fs };
}

/**
 * Channel permission resolver:
 * - Public read if unauthenticated and reading a published channel.
 * - Producer who owns the channel or has delegated team membership.
 * - Provider if the channel belongs to their licensed provider agreement.
 * - Zillionaire owner or delegated channels module operator.
 */
export async function requireChannelPermission(
  request: Request,
  channelId: string,
  permission: string = "channel.read",
  existingFs?: Firestore,
): Promise<ChannelPermissionContext> {
  const fs = existingFs || (await Firestore.create());
  const channel =
    (await fs.getDoc(`channels/${channelId}`)) || (await fs.getDoc(`liveChannels/${channelId}`));

  if (!channel) {
    throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
  }

  // Check if public read request without auth header
  const authHeader = request.headers.get("authorization");
  if (!authHeader && (permission === "channel.read" || permission === "read")) {
    if (
      channel["status"] === "PUBLISHED" ||
      channel["active"] === true ||
      channel["published"] === true
    ) {
      return {
        channelId,
        uid: "public-viewer",
        role: "viewer",
        permissions: ["channel.read"],
        fs,
        isPublicReadOnly: true,
      };
    }
  }

  // Authenticated path
  const { user, access } = await requireViewer(request, fs);

  // 1. Zillionaire owner or channels module delegate
  if (access.isZillionaireOwner || access.zillionaireModules.includes("channels")) {
    return {
      channelId,
      uid: user.uid,
      role: "owner",
      permissions: [...CHANNEL_ROLE_TEMPLATES.owner],
      user,
      fs,
      access,
    };
  }

  // 2. Provider representative
  if (access.roles.includes("provider") && access.providerId) {
    if (channel["providerId"] === access.providerId) {
      return {
        channelId,
        uid: user.uid,
        role: "manager",
        permissions: [...CHANNEL_ROLE_TEMPLATES.manager],
        user,
        fs,
        access,
      };
    }
  }

  // 3. Producer / Channel team member
  const channelAccess: ChannelAccess = await getChannelAccess(fs, channelId, user.uid);
  if (!hasChannelPermission(channelAccess, permission)) {
    throw new ApiError(
      403,
      "CHANNEL_PERMISSION_REQUIRED",
      "You do not have permission to perform this action on the channel.",
    );
  }

  return {
    ...channelAccess,
    user,
    fs,
    access,
  };
}

/**
 * Enforces that a producer or provider has an approved identity verification (KYC) record on file.
 * Throws 403 KYC_NOT_APPROVED if unsubmitted, pending, needs_changes, or rejected.
 */
export async function requireApprovedKyc(
  fs: Firestore,
  uid: string,
  role: "producer" | "provider" = "producer",
): Promise<void> {
  const kycDoc = await fs.getDoc(`kycProfiles/${uid}`);
  const status = (kycDoc?.["kycStatus"] || "unsubmitted") as string;
  if (status !== "approved") {
    throw new ApiError(
      403,
      "KYC_NOT_APPROVED",
      `Your identity verification is currently ${status}. Approved KYC is required before accessing console features or requesting payouts.`,
    );
  }
}

/**
 * Producer with verified platform role AND approved KYC.
 */
export async function requireApprovedProducer(
  request: Request,
  existingFs?: Firestore,
): Promise<ProducerContext> {
  const ctx = await requireProducer(request, existingFs);
  await requireApprovedKyc(ctx.fs, ctx.user.uid, "producer");
  return ctx;
}

/**
 * Provider with verified provider role AND approved KYC.
 */
export async function requireApprovedProvider(
  request: Request,
  targetProviderId?: string,
  existingFs?: Firestore,
): Promise<ProviderContext> {
  const ctx = await requireProvider(request, targetProviderId, existingFs);
  await requireApprovedKyc(ctx.fs, ctx.user.uid, "provider");
  return ctx;
}
