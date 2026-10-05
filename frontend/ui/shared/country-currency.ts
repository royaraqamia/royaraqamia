/**
 * Maps a visitor's ISO 3166-1 alpha-2 country to the currency quoted on the
 * rates board. Only countries that use a currency the board carries are listed;
 * every other country resolves to `null` so the caller can apply its fallback.
 *
 * EUR covers the eurozone plus the microstates and overseas territories that
 * use it unilaterally. USD is listed for the United States and the economies
 * that have adopted it (Ecuador, El Salvador, Panama, …).
 */
const CURRENCY_BY_COUNTRY: Readonly<Record<string, string>> = {
  // US dollar.
  US: 'USD',
  EC: 'USD',
  SV: 'USD',
  PA: 'USD',
  TL: 'USD',
  PR: 'USD',
  GU: 'USD',
  VI: 'USD',
  AS: 'USD',
  MP: 'USD',
  UM: 'USD',
  PW: 'USD',
  FM: 'USD',
  MH: 'USD',
  TC: 'USD',
  VG: 'USD',
  BQ: 'USD',
  ZW: 'USD',

  // Euro.
  AT: 'EUR',
  BE: 'EUR',
  BG: 'EUR',
  HR: 'EUR',
  CY: 'EUR',
  EE: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  GR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  SK: 'EUR',
  SI: 'EUR',
  ES: 'EUR',
  AD: 'EUR',
  MC: 'EUR',
  SM: 'EUR',
  VA: 'EUR',
  ME: 'EUR',
  XK: 'EUR',
  AX: 'EUR',
  GP: 'EUR',
  MQ: 'EUR',
  GF: 'EUR',
  RE: 'EUR',
  YT: 'EUR',
  PM: 'EUR',
  BL: 'EUR',
  MF: 'EUR',

  // Arab world.
  SA: 'SAR',
  AE: 'AED',
  EG: 'EGP',
  JO: 'JOD',
  IQ: 'IQD',
  SY: 'SYP',
  KW: 'KWD',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
  YE: 'YER',
  LB: 'LBP',
  LY: 'LYD',
  TN: 'TND',
  DZ: 'DZD',
  MA: 'MAD',
  EH: 'MAD',
  MR: 'MRU',
};

/** Resolves the currency used in an ISO 3166-1 alpha-2 country, or null. */
export function currencyFromCountry(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return CURRENCY_BY_COUNTRY[iso.toUpperCase()] ?? null;
}
