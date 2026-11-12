import { z } from 'zod';

/**
 * The catalogue the marketplace reads: the mirror of
 * `registry.modelcontextprotocol.io` (ADR-0155, ADR-0162,
 * `docs/specs/mcp-marketplace.md`).
 *
 * The registry is the source, not the store. Every active remote row is mirrored
 * so an admin can find it, but the member's store draws only rows that are
 * **verified** (an admin vouched for them) **and** connectable (the probe
 * measured OAuth metadata and dynamic registration) **and** active, unblocked,
 * and marked with a brand. The mirror is the haystack; the store is the curated
 * list.
 *
 * Two shapes live here, deliberately apart:
 *
 * - **A member's row** is what the screen draws: the server's own name, its
 *   description (ours if an admin wrote one, the registry's until then), its
 *   brand mark, and the fact that it is verified. It does not carry `remote_url`:
 *   the address is public data, but a client that knows it can try to reach a
 *   stranger's server directly, and the one module allowed to open that socket
 *   is ours.
 * - **An admin's row** is the curation list: it adds the registry's own status,
 *   the address, when the verdict was measured, and the block.
 */

/** One page of the catalogue. Small enough to draw, large enough to browse. */
export const MCP_CATALOG_PAGE_SIZE = 20;

/** Longest accepted search term; the same ceiling the community search uses. */
export const MCP_CATALOG_SEARCH_MAX_LENGTH = 80;

/** Longest accepted opaque cursor; a real one is a short base64url string. */
export const MCP_CATALOG_CURSOR_MAX_LENGTH = 200;

/**
 * Why a row cannot be connected, as a code rather than a sentence: the stored
 * row is evidence, the sentence is copy, and a code survives a reworded screen.
 */
export const McpCatalogConnectReasonSchema = z.enum([
  /** No usable `/.well-known/oauth-protected-resource` / authorization metadata. */
  'no_metadata',
  /** Publishes metadata but no `registration_endpoint`: pre-registered clients only. */
  'no_registration',
  /** The egress policy refused the host at probe time. */
  'blocked',
  /** The server did not answer inside the probe's ceiling. */
  'unreachable',
  /**
   * The row is published as no-auth, but the server refused an unauthenticated
   * call (#1269). The repair is an admin's: switch the row to `api_key` (or
   * `oauth`) once the measurement names what the server wants.
   */
  'needs_credentials',
]);

export type McpCatalogConnectReason = z.infer<typeof McpCatalogConnectReasonSchema>;

/**
 * How a catalogue row authenticates (#1269, ADR-0155 amendment).
 *
 * The mode is an admin's decision, not a probe's: which header a key belongs in
 * is a documented fact the probe cannot read, and a server that publishes nothing
 * must not be inferred into a mode. The probe measures beside it
 * (`probeAuthMode`) and the verdict says whether the decision opens the server.
 */
export const MCP_AUTH_MODES = ['oauth', 'none', 'api_key'] as const;

export const McpAuthModeSchema = z.enum(MCP_AUTH_MODES);

export type McpAuthMode = z.infer<typeof McpAuthModeSchema>;

/** What the last probe observed, or `null` when it could not tell. */
export const McpProbeAuthModeSchema = McpAuthModeSchema.nullable();

/**
 * Why a catalogue row waits for a person (#1293, half 3). A category rather
 * than prose, so «بانتظار إنسان» can count it and a run can recognise the same
 * reason on its next pass.
 */
export const McpCatalogWaitReasonSchema = z.enum([
  /** No mark from any of the allowed sources. */
  'no_mark',
  /** No dynamic registration, and no reviewed client for this provider. */
  'no_registration',
  /** A measured check failed for a reason the next run may clear. */
  'check_failed',
  /** A shipped SVG is waiting for its batched pull request to merge. */
  'repo_pr_pending',
]);

export type McpCatalogWaitReason = z.infer<typeof McpCatalogWaitReasonSchema>;

