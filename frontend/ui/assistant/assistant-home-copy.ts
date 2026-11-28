/**
 * `/assistant` in the member's words (ADR-0224, ADR-0228, ADR-0229).
 *
 * The page is a document surface — the app opens it rather than drawing a second
 * copy of the form — so these strings have no generated Kotlin twin and live
 * here, beside the view that renders them, exactly like the grants block's copy
 * before it. A key the view does not draw is a key this file should not have;
 * `metaTitle` is the route's `<head>` until the view writes the member's own
 * name, and `openPage` names the panel's and the thread header's door.
 *
 * Nothing here says «المساعد»: the page is about the member's own copy, and a
 * label that has to name it carries `{name}` — the member's choice, or «نور».
 * Sentences that describe the assistant are written without a gendered verb, so
 * they read correctly whether the voice is feminine or masculine.
 */
export const ASSISTANT_HOME_COPY = {
  /** The tab title before the view writes the member's name (ADR-0229). */
  metaTitle: 'نور',
  openPage: 'افتح صفحة {name}',
  guestTitle: 'بياناتك بعد تسجيل الدُّخول',
  guestBody: 'سجِّل الدُّخول لتغيّر الاسم والصُّورة، وتراجع ما يجري دون سؤالك.',
  signIn: 'تسجيل الدُّخول',
  loading: 'جاري تحميل البيانات...',
  loadFailed: 'تعذّر تحميل البيانات.',
  retry: 'إعادة المحاولة',

  /** The name with its pen, and the dialog behind it. */
  editName: 'تعديل الاسم',
  nameLabel: 'الاسم',
  nameHint: 'من 1 إلى 24 حرفاً: الحروف والأرقام والمسافة فقط. اتركه فارغاً ليعود إلى «نور».',
  nameRequired: 'الاسم مطلوب',
  nameTooLong: 'الاسم طويل جدًا',
  invalidName: 'اسم غير صالح',
  nameFailed: 'تعذَّر تحديث الاسم',
  nameSaved: 'تمَّ تحديث الاسم',
  save: 'حفظ',
  saving: 'جاري الحفظ...',

  /** How the assistant is addressed; the copy and the prompt follow it. */
  voiceLabel: 'صيغة الخطاب',
  voiceHint: 'تتبعها نصوص الموقع وردود المحادثة.',
  voiceFeminine: 'مؤنث',
  voiceMasculine: 'مذكر',

  /** The face with its camera badge, and the dialog behind it. */
  addAvatar: 'إضافة صُورة',
  editAvatar: 'تعديل أو حذف الصُّورة',
  avatarTitle: 'الصُّورة',
  imageLimit: 'الحد الأقصى لحجم الصُّورة 5 ميغابايت',
  changeAvatar: 'تغيير الصُّورة',
  uploadAvatar: 'رفع صُورة',
  uploading: 'جاري الرَّفع...',
  removeAvatar: 'حذف الصُّورة',
  removing: 'جاري الحذف...',
  removeMessage: 'هل أنت متأكِّد أنَّك تريد حذف هذه الصُّورة؟',
  confirmDelete: 'حذف',
  cancel: 'إلغاء',
  invalidImage: 'يجب أن يكون الملف صورة صالحة',
  imageTooLarge: 'يجب أن تكون الصورة أقل من 5 ميغابايت',
  avatarFailed: 'تعذَّر رفع الصُّورة',
  avatarSaved: 'تمَّ تحديث الصُّورة',
  avatarRemoveFailed: 'تعذَّر حذف الصُّورة',
  avatarRemoved: 'تمَّ حذف الصُّورة',

  sectionsAria: 'روابط إضافية',
  memoryTitle: 'ما يتذكّره',
  memoryBody: 'الحقائق التي تُحفظ عنك، وتصديرها أو حذفها.',
  codingTitle: 'مهام البرمجة',
  codingBody: 'المستودعات والمهام وحالة كل منها.',
} as const;

export type AssistantHomeCopy = typeof ASSISTANT_HOME_COPY;
