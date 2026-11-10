import { z } from 'zod';

/**
 * The catalogue the marketplace reads: the mirror of
 * `registry.modelcontextprotocol.io` (ADR-0155, `docs/specs/mcp-marketplace.md`).
 *
 * Two shapes live here, deliberately apart:
 *
 * - **A member's row** is what the screen draws: the server's own name, its
 *   description (ours if an admin wrote one, the registry's until then), and the
 *   verdict about whether it can be connected. It does not carry `remote_url`:
 *   the address is public data, but a client that knows it can try to reach a
 *   stranger's server directly, and the one module allowed to open that socket
 *   is ours.
 * - **An admin's row** is the takedown list: it adds the registry's own status,
 *   the address, when the verdict was measured, and the block.
 *
 * The app reads neither yet — phase 3 (#1224) ports the screen, and its contract
 * joins `scripts/generate-contracts.mjs` in that change.
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
  /**
   * `null` means nobody has probed this server yet — a third state, not a
   * "no". The screen says «لم نتحقق بعد» and the tap is still allowed, because
   * the tap is the definitive check.
   */
  connectable: z.boolean().nullable(),
  connectableReason: McpCatalogConnectReasonSchema.nullable(),
  publishedAt: z.string().nullable(),
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

/** A catalogue row as the Admin Console draws it, takedown included. */
export const McpCatalogAdminRowSchema = McpCatalogRowSchema.extend({
  remoteUrl: z.string(),
  /** The override as stored, so the field can be edited rather than only shown. */
  descriptionAr: z.string().nullable(),
  /** The registry's own status: `active`, `deprecated`, `deleted`. */
  status: z.string(),
  version: z.string().nullable(),
  blocked: z.boolean(),
  blockedReason: z.string().nullable(),
  /** When the verdict was measured, or `null` if it never was. */
  probedAt: z.string().nullable(),
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
    descriptionAr: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((body) => body.blocked !== true || (body.blockedReason ?? '').length > 0, {
    message: 'سبب الإيقاف مطلوب',
    path: ['blockedReason'],
  });

export type McpCatalogAdminUpdate = z.infer<typeof McpCatalogAdminUpdateSchema>;

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
    'كل صفّ في السجل العام يظهر في المتجر ما لم توقفه. الإيقاف يحتاج سبباً، ويُرفض به عند بدء الربط.',
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
  blockedBadge: 'موقوف',
  deprecatedBadge: 'مهجور',
  blockAction: 'إيقاف',
  unblockAction: 'إلغاء الإيقاف',
  arabicAction: 'تعريب الوصف',
  blockTitle: 'إيقاف تطبيق',
  blockDescription: 'لن يظهر التطبيق في المتجر، ولن يبدأ ربطه. اكتب السبب: هو ما يقرأه من يحاول.',
  blockReasonLabel: 'سبب الإيقاف',
  unblockTitle: 'إلغاء إيقاف تطبيق',
  unblockDescription: 'سيعود التطبيق إلى المتجر فوراً. لا يتأثر ربط قائم به.',
  arabicTitle: 'تعريب الوصف',
  arabicDescription: 'الاسم يبقى كما يسمّيه صاحبه. الوصف العربي يظهر بدل الإنجليزي حين تكتبه.',
  nameArLabel: 'الاسم بالعربية (اختياري)',
  descriptionArLabel: 'الوصف بالعربية',
  save: 'حفظ',
  cancel: 'إلغاء',
  saved: 'تم الحفظ.',
  saveFailed: 'تعذّر الحفظ.',
  reasonLabels: {
    no_metadata: 'لا ينشر إعدادات مصادقة',
    no_registration: 'لا يسمح بتسجيل عملاء جدد',
    blocked: 'أوقفته سياسة الخروج عند الفحص',
  },
} as const;
