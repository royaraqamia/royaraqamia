/**
 * `/assistant` in the member's words (ADR-0224).
 *
 * The page is a document surface — the app opens it rather than drawing a second
 * copy of the form — so these strings have no generated Kotlin twin and live
 * here, beside the view that renders them, exactly like the grants block's copy
 * before it. A key the view does not draw is a key this file should not have;
 * `metaTitle` is drawn by the route's `<head>`, and `openPage` names the panel's
 * and the thread header's door.
 */
export const ASSISTANT_HOME_COPY = {
  metaTitle: 'المساعد',
  openPage: 'افتح صفحة المساعد',
  guestTitle: 'مساعدك بعد تسجيل الدُّخول',
  guestBody: 'سجِّل الدُّخول لترى مساعدك، وتغيّر اسمه، وتراجع ما يفعله دون سؤال.',
  signIn: 'تسجيل الدُّخول',
  loading: 'جاري تحميل بيانات المساعد...',
  loadFailed: 'تعذّر تحميل بيانات المساعد.',
  retry: 'إعادة المحاولة',
  nameLabel: 'اسم المساعد',
  nameHint: 'من 1 إلى 24 حرفاً: الحروف والأرقام والمسافة فقط. اتركه فارغاً ليعود إلى «نور».',
  save: 'حفظ',
  saving: 'جاري الحفظ...',
  saved: 'حُفظ الاسم.',
  saveFailed: 'تعذّر حفظ الاسم.',
  sectionsAria: 'روابط المساعد',
  memoryTitle: 'ما يتذكّره',
  memoryBody: 'الحقائق التي يحفظها عنك، وتصديرها أو حذفها.',
  appsTitle: 'تطبيقاته',
  appsBody: 'التطبيقات المتصلة التي يستطيع العمل بها.',
  codingTitle: 'مهام البرمجة',
  codingBody: 'المستودعات والمهام التي ينفّذها، وحالة كل منها.',
} as const;

export type AssistantHomeCopy = typeof ASSISTANT_HOME_COPY;
