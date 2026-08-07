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
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = Object.values(CURRENCIES);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return code in CURRENCIES;
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