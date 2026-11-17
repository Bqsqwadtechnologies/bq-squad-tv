export function formatMinorCurrency(amountMinor: number, currency = "USD"): string {
  if (!Number.isSafeInteger(amountMinor)) return "—";
  try {
    const locale = undefined;
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    const scale = 10n ** BigInt(digits);
    const minor = BigInt(amountMinor);
    const whole = minor / scale;
    const fraction = (minor < 0n ? -minor : minor) % scale;
    const wholeFormatter = new Intl.NumberFormat(locale, {
      style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
    });
    const parts = wholeFormatter.formatToParts(minor < 0n && whole === 0n ? -1n : whole);
    if (minor < 0n && whole === 0n) {
      const zero = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 }).format(0);
      for (let index = parts.length - 1; index >= 0; index--) {
        if (parts[index].type === "group") parts.splice(index, 1);
        else if (parts[index].type === "integer") parts[index] = { ...parts[index], value: zero };
      }
    }
    if (digits === 0) return parts.map(part => part.value).join("");
    const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
      .formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
    const digitFormatter = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 });
    const fractionText = fraction.toString().padStart(digits, "0").split("")
      .map(digit => digitFormatter.format(Number(digit))).join("");
    let lastNumeric = -1;
    parts.forEach((part, index) => { if (part.type === "integer" || part.type === "group") lastNumeric = index; });
    parts.splice(lastNumeric + 1, 0, { type: "decimal", value: decimal }, { type: "fraction", value: fractionText });
    return parts.map(part => part.value).join("");
  } catch {
    return currency + " " + amountMinor;
  }
}
