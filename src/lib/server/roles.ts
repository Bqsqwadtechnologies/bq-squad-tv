import { ApiError, type Firestore } from "./firebase-admin";

export type PlatformRole = "viewer" | "producer" | "admin";
export type AdminModule =
  | "overview" | "users" | "roles" | "producers" | "channels" | "content"
  | "pricing" | "wallets" | "payments" | "payouts" | "ads" | "notifications"
  | "moderation" | "security" | "system";

export type PlatformAccess = {
  roles: PlatformRole[];
  isSuperAdmin: boolean;
  adminModules: AdminModule[];
  producerPlanActive: boolean;
};

const ADMIN_MODULES: AdminModule[] = [
  "overview", "users", "roles", "producers", "channels", "content", "pricing",
  "wallets", "payments", "payouts", "ads", "notifications", "moderation",
  "security", "system",
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
  const [user, producer] = await Promise.all([
    fs.getDoc("users/" + uid),
    fs.getDoc("producers/" + uid),
  ]);
  const configuredAdmin = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const isSuperAdmin = Boolean(
    emailVerified && configuredAdmin && email?.trim().toLowerCase() === configuredAdmin,
  );
  const storedRoles = stringArray(user?.["roleTags"]);
  const claimedRoles = stringArray(customClaims["roleTags"]);
  const producerPlanActive = producer?.["planStatus"] === "ACTIVE";
  const roles: PlatformRole[] = ["viewer"];
  if (producerPlanActive && (storedRoles.includes("producer") || claimedRoles.includes("producer") || customClaims["producer"] === true)) {
    roles.push("producer");
  }
  if (isSuperAdmin || storedRoles.includes("admin") || claimedRoles.includes("admin") || customClaims["admin"] === true) {
    roles.push("admin");
  }
  const configuredScopes = [
    ...stringArray(user?.["adminModules"]),
    ...stringArray(customClaims["adminModules"]),
  ].filter((scope): scope is AdminModule => ADMIN_MODULES.includes(scope as AdminModule));
  return {
    roles,
    isSuperAdmin,
    adminModules: isSuperAdmin ? ADMIN_MODULES : [...new Set(configuredScopes)],
    producerPlanActive,
  };
}

export async function requirePlatformRole(
  fs: Firestore,
  user: { uid: string; email: string | null; emailVerified?: boolean; customClaims?: Record<string, unknown> },
  role: PlatformRole,
): Promise<PlatformAccess> {
  if (role === "admin" && user.emailVerified !== true) {
    throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email address before accessing administrator tools.");
  }
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
  const access = await requirePlatformRole(fs, user, "admin");
  if (!access.adminModules.includes(module)) {
    throw new ApiError(403, "ADMIN_SCOPE_REQUIRED", "Your administrator account cannot access this module.");
  }
  return access;
}

export function isProtectedSuperAdmin(targetEmail: string | null, configuredAdminEmail = process.env["ADMIN_EMAIL"]): boolean {
  return Boolean(
    configuredAdminEmail?.trim() &&
    targetEmail?.trim().toLowerCase() === configuredAdminEmail.trim().toLowerCase(),
  );
}
