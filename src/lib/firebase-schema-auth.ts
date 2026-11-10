export function hasAdminBearerAuthorization(
  authorization: string | null,
  adminEmail: string | undefined,
): boolean {
  return Boolean(adminEmail?.trim() && authorization?.startsWith("Bearer ") && authorization && authorization.length > 7);
}