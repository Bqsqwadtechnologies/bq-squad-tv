import { ApiError, base64UrlEncode, decodeBase64Url } from "./firebase-admin";

export type LedgerCursor = { createdAt: string; id: string };

export function encodeLedgerCursor(cursor: LedgerCursor): string {
  return base64UrlEncode(JSON.stringify(cursor));
}

export function decodeLedgerCursor(value: string | null): LedgerCursor | null {
  if (!value) return null;
  if (value.length > 512) throw new ApiError(400, "INVALID_CURSOR", "The ledger cursor is invalid.");
  try {
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as Record<string, unknown>;
    if (
      typeof decoded["createdAt"] !== "string" ||
      !Number.isFinite(Date.parse(decoded["createdAt"])) ||
      typeof decoded["id"] !== "string" ||
      !/^[A-Za-z0-9_-]{1,150}$/.test(decoded["id"])
    ) {
      throw new Error("Invalid cursor fields");
    }
    return { createdAt: decoded["createdAt"], id: decoded["id"] };
  } catch {
    throw new ApiError(400, "INVALID_CURSOR", "The ledger cursor is invalid.");
  }
}
