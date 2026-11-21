export type AccountType = "checking" | "savings" | "current";

export interface PayoutProfileRecord {
  uid: string;
  country: string; // ISO 2-letter, locked to KYC country
  beneficiaryName: string; // pre-filled from verified KYC legal name
  beneficiaryAddress: string; // pre-filled from KYC
  bankName: string;
  bankCountry: string; // must equal country
  bankAddress: string;
  accountNumberEncrypted: string;
  accountNumberMasked: string; // e.g. ******1234
  iban?: string | null;
  accountType: AccountType;
  currency: string; // NGN if NG, USD otherwise
  swiftBic: string;
  routingCode?: string | null;
  purposeOfPayment: string;
  taxResidency: string;
  taxIdMasked?: string | null;
  isManualBank: boolean;
  status: "active" | "flagged_for_review";
  createdAt: string;
  updatedAt: string;
}

export const PURPOSE_OF_PAYMENT_OPTIONS = [
  { id: "streaming_royalties", label: "Streaming royalties and creator revenue" },
  { id: "content_licensing", label: "Content licensing and distribution" },
  { id: "production_services", label: "Media production services" },
  { id: "digital_services", label: "Software and digital services settlement" },
];
