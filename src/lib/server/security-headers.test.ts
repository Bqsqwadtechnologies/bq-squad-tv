import { describe, expect, it } from "vitest";
import { applySecurityHeaders } from "./security-headers";

describe("response security headers", () => {
  it("adds baseline transport, MIME, framing, referrer and permission headers", () => {
    const response = applySecurityHeaders(new Response("ok"));
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=(self)");
    expect(response.headers.get("permissions-policy")).toContain("microphone=()");
    expect(response.headers.get("permissions-policy")).toContain("geolocation=()");
    expect(response.headers.get("content-security-policy-report-only")).toContain(
      "frame-ancestors 'none'",
    );
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("https://accounts.google.com");
    expect(csp).toContain("https://identitytoolkit.googleapis.com");
    expect(csp).toContain("frame-src 'self' https://accounts.google.com");
  });

  it("preserves explicitly configured response headers", () => {
    const response = applySecurityHeaders(
      new Response("ok", { headers: { "referrer-policy": "no-referrer" } }),
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
