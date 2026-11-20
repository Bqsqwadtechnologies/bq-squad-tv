/**
 * Retention-safe anonymisation and privacy masking utilities.
 */

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "anonymous@domain.local";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "anonymous@domain.local";
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local[0]}${"*".repeat(Math.min(local.length - 2, 5))}${local[local.length - 1]}@${domain}`;
}

export function maskPaymentInstrument(last4: string | null | undefined, brand = "Card"): string {
  if (!last4) return "Payment Method";
  return `${brand} ending in ${last4}`;
}

export function anonymiseActorId(uid: string): string {
  if (!uid) return "anon";
  return `anon_${uid.slice(0, 4)}...${uid.slice(-4)}`;
}
