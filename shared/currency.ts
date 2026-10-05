export type CurrencyPosition = 'prefix' | 'suffix';

export type CurrencyInfo = {
  code: string;
  symbol: string;
  name: string;
  position: CurrencyPosition;
};

export const CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: 'USD', symbol: '$', name: 'الدولار الأمريكي', position: 'prefix' },
  EUR: { code: 'EUR', symbol: '€', name: 'اليورو', position: 'prefix' },
  GBP: { code: 'GBP', symbol: '£', name: 'الجنيه الإسترليني', position: 'prefix' },
  SAR: { code: 'SAR', symbol: 'ر.س', name: 'الريال السعودي', position: 'suffix' },
  AED: { code: 'AED', symbol: 'د.إ', name: 'الدرهم الإماراتي', position: 'suffix' },
  EGP: { code: 'EGP', symbol: 'ج.م', name: 'الجنيه المصري', position: 'suffix' },
  JOD: { code: 'JOD', symbol: 'د.أ', name: 'الدينار الأردني', position: 'suffix' },
  IQD: { code: 'IQD', symbol: 'د.ع', name: 'الدينار العراقي', position: 'suffix' },
  SYP: { code: 'SYP', symbol: 'ل.س', name: 'الليرة السورية', position: 'suffix' },
  KWD: { code: 'KWD', symbol: 'د.ك', name: 'الدينار الكويتي', position: 'suffix' },
  QAR: { code: 'QAR', symbol: 'ر.ق', name: 'الريال القطري', position: 'suffix' },
  BHD: { code: 'BHD', symbol: 'د.ب', name: 'الدينار البحريني', position: 'suffix' },
  OMR: { code: 'OMR', symbol: 'ر.ع', name: 'الريال العُماني', position: 'suffix' },
  YER: { code: 'YER', symbol: 'ر.ي', name: 'الريال اليمني', position: 'suffix' },
  LBP: { code: 'LBP', symbol: 'ل.ل', name: 'الليرة اللبنانية', position: 'suffix' },
  LYD: { code: 'LYD', symbol: 'د.ل', name: 'الدينار الليبي', position: 'suffix' },
  TND: { code: 'TND', symbol: 'د.ت', name: 'الدينار التونسي', position: 'suffix' },
  DZD: { code: 'DZD', symbol: 'د.ج', name: 'الدينار الجزائري', position: 'suffix' },
  MAD: { code: 'MAD', symbol: 'د.م', name: 'الدرهم المغربي', position: 'suffix' },
  SDG: { code: 'SDG', symbol: 'ج.س', name: 'الجنيه السوداني', position: 'suffix' },
  MRU: { code: 'MRU', symbol: 'أ.م', name: 'الأوقية الموريتانية', position: 'suffix' },
  SOS: { code: 'SOS', symbol: 'ش.ص', name: 'الشلن الصومالي', position: 'suffix' },
  DJF: { code: 'DJF', symbol: 'ف.ج', name: 'الفرنك الجيبوتي', position: 'suffix' },
  KMF: { code: 'KMF', symbol: 'ف.ق', name: 'الفرنك القمري', position: 'suffix' },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

/** The 2025 redenomination dropped two zeros: 100 old SYP = 1 new SYP. */
export const OLD_SYP_PER_NEW_SYP = 100;

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = Object.values(CURRENCIES);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return code in CURRENCIES;
}

const EXPENSE_CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'SAR',
  'AED',
  'EGP',
  'JOD',
  'IQD',
  'SYP',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
] as const;

export const EXPENSE_CURRENCIES: CurrencyInfo[] = EXPENSE_CURRENCY_CODES.map(
  (code) => CURRENCIES[code] as CurrencyInfo
);

export function isExpenseCurrency(code: string): code is CurrencyCode {
  return EXPENSE_CURRENCIES.some((currency) => currency.code === code);
}

export function getCurrencyInfo(code: string | null | undefined): CurrencyInfo {
  if (code && code in CURRENCIES) return CURRENCIES[code as CurrencyCode] as CurrencyInfo;
  return CURRENCIES[DEFAULT_CURRENCY] as CurrencyInfo;
}

export function getCurrencySymbol(code: string | null | undefined): string {
  return getCurrencyInfo(code).symbol;
}

export function getCurrencyName(code: string | null | undefined): string {
  return getCurrencyInfo(code).name;
}

export function formatMoney(amount: number, code: string | null | undefined): string {
  const info = getCurrencyInfo(code);
  const value = new Intl.NumberFormat('ar-SA-u-nu-latn', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return info.position === 'prefix' ? `${info.symbol}${value}` : `${value} ${info.symbol}`;
}

function getCurated(code: string): CurrencyInfo | undefined {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code) ? CURRENCIES[code] : undefined;
}

export function getCurrencyDisplayName(code: string): string {
  const curated = getCurated(code);
  if (curated) return curated.name;
  try {
    return new Intl.DisplayNames(['ar'], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function getCurrencyDisplaySymbol(code: string): string {
  const curated = getCurated(code);
  if (curated) return curated.symbol;
  try {
    const parts = new Intl.NumberFormat('ar', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(1);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}
