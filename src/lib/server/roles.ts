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
  emailVerified: boolean;
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
  // The app's six-digit OTP flow records verification server-side. Accept that
  // proof only while it remains bound to the exact current Firebase email;
  // a changed account email invalidates the app-level verification.
  const appEmailVerified = Boolean(
    user?.["appEmailVerified"] === true &&
    typeof user["email"] === "string" &&
    email && user["email"].trim().toLowerCase() === email.trim().toLowerCase(),
  );
  const effectiveEmailVerified = emailVerified || appEmailVerified;
  const configuredAdmin = process.env["ZILLIONAIRE_EMAIL"]?.trim().toLowerCase();
  const isSuperAdmin = Boolean(
    effectiveEmailVerified && configuredAdmin && email?.trim().toLowerCase() === configuredAdmin,
  );
  const storedRoles = stringArray(user?.["roleTags"]);
  const claimedRoles = stringArray(customClaims["roleTags"]);
  const producerPlanActive = producer?.["planStatus"] === "ACTIVE";
  const producerVerified = producer?.["verificationStatus"] === "APPROVED";
  const roles: PlatformRole[] = ["viewer"];
  if (producerPlanActive && producerVerified && (storedRoles.includes("producer") || claimedRoles.includes("producer") || customClaims["producer"] === true)) {
    roles.push("producer");
  }
  if (isSuperAdmin || storedRoles.includes("admin") || claimedRoles.includes("admin") || customClaims["admin"] === true) {
    roles.push("admin");
  }
  // Delegated module permissions live in Firestore so the protected owner can
  // revoke them immediately; stale Firebase custom claims must not preserve access.
  const configuredScopes = stringArray(user?.["adminModules"])
    .filter((scope): scope is AdminModule => ADMIN_MODULES.includes(scope as AdminModule));
  return {
    roles,
    isSuperAdmin,
    adminModules: isSuperAdmin ? ADMIN_MODULES : [...new Set(configuredScopes)],
    producerPlanActive,
    emailVerified: effectiveEmailVerified,
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
  if (role === "admin" && !access.emailVerified) {
    throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email address before accessing administrator tools.");
  }
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

export function isProtectedSuperAdmin(
  targetEmail: string | null,
  configuredAdminEmail = process.env["ZILLIONAIRE_EMAIL"] ?? process.env["ADMIN_EMAIL"],
): boolean {
  return Boolean(
    configuredAdminEmail?.trim() &&
    targetEmail?.trim().toLowerCase() === configuredAdminEmail.trim().toLowerCase(),
  );
}
