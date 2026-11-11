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
]);

export type McpCatalogConnectReason = z.infer<typeof McpCatalogConnectReasonSchema>;

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
  fetchedAt: z.string(),
});

export type McpCatalogAdminRow = z.infer<typeof McpCatalogAdminRowSchema>;

export const McpCatalogAdminPageSchema = z.object({
  servers: z.array(McpCatalogAdminRowSchema),
  nextCursor: z.string().nullable(),
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
    'اعتمد التطبيقات التي تظهر للعضو: لا يظهر في المتجر إلا تطبيق معتمد، وثبت أن ربطه ممكن، وغير موقوف. الإيقاف يحتاج سبباً، ويُرفض به عند بدء الربط.',
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
  verifiedBadge: 'في المتجر',
  unverifiedBadge: 'غير معتمد',
  staticClientBadge: 'عميل مسجّل مسبقاً',
  verifyAction: 'اعتماد',
  manageVerifiedAction: 'إدارة الاعتماد',
  unverifyAction: 'إلغاء الاعتماد',
  verifyTitle: 'اعتماد تطبيق في المتجر',
  verifyDescription:
    'لن يظهر التطبيق للعضو قبل اعتماده. الاعتماد يحتاج أن يكون الربط ممكّناً بعد الفحص، وأن يكون اسمه ووصفه وشعاره واضحين.',
  manageVerifiedDescription:
    'غيّر ترتيب الظهور، أو ألغِ الاعتماد ليختفي التطبيق من المتجر. لا يتأثر ربط قائم به.',
  verifyNeedsConnectable: 'لا يمكن اعتماد تطبيق لم يثبت أن ربطه ممكن. افحصه الآن ثم أعد المحاولة.',
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
  verifyNeedsMark: 'لا يمكن اعتماد تطبيق بلا شعار: بطاقته سترسم حرفاً. أضف الشعار ثم أعد المحاولة.',
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
  },
} as const;
