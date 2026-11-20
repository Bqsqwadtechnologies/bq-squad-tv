import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export type ZillionaireStepUpScope =
  "wallet_adjust" | "payment_reversal" | "permanent_delete" | "team_manage" | "payout_settlement";

export async function requestZillionaireStepUp(
  scope: ZillionaireStepUpScope,
  reason: string,
): Promise<Headers> {
  const password = window.prompt("Re-enter the Zillionaire access password to continue.");
  if (!password) throw new Error("Step-up verification was cancelled.");
  const code = window.prompt("Enter the current six-digit authenticator code.");
  if (!code) throw new Error("Step-up verification was cancelled.");
  const headers = await getWebAuthHeaders();
  headers.set("Content-Type", "application/json");
  const response = await fetch("/api/public/v1/zillionaire/access/step-up", {
    method: "POST",
    headers,
    body: JSON.stringify({ password, code, scope, reason }),
  });
  const data = (await response.json()) as { token?: string; message?: string; error?: string };
  if (!response.ok || !data.token)
    throw new Error(data.message || data.error || "Step-up verification failed.");
  headers.set("x-zillionaire-step-up", data.token);
  return headers;
}
