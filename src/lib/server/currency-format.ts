import { minorUnitDigits } from "./currency";

export function currencySymbol(currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find(part => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

/** Format an integer minor-unit amount without converting it through floating point. */
export function formatMinorCurrency(amountMinor: number, currency: string): string {
  const digits = minorUnitDigits(currency);
  if (!Number.isSafeInteger(amountMinor)) throw new Error("Wallet amount must be a safe integer.");
  const amount = BigInt(amountMinor);
  const scale = 10n ** BigInt(digits);
  const whole = amount / scale;
  const fraction = (amount < 0n ? -amount : amount) % scale;
  const formatter = new Intl.NumberFormat("en", {
    style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
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
