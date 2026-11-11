/**
 * The marketplace's words, in the site's voice (ADR-0155, phase 3 / #1224).
 *
 * They live here rather than in `shared/copy/` for now, and for a recorded
 * reason: `scripts/check-parity.mjs` refuses a copy source that no ported
 * component claims, and the two screens are ported in phase 6 (#1228). A
 * `shared/copy/mcp-marketplace.json` today would be a file with one side —
 * exactly the shape the admin catalogue's words avoided
 * (`shared/contracts/mcp-catalog.ts`). #1228 moves this module to the shared
 * source, generates the Kotlin object from it, and lists the pair in
 * `docs/mobile/parity.json`.
 *
 * A `{name}` is a placeholder the caller substitutes, not a format string.
 */
export const MCP_MARKETPLACE_COPY = {
  searchLabel: 'البحث في المتجر',
  searchPlaceholder: 'ابحث باسم التطبيق أو وصفه...',
  searchAction: 'بحث',
  searchLoading: 'جاري البحث...',
  searchRefreshing: 'جاري تحديث القائمة...',
  searchFailed: 'تعذّر تحميل المتجر.',
  searchOffline: 'تعذّر تحميل المتجر: لم يصل الطلب إلى الخادم. تحقّق من اتصالك ثم أعد المحاولة.',
  searchEmptyTitle: 'لا يوجد تطبيق بهذا الاسم',
  searchEmptyBody: 'جرّب كلمة أخرى، أو ابحث بالاسم الإنجليزي.',
  storeEmptyTitle: 'لا يوجد تطبيق معتمد بعد',
  storeEmptyBody: 'يعتمد فريق نور كل تطبيق قبل ظهوره هنا. عُد قريباً.',
  more: 'تحميل المزيد',

  verifiedBadge: 'موثّق',
  connect: 'ربط',
  connecting: 'جاري الربط...',
  connectFailed: 'تعذّر بدء الربط. حاول من جديد.',

  connectionsTitle: 'التطبيقات المرتبطة',
  connectionsEmptyTitle: 'لا يوجد تطبيق مرتبط بعد',
  connectionsEmptyBody: 'اختر تطبيقًا من المتجر ليعمل مع نور.',
  connectionsFailed: 'تعذّر تحميل التطبيقات المرتبطة.',
  connectionsOffline:
    'تعذّر تحميل التطبيقات المرتبطة: لم يصل الطلب إلى الخادم. تحقّق من اتصالك ثم أعد المحاولة.',
  statusActive: 'متصل',
  statusNeedsReauth: 'أعد الربط',
  statusError: 'تعذّر الوصول إلى التطبيق',
  connectionNeedsReauth: 'انتهت صلاحية الوصول إلى هذا التطبيق. افصله ثم أعد ربطه.',
  connectionUnreachable: 'تعذّرت الاستجابة من هذا التطبيق. أعد المحاولة لاحقًا أو افصله.',
  connectionDisabled: 'مُتوقِّف',
  connectionEnabled: 'مُفعَّل',
  toolCount: '{count} أداة',
  lastUsed: 'آخر استخدام:',
  neverUsed: 'لم يُستخدم بعد',
  manage: 'إدارة',
  permissionAsk: 'يسألني قبل كل كتابة',
  permissionReads: 'قراءة فقط',
  permissionAll: 'قراءة وكتابة',

  detailReach: 'يستطيع نور أن يستدعي أدوات هذا التطبيق عندما تطلب ذلك، ضمن الصلاحية أدناه.',
  detailPermissionTitle: 'الصلاحية',
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
  cancel: 'إلغاء',
  saveFailed: 'تعذّر حفظ التغيير.',
  toolFailed: 'تعذّر حفظ حالة الأداة.',
  detailNotFound: 'هذا التطبيق غير مرتبط بحسابك.',
  detailFailed: 'تعذّر تحميل التطبيق.',
  detailOffline: 'تعذّر تحميل التطبيق: لم يصل الطلب إلى الخادم. تحقّق من اتصالك ثم أعد المحاولة.',

  signIn: 'تسجيل الدخول',
  signInBody: 'سجّل الدخول لترى التطبيقات التي يستطيع نور الوصول إليها، وتربط غيرها.',
  loadingLabel: 'جاري التحميل...',
  retry: 'إعادة المحاولة',

  connectedBanner: 'تم ربط التطبيق، وهو مُفعَّل الآن.',
  connectDenied: 'لم تمنح التطبيق الصلاحية، ولم يُربط.',
  connectInvalid: 'انتهت صلاحية طلب الربط. ابدأ الربط من جديد.',
  connectSignin: 'سجّل الدخول ثم أعد المحاولة لربط التطبيق.',
  connectBlocked: 'هذا التطبيق موقوف ولا يمكن ربطه.',
  connectPlanLimit: 'وصلت إلى حدّ التطبيقات في خطتك. افصل تطبيقًا أو ارتقِ بالخطة.',
  connectError: 'تعذّر إتمام الربط. حاول من جديد.',
} as const;

export type McpMarketplaceCopy = typeof MCP_MARKETPLACE_COPY;
