/**
 * Comprehensive KYC Country Rules Table.
 * Provides data-driven identification, tax, company registry, and banking parameters
 * for all countries of the world with tailored configurations for key jurisdictions
 * and a safe, non-blocking generic fallback.
 */

export interface KycIdType {
  id: string;
  label: string;
  formatDescription: string;
  pattern?: string;
  requiresBackImage: boolean;
  samplePlaceholder?: string;
}

export interface KycTaxConfig {
  name: string;
  label: string;
  formatDescription: string;
  pattern?: string;
  optional?: boolean;
}

export interface KycCompanyRegistryConfig {
  name: string;
  label: string;
  formatDescription: string;
  pattern?: string;
}

export interface KycAddressFormat {
  stateLabel: string;
  postalCodeLabel: string;
  postalCodeRequired: boolean;
}

export type BankCodeSystem = 'nuban' | 'sort_code' | 'routing_number' | 'iban' | 'swift_bic' | 'generic';

export interface KycCountryRule {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  defaultCurrency: string;
  isGeneric: boolean;
  acceptedPersonalIdTypes: KycIdType[];
  taxId: KycTaxConfig;
  companyRegistry: KycCompanyRegistryConfig;
  addressFormat: KycAddressFormat;
  bankCodeSystem: BankCodeSystem;
}

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const TAILORED_COUNTRY_RULES: Record<string, Partial<KycCountryRule>> = {
  NG: {
    isGeneric: false,
    acceptedPersonalIdTypes: [
      {
        id: 'nin',
        label: 'National Identity Number (NIN)',
        formatDescription: '11-digit national identity number',
        pattern: '^\\d{11}$',
        requiresBackImage: false,
        samplePlaceholder: '12345678901',
      },
      {
        id: 'passport',
        label: 'Nigerian International Passport',
        formatDescription: '1 letter followed by 8 digits',
        pattern: '^[A-Za-z]\\d{8}$',
        requiresBackImage: false,
        samplePlaceholder: 'A12345678',
      },
      {
        id: 'drivers_license',
        label: "Driver's Licence",
        formatDescription: '3 letters followed by 12 characters',
        pattern: '^[A-Za-z]{3}[A-Za-z0-9]{12}$',
        requiresBackImage: true,
        samplePlaceholder: 'ABC123456789012',
      },
      {
        id: 'voters_card',
        label: "Voter's Card (VIN)",
        formatDescription: '19 alphanumeric characters',
        pattern: '^[A-Za-z0-9]{19}$',
        requiresBackImage: true,
      },
      {
        id: 'bvn',
        label: 'Bank Verification Number (BVN - Optional)',
        formatDescription: '11-digit BVN',
        pattern: '^\\d{11}$',
        requiresBackImage: false,
      },
    ],
    taxId: {
      name: 'TIN',
      label: 'Tax Identification Number (TIN)',
      formatDescription: '10 to 12 digits issued by JTB / FIRS',
      pattern: '^\\d{10,12}$',
      optional: false,
    },
    companyRegistry: {
      name: 'CAC',
      label: 'Corporate Affairs Commission (CAC) Number',
      formatDescription: 'RC or BN number (e.g. RC1234567 or BN1234567)',
      pattern: '^(RC|BN|LLP|IT)?[0-9]{6,8}$',
    },
    addressFormat: {
      stateLabel: 'State / LGA',
      postalCodeLabel: 'Postal Code (Optional)',
      postalCodeRequired: false,
    },
    bankCodeSystem: 'nuban',
  },
  GB: {
    isGeneric: false,
    acceptedPersonalIdTypes: [
      {
        id: 'passport',
        label: 'British Passport',
        formatDescription: '9-digit UK passport number',
        pattern: '^\\d{9}$',
        requiresBackImage: false,
      },
      {
        id: 'driving_licence',
        label: 'UK Driving Licence',
        formatDescription: '16-character driving licence number',
        pattern: '^[A-Za-z0-9]{16}$',
        requiresBackImage: true,
      },
    ],
    taxId: {
      name: 'UTR_VAT',
      label: 'Unique Taxpayer Reference (UTR) or VAT Number',
      formatDescription: '10-digit UTR or 9-digit VAT registration',
      pattern: '^(\\d{10}|GB\\d{9}|\\d{9})$',
      optional: false,
    },
    companyRegistry: {
      name: 'Companies House',
      label: 'Companies House Registration Number',
      formatDescription: '8-character company number (e.g. 12345678 or SC123456)',
      pattern: '^[A-Za-z0-9]{8}$',
    },
    addressFormat: {
      stateLabel: 'County / Region',
      postalCodeLabel: 'Postcode',
      postalCodeRequired: true,
    },
    bankCodeSystem: 'sort_code',
  },
  US: {
    isGeneric: false,
    acceptedPersonalIdTypes: [
      {
        id: 'passport',
        label: 'US Passport',
        formatDescription: '9-digit passport book number',
        pattern: '^\\d{9}$',
        requiresBackImage: false,
      },
      {
        id: 'state_id',
        label: "Driver's License or State ID",
        formatDescription: 'State-issued identification number',
        pattern: '^[A-Za-z0-9-]{5,20}$',
        requiresBackImage: true,
      },
    ],
    taxId: {
      name: 'EIN_SSN',
      label: 'Employer Identification Number (EIN) or SSN',
      formatDescription: '9 digits (XX-XXXXXXX or XXX-XX-XXXX)',
      pattern: '^\\d{2}-?\\d{7}$|^\\d{3}-?\\d{2}-?\\d{4}$',
      optional: false,
    },
    companyRegistry: {
      name: 'Secretary of State Filing',
      label: 'State Secretary of State Entity ID',
      formatDescription: 'State business entity or charter number',
      pattern: '^[A-Za-z0-9-]{4,15}$',
    },
    addressFormat: {
      stateLabel: 'State',
      postalCodeLabel: 'ZIP Code',
      postalCodeRequired: true,
    },
    bankCodeSystem: 'routing_number',
  },
  GH: {
    isGeneric: false,
    acceptedPersonalIdTypes: [
      {
        id: 'ghana_card',
        label: 'Ghana Card',
        formatDescription: 'Format GHA-XXXXXXXXX-X',
        pattern: '^GHA-\\d{9}-\\d$',
        requiresBackImage: true,
      },
      {
        id: 'passport',
        label: 'Ghanaian Passport',
        formatDescription: 'Passport number',
        pattern: '^[A-Za-z0-9]{7,9}$',
        requiresBackImage: false,
      },
    ],
    taxId: {
      name: 'GRA_TIN',
      label: 'Ghana Revenue Authority TIN',
      formatDescription: 'GRA Taxpayer Identification Number',
      pattern: '^[A-Za-z0-9-]{10,14}$',
      optional: false,
    },
    companyRegistry: {
      name: 'RGD',
      label: 'Registrar of Companies / RGD Number',
      formatDescription: 'Registration number (e.g. CS123456789 or BN123456789)',
      pattern: '^[A-Za-z0-9-]{8,15}$',
    },
    addressFormat: {
      stateLabel: 'Region',
      postalCodeLabel: 'Digital Address (GhanaPostGPS)',
      postalCodeRequired: false,
    },
    bankCodeSystem: 'generic',
  },
  KE: {
    isGeneric: false,
    acceptedPersonalIdTypes: [
      {
        id: 'national_id',
        label: 'Kenyan National ID',
        formatDescription: '7 to 8 digits',
        pattern: '^\\d{7,8}$',
        requiresBackImage: true,
      },
      {
        id: 'passport',
        label: 'Kenyan Passport',
        formatDescription: 'Passport number (e.g. A1234567)',
        pattern: '^[A-Za-z]\\d{7}$',
        requiresBackImage: false,
      },
    ],
    taxId: {
      name: 'KRA_PIN',
      label: 'KRA PIN',
      formatDescription: '11 characters: Starts with A or P, 9 digits, ends with a letter',
      pattern: '^[APap]\\d{9}[A-Za-z]$',
      optional: false,
    },
    companyRegistry: {
      name: 'BRS',
      label: 'Business Registration Service (BRS) Number',
      formatDescription: 'BRS or CPR business registration number',
      pattern: '^[A-Za-z0-9-]{6,15}$',
    },
    addressFormat: {
      stateLabel: 'County',
      postalCodeLabel: 'Postal Code',
      postalCodeRequired: false,
    },
    bankCodeSystem: 'generic',
  },
  ZA: {
    isGeneric: false,
    acceptedPersonalIdTypes: [
      {
        id: 'sa_id',
        label: 'South African ID Card/Book',
        formatDescription: '13-digit national identity number',
        pattern: '^\\d{13}$',
        requiresBackImage: true,
      },
      {
        id: 'passport',
        label: 'South African Passport',
        formatDescription: '9 characters',
        pattern: '^[A-Za-z0-9]{9}$',
        requiresBackImage: false,
      },
    ],
    taxId: {
      name: 'SARS_TAX',
      label: 'SARS Tax Reference Number',
      formatDescription: '10-digit South African Revenue Service tax number',
      pattern: '^\\d{10}$',
      optional: false,
    },
    companyRegistry: {
      name: 'CIPC',
      label: 'CIPC Company Registration Number',
      formatDescription: 'YYYY/NNNNNN/NN format (e.g. 2021/123456/07)',
      pattern: '^\\d{4}/\\d{6}/\\d{2}$',
    },
    addressFormat: {
      stateLabel: 'Province',
      postalCodeLabel: 'Postal Code',
      postalCodeRequired: true,
    },
    bankCodeSystem: 'generic',
  },
};

