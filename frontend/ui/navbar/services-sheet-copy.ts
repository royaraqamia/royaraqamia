/**
 * The add/remove sheet's words (ADR-0146).
 *
 * Site-only for now: the native sheet keeps its row names from the generated
 * `SERVICES_COPY` and gains this sheet's add/remove states in the Android pair
 * (PR 5), at which point these strings move into `shared/copy` rather than
 * being retyped in Kotlin (ADR-0098).
 */
export const SERVICES_SHEET_COPY = {
  title: 'التطبيقات',
  body: 'أضِف ما تريد أن تجده في صفحتك، وأزِل ما لا تحتاجه.',
  add: 'إضافة',
  remove: 'إزالة',
  failed: 'تعذَّر تحديث تطبيقاتك.',
} as const;
