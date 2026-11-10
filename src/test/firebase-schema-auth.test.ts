import { describe, expect, it } from "vitest";

import { hasAdminBearerAuthorization } from "@/lib/firebase-schema-auth";

describe("Firebase schema inspection access", () => {
  it("requires the configured admin and a bearer token", () => {
    expect(hasAdminBearerAuthorization(null, "admin@example.com")).toBe(false);
    expect(hasAdminBearerAuthorization("Basic token", "admin@example.com")).toBe(false);
    expect(hasAdminBearerAuthorization("Bearer ", "admin@example.com")).toBe(false);
    expect(hasAdminBearerAuthorization("Bearer token", undefined)).toBe(false);
    expect(hasAdminBearerAuthorization("Bearer token", "admin@example.com")).toBe(true);
  });
});