export const ALL_COUNTRIES: Array<{ code: string; name: string; dialCode: string; defaultCurrency: string }> = [
  { code: 'AF', name: 'Afghanistan', dialCode: '+93', defaultCurrency: 'AFN' },
  { code: 'AL', name: 'Albania', dialCode: '+355', defaultCurrency: 'ALL' },
  { code: 'DZ', name: 'Algeria', dialCode: '+213', defaultCurrency: 'DZD' },
  { code: 'AD', name: 'Andorra', dialCode: '+376', defaultCurrency: 'EUR' },
  { code: 'AO', name: 'Angola', dialCode: '+244', defaultCurrency: 'AOA' },
  { code: 'AG', name: 'Antigua and Barbuda', dialCode: '+1-268', defaultCurrency: 'XCD' },
  { code: 'AR', name: 'Argentina', dialCode: '+54', defaultCurrency: 'ARS' },
  { code: 'AM', name: 'Armenia', dialCode: '+374', defaultCurrency: 'AMD' },
  { code: 'AU', name: 'Australia', dialCode: '+61', defaultCurrency: 'AUD' },
  { code: 'AT', name: 'Austria', dialCode: '+43', defaultCurrency: 'EUR' },
  { code: 'AZ', name: 'Azerbaijan', dialCode: '+994', defaultCurrency: 'AZN' },
  { code: 'BS', name: 'Bahamas', dialCode: '+1-242', defaultCurrency: 'BSD' },
  { code: 'BH', name: 'Bahrain', dialCode: '+973', defaultCurrency: 'BHD' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880', defaultCurrency: 'BDT' },
  { code: 'BB', name: 'Barbados', dialCode: '+1-246', defaultCurrency: 'BBD' },
  { code: 'BY', name: 'Belarus', dialCode: '+375', defaultCurrency: 'BYN' },
  { code: 'BE', name: 'Belgium', dialCode: '+32', defaultCurrency: 'EUR' },
  { code: 'BZ', name: 'Belize', dialCode: '+501', defaultCurrency: 'BZD' },
  { code: 'BJ', name: 'Benin', dialCode: '+229', defaultCurrency: 'XOF' },
  { code: 'BT', name: 'Bhutan', dialCode: '+975', defaultCurrency: 'BTN' },
  { code: 'BO', name: 'Bolivia', dialCode: '+591', defaultCurrency: 'BOB' },
  { code: 'BA', name: 'Bosnia and Herzegovina', dialCode: '+387', defaultCurrency: 'BAM' },
  { code: 'BW', name: 'Botswana', dialCode: '+267', defaultCurrency: 'BWP' },
  { code: 'BR', name: 'Brazil', dialCode: '+55', defaultCurrency: 'BRL' },
  { code: 'BN', name: 'Brunei', dialCode: '+673', defaultCurrency: 'BND' },
  { code: 'BG', name: 'Bulgaria', dialCode: '+359', defaultCurrency: 'BGN' },
  { code: 'BF', name: 'Burkina Faso', dialCode: '+226', defaultCurrency: 'XOF' },
  { code: 'BI', name: 'Burundi', dialCode: '+257', defaultCurrency: 'BIF' },
  { code: 'CV', name: 'Cabo Verde', dialCode: '+238', defaultCurrency: 'CVE' },
  { code: 'KH', name: 'Cambodia', dialCode: '+855', defaultCurrency: 'KHR' },
  { code: 'CM', name: 'Cameroon', dialCode: '+237', defaultCurrency: 'XAF' },
  { code: 'CA', name: 'Canada', dialCode: '+1', defaultCurrency: 'CAD' },
  { code: 'CF', name: 'Central African Republic', dialCode: '+236', defaultCurrency: 'XAF' },
  { code: 'TD', name: 'Chad', dialCode: '+235', defaultCurrency: 'XAF' },
  { code: 'CL', name: 'Chile', dialCode: '+56', defaultCurrency: 'CLP' },
  { code: 'CN', name: 'China', dialCode: '+86', defaultCurrency: 'CNY' },
  { code: 'CO', name: 'Colombia', dialCode: '+57', defaultCurrency: 'COP' },
  { code: 'KM', name: 'Comoros', dialCode: '+269', defaultCurrency: 'KMF' },
  { code: 'CD', name: 'Congo (DRC)', dialCode: '+243', defaultCurrency: 'CDF' },
  { code: 'CG', name: 'Congo (Republic)', dialCode: '+242', defaultCurrency: 'XAF' },
  { code: 'CR', name: 'Costa Rica', dialCode: '+506', defaultCurrency: 'CRC' },
  { code: 'CI', name: "Cote d'Ivoire", dialCode: '+225', defaultCurrency: 'XOF' },
  { code: 'HR', name: 'Croatia', dialCode: '+385', defaultCurrency: 'EUR' },
  { code: 'CU', name: 'Cuba', dialCode: '+53', defaultCurrency: 'CUP' },
  { code: 'CY', name: 'Cyprus', dialCode: '+357', defaultCurrency: 'EUR' },
  { code: 'CZ', name: 'Czech Republic', dialCode: '+420', defaultCurrency: 'CZK' },
  { code: 'DK', name: 'Denmark', dialCode: '+45', defaultCurrency: 'DKK' },
  { code: 'DJ', name: 'Djibouti', dialCode: '+253', defaultCurrency: 'DJF' },
  { code: 'DM', name: 'Dominica', dialCode: '+1-767', defaultCurrency: 'XCD' },
  { code: 'DO', name: 'Dominican Republic', dialCode: '+1-809', defaultCurrency: 'DOP' },
  { code: 'EC', name: 'Ecuador', dialCode: '+593', defaultCurrency: 'USD' },
  { code: 'EG', name: 'Egypt', dialCode: '+20', defaultCurrency: 'EGP' },
  { code: 'SV', name: 'El Salvador', dialCode: '+503', defaultCurrency: 'USD' },
  { code: 'GQ', name: 'Equatorial Guinea', dialCode: '+240', defaultCurrency: 'XAF' },
  { code: 'ER', name: 'Eritrea', dialCode: '+291', defaultCurrency: 'ERN' },
  { code: 'EE', name: 'Estonia', dialCode: '+372', defaultCurrency: 'EUR' },
  { code: 'SZ', name: 'Eswatini', dialCode: '+268', defaultCurrency: 'SZL' },
  { code: 'ET', name: 'Ethiopia', dialCode: '+251', defaultCurrency: 'ETB' },
  { code: 'FJ', name: 'Fiji', dialCode: '+679', defaultCurrency: 'FJD' },
  { code: 'FI', name: 'Finland', dialCode: '+358', defaultCurrency: 'EUR' },
  { code: 'FR', name: 'France', dialCode: '+33', defaultCurrency: 'EUR' },
  { code: 'GA', name: 'Gabon', dialCode: '+241', defaultCurrency: 'XAF' },
  { code: 'GM', name: 'Gambia', dialCode: '+220', defaultCurrency: 'GMD' },
  { code: 'GE', name: 'Georgia', dialCode: '+995', defaultCurrency: 'GEL' },
  { code: 'DE', name: 'Germany', dialCode: '+49', defaultCurrency: 'EUR' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', defaultCurrency: 'GHS' },
  { code: 'GR', name: 'Greece', dialCode: '+30', defaultCurrency: 'EUR' },
  { code: 'GD', name: 'Grenada', dialCode: '+1-473', defaultCurrency: 'XCD' },
  { code: 'GT', name: 'Guatemala', dialCode: '+502', defaultCurrency: 'GTQ' },
  { code: 'GN', name: 'Guinea', dialCode: '+224', defaultCurrency: 'GNF' },
  { code: 'GW', name: 'Guinea-Bissau', dialCode: '+245', defaultCurrency: 'XOF' },
  { code: 'GY', name: 'Guyana', dialCode: '+592', defaultCurrency: 'GYD' },
  { code: 'HT', name: 'Haiti', dialCode: '+509', defaultCurrency: 'HTG' },
  { code: 'HN', name: 'Honduras', dialCode: '+504', defaultCurrency: 'HNL' },
  { code: 'HU', name: 'Hungary', dialCode: '+36', defaultCurrency: 'HUF' },
  { code: 'IS', name: 'Iceland', dialCode: '+354', defaultCurrency: 'ISK' },
  { code: 'IN', name: 'India', dialCode: '+91', defaultCurrency: 'INR' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62', defaultCurrency: 'IDR' },
  { code: 'IR', name: 'Iran', dialCode: '+98', defaultCurrency: 'IRR' },
  { code: 'IQ', name: 'Iraq', dialCode: '+964', defaultCurrency: 'IQD' },
  { code: 'IE', name: 'Ireland', dialCode: '+353', defaultCurrency: 'EUR' },
  { code: 'IL', name: 'Israel', dialCode: '+972', defaultCurrency: 'ILS' },
  { code: 'IT', name: 'Italy', dialCode: '+39', defaultCurrency: 'EUR' },
  { code: 'JM', name: 'Jamaica', dialCode: '+1-876', defaultCurrency: 'JMD' },
  { code: 'JP', name: 'Japan', dialCode: '+81', defaultCurrency: 'JPY' },
  { code: 'JO', name: 'Jordan', dialCode: '+962', defaultCurrency: 'JOD' },
  { code: 'KZ', name: 'Kazakhstan', dialCode: '+7', defaultCurrency: 'KZT' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', defaultCurrency: 'KES' },
  { code: 'KI', name: 'Kiribati', dialCode: '+686', defaultCurrency: 'AUD' },
  { code: 'KW', name: 'Kuwait', dialCode: '+965', defaultCurrency: 'KWD' },
  { code: 'KG', name: 'Kyrgyzstan', dialCode: '+996', defaultCurrency: 'KGS' },
  { code: 'LA', name: 'Laos', dialCode: '+856', defaultCurrency: 'LAK' },
  { code: 'LV', name: 'Latvia', dialCode: '+371', defaultCurrency: 'EUR' },
  { code: 'LB', name: 'Lebanon', dialCode: '+961', defaultCurrency: 'LBP' },
  { code: 'LS', name: 'Lesotho', dialCode: '+266', defaultCurrency: 'LSL' },
  { code: 'LR', name: 'Liberia', dialCode: '+231', defaultCurrency: 'LRD' },
  { code: 'LY', name: 'Libya', dialCode: '+218', defaultCurrency: 'LYD' },
  { code: 'LI', name: 'Liechtenstein', dialCode: '+423', defaultCurrency: 'CHF' },
  { code: 'LT', name: 'Lithuania', dialCode: '+370', defaultCurrency: 'EUR' },
  { code: 'LU', name: 'Luxembourg', dialCode: '+352', defaultCurrency: 'EUR' },
  { code: 'MG', name: 'Madagascar', dialCode: '+261', defaultCurrency: 'MGA' },
  { code: 'MW', name: 'Malawi', dialCode: '+265', defaultCurrency: 'MWK' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60', defaultCurrency: 'MYR' },
  { code: 'MV', name: 'Maldives', dialCode: '+960', defaultCurrency: 'MVR' },
  { code: 'ML', name: 'Mali', dialCode: '+223', defaultCurrency: 'XOF' },
  { code: 'MT', name: 'Malta', dialCode: '+356', defaultCurrency: 'EUR' },
  { code: 'MH', name: 'Marshall Islands', dialCode: '+692', defaultCurrency: 'USD' },
  { code: 'MR', name: 'Mauritania', dialCode: '+222', defaultCurrency: 'MRU' },
  { code: 'MU', name: 'Mauritius', dialCode: '+230', defaultCurrency: 'MUR' },
  { code: 'MX', name: 'Mexico', dialCode: '+52', defaultCurrency: 'MXN' },
  { code: 'FM', name: 'Micronesia', dialCode: '+691', defaultCurrency: 'USD' },
  { code: 'MD', name: 'Moldova', dialCode: '+373', defaultCurrency: 'MDL' },
  { code: 'MC', name: 'Monaco', dialCode: '+377', defaultCurrency: 'EUR' },
  { code: 'MN', name: 'Mongolia', dialCode: '+976', defaultCurrency: 'MNT' },
  { code: 'ME', name: 'Montenegro', dialCode: '+382', defaultCurrency: 'EUR' },
  { code: 'MA', name: 'Morocco', dialCode: '+212', defaultCurrency: 'MAD' },
  { code: 'MZ', name: 'Mozambique', dialCode: '+258', defaultCurrency: 'MZN' },
  { code: 'MM', name: 'Myanmar', dialCode: '+95', defaultCurrency: 'MMK' },
  { code: 'NA', name: 'Namibia', dialCode: '+264', defaultCurrency: 'NAD' },
  { code: 'NR', name: 'Nauru', dialCode: '+674', defaultCurrency: 'AUD' },
  { code: 'NP', name: 'Nepal', dialCode: '+977', defaultCurrency: 'NPR' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31', defaultCurrency: 'EUR' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64', defaultCurrency: 'NZD' },
  { code: 'NI', name: 'Nicaragua', dialCode: '+505', defaultCurrency: 'NIO' },
  { code: 'NE', name: 'Niger', dialCode: '+227', defaultCurrency: 'XOF' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', defaultCurrency: 'NGN' },
  { code: 'MK', name: 'North Macedonia', dialCode: '+389', defaultCurrency: 'MKD' },
  { code: 'NO', name: 'Norway', dialCode: '+47', defaultCurrency: 'NOK' },
  { code: 'OM', name: 'Oman', dialCode: '+968', defaultCurrency: 'OMR' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92', defaultCurrency: 'PKR' },
  { code: 'PW', name: 'Palau', dialCode: '+680', defaultCurrency: 'USD' },
  { code: 'PA', name: 'Panama', dialCode: '+507', defaultCurrency: 'PAB' },
  { code: 'PG', name: 'Papua New Guinea', dialCode: '+675', defaultCurrency: 'PGK' },
  { code: 'PY', name: 'Paraguay', dialCode: '+595', defaultCurrency: 'PYG' },
  { code: 'PE', name: 'Peru', dialCode: '+51', defaultCurrency: 'PEN' },
  { code: 'PH', name: 'Philippines', dialCode: '+63', defaultCurrency: 'PHP' },
  { code: 'PL', name: 'Poland', dialCode: '+48', defaultCurrency: 'PLN' },
  { code: 'PT', name: 'Portugal', dialCode: '+351', defaultCurrency: 'EUR' },
  { code: 'QA', name: 'Qatar', dialCode: '+974', defaultCurrency: 'QAR' },
  { code: 'RO', name: 'Romania', dialCode: '+40', defaultCurrency: 'RON' },
  { code: 'RU', name: 'Russia', dialCode: '+7', defaultCurrency: 'RUB' },
  { code: 'RW', name: 'Rwanda', dialCode: '+250', defaultCurrency: 'RWF' },
  { code: 'KN', name: 'Saint Kitts and Nevis', dialCode: '+1-869', defaultCurrency: 'XCD' },
  { code: 'LC', name: 'Saint Lucia', dialCode: '+1-758', defaultCurrency: 'XCD' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', dialCode: '+1-784', defaultCurrency: 'XCD' },
  { code: 'WS', name: 'Samoa', dialCode: '+685', defaultCurrency: 'WST' },
  { code: 'SM', name: 'San Marino', dialCode: '+378', defaultCurrency: 'EUR' },
  { code: 'ST', name: 'Sao Tome and Principe', dialCode: '+239', defaultCurrency: 'STN' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', defaultCurrency: 'SAR' },
  { code: 'SN', name: 'Senegal', dialCode: '+221', defaultCurrency: 'XOF' },
  { code: 'RS', name: 'Serbia', dialCode: '+381', defaultCurrency: 'RSD' },
  { code: 'SC', name: 'Seychelles', dialCode: '+248', defaultCurrency: 'SCR' },
  { code: 'SL', name: 'Sierra Leone', dialCode: '+232', defaultCurrency: 'SLE' },
  { code: 'SG', name: 'Singapore', dialCode: '+65', defaultCurrency: 'SGD' },
  { code: 'SK', name: 'Slovakia', dialCode: '+421', defaultCurrency: 'EUR' },
  { code: 'SI', name: 'Slovenia', dialCode: '+386', defaultCurrency: 'EUR' },
  { code: 'SB', name: 'Solomon Islands', dialCode: '+677', defaultCurrency: 'SBD' },
  { code: 'SO', name: 'Somalia', dialCode: '+252', defaultCurrency: 'SOS' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', defaultCurrency: 'ZAR' },
  { code: 'SS', name: 'South Sudan', dialCode: '+211', defaultCurrency: 'SSP' },
  { code: 'ES', name: 'Spain', dialCode: '+34', defaultCurrency: 'EUR' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94', defaultCurrency: 'LKR' },
  { code: 'SD', name: 'Sudan', dialCode: '+249', defaultCurrency: 'SDG' },
  { code: 'SR', name: 'Suriname', dialCode: '+597', defaultCurrency: 'SRD' },
  { code: 'SE', name: 'Sweden', dialCode: '+46', defaultCurrency: 'SEK' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41', defaultCurrency: 'CHF' },
  { code: 'SY', name: 'Syria', dialCode: '+963', defaultCurrency: 'SYP' },
  { code: 'TW', name: 'Taiwan', dialCode: '+886', defaultCurrency: 'TWD' },
  { code: 'TJ', name: 'Tajikistan', dialCode: '+992', defaultCurrency: 'TJS' },
  { code: 'TZ', name: 'Tanzania', dialCode: '+255', defaultCurrency: 'TZS' },
  { code: 'TH', name: 'Thailand', dialCode: '+66', defaultCurrency: 'THB' },
  { code: 'TL', name: 'Timor-Leste', dialCode: '+670', defaultCurrency: 'USD' },
  { code: 'TG', name: 'Togo', dialCode: '+228', defaultCurrency: 'XOF' },
  { code: 'TO', name: 'Tonga', dialCode: '+676', defaultCurrency: 'TOP' },
  { code: 'TT', name: 'Trinidad and Tobago', dialCode: '+1-868', defaultCurrency: 'TTD' },
  { code: 'TN', name: 'Tunisia', dialCode: '+216', defaultCurrency: 'TND' },
  { code: 'TR', name: 'Turkey', dialCode: '+90', defaultCurrency: 'TRY' },
  { code: 'TM', name: 'Turkmenistan', dialCode: '+993', defaultCurrency: 'TMT' },
  { code: 'TV', name: 'Tuvalu', dialCode: '+688', defaultCurrency: 'AUD' },
  { code: 'UG', name: 'Uganda', dialCode: '+256', defaultCurrency: 'UGX' },
  { code: 'UA', name: 'Ukraine', dialCode: '+380', defaultCurrency: 'UAH' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', defaultCurrency: 'AED' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', defaultCurrency: 'GBP' },
  { code: 'US', name: 'United States', dialCode: '+1', defaultCurrency: 'USD' },
  { code: 'UY', name: 'Uruguay', dialCode: '+598', defaultCurrency: 'UYU' },
  { code: 'UZ', name: 'Uzbekistan', dialCode: '+998', defaultCurrency: 'UZS' },
  { code: 'VU', name: 'Vanuatu', dialCode: '+678', defaultCurrency: 'VUV' },
  { code: 'VA', name: 'Vatican City', dialCode: '+379', defaultCurrency: 'EUR' },
  { code: 'VE', name: 'Venezuela', dialCode: '+58', defaultCurrency: 'VES' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84', defaultCurrency: 'VND' },
  { code: 'YE', name: 'Yemen', dialCode: '+967', defaultCurrency: 'YER' },
  { code: 'ZM', name: 'Zambia', dialCode: '+260', defaultCurrency: 'ZMW' },
  { code: 'ZW', name: 'Zimbabwe', dialCode: '+263', defaultCurrency: 'USD' }
];

export function getGenericRule(code: string, name: string, dialCode: string, currency: string): KycCountryRule {
  return {
    code,
    name,
    flag: getFlagEmoji(code),
    dialCode,
    defaultCurrency: currency,
    isGeneric: true,
    acceptedPersonalIdTypes: [
      {
        id: 'passport',
        label: 'International Passport',
        formatDescription: 'Valid international passport biodata page',
        requiresBackImage: false,
      },
      {
        id: 'national_id',
        label: 'National Identity Card',
        formatDescription: 'Government-issued national identification card',
        requiresBackImage: true,
      },
    ],
    taxId: {
      name: 'TIN',
      label: 'Tax Identification Number (TIN)',
      formatDescription: 'National tax reference or registration number',
      optional: false,
    },
    companyRegistry: {
      name: 'Commercial Registry',
      label: 'Company Registration / Incorporation Number',
      formatDescription: 'Official commercial registry registration number',
    },
    addressFormat: {
      stateLabel: 'State / Province / Region',
      postalCodeLabel: 'Postal / ZIP Code',
      postalCodeRequired: false,
    },
    bankCodeSystem: 'iban',
  };
}

/**
 * Retrieves the data-driven KYC rule for a given country code.
 * Falls back safely to generic rule so no country is ever blocked.
 */
export function getCountryRule(countryCode: string): KycCountryRule {
  const upper = (countryCode || '').toUpperCase().trim();
  const found = ALL_COUNTRIES.find((c) => c.code === upper) || {
    code: upper || 'XX',
    name: upper || 'Unknown',
    dialCode: '+1',
    defaultCurrency: 'USD',
  };

  const generic = getGenericRule(found.code, found.name, found.dialCode, found.defaultCurrency);
  const tailored = TAILORED_COUNTRY_RULES[upper];
  if (!tailored) {
    return generic;
  }

  return {
    ...generic,
    ...tailored,
    code: found.code,
    name: found.name,
    flag: getFlagEmoji(found.code),
    dialCode: found.dialCode,
    defaultCurrency: found.defaultCurrency,
    isGeneric: false,
  };
}

export function getAllCountryRules(): KycCountryRule[] {
  return ALL_COUNTRIES.map((c) => getCountryRule(c.code));
}

export function validateIdFormat(
  countryCode: string,
  idTypeId: string,
  idNumber: string
): { valid: boolean; message?: string } {
  const rule = getCountryRule(countryCode);
  const matchedType = rule.acceptedPersonalIdTypes.find((t) => t.id === idTypeId);
  if (!matchedType) {
    return { valid: true }; // fallback
  }
  if (matchedType.pattern) {
    const regex = new RegExp(matchedType.pattern);
    if (!regex.test(idNumber.trim())) {
      return {
        valid: false,
        message: 'Invalid format for ' + matchedType.label + '. Expected: ' + matchedType.formatDescription,
      };
    }
  }
  return { valid: true };
}

export function validateTaxIdFormat(
  countryCode: string,
  taxId: string
): { valid: boolean; message?: string } {
  const rule = getCountryRule(countryCode);
  if (!rule.taxId.optional && !taxId.trim()) {
    return { valid: false, message: rule.taxId.label + ' is required.' };
  }
  if (rule.taxId.pattern && taxId.trim()) {
    const regex = new RegExp(rule.taxId.pattern);
    if (!regex.test(taxId.trim())) {
      return {
        valid: false,
        message: 'Invalid format for ' + rule.taxId.label + '. Expected: ' + rule.taxId.formatDescription,
      };
    }
  }
  return { valid: true };
}

export function validateCompanyRegistryFormat(
  countryCode: string,
  regNumber: string
): { valid: boolean; message?: string } {
  const rule = getCountryRule(countryCode);
  if (!regNumber.trim()) {
    return { valid: false, message: rule.companyRegistry.label + ' is required.' };
  }
  if (rule.companyRegistry.pattern) {
    const regex = new RegExp(rule.companyRegistry.pattern);
    if (!regex.test(regNumber.trim())) {
      return {
        valid: false,
        message: 'Invalid format for ' + rule.companyRegistry.label + '. Expected: ' + rule.companyRegistry.formatDescription,
      };
    }
  }
  return { valid: true };
}
