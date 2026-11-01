/**
 * `/account/services` in the site's words (ADR-0112).
 *
 * Not a generated module: the shell opens this page as the document, so no
 * Kotlin object draws these strings, and `shared/copy` is reserved for the copy a
 * listed parity row is checked against. The row labels themselves are not here —
 * they are `SERVICES_LINK`'s, which come from the generated `SERVICES_COPY`, so
 * the switch and the menu cannot name a service differently.
 *
 * A `{name}` is a placeholder the caller substitutes, not a format string.
 */
export const HIDDEN_SERVICES_COPY = {
  title: 'الخدمات الظَّاهرة',
  shown: 'ظاهرة',
  hidden: 'مخفيَّة',
  hideAria: 'إخفاء {name}',
  showAria: 'إظهار {name}',
  hideFailed: 'تعذَّر حفظ التَّغيير. أعد المحاولة.',
  allHidden: 'أخفيت كل الخدمات. أظهر واحدة على الأقل لتظهر في القائمة من جديد.',
  loadingLabel: 'جاري تحميل الخدمات…',
  failed: 'تعذَّر تحميل حالة الخدمات.',
  offline:
    'تعذَّر تحميل حالة الخدمات: لم يصل الطَّلب إلى الخادم. تحقَّق من اتِّصالك ثم أعد المحاولة.',
  retry: 'إعادة المحاولة',
  signIn: 'سجِّل الدُّخول لتخصيص الخدمات الظَّاهرة.',
} as const;
