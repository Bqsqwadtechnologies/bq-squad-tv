import errorCatalogue from "../../../content/strings/errors.en.json";

export function generateErrorRef(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let ref = "BQ-";
  for (let i = 0; i < 5; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

export function getFriendlyErrorMessage(code: string, fallback?: string): string {
  const catalogue = errorCatalogue as Record<string, string>;
  return catalogue[code] ?? fallback ?? catalogue["GENERIC_ERROR"] ?? "Something went wrong. Please try again.";
}
