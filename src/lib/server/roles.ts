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

/** Resolve every platform privilege from trusted server-side records, never request data. */
export async function resolvePlatformAccess(
  fs: Firestore,
  uid: string,
  email: string | null,
): Promise<PlatformAccess> {
  const [user, producer] = await Promise.all([
    fs.getDoc(`users/${uid}`),
    fs.getDoc(`producers/${uid}`),
  ]);
  const configuredAdmin = process.env["ADMIN_EMAIL"]?.trim().toLowerCase();
  const isSuperAdmin = Boolean(configuredAdmin && email?.trim().toLowerCase() === configuredAdmin);
  const storedRoles = stringArray(user?.["roleTags"]);
  const roles: PlatformRole[] = ["viewer"];
  if (storedRoles.includes("producer") && producer?.["planStatus"] === "ACTIVE") roles.push("producer");
  if (isSuperAdmin || storedRoles.includes("admin")) roles.push("admin");
  const configuredScopes = stringArray(user?.["adminModules"]).filter(
    (scope): scope is AdminModule => ADMIN_MODULES.includes(scope as AdminModule),
  );
  return {
    roles,
    isSuperAdmin,
    adminModules: isSuperAdmin ? ADMIN_MODULES : configuredScopes,
    producerPlanActive: producer?.["planStatus"] === "ACTIVE",
  };
}

export async function requirePlatformRole(
  fs: Firestore,
  user: { uid: string; email: string | null },
  role: PlatformRole,
): Promise<PlatformAccess> {
  const access = await resolvePlatformAccess(fs, user.uid, user.email);
  if (!access.roles.includes(role)) {
    throw new ApiError(403, "FORBIDDEN", "This account does not have the required platform role.");
  }
  return access;
}

export async function requireAdminModule(
  fs: Firestore,
  user: { uid: string; email: string | null },
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
