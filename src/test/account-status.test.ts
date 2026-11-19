import { describe, expect, it } from "vitest";
import { assertAccountActive } from "@/lib/server/account-status";

describe("account status enforcement", () => {
  it("keeps legacy profiles active when no status is stored", () => {
    expect(() => assertAccountActive(null)).not.toThrow();
    expect(() => assertAccountActive({ email: "viewer@example.com" })).not.toThrow();
    expect(() => assertAccountActive({ accountStatus: "ACTIVE" })).not.toThrow();
  });

  it("blocks suspended accounts", () => {
    expect(() => assertAccountActive({ accountStatus: "SUSPENDED" })).toThrow(
      expect.objectContaining({ status: 403, code: "ACCOUNT_SUSPENDED" }),
    );
  });

  it("blocks accounts pending deletion", () => {
    expect(() => assertAccountActive({ accountStatus: "DELETION_PENDING" })).toThrow(
      expect.objectContaining({ status: 403, code: "ACCOUNT_DELETION_PENDING" }),
    );
  });

  it("blocks deleted accounts", () => {
    expect(() => assertAccountActive({ accountStatus: "DELETED" })).toThrow(
      expect.objectContaining({ status: 403, code: "ACCOUNT_DELETED" }),
    );
  });
});