/** One row on the wait list: what it is, why it waits, and since when. */
export const McpCatalogWaitingRowSchema = z.object({
  registryName: z.string().min(1),
  title: z.string().nullable(),
  iconUrl: z.string().nullable(),
  reason: McpCatalogWaitReasonSchema,
  detail: z.string().nullable(),
  at: z.string(),
});

export type McpCatalogWaitingRow = z.infer<typeof McpCatalogWaitingRowSchema>;

/**
 * The three numbers the console header and the run summary draw (#1293): a
 * target nobody can measure is not a target.
 */
export const McpCatalogCoverageSchema = z.object({
  /** Active, unblocked, connectable, and carrying a mark. */
  eligible: z.number().int().nonnegative(),
  /** Eligible and admitted: `verified_at` set, which is the publish switch. */
  published: z.number().int().nonnegative(),
  /** The newest event for the row is a skip: it waits for a person. */
  waiting: z.number().int().nonnegative(),
});

export type McpCatalogCoverage = z.infer<typeof McpCatalogCoverageSchema>;

/** A catalogue row as the marketplace draws it. */
export const McpCatalogRowSchema = z.object({
  registryName: z.string().min(1),
  /** The server's own name, in Latin: a brand is not transliterated. */
  title: z.string().nullable(),
  /** The Arabic override when an admin wrote one, the registry's text until then. */
  description: z.string().nullable(),
  /** The Arabic name an admin may add; the row still shows `title` beside it. */
  nameAr: z.string().nullable(),
  /** The brand mark, proxied by us; `null` draws a monogram. */
  iconUrl: z.string().nullable(),
  /**
   * The admin's vouch. The store draws only verified rows that are also
   * connectable, so a member never meets a row we have not stood behind.
   */
  verified: z.boolean(),
  /** Lower sorts earlier; `null` is "not featured". */
  featuredRank: z.number().int().nullable(),
  /**
   * `null` means nobody has probed this server yet — a third state, not a
   * "no". The store hides it; the Admin Console says «لم نتحقق بعد» and lets the
   * admin probe again.
   */
  connectable: z.boolean().nullable(),
  connectableReason: McpCatalogConnectReasonSchema.nullable(),
  /**
   * How the row is linked (#1269): the consent flow, no credentials at all, or a
   * key the member supplies. An admin's decision; the store says what the row
   * needs before a tap.
   */
  authMode: McpAuthModeSchema,
  /** What the last probe measured, beside the decision; `null` is "not measured". */
  probeAuthMode: McpProbeAuthModeSchema,
  publishedAt: z.string().nullable(),
  /**
   * The permissions we will ask this server for, in its own names, so the sheet
   * can say what the consent screen will contain before the member leaves
   * (#1230). Empty means the row carries no measured set: the provider's own
   * default is the grant, and the sheet says that instead of a list.
   *
   * It is the *ask*, not the grant: the flow drops a scope the provider no
   * longer advertises, so the granted set can be a subset.
   */
  requestedScopes: z.array(z.string()),
});

export type McpCatalogRow = z.infer<typeof McpCatalogRowSchema>;

export const McpCatalogPageSchema = z.object({
  servers: z.array(McpCatalogRowSchema),
  /** `null` is the last page. */
  nextCursor: z.string().nullable(),
});

export type McpCatalogPage = z.infer<typeof McpCatalogPageSchema>;

/**
 * The search query. A blank term is the whole catalogue in registry order, which
 * is what a member browsing without a word should see.
 */
export const McpCatalogSearchQuerySchema = z.object({
  q: z.string().trim().max(MCP_CATALOG_SEARCH_MAX_LENGTH, 'مصطلح البحث طويل').default(''),
  cursor: z
    .string()
    .trim()
    .max(MCP_CATALOG_CURSOR_MAX_LENGTH, 'مؤشر التصفّح غير صالح')
    .nullable()
    .transform((value) => value || null),
});

export type McpCatalogSearchQuery = z.infer<typeof McpCatalogSearchQuerySchema>;

