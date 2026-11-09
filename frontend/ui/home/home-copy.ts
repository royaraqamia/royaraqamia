/**
 * The homepage door's words (ADR-0146).
 *
 * The sheet's own title and body live beside the sheet; these are the empty
 * state and the strip's accessible names. The app labels themselves come from
 * the generated `SERVICES_COPY`, never from here.
 */
export const HOME_COPY = {
  emptyTitle: 'ابدأ بتطبيقك الأوَّل',
  emptyBody: 'القرآن، الأذكار، ملاحظاتك… اختر ما تريد أن تجده هنا كلَّ يوم.',
  emptyCta: 'أضِف تطبيقًا',
  emptyNote: 'يمكنك تغييرها وقت ما تشاء.',
  stripLabel: 'تطبيقاتك',
  newApp: 'تطبيق جديد',
} as const;
