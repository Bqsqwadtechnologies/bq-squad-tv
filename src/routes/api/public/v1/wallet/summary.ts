import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, getWallet, requireUser } from "@/lib/server/api";
import { minorUnitDigits } from "@/lib/server/currency";

function formatMinorCurrency(amountMinor: number, currency: string, digits: number): string {
  if (!Number.isSafeInteger(amountMinor) || !Number.isInteger(digits) || digits < 0 || digits > 3) {
    throw new Error("Wallet amount is outside the supported range.");
  }
  const amount = BigInt(amountMinor);
  const scale = 10n ** BigInt(digits);
  const whole = amount / scale;
  const fraction = (amount < 0n ? -amount : amount) % scale;
  const formatter = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  const parts = formatter.formatToParts(amount < 0n && whole === 0n ? -1n : whole);
  if (amount < 0n && whole === 0n) {
    const zero = new Intl.NumberFormat("en", { useGrouping: false, maximumFractionDigits: 0 }).format(0);
    for (let index = parts.length - 1; index >= 0; index--) {
      const part = parts[index];
      if (!part) continue;
      if (part.type === "group") parts.splice(index, 1);
      else if (part.type === "integer") parts[index] = { type: "integer", value: zero };
    }
  }
  if (digits === 0) return parts.map(part => part.value).join("");
  const decimal = new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
  const fractionText = fraction.toString().padStart(digits, "0");
  let lastNumeric = -1;
  parts.forEach((part, index) => {
    if (part.type === "integer" || part.type === "group") lastNumeric = index;
  });
  parts.splice(lastNumeric + 1, 0, { type: "decimal", value: decimal }, { type: "fraction", value: fractionText });
  return parts.map(part => part.value).join("");
}

function symbolFor(currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find(part => part.type === "currency")?.value ?? currency;
  } catch { return currency; }
}

export const Route = createFileRoute("/api/public/v1/wallet/summary")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        const wallet = await getWallet(fs, user.uid);
        const digits = minorUnitDigits(wallet.currency);
        const formattedBalance = formatMinorCurrency(wallet.balanceMinor, wallet.currency, digits);
        return Response.json({
          balanceMinor: wallet.balanceMinor,
          currency: wallet.currency,
          currencyCode: wallet.currency,
          currencySymbol: symbolFor(wallet.currency),
          symbol: symbolFor(wallet.currency),
          minorUnitDigits: digits,
          formattedBalance,
          dailySpendLimitMinor: wallet.dailySpendLimitMinor, spentTodayMinor: wallet.spentTodayMinor,
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) { return errorBody(error); }
    },
  } },
});
