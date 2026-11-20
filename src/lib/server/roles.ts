import { ApiError, type Firestore } from "./firebase-admin";
import { recordAccessDenial } from "./access-denials";

export type PlatformRole = "viewer" | "producer" | "provider";

export type ZillionaireModule =
  | "overview"
  | "users"
  | "roles"
  | "producers"
  | "channels"
  | "content"
  | "video"
  | "storage"
  | "delivery"
  | "pricing"
  | "wallets"
  | "payments"
  | "payouts"
  | "ads"
  | "notifications"
  | "moderation"
  | "security"
  | "reports"
  | "settings"
  | "system"
  | "providers"
  | "support"
  | "pages"
  | "finance"
  | "catalog"
  | "live_approvals"
  | "rights_review";

// Backward-compatible type alias during migration
export type AdminModule = ZillionaireModule;

export type PlatformAccess = {
  roles: PlatformRole[];
  isZillionaireOwner: boolean;
  needsOwnerVerification: boolean;
  legacySecretWarning?: boolean;
  zillionaireModules: ZillionaireModule[];
  adminModules: ZillionaireModule[]; // Backward-compat alias
  producerPlanActive: boolean;
  emailVerified: boolean;
  providerId?: string;
};

export const ZILLIONAIRE_MODULES: ZillionaireModule[] = [
  "overview",
  "users",
  "roles",
  "producers",
  "channels",
  "content",
  "video",
  "storage",
  "delivery",
  "pricing",
  "wallets",
  "payments",
  "payouts",
  "ads",
  "notifications",
  "moderation",
  "security",
  "reports",
  "settings",
  "system",
  "providers",
  "support",
  "pages",
  "finance",
  "catalog",
  "live_approvals",
  "rights_review",
];

// Backward-compatible constant alias
export const ADMIN_MODULES = ZILLIONAIRE_MODULES;

export type OwnerEmailConfig = {
  email: string;
  isLegacySecret: boolean;
};

export function getOwnerEmailConfig(): OwnerEmailConfig {
  const zillionaireEmail = (process.env["ZILLIONAIRE_EMAIL"] || "").trim().toLowerCase();
  return {
    email: zillionaireEmail,
    isLegacySecret: false,
  };
}

export function getConfiguredOwnerEmail(): string {
  return getOwnerEmailConfig().email;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function hasModuleAccess(
  activeModules: readonly ZillionaireModule[],
  required: ZillionaireModule,
): boolean {
  if (activeModules.includes(required)) return true;
  if (required === "live_approvals" && (activeModules.includes("channels") || activeModules.includes("live_approvals"))) return true;
  if (required === "rights_review" && (activeModules.includes("content") || activeModules.includes("moderation") || activeModules.includes("rights_review"))) return true;
  // Module family aliases: finance covers payments, payouts, wallets; catalog covers content
  if (
    (required === "payments" || required === "payouts" || required === "wallets") &&
    activeModules.includes("finance")
  ) {
    return true;
  }
  if (
    required === "finance" &&
    (activeModules.includes("payments") ||
      activeModules.includes("payouts") ||
      activeModules.includes("wallets"))
  ) {
    return true;
  }
  if (required === "content" && activeModules.includes("catalog")) return true;
  if (required === "catalog" && activeModules.includes("content")) return true;
  return false;
}

export async function resolvePlatformAccess(
  fs: Firestore,
  uid: string,
  email: string | null,
  customClaims: Record<string, unknown> = {},
  emailVerified = false,
): Promise<PlatformAccess> {
  const roles: PlatformRole[] = ["viewer"];
  const user = await fs.getDoc("users/" + uid);
  const userDocEmail = typeof user?.["email"] === "string" ? (user["email"] as string) : null;
  const effectiveEmail = email || userDocEmail;

  // Verify email status from Firebase Auth claim or verified OTP proof recorded on user doc
  const isEmailVerified =
    emailVerified ||
    (Boolean(user?.["appEmailVerified"]) &&
      typeof user?.["email"] === "string" &&
      typeof effectiveEmail === "string" &&
      user["email"].trim().toLowerCase() === effectiveEmail.trim().toLowerCase());

  // Producer role resolution
  const storedRoles = stringArray(user?.["roleTags"]);
  const claimedProducer = Boolean(customClaims["producer"]) || storedRoles.includes("producer");
  const producer = claimedProducer ? await fs.getDoc("producers/" + uid) : null;
  const producerPlanActive = producer?.["planStatus"] === "ACTIVE";
  const producerVerified = producer?.["verificationStatus"] === "APPROVED";

  if (claimedProducer && producerPlanActive && producerVerified) {
    roles.push("producer");
  }

  // Provider representative resolution
  const providerRep = await fs.getDoc("providerUsers/" + uid);
  let providerId: string | undefined;
  if (
    providerRep &&
    providerRep["status"] === "ACTIVE" &&
    typeof providerRep["providerId"] === "string"
  ) {
    roles.push("provider");
    providerId = providerRep["providerId"];
  }

  // Zillionaire owner resolution
  // Strictly requires configured ZILLIONAIRE_EMAIL and verified email address
  const ownerConfig = getOwnerEmailConfig();
  const configuredOwnerEmail = ownerConfig.email;
  const normalizedUserEmail = (effectiveEmail || "").trim().toLowerCase();
  const isOwnerCandidate = Boolean(
    configuredOwnerEmail && normalizedUserEmail === configuredOwnerEmail,
  );
  const isZillionaireOwner = isOwnerCandidate && isEmailVerified;
  const needsOwnerVerification = isOwnerCandidate && !isEmailVerified;

  // The Zillionaire identity is the only top-level control identity.
  // Delegated access is expressed as individual module permissions, not an administrator role.
  // Delegated module permissions live in Firestore so the protected owner can
  // revoke them immediately; stale Firebase custom claims must not preserve access.
  // Reads accept both zillionaireModules and legacy adminModules for one release.
  let rawModules = stringArray(user?.["zillionaireModules"]);
  if (!rawModules.length && Array.isArray(user?.["adminModules"])) {
    rawModules = stringArray(user?.["adminModules"]);
    if (rawModules.length > 0) {
      console.warn(
        `[LEGACY_ADMIN_MODULES] User ${uid} used legacy adminModules; migration recommended.`,
      );
    }
  }
  const configuredScopes = rawModules.filter((scope): scope is ZillionaireModule =>
    ZILLIONAIRE_MODULES.includes(scope as ZillionaireModule),
  );
  const activeModules = isZillionaireOwner ? ZILLIONAIRE_MODULES : [...new Set(configuredScopes)];

  return {
    roles,
    isZillionaireOwner,
    legacySecretWarning: isZillionaireOwner && ownerConfig.isLegacySecret,
    needsOwnerVerification,
    zillionaireModules: activeModules,
    adminModules: activeModules, // Backward-compat alias
    producerPlanActive,
    emailVerified: isEmailVerified,
    ...(providerId ? { providerId } : {}),
  };
}

export function isProtectedZillionaire(email: string | null): boolean {
  if (!email) return false;
  const ownerConfig = getOwnerEmailConfig();
  const configuredOwnerEmail = ownerConfig.email;
  if (!configuredOwnerEmail) return false;
  return email.trim().toLowerCase() === configuredOwnerEmail;
}

export function assertNotProtectedZillionaire(email: string | null, action: string): void {
  if (isProtectedZillionaire(email)) {
    throw new ApiError(
      403,
      "OWNER_ACCOUNT_PROTECTED",
      `The protected platform-owner account cannot be ${action.endsWith("e") ? action + "d" : action + "ed"}.`,
    );
  }
}

export async function requirePlatformRole(
  fs: Firestore,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
  role: PlatformRole,
): Promise<PlatformAccess> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  if (access.isZillionaireOwner) {
    return access;
  }
  if (!access.roles.includes(role)) {
    await recordAccessDenial(fs, {
      actorUid: user.uid,
      actorRoleClass: access.roles.includes("producer")
        ? "producer"
        : access.roles.includes("provider")
          ? "provider"
          : "viewer",
      requiredRole: role,
      resourceKind: "platform_role",
      reasonCode: "CROSS_ROLE_DENIED",
    }).catch(() => undefined);
    throw new ApiError(403, "FORBIDDEN", "This account does not have the required platform role.");
  }
  return access;
}

