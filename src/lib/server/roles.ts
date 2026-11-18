import { ApiError, type Firestore } from "./firebase-admin";

export type PlatformRole = "viewer" | "producer" | "provider";

export type ZillionaireModule =
  | "overview" | "users" | "roles" | "producers" | "channels" | "content"
  | "video" | "storage" | "delivery" | "pricing" | "wallets" | "payments"
  | "payouts" | "ads" | "notifications" | "moderation" | "security" | "reports"
  | "settings" | "system" | "providers" | "support" | "pages";

// Backward-compatible type alias during migration
export type AdminModule = ZillionaireModule;

export type PlatformAccess = {
  roles: PlatformRole[];
  isZillionaireOwner: boolean;
  zillionaireModules: ZillionaireModule[];
  adminModules: ZillionaireModule[]; // Backward-compat alias
  producerPlanActive: boolean;
  emailVerified: boolean;
  providerId?: string;
};

export const ZILLIONAIRE_MODULES: ZillionaireModule[] = [
  "overview", "users", "roles", "producers", "channels", "content",
  "video", "storage", "delivery", "pricing", "wallets", "payments",
  "payouts", "ads", "notifications", "moderation", "security", "reports",
  "settings", "system", "providers", "support", "pages",
];

// Backward-compatible constant alias
export const ADMIN_MODULES = ZILLIONAIRE_MODULES;

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export async function resolvePlatformAccess(
  fs: Firestore,
  uid: string,
  email: string | null,
  customClaims: Record<string, unknown> = {},
  emailVerified = false,
): Promise<PlatformAccess> {
  const [user, producer, providerUser] = await Promise.all([
    fs.getDoc("users/" + uid),
    fs.getDoc("producers/" + uid),
    fs.getDoc("providerUsers/" + uid),
  ]);
  // The app's six-digit OTP flow records verification server-side. Accept that
  // proof only while it remains bound to the exact current Firebase email;
  // a changed account email invalidates the app-level verification.
  const appEmailVerified = Boolean(
    user?.["appEmailVerified"] === true &&
    typeof user["email"] === "string" &&
    email && user["email"].trim().toLowerCase() === email.trim().toLowerCase(),
  );
  const effectiveEmailVerified = emailVerified || appEmailVerified;
  // Strictly ZILLIONAIRE_EMAIL only - no ADMIN_EMAIL fallback
  const configuredZillionaireEmail = process.env["ZILLIONAIRE_EMAIL"]?.trim().toLowerCase();
  const isZillionaireOwner = Boolean(
    effectiveEmailVerified && configuredZillionaireEmail && email?.trim().toLowerCase() === configuredZillionaireEmail,
  );
  const storedRoles = stringArray(user?.["roleTags"]);
  const claimedRoles = stringArray(customClaims["roleTags"]);
  const producerPlanActive = producer?.["planStatus"] === "ACTIVE";
  const producerVerified = producer?.["verificationStatus"] === "APPROVED";
  const roles: PlatformRole[] = ["viewer"];
  if (producerPlanActive && producerVerified && (storedRoles.includes("producer") || claimedRoles.includes("producer") || customClaims["producer"] === true)) {
    roles.push("producer");
  }

  // Provider role check
  let resolvedProviderId: string | undefined = undefined;
  const providerActive = providerUser?.["status"] === "ACTIVE" || providerUser?.["active"] === true;
  if (providerActive && typeof providerUser?.["providerId"] === "string") {
    roles.push("provider");
    resolvedProviderId = providerUser["providerId"] as string;
  } else if (storedRoles.includes("provider") || claimedRoles.includes("provider") || customClaims["provider"] === true) {
    if (typeof user?.["providerId"] === "string") {
      roles.push("provider");
      resolvedProviderId = user["providerId"] as string;
    }
  }

  // The Zillionaire identity is the only top-level control identity.
  // Delegated access is expressed as individual module permissions, not an administrator role.
  // Delegated module permissions live in Firestore so the protected owner can
  // revoke them immediately; stale Firebase custom claims must not preserve access.
  // Reads accept both zillionaireModules and legacy adminModules for one release.
  let rawModules = stringArray(user?.["zillionaireModules"]);
  if (!rawModules.length && Array.isArray(user?.["adminModules"])) {
    rawModules = stringArray(user?.["adminModules"]);
    if (rawModules.length > 0) {
      console.warn(`[LEGACY_ADMIN_MODULES] User ${uid} used legacy adminModules; migration recommended.`);
    }
  }
  const configuredScopes = rawModules
    .filter((scope): scope is ZillionaireModule => ZILLIONAIRE_MODULES.includes(scope as ZillionaireModule));
  const activeModules = isZillionaireOwner ? ZILLIONAIRE_MODULES : [...new Set(configuredScopes)];

  return {
    roles,
    isZillionaireOwner,
    zillionaireModules: activeModules,
    adminModules: activeModules,
    producerPlanActive,
    emailVerified: effectiveEmailVerified,
    ...(resolvedProviderId ? { providerId: resolvedProviderId } : {}),
  };
}

export async function requirePlatformRole(
  fs: Firestore,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
  role: PlatformRole,
): Promise<PlatformAccess> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  if (!access.roles.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "This account does not have the required platform role.");
  }
  return access;
}

export async function requireZillionaireModule(
  fs: Firestore,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
  module: ZillionaireModule,
): Promise<PlatformAccess> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  if (!access.isZillionaireOwner && !access.zillionaireModules.includes(module)) {
    throw new ApiError(403, "ZILLIONAIRE_SCOPE_REQUIRED", "This account does not have permission to access this section.");
  }
  return access;
}

// Backward-compatible function alias
export const requireAdminModule = requireZillionaireModule;

export async function requireProviderAccess(
  fs: Firestore,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
  targetProviderId?: string,
): Promise<PlatformAccess & { providerId: string }> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  if (access.isZillionaireOwner) {
    return { ...access, providerId: targetProviderId || "zillionaire-owner" };
  }
  if (!access.roles.includes("provider") || !access.providerId) {
    throw new ApiError(403, "PROVIDER_ROLE_REQUIRED", "Access restricted to licensed channel provider representatives.");
  }
  if (targetProviderId && access.providerId !== targetProviderId) {
    throw new ApiError(403, "PROVIDER_ISOLATION_VIOLATION", "You can only access data belonging to your own provider organisation.");
  }
  return access as PlatformAccess & { providerId: string };
}

export function isProtectedZillionaire(
  targetEmail: string | null,
  configuredZillionaireEmail = process.env["ZILLIONAIRE_EMAIL"],
): boolean {
  return Boolean(
    configuredZillionaireEmail?.trim() &&
    targetEmail?.trim().toLowerCase() === configuredZillionaireEmail.trim().toLowerCase(),
  );
}

export function assertNotProtectedZillionaire(
  targetEmail: string | null,
  operation: "demote" | "suspend" | "delete" | "remove",
): void {
  if (isProtectedZillionaire(targetEmail)) {
    throw new ApiError(403, "PROTECTED_ZILLIONAIRE_OWNER", `The Zillionaire owner cannot be ${operation === "suspend" ? "suspended" : operation === "demote" ? "demoted" : operation === "delete" ? "deleted" : "removed"}.`);
  }
}
