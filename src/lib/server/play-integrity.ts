import {
  ApiError,
  base64UrlEncode,
  base64UrlEncodeBytes,
  toArrayBuffer,
} from "./firebase-admin";

type PlayIntegrityServiceAccount = {
  client_email: string;
  private_key: string;
};

export type PlayIntegrityPayload = {
  requestDetails?: {
    requestPackageName?: string;
    nonce?: string;
    timestampMillis?: string | number;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
  };
  accountDetails?: {
    appLicensingVerdict?: string;
  };
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

function getPlayIntegrityServiceAccount(): PlayIntegrityServiceAccount {
  const raw = process.env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"];
  if (!raw) {
    throw new ApiError(503, "PLAY_INTEGRITY_NOT_CONFIGURED", "Google Play Integrity verification is not configured.");
  }
  let parsed: Partial<PlayIntegrityServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<PlayIntegrityServiceAccount>;
  } catch {
    throw new ApiError(503, "PLAY_INTEGRITY_NOT_CONFIGURED", "Google Play service-account configuration is invalid.");
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new ApiError(503, "PLAY_INTEGRITY_NOT_CONFIGURED", "Google Play service-account configuration is incomplete.");
  }
  return parsed as PlayIntegrityServiceAccount;
}

function pemBytes(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getPlayIntegrityAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }
  const serviceAccount = getPlayIntegrityServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const unsigned =
    base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    base64UrlEncode(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/playintegrity",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pemBytes(serviceAccount.private_key)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    toArrayBuffer(new TextEncoder().encode(unsigned)),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + base64UrlEncodeBytes(new Uint8Array(signature)),
    }),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!response.ok || !payload.access_token) {
    throw new ApiError(503, "PLAY_INTEGRITY_AUTH_FAILED", "Google Play Integrity authentication failed.");
  }
  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

/** Validate the decoded Google payload before any session or wallet mutation. */
export function assertPlayIntegrityPayload(
  payload: PlayIntegrityPayload,
  expectedNonce: string,
  expectedPackageName: string,
  nowMillis = Date.now(),
): void {
  const request = payload.requestDetails;
  const timestamp = Number(request?.timestampMillis);
  if (
    request?.requestPackageName !== expectedPackageName ||
    request.nonce !== expectedNonce ||
    !Number.isSafeInteger(timestamp) ||
    timestamp > nowMillis + 60_000 ||
    nowMillis - timestamp > 5 * 60_000
  ) {
    throw new ApiError(403, "PLAY_INTEGRITY_REQUEST_INVALID", "The Play Integrity request is invalid or expired.");
  }
  if (payload.appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") {
    throw new ApiError(403, "PLAY_INTEGRITY_APP_UNRECOGNIZED", "This app installation could not be verified by Google Play.");
  }
  if (!payload.deviceIntegrity?.deviceRecognitionVerdict?.includes("MEETS_DEVICE_INTEGRITY")) {
    throw new ApiError(403, "PLAY_INTEGRITY_DEVICE_UNTRUSTED", "This device does not meet the required integrity level.");
  }
  if (payload.accountDetails?.appLicensingVerdict !== "LICENSED") {
    throw new ApiError(403, "PLAY_INTEGRITY_LICENSE_REQUIRED", "This app installation is not licensed by Google Play.");
  }
}

export async function verifyPlayIntegrityToken(
  integrityToken: string,
  expectedNonce: string,
  nowMillis = Date.now(),
): Promise<void> {
  if (!integrityToken || integrityToken.length > 20_000) {
    throw new ApiError(400, "PLAY_INTEGRITY_TOKEN_INVALID", "A valid Play Integrity token is required.");
  }
  const packageName = process.env["GOOGLE_PLAY_PACKAGE_NAME"];
  if (!packageName) {
    throw new ApiError(503, "PLAY_INTEGRITY_NOT_CONFIGURED", "The Google Play package name is not configured.");
  }
  const accessToken = await getPlayIntegrityAccessToken();
  const response = await fetch(
    "https://playintegrity.googleapis.com/v1/" + encodeURIComponent(packageName) + ":decodeIntegrityToken",
    {
      method: "POST",
      headers: {
        authorization: "Bearer " + accessToken,
        "content-type": "application/json",
      },
      body: JSON.stringify({ integrityToken }),
    },
  );
  const body = (await response.json()) as {
    tokenPayloadExternal?: PlayIntegrityPayload;
  };
  if (!response.ok || !body.tokenPayloadExternal) {
    throw new ApiError(403, "PLAY_INTEGRITY_TOKEN_INVALID", "Google could not verify this Play Integrity token.");
  }
  assertPlayIntegrityPayload(body.tokenPayloadExternal, expectedNonce, packageName, nowMillis);
}