export async function requireZillionaireModule(
  fs: Firestore,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
  module: ZillionaireModule,
): Promise<PlatformAccess> {
  const access = await resolvePlatformAccess(
    fs,
    user.uid,
    user.email,
    user.customClaims,
    user.emailVerified === true,
  );
  if (!access.isZillionaireOwner && !hasModuleAccess(access.zillionaireModules, module)) {
    await recordAccessDenial(fs, {
      actorUid: user.uid,
      actorRoleClass: access.roles.includes("producer")
        ? "producer"
        : access.roles.includes("provider")
          ? "provider"
          : "viewer",
      requiredRole: `module:${module}`,
      resourceKind: "zillionaire_module",
      reasonCode: "MISSING_MODULE",
    }).catch(() => undefined);
    throw new ApiError(
      403,
      "ZILLIONAIRE_SCOPE_REQUIRED",
      `Zillionaire module permission '${module}' is required for this action.`,
    );
  }
  return access;
}

// Backward-compatible function alias
export const requireAdminModule = requireZillionaireModule;

export async function requireProviderAccess(
  fs: Firestore,
  user: {
    uid: string;
    email: string | null;
    emailVerified?: boolean;
    customClaims?: Record<string, unknown>;
  },
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
    return { ...access, providerId: access.providerId || targetProviderId || "zillionaire_owner" };
  }
  if (!access.roles.includes("provider") || !access.providerId) {
    await recordAccessDenial(fs, {
      actorUid: user.uid,
      actorRoleClass: access.roles.includes("producer") ? "producer" : "viewer",
      requiredRole: "provider",
      resourceKind: "provider_tenant",
      reasonCode: "CROSS_ROLE_DENIED",
    }).catch(() => undefined);
    throw new ApiError(
      403,
      "PROVIDER_ROLE_REQUIRED",
      "This account is not associated with an active channel provider.",
    );
  }

  if (targetProviderId && access.providerId !== targetProviderId) {
    await recordAccessDenial(fs, {
      actorUid: user.uid,
      actorRoleClass: "provider",
      requiredRole: "provider",
      resourceKind: "provider_tenant",
      targetId: targetProviderId,
      reasonCode: "CROSS_TENANT_DENIED",
    }).catch(() => undefined);
    throw new ApiError(
      403,
      "PROVIDER_ISOLATION_VIOLATION",
      "You do not have permission to access resources belonging to another provider.",
    );
  }

  return { ...access, providerId: access.providerId };
}
