import { describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api/public/v1/auth/web/config";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

describe("Google authentication configuration", () => {
  it("returns the configured web client ID without caching it for long", async () => {
    vi.stubEnv("GOOGLE_WEB_CLIENT_ID", "web-client-id.apps.googleusercontent.com");
    const route = Route as unknown as {
      options: { server: { handlers: { GET: () => Promise<Response> } } };
    };
    const response = await route.options.server.handlers.GET();
    const body = await response.json();
    expect(body.googleClientId).toBe("web-client-id.apps.googleusercontent.com");
    expect(body.googleConfigured).toBe(true);
    expect(response.headers.get("cache-control")).toBe("no-store");
    vi.unstubAllEnvs();
  });
});
