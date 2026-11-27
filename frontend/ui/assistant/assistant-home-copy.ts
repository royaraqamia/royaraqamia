/**
 * `/assistant` in the member's words (ADR-0224).
 *
 * The page is a document surface — the app opens it rather than drawing a second
 * copy of the form — so these strings have no generated Kotlin twin and live
 * here, beside the view that renders them, exactly like the grants block's copy
 * before it. A key the view does not draw is a key this file should not have.
 */
export const ASSISTANT_HOME_COPY = {
  eyebrow: 'المساعد',
  lead: 'اسمه وعلامته وأذونه في مكان واحد، والشيء الذي يتذكّره.',
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
  reset: 'إعادة التعيين',
  resetTitle: 'إعادة تعيين المساعد',
  resetMessage: 'سيعود الاسم إلى «نور»، وتُحذف العلامة والنبرة والملاحظة التي حفظتها.',
  resetConfirm: 'إعادة التعيين',
  resetDone: 'أُعيد الاسم إلى «نور».',
  resetFailed: 'تعذّرت إعادة التعيين.',
  cancel: 'إلغاء',
  sectionsTitle: 'أقسام المساعد',
  memoryTitle: 'ما يتذكّره',
  memoryBody: 'الحقائق التي يحفظها عنك، وتصديرها أو حذفها.',
  appsTitle: 'تطبيقاته',
  appsBody: 'التطبيقات المتصلة التي يستطيع العمل بها.',
  codingTitle: 'مهام البرمجة',
  codingBody: 'المستودعات والمهام التي ينفّذها، وحالة كل منها.',
  open: 'فتح',
} as const;

export type AssistantHomeCopy = typeof ASSISTANT_HOME_COPY;
