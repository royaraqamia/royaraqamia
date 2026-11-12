/**
 * The connection screen's words (#1224, #1256).
 *
 * The store tab's labels moved to `shared/copy/mcp-store.json` (#1256): that tab
 * is a ported panel, so its words are generated for both clients instead of
 * living in a module only the site reads. What is left here is the screen the
 * store's rows open — `frontend/ui/mcp/connection-view.tsx` — which is ported in
 * the same issue's third slice; until then its words stay in one module rather
 * than in a `shared/copy` file with one side (the rule
 * `scripts/check-parity.mjs` enforces).
 *
 * A `{name}` is a placeholder the caller substitutes, not a format string.
 */
export const MCP_MARKETPLACE_COPY = {
  searchPlaceholder: 'ابحث باسم التطبيق أو وصفه...',
  connectionNeedsReauth: 'انتهت صلاحية الوصول إلى هذا التطبيق. افصله ثم أعد ربطه.',
  connectionUnreachable: 'تعذّرت الاستجابة من هذا التطبيق. أعد المحاولة لاحقًا أو افصله.',
  connectionEnabled: 'مُفعَّل',
  detailReach: 'يستطيع نور أن يستدعي أدوات هذا التطبيق عندما تطلب ذلك، ضمن الصلاحية أدناه.',
  detailPermissionTitle: 'الصلاحية',
  detailAuthTitle: 'طريقة الربط',
  detailAuthOauth: 'حساب لدى التطبيق، بموافقتك عند الربط.',
  detailAuthNone: 'بلا حساب ولا مفتاح: التطبيق يستجيب دون بيانات اعتماد.',
  detailAuthApiKey: 'مفتاح محفوظ ومشفّر، ولا يظهر بعد حفظه.',
  detailKeySectionTitle: 'المفتاح',
  detailKeyBody:
    'احتفظنا بمفتاحك مشفّراً. إن ألغيته عند التطبيق أو بدّلته، أدخل الجديد هنا ليستمر نور في استدعاء أدواته.',
  detailKeyLabel: 'المفتاح الجديد',
  detailKeyPlaceholder: 'الصق المفتاح الجديد',
  detailKeyAction: 'استبدال المفتاح',
  detailKeyDone: 'تم تحديث المفتاح.',
  detailKeyFailed: 'تعذّر حفظ المفتاح.',
  detailScopesTitle: 'الصلاحيات الممنوحة',
  detailScopesBody: 'ما منحه التطبيق لنور في حسابك، بأسماء الصلاحيات كما يسمّيها هو.',
  detailScopesEmpty: 'لم نسجّل صلاحيات هذا الربط. أعد الربط لتُقرأ من التطبيق.',
  detailScopesAsk: 'طلب أوسع للصلاحيات يمرّ على شاشة موافقة التطبيق من جديد.',
  widen: 'توسيع الصلاحيات',
  detailScopeRefused: 'رفض التطبيق آخر عملية لأن الصلاحية الممنوحة لا تشملها.',
  detailToolsTitle: 'أدوات التطبيق',
  detailToolsEmpty: 'لم يعلن التطبيق أي أداة.',
  toolWrites: 'كتابة',
  toolReads: 'قراءة',
  toolEnabled: 'مُفعَّلَة',
  toolDisabled: 'مُتوقِّفَة',
  toolStale: 'توقّف التطبيق عن إعلان هذه الأداة.',
  detailStale: 'تغيّرت قائمة الأدوات منذ الربط. راجع المفاتيح قبل الاستخدام.',
  detailUnreachable: 'تعذّر الوصول إلى التطبيق. قد تكون صلاحيته انتهت، أو خدمته متوقفة.',
  detailNeedsReauth: 'انتهت صلاحية الوصول إلى التطبيق. أعد الربط ليستطيع نور استدعاء أدواته.',
  reconnect: 'أعد الربط',
  reconnecting: 'جاري التحويل...',
  reconnectFailed: 'تعذّر بدء إعادة الربط. حاول من جديد.',
  detailDisconnect: 'افصل',
  detailDisconnectTitle: 'فصل التطبيق',
  detailDisconnectMessage: 'هل تريد فصل «{name}»؟ لن يستطيع نور استدعاء أدواته بعد الآن.',
  confirmDisconnect: 'فصل',
  saveFailed: 'تعذّر حفظ التغيير.',
  toolFailed: 'تعذّر حفظ حالة الأداة.',
  detailNotFound: 'هذا التطبيق غير مرتبط بحسابك.',
  detailFailed: 'تعذّر تحميل التطبيق.',
  detailOffline: 'تعذّر تحميل التطبيق: لم يصل الطلب إلى الخادم. تحقّق من اتصالك ثم أعد المحاولة.',
  connectedBanner: 'تم ربط التطبيق، وهو مُفعَّل الآن.',
} as const;

export type McpMarketplaceCopy = typeof MCP_MARKETPLACE_COPY;
