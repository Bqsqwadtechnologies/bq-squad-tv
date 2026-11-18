import { ApiError, type Firestore } from "./firebase-admin";

export type PlatformRole = "viewer" | "producer" | "provider";
export type AdminModule =
  | "overview" | "users" | "roles" | "producers" | "channels" | "content"
  | "pricing" | "wallets" | "payments" | "payouts" | "ads" | "notifications"
  | "moderation" | "security" | "system" | "providers" | "support" | "pages";

export type PlatformAccess = {
  roles: PlatformRole[];
  isZillionaireOwner: boolean;
  adminModules: AdminModule[];
  producerPlanActive: boolean;
  emailVerified: boolean;
  providerId?: string;
};

const ADMIN_MODULES: AdminModule[] = [
  "overview", "users", "roles", "producers", "channels", "content", "pricing",
  "wallets", "payments", "payouts", "ads", "notifications", "moderation",
  "security", "system", "providers", "support", "pages",
];

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
  const configuredScopes = stringArray(user?.["adminModules"])
    .filter((scope): scope is AdminModule => ADMIN_MODULES.includes(scope as AdminModule));
  return {
    roles,
    isZillionaireOwner,
    adminModules: isZillionaireOwner ? ADMIN_MODULES : [...new Set(configuredScopes)],
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

export async function requireAdminModule(
  fs: Firestore,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
  module: AdminModule,
): Promise<PlatformAccess> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  if (!access.isZillionaireOwner && !access.adminModules.includes(module)) {
    throw new ApiError(403, "ADMIN_SCOPE_REQUIRED", "This account does not have permission to access this section.");
  }
  return access;
}

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
    return { ...access, providerId: targetProviderId || "admin-owner" };
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
