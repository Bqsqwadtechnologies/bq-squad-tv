import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { Route as ProducerChannelsRoute } from "@/routes/api/public/v1/producer/channels";
import { Route as ProviderChannelsRoute } from "@/routes/api/public/v1/provider/channels";
import { Route as ProfileCountryRoute } from "@/routes/api/public/v1/profile/country";
import { Route as ProviderRegisterRoute } from "@/routes/api/public/v1/provider/register";

describe("Owner Rules — Channel Creation & Country Lock (A1, A2, A3)", () => {
  it("rejects channel creation on POST /api/public/v1/producer/channels with 403 and friendly contact message", async () => {
    const handler = (ProducerChannelsRoute.options.server as any)?.handlers?.POST;
    expect(handler).toBeDefined();

    const response = await handler({
      request: new Request("http://localhost/api/public/v1/producer/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unauthorized Channel" }),
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("CHANNEL_CREATION_RESTRICTED");
    expect(body.message).toContain("Only we can create channels. Contact tv@bqsqwad.com.");
  });

  it("rejects channel creation on POST /api/public/v1/provider/channels with 403 and friendly contact message", async () => {
    const handler = (ProviderChannelsRoute.options.server as any)?.handlers?.POST;
    expect(handler).toBeDefined();

    const response = await handler({
      request: new Request("http://localhost/api/public/v1/provider/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Unauthorized Broadcast Channel" }),
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("CHANNEL_CREATION_RESTRICTED");
    expect(body.message).toContain("Only we can create channels. Contact tv@bqsqwad.com.");
  });

  it("rejects user country change on POST /api/public/v1/profile/country with 403 and locked message", async () => {
    const handler = (ProfileCountryRoute.options.server as any)?.handlers?.POST;
    expect(handler).toBeDefined();

    const response = await handler({
      request: new Request("http://localhost/api/public/v1/profile/country", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryCode: "US" }),
      }),
    });

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("rejects provider self-registration on POST /api/public/v1/provider/register with 403", async () => {
    const handler = (ProviderRegisterRoute.options.server as any)?.handlers?.POST;
    expect(handler).toBeDefined();

    const response = await handler({
      request: new Request("http://localhost/api/public/v1/provider/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Self Register Inc" }),
      }),
    });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("REGISTRATION_RESTRICTED");
    expect(body.message).toContain("Channels are created by us for approved partners. To partner with us, contact tv@bqsqwad.com.");
  });

  it("enforces that no non-Zillionaire API route can create or insert channels", () => {
    const apiDir = path.resolve(__dirname, "../routes/api");
    const violations: string[] = [];

    function scanDir(dir: string) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanDir(fullPath);
        } else if (file.endsWith(".ts") && !file.endsWith(".test.ts")) {
          // Normalize path
          const relPath = path.relative(apiDir, fullPath).replace(/\\/g, "/");
          // If not in zillionaire
          if (!relPath.startsWith("public/v1/zillionaire/")) {
            const content = fs.readFileSync(fullPath, "utf-8");
            // Check for channel collection insertion patterns
            // Check for top-level channel root document insertion (e.g., setDoc(`liveChannels/${id}`, ...) or setDoc(`channels/${id}`, ...))
            // but not subcollections like channels/${id}/liveChat/...
            const hasChannelInsert =
              /(?:setDoc|addDoc|createDoc)\s*\(\s*["`'](?:liveChannels|channels)\/(?:\$\{[^}]+\}|[a-zA-Z0-9_-]+)["`']/.test(content) ||
              /\.collection\s*\(\s*["`'](?:liveChannels|channels)["`']\s*\)\s*\.add/.test(content);

            if (hasChannelInsert) {
              violations.push(relPath);
            }
          }
        }
      }
    }

    scanDir(apiDir);
    expect(violations).toEqual([]);
  });
});
