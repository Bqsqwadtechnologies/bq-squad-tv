import { describe, it, expect } from "vitest";
import { redactString, sanitizePayload } from "../lib/server/security-redaction";

describe("Security Redaction Canary Suite", () => {
  it("intercepts simulated PEM private key leaks", () => {
    const raw =
      "Error: Failed with key -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0\n-----END RSA PRIVATE KEY----- in worker";
    const redacted = redactString(raw);
    expect(redacted).not.toContain("BEGIN RSA PRIVATE KEY");
    expect(redacted).toContain("[REDACTED_PRIVATE_KEY]");
  });

  it("intercepts simulated Bearer and JWT token leaks", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNH";
    const raw = `Authorization: Bearer ${jwt}`;
    const redacted = redactString(raw);
    expect(redacted).not.toContain(jwt);
    expect(redacted).toContain("[REDACTED_TOKEN]");
  });

  it("intercepts sensitive keys in structured payloads", () => {
    const payload = {
      user: "viewer-123",
      apiKey: "live_sec_999888777",
      client_secret: "top_secret_value",
      nested: {
        token: "abcdef123456",
        message: "Key is key=supersecretpassword in url",
      },
    };
    const sanitized = sanitizePayload(payload);
    expect(sanitized.apiKey).toBe("[REDACTED]");
    expect(sanitized.client_secret).toBe("[REDACTED]");
    expect(sanitized.nested.token).toBe("[REDACTED]");
    expect(sanitized.nested.message).not.toContain("supersecretpassword");
  });
});
