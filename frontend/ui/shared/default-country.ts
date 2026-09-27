'use client';

import * as React from 'react';

import { DEFAULT_COUNTRY, getCountryByIso, type CountryDialCode } from './country-dial-codes';
import { readCountryCookie } from './country-cookie';

/**
 * Best-effort IANA timezone → ISO 3166-1 alpha-2 map. Only zones that map to a
 * single country are listed; ambiguous multi-country zones fall through to the
 * browser language region or the default. Ordered regionally for reviewability.
 */
const TIMEZONE_TO_ISO: Readonly<Record<string, string>> = {
  // Levant, Gulf and the wider Arab world.
  'Asia/Damascus': 'SY',
  'Asia/Beirut': 'LB',
  'Asia/Amman': 'JO',
  'Asia/Baghdad': 'IQ',
  'Asia/Kuwait': 'KW',
  'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA',
  'Asia/Bahrain': 'BH',
  'Asia/Dubai': 'AE',
  'Asia/Muscat': 'OM',
  'Asia/Aden': 'YE',
  'Africa/Cairo': 'EG',
  'Africa/Khartoum': 'SD',
  'Africa/Tripoli': 'LY',
  'Africa/Tunis': 'TN',
  'Africa/Algiers': 'DZ',
  'Africa/Casablanca': 'MA',
  'Africa/El_Aaiun': 'EH',
  'Africa/Nouakchott': 'MR',
  'Africa/Mogadishu': 'SO',
  'Africa/Djibouti': 'DJ',
  'Indian/Comoro': 'KM',
  'Asia/Gaza': 'PS',
  'Asia/Hebron': 'PS',

  // Neighbouring regions and major diaspora destinations.
  'Europe/Istanbul': 'TR',
  'Asia/Tehran': 'IR',
  'Asia/Baku': 'AZ',
  'Asia/Yerevan': 'AM',
  'Asia/Tbilisi': 'GE',
  'Europe/Berlin': 'DE',
  'Europe/Stockholm': 'SE',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Oslo': 'NO',
  'Europe/Paris': 'FR',
  'Europe/London': 'GB',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Athens': 'GR',
  'Europe/Bucharest': 'RO',
  'Europe/Moscow': 'RU',
  'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Phoenix': 'US',
  'America/Los_Angeles': 'US',
  'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA',
  'America/Halifax': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU',
  'Australia/Adelaide': 'AU',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dhaka': 'BD',
  'Asia/Kabul': 'AF',

  // Rest of Europe.
  'Europe/Lisbon': 'PT',
  'Europe/Dublin': 'IE',
  'Europe/Vienna': 'AT',
  'Europe/Zurich': 'CH',
  'Europe/Prague': 'CZ',
  'Europe/Budapest': 'HU',
  'Europe/Warsaw': 'PL',
  'Europe/Belgrade': 'RS',
  'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR',
  'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK',
  'Europe/Vilnius': 'LT',
  'Europe/Riga': 'LV',
  'Europe/Tallinn': 'EE',
  'Europe/Minsk': 'BY',
  'Europe/Chisinau': 'MD',
  'Atlantic/Reykjavik': 'IS',
  'Asia/Nicosia': 'CY',
  'Europe/Nicosia': 'CY',

  // Rest of Asia.
  'Asia/Jerusalem': 'IL',
  'Asia/Tel_Aviv': 'IL',
  'Asia/Shanghai': 'CN',
  'Asia/Chongqing': 'CN',
  'Asia/Urumqi': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Macau': 'MO',
  'Asia/Taipei': 'TW',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Singapore': 'SG',
  'Asia/Jakarta': 'ID',
  'Asia/Manila': 'PH',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Yangon': 'MM',
  'Asia/Phnom_Penh': 'KH',
  'Asia/Vientiane': 'LA',
  'Asia/Ulaanbaatar': 'MN',
  'Asia/Kathmandu': 'NP',
  'Asia/Colombo': 'LK',
  'Asia/Tashkent': 'UZ',
  'Asia/Almaty': 'KZ',
  'Asia/Bishkek': 'KG',
  'Asia/Dushanbe': 'TJ',
  'Asia/Ashgabat': 'TM',
  'Asia/Yekaterinburg': 'RU',

  // Americas.
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Santiago': 'CL',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'America/Caracas': 'VE',
  'America/Guayaquil': 'EC',
  'America/La_Paz': 'BO',
  'America/Asuncion': 'PY',
  'America/Montevideo': 'UY',
  'America/Panama': 'PA',
  'America/Costa_Rica': 'CR',
  'America/Guatemala': 'GT',
  'America/Havana': 'CU',
  'America/Santo_Domingo': 'DO',
  'America/Puerto_Rico': 'PR',

  // Africa.
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Accra': 'GH',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Kampala': 'UG',
  'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Johannesburg': 'ZA',
  'Africa/Kinshasa': 'CD',
  'Africa/Luanda': 'AO',
  'Africa/Dakar': 'SN',
  'Africa/Abidjan': 'CI',
  'Africa/Bamako': 'ML',
  'Africa/Ouagadougou': 'BF',
  'Africa/Niamey': 'NE',
  'Africa/Ndjamena': 'TD',
  'Africa/Kigali': 'RW',
  'Africa/Lusaka': 'ZM',
  'Africa/Harare': 'ZW',
  'Africa/Maputo': 'MZ',
  'Africa/Gaborone': 'BW',
  'Africa/Windhoek': 'NA',
  'Indian/Mauritius': 'MU',
  'Indian/Antananarivo': 'MG',

  // Oceania.
  'Pacific/Auckland': 'NZ',
  'Pacific/Fiji': 'FJ',
};

