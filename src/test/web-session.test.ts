import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/server/firebase-admin";
import {
  clearWebRefreshCookie,
  readWebRefreshCookie,
  requireSameOrigin,
  webRefreshCookie,
} from "@/lib/server/web-session";

describe("secure website session cookies", () => {
  it("reads only the named refresh cookie", () => {
    const request = new Request("https://tv.example.test/account", {
      headers: { cookie: "theme=dark; __Host-bq_sqwad_refresh=refresh%2Btoken" },
    });
    expect(readWebRefreshCookie(request)).toBe("refresh+token");
  });

  it("rejects malformed cookie encoding safely", () => {
    const request = new Request("https://tv.example.test/account", {
      headers: { cookie: "__Host-bq_sqwad_refresh=%E0%A4%A" },
    });
    expect(readWebRefreshCookie(request)).toBeNull();
  });

  it("sets and clears refresh tokens with secure cookie attributes", () => {
    const setCookie = webRefreshCookie("opaque-refresh-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=");
    const clearCookie = clearWebRefreshCookie();
    expect(clearCookie).toContain("Max-Age=0");
    expect(clearCookie).toContain("HttpOnly");
    expect(clearCookie).toContain("Secure");
  });

  it("blocks cross-origin session actions", () => {
    const sameOrigin = new Request("https://tv.example.test/api/session", {
      method: "POST",
      headers: { origin: "https://tv.example.test" },
    });
    expect(() => requireSameOrigin(sameOrigin)).not.toThrow();

    const crossOrigin = new Request("https://tv.example.test/api/session", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(() => requireSameOrigin(crossOrigin)).toThrow(ApiError);
  });
});
