/**
 * Reviewed public route allow-list.
 * Only genuinely unauthenticated endpoints belong here.
 * Any new route not guarded by a known auth check must be explicitly reviewed
 * and added here, or the route-guards test will fail.
 */
export const PUBLIC_ROUTE_ALLOWLIST = [
  "/api/public/v1/auth/web/config",
  "/api/public/v1/auth/web/session",
  "/api/public/v1/auth/web/session/logout",
  "/api/public/v1/auth/web/session/refresh",
  "/api/public/v1/config/client",
  "/api/public/v1/contact",
  "/api/public/v1/pages/$slug",
  "/api/public/firebase-schema-inspect",
] as const;

export function isPublicRoute(routePath: string): boolean {
  return (PUBLIC_ROUTE_ALLOWLIST as readonly string[]).includes(routePath);
}
