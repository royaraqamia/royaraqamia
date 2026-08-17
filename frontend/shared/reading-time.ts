import { estimateReadingTime, estimateWordCount } from '@/shared/reading-time';

export { estimateReadingTime, estimateWordCount };

export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  return `${minutes} د`;
}

export function formatReadingTimeLong(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتان';
  return `${minutes} دقائق قراءة`;
}
