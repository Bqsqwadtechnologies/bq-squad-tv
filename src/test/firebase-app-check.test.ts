import { afterAll, describe, expect, it } from "vitest";
import { requireAppCheck } from "@/lib/server/firebase-app-check";

const originalEnforcement = process.env["APP_CHECK_ENFORCED"];

afterAll(() => {
  if (originalEnforcement === undefined) delete process.env["APP_CHECK_ENFORCED"];
  else process.env["APP_CHECK_ENFORCED"] = originalEnforcement;
});

describe("Firebase App Check enforcement switch", () => {
  it("keeps enforcement disabled until both clients are configured", async () => {
    process.env["APP_CHECK_ENFORCED"] = "false";
    await expect(
      requireAppCheck(new Request("https://tv.example.test/api")),
    ).resolves.toBeUndefined();
  });

  it("rejects authenticated API requests without an App Check token when enforcement is enabled", async () => {
    process.env["APP_CHECK_ENFORCED"] = "true";
    await expect(requireAppCheck(new Request("https://tv.example.test/api"))).rejects.toMatchObject(
      {
        code: "APP_CHECK_REQUIRED",
        status: 401,
      },
    );
  });
});
