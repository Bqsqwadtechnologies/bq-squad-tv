const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(self), microphone=(), geolocation=()",
  "content-security-policy-report-only":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src 'self' https://accounts.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "content-security-policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://accounts.google.com; img-src 'self' data: https:; media-src 'self' https: blob:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src 'self' https://accounts.google.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none';",
};

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function applySensitiveEndpointHeaders(response: Response): Response {
  const secured = applySecurityHeaders(response);
  const headers = new Headers(secured.headers);
  headers.set("cache-control", "no-store, no-cache, must-revalidate, private");
  headers.set("pragma", "no-cache");
  return new Response(secured.body, {
    status: secured.status,
    statusText: secured.statusText,
    headers,
  });
}
