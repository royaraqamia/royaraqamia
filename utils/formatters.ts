/**
 * Formats a date to Hijri calendar using 'ar-SA' locale and 'latn' numbering system.
 * @param date The date to format (Date object, string, or timestamp)
 * @param options Optional Intl.DateTimeFormatOptions
 * @returns Formatted Hijri date string
 */
export const formatHijriDate = (
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  const dateObj = new Date(date);

  // Default options for Hijri date
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    calendar: 'islamic-umalqura',
    numberingSystem: 'latn',
    ...options,
  };

  return new Intl.DateTimeFormat('ar-SA', defaultOptions).format(dateObj);
};

/**
 * Formats a number using 'ar-SA' locale and 'latn' numbering system (1, 2, 3).
 * @param num The number to format
 * @param options Optional Intl.NumberFormatOptions
 * @returns Formatted number string
 */
export const formatNumber = (num: number, options: Intl.NumberFormatOptions = {}): string => {
  const defaultOptions: Intl.NumberFormatOptions = {
    numberingSystem: 'latn',
    ...options,
  };

  return new Intl.NumberFormat('ar-SA', defaultOptions).format(num);
};
