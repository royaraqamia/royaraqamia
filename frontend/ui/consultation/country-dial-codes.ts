export interface CountryDialCode {
  /** ISO 3166-1 alpha-2, unique key for list rendering. */
  iso: string;
  /** Arabic display name (primary UI language). */
  nameAr: string;
  /** International dial code without the leading "+". */
  dial: string;
  flag: string;
}

export const DEFAULT_COUNTRY: CountryDialCode = {
  iso: 'SY',
  nameAr: 'سوريا',
  dial: '963',
  flag: '🇸🇾',
};

/**
 * Curated calling-code list ordered for the primary audience:
 * Syria first, then the Levant/Gulf, North Africa, then major
 * diaspora destinations. Search makes ordering secondary.
 */
export const COUNTRY_DIAL_CODES: readonly CountryDialCode[] = [
  DEFAULT_COUNTRY,
  { iso: 'PS', nameAr: 'فلسطين', dial: '970', flag: '🇵🇸' },
  { iso: 'LB', nameAr: 'لبنان', dial: '961', flag: '🇱🇧' },
  { iso: 'JO', nameAr: 'الأردن', dial: '962', flag: '🇯🇴' },
  { iso: 'IQ', nameAr: 'العراق', dial: '964', flag: '🇮🇶' },
  { iso: 'KW', nameAr: 'الكويت', dial: '965', flag: '🇰🇼' },
  { iso: 'SA', nameAr: 'السعودية', dial: '966', flag: '🇸🇦' },
  { iso: 'BH', nameAr: 'البحرين', dial: '973', flag: '🇧🇭' },
  { iso: 'QA', nameAr: 'قطر', dial: '974', flag: '🇶🇦' },
  { iso: 'AE', nameAr: 'الإمارات', dial: '971', flag: '🇦🇪' },
  { iso: 'OM', nameAr: 'عُمان', dial: '968', flag: '🇴🇲' },
  { iso: 'YE', nameAr: 'اليمن', dial: '967', flag: '🇾🇪' },
  { iso: 'EG', nameAr: 'مصر', dial: '20', flag: '🇪🇬' },
  { iso: 'SD', nameAr: 'السودان', dial: '249', flag: '🇸🇩' },
  { iso: 'LY', nameAr: 'ليبيا', dial: '218', flag: '🇱🇾' },
  { iso: 'TN', nameAr: 'تونس', dial: '216', flag: '🇹🇳' },
  { iso: 'DZ', nameAr: 'الجزائر', dial: '213', flag: '🇩🇿' },
  { iso: 'MA', nameAr: 'المغرب', dial: '212', flag: '🇲🇦' },
  { iso: 'MR', nameAr: 'موريتانيا', dial: '222', flag: '🇲🇷' },
  { iso: 'SO', nameAr: 'الصومال', dial: '252', flag: '🇸🇴' },
  { iso: 'DJ', nameAr: 'جيبوتي', dial: '253', flag: '🇩🇯' },
  { iso: 'TR', nameAr: 'تركيا', dial: '90', flag: '🇹🇷' },
  { iso: 'DE', nameAr: 'ألمانيا', dial: '49', flag: '🇩🇪' },
  { iso: 'SE', nameAr: 'السويد', dial: '46', flag: '🇸🇪' },
  { iso: 'NL', nameAr: 'هولندا', dial: '31', flag: '🇳🇱' },
  { iso: 'BE', nameAr: 'بلجيكا', dial: '32', flag: '🇧🇪' },
  { iso: 'DK', nameAr: 'الدنمارك', dial: '45', flag: '🇩🇰' },
  { iso: 'FR', nameAr: 'فرنسا', dial: '33', flag: '🇫🇷' },
  { iso: 'GB', nameAr: 'المملكة المتحدة', dial: '44', flag: '🇬🇧' },
  { iso: 'ES', nameAr: 'إسبانيا', dial: '34', flag: '🇪🇸' },
  { iso: 'IT', nameAr: 'إيطاليا', dial: '39', flag: '🇮🇹' },
  { iso: 'GR', nameAr: 'اليونان', dial: '30', flag: '🇬🇷' },
  { iso: 'RO', nameAr: 'رومانيا', dial: '40', flag: '🇷🇴' },
  { iso: 'RU', nameAr: 'روسيا', dial: '7', flag: '🇷🇺' },
  { iso: 'UA', nameAr: 'أوكرانيا', dial: '380', flag: '🇺🇦' },
  { iso: 'US', nameAr: 'الولايات المتحدة وكندا', dial: '1', flag: '🇺🇸' },
  { iso: 'AU', nameAr: 'أستراليا', dial: '61', flag: '🇦🇺' },
  { iso: 'MY', nameAr: 'ماليزيا', dial: '60', flag: '🇲🇾' },
  { iso: 'PK', nameAr: 'باكستان', dial: '92', flag: '🇵🇰' },
  { iso: 'IN', nameAr: 'الهند', dial: '91', flag: '🇮🇳' },
];
