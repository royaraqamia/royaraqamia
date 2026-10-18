/**
 * The Arabic-Indic digits the text itself uses, so an ayah number in the margin
 * looks like part of the page rather than a Latin annotation on it.
 */
const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

export function toArabicDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => ARABIC_INDIC[Number(digit)]!);
}

/** Tanzil's word for where a sura was revealed, in Arabic. */
export function revelationLabel(revelation: 'Meccan' | 'Medinan'): string {
  return revelation === 'Meccan' ? 'مكِّيَّة' : 'مدنيَّة';
}
