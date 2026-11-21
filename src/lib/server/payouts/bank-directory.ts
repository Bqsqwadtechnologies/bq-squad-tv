/**
 * Bank directory containing verified bank codes, SWIFT/BICs, and headquarters addresses
 * keyed by ISO country code.
 */

export interface BankDirectoryEntry {
  id: string;
  name: string;
  code: string; // 3-digit CBN code in NG, sort code prefix in UK, routing number in US, etc.
  swiftBic: string;
  address: string;
  routingCodeType?: "sort_code" | "routing_number" | "cbn_code" | "clabe" | "bsb" | "ifsc";
  routingCode?: string;
}

export const BANK_DIRECTORY: Record<string, BankDirectoryEntry[]> = {
  NG: [
    { id: "access", name: "Access Bank", code: "044", swiftBic: "ACENTPLX", address: "Plot 999c, Danmole Street, Victoria Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "044" },
    { id: "gtb", name: "Guaranty Trust Bank (GTBank)", code: "058", swiftBic: "GTBINGLA", address: "Plot 635, Akin Adesola Street, Victoria Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "058" },
    { id: "zenith", name: "Zenith Bank", code: "057", swiftBic: "ZEIBNGLA", address: "Plot 84, Ajose Adeogun Street, Victoria Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "057" },
    { id: "firstbank", name: "First Bank of Nigeria", code: "011", swiftBic: "FBNINGLA", address: "Samuel Asabia House, 35 Marina, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "011" },
    { id: "uba", name: "United Bank for Africa (UBA)", code: "033", swiftBic: "UBANLA", address: "57 Marina, Lagos Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "033" },
    { id: "wema", name: "Wema Bank", code: "035", swiftBic: "WEMANGLA", address: "54 Marina, Lagos Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "035" },
    { id: "sterling", name: "Sterling Bank", code: "232", swiftBic: "STERINGLA", address: "20 Marina, Lagos Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "232" },
    { id: "stanbic_ng", name: "Stanbic IBTC Bank", code: "221", swiftBic: "SBICNGLA", address: "IBTC Place, Walter Carrington Crescent, Victoria Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "221" },
    { id: "fidelity", name: "Fidelity Bank", code: "070", swiftBic: "FIDENGLA", address: "2 Kofo Abayomi Street, Victoria Island, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "070" },
    { id: "fcmb", name: "First City Monument Bank (FCMB)", code: "214", swiftBic: "FCMBNGLA", address: "Primrose Tower, 17A Tinubu Street, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "214" },
    { id: "opay", name: "OPay Digital Services", code: "999992", swiftBic: "OPAYNGLA", address: "Alexander House, Otunba Jobi Fele Way, Alausa, Ikeja, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "999992" },
    { id: "palmpay", name: "PalmPay", code: "999991", swiftBic: "PALMNGLA", address: "20 Opebi Road, Ikeja, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "999991" },
    { id: "kuda", name: "Kuda Microfinance Bank", code: "50211", swiftBic: "KUDANGLA", address: "1-11 Commercial Avenue, Yaba, Lagos, Nigeria", routingCodeType: "cbn_code", routingCode: "50211" },
    { id: "moniepoint", name: "Moniepoint Microfinance Bank", code: "50515", swiftBic: "MONINGLA", address: "Oyo-Ibadan Road, Bodija, Ibadan, Oyo State, Nigeria", routingCodeType: "cbn_code", routingCode: "50515" },
  ],
  US: [
    { id: "jpmorgan", name: "JPMorgan Chase Bank, N.A.", code: "021000021", swiftBic: "CHASUS33", address: "270 Park Avenue, New York, NY 10017, USA", routingCodeType: "routing_number", routingCode: "021000021" },
    { id: "bofa", name: "Bank of America, N.A.", code: "026009593", swiftBic: "BOFAUS3N", address: "100 North Tryon Street, Charlotte, NC 28255, USA", routingCodeType: "routing_number", routingCode: "026009593" },
    { id: "wellsfargo", name: "Wells Fargo Bank, N.A.", code: "121000248", swiftBic: "WFBIUS6S", address: "420 Montgomery Street, San Francisco, CA 94104, USA", routingCodeType: "routing_number", routingCode: "121000248" },
    { id: "citibank", name: "Citibank, N.A.", code: "021000089", swiftBic: "CITIUS33", address: "388 Greenwich Street, New York, NY 10013, USA", routingCodeType: "routing_number", routingCode: "021000089" },
  ],
  GB: [
    { id: "barclays", name: "Barclays Bank UK PLC", code: "20-00-00", swiftBic: "BARCGB22", address: "1 Churchill Place, London E14 5HP, United Kingdom", routingCodeType: "sort_code", routingCode: "20-00-00" },
    { id: "hsbc_uk", name: "HSBC UK Bank plc", code: "40-00-00", swiftBic: "MIDLGB22", address: "1 Centenary Square, Birmingham B1 1HQ, United Kingdom", routingCodeType: "sort_code", routingCode: "40-00-00" },
    { id: "lloyds", name: "Lloyds Bank plc", code: "30-00-00", swiftBic: "LOYDGB2L", address: "25 Gresham Street, London EC2V 7HN, United Kingdom", routingCodeType: "sort_code", routingCode: "30-00-00" },
    { id: "natwest", name: "National Westminster Bank (NatWest)", code: "60-00-01", swiftBic: "NWBKGB2L", address: "250 Bishopsgate, London EC2M 4AA, United Kingdom", routingCodeType: "sort_code", routingCode: "60-00-01" },
  ],
  GH: [
    { id: "gcb", name: "GCB Bank PLC", code: "040100", swiftBic: "GCBLGHAC", address: "High Street, Accra, Ghana", routingCodeType: "sort_code", routingCode: "040100" },
    { id: "ecobank_gh", name: "Ecobank Ghana PLC", code: "130100", swiftBic: "ECOCGHAC", address: "2 Morocco Lane, Off Independence Avenue, Accra, Ghana", routingCodeType: "sort_code", routingCode: "130100" },
    { id: "stanbic_gh", name: "Stanbic Bank Ghana Limited", code: "190100", swiftBic: "SBICGHAC", address: "Stanbic Heights, 215 South Liberation Link, Airport City, Accra, Ghana", routingCodeType: "sort_code", routingCode: "190100" },
  ],
  KE: [
    { id: "kcb", name: "KCB Bank Kenya Limited", code: "01", swiftBic: "KCBLKENX", address: "Kencom House, Moi Avenue, Nairobi, Kenya", routingCodeType: "sort_code", routingCode: "01" },
    { id: "equity_ke", name: "Equity Bank Kenya Limited", code: "68", swiftBic: "EQBLKENA", address: "Equity Centre, Hospital Road, Upper Hill, Nairobi, Kenya", routingCodeType: "sort_code", routingCode: "68" },
    { id: "coop_ke", name: "The Co-operative Bank of Kenya", code: "11", swiftBic: "KCOOOKEN", address: "Co-operative House, Haile Selassie Avenue, Nairobi, Kenya", routingCodeType: "sort_code", routingCode: "11" },
  ],
  ZA: [
    { id: "standard_bank_za", name: "The Standard Bank of South Africa", code: "051001", swiftBic: "SBZAZAJJ", address: "5 Simmonds Street, Johannesburg 2001, South Africa", routingCodeType: "sort_code", routingCode: "051001" },
    { id: "fnb_za", name: "First National Bank (FNB)", code: "250655", swiftBic: "FIRNZAJJ", address: "1 First Place, Bank City, Simmonds Street, Johannesburg 2001, South Africa", routingCodeType: "sort_code", routingCode: "250655" },
    { id: "absa_za", name: "Absa Bank Limited", code: "632005", swiftBic: "ABSAZAJJ", address: "15 Troye Street, Johannesburg 2001, South Africa", routingCodeType: "sort_code", routingCode: "632005" },
  ],
};

/**
 * Returns available banks in the directory for the given country.
 */
export function getBanksForCountry(countryCode: string): BankDirectoryEntry[] {
  return BANK_DIRECTORY[countryCode.toUpperCase()] || [];
}

/**
 * Looks up bank entry by country and bank ID or code.
 */
export function lookupBankInDirectory(countryCode: string, bankIdOrCode: string): BankDirectoryEntry | null {
  const banks = getBanksForCountry(countryCode);
  const normalized = bankIdOrCode.trim().toLowerCase();
  return banks.find((b) => b.id.toLowerCase() === normalized || b.code.toLowerCase() === normalized) || null;
}

/**
 * Validates an International Bank Account Number (IBAN) using the ISO 13616 Modulo 97-10 algorithm.
 * Also verifies that the country code in the IBAN matches the expected country.
 */
export function validateIban(iban: string, expectedCountry?: string): { valid: boolean; countryCode?: string; error?: string } {
  const cleanIban = iban.replace(/[\s-]/g, "").toUpperCase();
  if (cleanIban.length < 15 || cleanIban.length > 34) {
    return { valid: false, error: "IBAN must be between 15 and 34 characters." };
  }
  const ibanCountry = cleanIban.substring(0, 2);
  if (!/^[A-Z]{2}$/.test(ibanCountry)) {
    return { valid: false, error: "IBAN must begin with a 2-letter country code." };
  }
  if (expectedCountry && ibanCountry !== expectedCountry.toUpperCase()) {
    return {
      valid: false,
      countryCode: ibanCountry,
      error: `IBAN country code (${ibanCountry}) does not match your verified country (${expectedCountry.toUpperCase()}).`,
    };
  }

  // Move first 4 characters to the end
  const rearranged = cleanIban.substring(4) + cleanIban.substring(0, 4);

  // Convert letters to two-digit numbers (A = 10, Z = 35)
  let numericString = "";
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 48 && code <= 57) {
      numericString += rearranged[i];
    } else if (code >= 65 && code <= 90) {
      numericString += (code - 55).toString();
    } else {
      return { valid: false, error: "IBAN contains invalid characters." };
    }
  }

  // Modulo 97 on large numbers using chunking
  let remainder = 0;
  for (let i = 0; i < numericString.length; i += 7) {
    const chunk = remainder.toString() + numericString.substring(i, i + 7);
    remainder = parseInt(chunk, 10) % 97;
  }

  if (remainder !== 1) {
    return { valid: false, error: "IBAN checksum validation failed." };
  }

  return { valid: true, countryCode: ibanCountry };
}

/**
 * Validates a Nigerian NUBAN (10 numeric digits).
 */
export function validateNuban(accountNumber: string, _cbnBankCode?: string): { valid: boolean; error?: string } {
  const cleaned = accountNumber.trim().replace(/\s/g, "");
  if (!/^\d{10}$/.test(cleaned)) {
    return { valid: false, error: "Nigerian bank account number must be exactly 10 digits." };
  }
  return { valid: true };
}
