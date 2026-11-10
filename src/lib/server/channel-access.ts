import { ApiError, type Firestore } from "./firebase-admin";

export type ChannelRole =
  | "owner" | "co-owner" | "manager" | "scheduler" | "uploader"
  | "moderator" | "analyst" | "finance";

export const CHANNEL_ROLE_TEMPLATES: Record<ChannelRole, readonly string[]> = {
  owner: [
    "channel.settings", "team.manage", "video.upload", "video.delete", "schedule.write",
    "schedule.publish", "analytics.read", "earnings.read", "payout.write", "ads.manage",
    "chat.moderate", "channel.delete", "ownership.transfer",
  ],
  "co-owner": [
    "channel.settings", "team.manage", "video.upload", "video.delete", "schedule.write",
    "schedule.publish", "analytics.read", "earnings.read", "payout.write", "ads.manage",
    "chat.moderate",
  ],
  manager: [
    "channel.settings", "team.manage", "video.upload", "video.delete", "schedule.write",
    "schedule.publish", "analytics.read", "ads.manage", "chat.moderate",
  ],
  scheduler: ["schedule.write", "analytics.read"],
  uploader: ["video.upload", "analytics.read.own"],
  moderator: ["chat.moderate"],
  analyst: ["analytics.read"],
  finance: ["analytics.read", "earnings.read", "payout.write"],
};

export type ChannelAccess = {
  channelId: string;
  uid: string;
  role: ChannelRole;
  permissions: string[];
};

export function hasChannelPermission(access: Pick<ChannelAccess, "role" | "permissions">, permission: string): boolean {
  if (access.role === "owner") return true;
  return access.permissions.includes(permission);
}

export async function getChannelAccess(
  fs: Firestore,
  channelId: string,
  uid: string,
): Promise<ChannelAccess> {
  const [channel, member] = await Promise.all([
    fs.getDoc(`channels/${channelId}`),
    fs.getDoc(`channels/${channelId}/members/${uid}`),
  ]);
  if (!channel) throw new ApiError(404, "CHANNEL_NOT_FOUND", "This channel does not exist.");
  if (channel["ownerUid"] === uid) {
    return { channelId, uid, role: "owner", permissions: [...CHANNEL_ROLE_TEMPLATES.owner] };
  }
  if (!member || member["status"] !== "ACTIVE") {
    throw new ApiError(403, "CHANNEL_ACCESS_REQUIRED", "You are not an active member of this channel.");
  }
  const expiresAt = member["expiresAt"];
  if (typeof expiresAt === "string" && Date.parse(expiresAt) <= Date.now()) {
    throw new ApiError(403, "CHANNEL_ACCESS_EXPIRED", "Your access to this channel has expired.");
  }
  const role = member["role"];
  if (typeof role !== "string" || !(role in CHANNEL_ROLE_TEMPLATES)) {
    throw new ApiError(403, "CHANNEL_ROLE_INVALID", "This channel membership has an invalid role.");
  }
  const template = CHANNEL_ROLE_TEMPLATES[role as ChannelRole];
  const custom = Array.isArray(member["permissions"])
    ? member["permissions"].filter((item): item is string => typeof item === "string")
    : [...template];
  return { channelId, uid, role: role as ChannelRole, permissions: custom };
}

export async function requireChannelPermission(
  fs: Firestore,
  channelId: string,
  uid: string,
  permission: string,
): Promise<ChannelAccess> {
  const access = await getChannelAccess(fs, channelId, uid);
  if (!hasChannelPermission(access, permission)) {
    throw new ApiError(403, "CHANNEL_PERMISSION_REQUIRED", "You do not have permission to perform this action on the channel.");
  }
  return access;
}
