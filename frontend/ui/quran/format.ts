/**
 * Tanzil's word for where a sura was revealed, in Arabic.
 */
export function revelationLabel(revelation: 'Meccan' | 'Medinan'): string {
  return revelation === 'Meccan' ? 'مكِّيَّة' : 'مدنيَّة';
}
