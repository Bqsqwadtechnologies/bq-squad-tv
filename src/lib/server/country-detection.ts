import { normalizeCountryCode } from "./currency";

/**
 * Resolve the country from hosting-platform geolocation metadata first.
 * When the host does not expose a country header, use the client IP with
 * ipapi.co. Never accept a country code supplied in a request body.
 */
export async function detectCountryFromRequest(request: Request): Promise<string | null> {
  const trustedCountry =
    normalizeCountryCode(request.headers.get("cf-ipcountry")) ??
    normalizeCountryCode(request.headers.get("x-vercel-ip-country")) ??
    normalizeCountryCode(request.headers.get("x-nf-country"));
  if (trustedCountry) return trustedCountry;

  const forwarded = request.headers.get("x-forwarded-for");
  const forwardedAddresses = forwarded?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  const remoteIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    forwardedAddresses.at(-1) ??
    null;
  if (!remoteIp || !isPublicIpLiteral(remoteIp)) return null;

  try {
    const response = await fetch(
      `https://ipapi.co/${encodeURIComponent(remoteIp)}/country/`,
      {
        headers: { accept: "text/plain" },
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      },
    );
    if (!response.ok) return null;
    return normalizeCountryCode((await response.text()).trim());
  } catch {
    return null;
  }
}

function isPublicIpLiteral(value: string): boolean {
  if (value.length > 64) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) {
    const octets = value.split(".").map(Number);
    if (octets.some((part) => part > 255)) return false;
    const [a, b] = octets;
    if (a === undefined || b === undefined) return false;
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b !== undefined && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    return true;
  }
  // Accept syntactically valid IPv6 literals, excluding loopback, link-local,
  // unique-local and unspecified addresses.
  if (!/^[0-9a-f:]+$/i.test(value) || !value.includes(":")) return false;
  const normalized = value.toLowerCase();
  return normalized !== "::1" && normalized !== "::" &&
    !normalized.startsWith("fe8") && !normalized.startsWith("fe9") &&
    !normalized.startsWith("fea") && !normalized.startsWith("feb") &&
    !normalized.startsWith("fc") && !normalized.startsWith("fd");
}