/** One address the registry publishes for a row, so an admin can pick it. */
export const McpCatalogRemoteOptionSchema = z.object({
  /** The `remotes[]` entry's URL, verbatim. */
  url: z.string().min(1),
  /** `streamable-http`, `sse`, or whatever else the publisher declared. */
  type: z.string().min(1),
});

export type McpCatalogRemoteOption = z.infer<typeof McpCatalogRemoteOptionSchema>;

/**
 * The newest act the log holds for a row: the date and the actor the Admin
 * Console draws beside the state (#1293).
 *
 * `null` is honest: a row the launch seed published before the log existed has
 * a date but nobody the log can name, and inventing an actor would be worse than
 * saying so.
 */
export const McpCatalogLastVerificationSchema = z.object({
  /** What happened: published after the checks passed, or taken back out. */
  action: z.enum(['verify', 'withdraw']),
  /** An admin's email, or `agent:mcp-catalog`. */
  actor: z.string().min(1),
  at: z.string(),
});

export type McpCatalogLastVerification = z.infer<typeof McpCatalogLastVerificationSchema>;

/** A catalogue row as the Admin Console draws it, takedown included. */
export const McpCatalogAdminRowSchema = McpCatalogRowSchema.extend({
  /** The address the mirror keeps: the first remote the policy accepted. */
  remoteUrl: z.string(),
  /**
   * Who we are at this provider: `static` when the row carries a client we
   * registered by hand (#1229), `dcr` when the flow registers itself. The admin
   * needs it because a static row can be connectable without publishing a
   * `registration_endpoint`, and verification asks about connectability.
   */
  registrationKind: z.enum(['dcr', 'static']),
  /**
   * The admin's choice of remote, when it differs from the registry's first
   * accepted one. `null` means "follow the registry", which is the sync's job.
   */
  remoteOverride: z.string().nullable(),
  /**
   * Every address the registry publishes for this server, from the `raw` entry
   * it sent. The console offers these beside a free-text `https` field, because
   * a publisher's list is a starting point and not a guarantee.
   */
  remoteOptions: z.array(McpCatalogRemoteOptionSchema),
  /** The Latin name an admin wrote; `title` already falls back to it. */
  titleOverride: z.string().nullable(),
  /**
   * The mark the row draws: a path we ship (`/brand/mcp/...`) or an https URL an
   * admin pasted from the publisher's own brand page. `null` follows the two
   * measured sources.
   */
  iconOverride: z.string().nullable(),
  /** The override as stored, so the field can be edited rather than only shown. */
  descriptionAr: z.string().nullable(),
  /**
   * Where an `api_key` row's key goes, as the server documents it: the header
   * name and the scheme it is prefixed with (`Authorization` + `Bearer` for
   * Postman; `X-API-Key` with no prefix for servers that take it bare). `null`
   * follows the default, `Authorization` with a `Bearer` prefix.
   */
  apiKeyHeader: z.string().nullable(),
  apiKeyPrefix: z.string().nullable(),
  /** The registry's own status: `active`, `deprecated`, `deleted`. */
  status: z.string(),
  version: z.string().nullable(),
  iconMime: z.string().nullable(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  /** When the verdict was measured, or `null` if it never was. */
  probedAt: z.string().nullable(),
  /** When an admin approved it for the store, or `null` if nobody has. */
  verifiedAt: z.string().nullable(),
  /**
   * The newest verify or withdraw in the append-only log. The console draws
   * this date and actor beside the state; the launch seed's rows predate the
   * log and answer `null` rather than a made-up name.
   */
  lastVerification: McpCatalogLastVerificationSchema.nullable(),
  fetchedAt: z.string(),
});

export type McpCatalogAdminRow = z.infer<typeof McpCatalogAdminRowSchema>;

export const McpCatalogAdminPageSchema = z.object({
  servers: z.array(McpCatalogAdminRowSchema),
  nextCursor: z.string().nullable(),
  /** The header's eligible / published / waiting counts. */
  coverage: McpCatalogCoverageSchema,
  /** The rows the agent could not publish, newest skip first. */
  waiting: z.array(McpCatalogWaitingRowSchema),
});

export type McpCatalogAdminPage = z.infer<typeof McpCatalogAdminPageSchema>;

/**
 * The two acts the console performs on one row: block it with a reason, or
 * correct the Arabic a member reads. One body for both, because both are edits
 * to the same row and an admin may make them together.
 *
 * `blocked: false` clears the reason as well — a block without a reason is the
 * state this endpoint exists to make impossible.
 */
export const McpCatalogAdminUpdateSchema = z
  .object({
    registryName: z.string().trim().min(1).max(200),
    blocked: z.boolean().optional(),
    blockedReason: z.string().trim().max(500).nullable().optional(),
    nameAr: z.string().trim().max(120).nullable().optional(),
    /** The Latin name the store draws, when the registry has none or a worse one. */
    titleOverride: z.string().trim().max(120).nullable().optional(),
    /** A shipped path (`/brand/...`) or an https URL the publisher serves. */
    iconOverride: z.string().trim().max(500).nullable().optional(),
    descriptionAr: z.string().trim().max(1000).nullable().optional(),
    /** The store's admission rule; the service refuses a row not measured connectable. */
    verified: z.boolean().optional(),
    featuredRank: z.number().int().min(0).max(999999).nullable().optional(),
    /**
     * The address the probe measures and the connect flow opens, or `null` to
     * follow the remote the registry's first accepted entry names. The service
     * holds it to the egress policy; the schema only bounds the size.
     */
    remoteOverride: z.string().trim().max(2048).nullable().optional(),
    /**
     * How the row is linked (#1269). Changing it changes what the probe measures,
     * so the service clears the verdict in the same write; the row reads
     * «لم نتحقق بعد» until «فحص الآن» runs.
     */
    authMode: McpAuthModeSchema.optional(),
    /** The header an `api_key` row sends, and the scheme it prefixes the key with. */
    apiKeyHeader: z.string().trim().max(60).nullable().optional(),
    apiKeyPrefix: z.string().trim().max(40).nullable().optional(),
  })
  .refine((body) => body.blocked !== true || (body.blockedReason ?? '').length > 0, {
    message: 'سبب الإيقاف مطلوب',
    path: ['blockedReason'],
  });

export type McpCatalogAdminUpdate = z.infer<typeof McpCatalogAdminUpdateSchema>;

/** One row to measure now, from the Admin Console. */
export const McpCatalogProbeSchema = z.object({
  registryName: z.string().trim().min(1).max(200),
});

export type McpCatalogProbe = z.infer<typeof McpCatalogProbeSchema>;

/**
 * The Admin Console's words.
 *
 * They live here rather than in `shared/copy/` on purpose: that directory is the
 * seam between the site and the app (`scripts/generate-copy.mjs`), and
 * `scripts/check-parity.mjs` refuses a copy source no ported component claims.
 * There is no admin console in the app, so a copy source for it would be a file
 * with no other side — the words belong to the one client that draws them.
 */
export const MCP_CATALOG_ADMIN_COPY = {
  title: 'متجر التطبيقات',
  description:
    'افحص التطبيقات التي تظهر للعضو: لا يظهر في المتجر إلا تطبيق اجتاز الفحص، وثبت أن ربطه ممكن، وغير موقوف. الفحص آلي ويُسجَّل باسم من أجراه، والإيقاف يحتاج سبباً ويُرفض به عند بدء الربط.',
  searchPlaceholder: 'ابحث بالاسم أو الوصف...',
  searchLabel: 'بحث في المتجر',
  searchAction: 'بحث',
  empty: 'لا يوجد تطبيق',
  emptyDescription: 'لم يطابق البحث أي صفّ في السجل.',
  loading: 'جاري تحميل المتجر',
  loadFailed: 'تعذّر تحميل المتجر.',
  more: 'تحميل المزيد',
  connectableYes: 'قابل للربط',
  connectableNo: 'لا يمكن ربطه',
  connectableUnknown: 'لم نتحقق بعد',
  /** The mode a row needs, said before the tap (#1269). */
  authBadgeOauth: 'حساب',
  authBadgeNone: 'بلا تسجيل',
  authBadgeApiKey: 'يتطلب مفتاحاً',
  /** The probe's own measurement, beside the admin's decision. */
  probeAuthLabel: 'قياس الفحص:',
  probeAuthUnknown: 'لم يتّضح',
  authAction: 'طريقة الربط',
  authTitle: 'طريقة ربط التطبيق',
  authDescription:
    'الفحص يقرأ ما ينشره التطبيق، ولا يستطيع أن يعرف في أي ترويسة يوضع المفتاح: هذا قرار يُقرأ من توثيق التطبيق. تغيير الطريقة يلغي نتيجة الفحص حتى تفحصه من جديد.',
  authModeLabels: {
    oauth: 'حساب لدى التطبيق (OAuth)',
    none: 'بلا مصادقة',
    api_key: 'مفتاح API',
  },
  authModeHints: {
    oauth: 'التطبيق يفتح شاشة موافقة، ولا يُطلب من العضو شيء غيرها.',
    none: 'الخادم يستجيب دون أي بيانات اعتماد.',
    api_key: 'العضو يلصق مفتاحه، ويُخزَّن مشفّراً ويُرسل في الترويسة أدناه.',
  },
  authHeaderLabel: 'ترويسة المفتاح',
  authHeaderHint:
    'كما يسمّيها توثيق التطبيق، مثل Authorization أو X-API-Key. الافتراضي Authorization.',
  authPrefixLabel: 'بادئة المفتاح (اختياري)',
  authPrefixHint: 'ما يوضع قبل المفتاح، مثل Bearer. اتركها فارغة إن كان المفتاح وحده في الترويسة.',
  authInvalid: 'اسم الترويسة غير صالح: حروف لاتينية وأرقام وشرطات فقط.',
  verifiedBadge: 'في المتجر',
  unverifiedBadge: 'غير مفحوص',
  staticClientBadge: 'عميل مسجّل مسبقاً',
  verifyAction: 'فحص',
  manageVerifiedAction: 'إدارة الفحص',
  unverifyAction: 'سحب من المتجر',
  verifyTitle: 'فحص تطبيق ونشره في المتجر',
  verifyDescription:
    'لن يظهر التطبيق للعضو قبل اجتياز الفحص. الفحص يشترط أن يكون الربط ممكّناً وأن يكون للتطبيق شعار، ويُسجَّل في السجل باسم من أجراه.',
  manageVerifiedDescription:
    'غيّر ترتيب الظهور، أو اسحب التطبيق من المتجر. لا يتأثر ربط قائم به. السحب يوقف ظهوره فقط، ولا يحذف التطبيق.',
  verifyNeedsConnectable: 'لا يمكن نشر تطبيق لم يثبت أن ربطه ممكن. افحصه الآن ثم أعد المحاولة.',
  probeAction: 'فحص الآن',
  probeDone: 'تم الفحص.',
  probeFailed: 'تعذّر إكمال الفحص.',
  featuredRankLabel: 'ترتيب الظهور (اختياري)',
  featuredRankHint: 'الأصغر يظهر أولاً. اتركه فارغاً ليأتي بعد التطبيقات المميّزة.',
  featuredRankBadge: 'ترتيب',
  blockedBadge: 'موقوف',
  deprecatedBadge: 'مهجور',
  blockAction: 'إيقاف',
  unblockAction: 'إلغاء الإيقاف',
  arabicAction: 'الاسم والوصف',
  markAction: 'الشعار',
  markTitle: 'شعار التطبيق',
  markDescription:
    'الشعار هو ما يميّز البطاقة في المتجر. اختر مساراً من شعاراتنا أو رابطاً من المزوّد نفسه؛ يُجلب عبر سياستنا، ولا يصل متصفح العضو إلى المزوّد.',
  markUrlLabel: 'مسار الشعار أو رابطه',
  markUrlHint:
    'مسار يبدأ بـ /brand/، أو رابط https. تركه فارغاً يعود إلى شعار السجل أو شعار الفحص.',
  markPreviewHint: 'هكذا تظهر العلامة في المتجر.',
  markClear: 'اترك شعار المزوّد',
  noMarkBadge: 'بلا شعار',
  verifyNeedsMark: 'لا يمكن نشر تطبيق بلا شعار: بطاقته سترسم حرفاً. أضف الشعار ثم أعد المحاولة.',
  lastVerificationLabel: 'آخر فحص',
  lastVerificationByLabel: 'أجراه',
  lastVerificationWithdrawn: 'سحب من المتجر',
  lastVerificationMissing: 'لا سجل لهذا الإجراء بعد',
  coverageEligible: 'مؤهل',
  coveragePublished: 'منشور',
  coverageWaiting: 'بانتظار إنسان',
  waitingTitle: 'بانتظار إنسان',
  waitingDescription:
    'صفوف فحصها الوكيل ولم يستطع نشرها. السبب فئة تُعدّ، لا جملة تُقرأ: عالجه ثم سيُعاد فحصه في التشغيل التالي دون أن يمسح أحد شيئاً.',
  waitingEmpty: 'لا شيء بانتظار إنسان.',
  waitingSinceLabel: 'منذ',
  waitingReasonLabels: {
    no_mark: 'لا شعار مؤكد',
    no_registration: 'لا تسجيل عملاء ولا عميل مسجّل',
    check_failed: 'فشل فحص',
    repo_pr_pending: 'شعاره في طلب تغيير',
  },
  blockTitle: 'إيقاف تطبيق',
  blockDescription: 'لن يظهر التطبيق في المتجر، ولن يبدأ ربطه. اكتب السبب: هو ما يقرأه من يحاول.',
  blockReasonLabel: 'سبب الإيقاف',
  unblockTitle: 'إلغاء إيقاف تطبيق',
  unblockDescription: 'سيعود التطبيق إلى المتجر فوراً. لا يتأثر ربط قائم به.',
  arabicTitle: 'اسم التطبيق ووصفه',
  arabicDescription:
    'الاسم اللاتيني هو ما يقرأه العضو؛ اكتب العلامة كما تكتبها الشركة. الوصف العربي يظهر بدل الإنجليزي حين تكتبه.',
  nameEnLabel: 'الاسم باللاتينية',
  nameArLabel: 'الاسم بالعربية (اختياري)',
  descriptionArLabel: 'الوصف بالعربية',
  remoteAction: 'العنوان',
  remoteTitle: 'عنوان الخادم',
  remoteDescription:
    'السجل ينشر أكثر من عنوان للخادم الواحد، والمتجر يختار أوله المقبول. اختر عنواناً آخر حين ينشر العنوان الأول وثيقة بلا مصادقة.',
  remoteOptionsLabel: 'عناوين السجل',
  remoteUrlLabel: 'العنوان المستخدم',
  remoteUrlHint: 'يجب أن يبدأ بـ https. تغيير العنوان يلغي نتيجة الفحص حتى تفحصه من جديد.',
  remoteRegistryHint: 'ما دام العنوان هو عنوان السجل، يبقى المتجر تابعاً له إذا تغيّر.',
  save: 'حفظ',
  cancel: 'إلغاء',
  saved: 'تم الحفظ.',
  saveFailed: 'تعذّر الحفظ.',
  reasonLabels: {
    no_metadata: 'لا ينشر إعدادات مصادقة',
    no_registration: 'لا يسمح بتسجيل عملاء جدد',
    blocked: 'أوقفته سياسة الخروج عند الفحص',
    unreachable: 'لم يستجب للفحص في الوقت المحدد',
    needs_credentials: 'يرفض الاستجابة دون بيانات اعتماد، والصفّ لا يطلبها',
  },
} as const;