/** Resolves an IANA timezone to an ISO country code, using only unambiguous zones. */
export function isoFromTimezone(timeZone: string | null | undefined): string | null {
  if (!timeZone) return null;
  return TIMEZONE_TO_ISO[timeZone] ?? null;
}

/**
 * Reads the region subtag of a BCP 47 language tag, e.g. `"ar-SY"` → `"SY"`.
 * Deliberately does not maximize the tag: `"en"` says nothing about location.
 */
export function isoFromLanguage(language: string | null | undefined): string | null {
  if (!language) return null;
  try {
    return new Intl.Locale(language).region ?? null;
  } catch {
    return null;
  }
}

export interface DefaultCountrySignals {
  explicitIso?: string | null;
  cookie?: string | null;
  timeZone?: string | null;
  language?: string | null;
}

/**
 * Picks the default country from the strongest available signal: an explicit
 * override, then the geo cookie, then timezone, then language, then `SY`.
 */
export function resolveDefaultCountry(signals: DefaultCountrySignals): CountryDialCode {
  const candidates = [
    signals.explicitIso,
    signals.cookie,
    isoFromTimezone(signals.timeZone),
    isoFromLanguage(signals.language),
  ];
  for (const iso of candidates) {
    const match = getCountryByIso(iso);
    if (match) return match;
  }
  return DEFAULT_COUNTRY;
}

/**
 * Location-based default country. The first render matches the server (only the
 * explicit override is applied), then a mount effect layers in the cookie and
 * browser signals — keeping static pages prerendered and avoiding hydration
 * mismatches at the cost of one post-hydration update.
 */
export function useDefaultCountry(explicitIso?: string | null): CountryDialCode {
  const [country, setCountry] = React.useState<CountryDialCode>(() =>
    resolveDefaultCountry({ explicitIso })
  );

  React.useEffect(() => {
    if (explicitIso) {
      setCountry(resolveDefaultCountry({ explicitIso }));
      return;
    }
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setCountry(
      resolveDefaultCountry({
        cookie: readCountryCookie(document.cookie),
        timeZone,
        language: navigator.language,
      })
    );
  }, [explicitIso]);

  return country;
}
