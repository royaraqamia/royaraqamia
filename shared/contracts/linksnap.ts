import { z } from 'zod';

export type LinkStatus = 'active' | 'expired' | 'blocked';

export interface ShortLink {
  code: string;
  originalUrl: string;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
  isBlocked: boolean;
  expiresAt: Date | null;
  passwordHash: string | null;
  /** Outbox/LWW fields (ADR-0029, ticket #162). */
  clientId?: string | null;
  deletedAt?: Date | null;
}

export interface AnalyticsEvent {
  id: string;
  linkCode: string;
  clickedAt: Date;
  referrer: string | null;
  userAgent: string | null;
  ipCountry: string | null;
}

export interface DailyClickStat {
  date: string;
  clicks: number;
}

export interface DeviceStat {
  name: string;
  count: number;
  percent: number;
}

export interface LinkDeviceBreakdown {
  devices: DeviceStat[];
  os: DeviceStat[];
  browsers: DeviceStat[];
}

export interface AnalyticsExportRow {
  clickedAt: string;
  referrer: string | null;
  ipCountry: string | null;
  device: string;
  os: string;
  browser: string;
}

export type BulkLinkAction = 'delete' | 'setExpiry';

export interface BulkLinkActionRequest {
  action: BulkLinkAction;
  codes: string[];
  expiresAt?: string | null;
}

export interface LinkAnalyticsSummary {
  totalClicks: number;
  recentClicks: AnalyticsEvent[];
  clicksByDate: DailyClickStat[];
  topReferrers: { name: string; count: number }[];
  device: LinkDeviceBreakdown;
}

/**
 * One owned link as the routes send it (#654), read by the app's store.
 *
 * The interfaces above are TypeScript, which the Kotlin generator cannot see: a
 * body the site accepts and the app cannot decode is a blank screen. This is the
 * shape both the sync snapshot and the shortener answer with, so the app holds
 * rows from the one route the web's pull reads.
 *
 * `isBlocked`, `passwordProtected` and `status` are optional because the
 * shortener's answer omits the moderation fields a new row cannot have yet.
 */
export const LinksnapRowSchema = z.object({
  code: z.string(),
  originalUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().nullable().optional(),
  isBlocked: z.boolean().optional(),
  expiresAt: z.string().nullable().optional(),
  passwordProtected: z.boolean().optional(),
  status: z.enum(['active', 'expired', 'blocked']).optional(),
  clientId: z.string().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
});

/**
 * `GET /linksnap/api/links/sync` (#654): the whole owned set, tombstones
 * included, so a delete made on another device reaches the store instead of
 * being invisible to it (ADR-0029).
 */
export const LinksnapSyncResponseSchema = z.object({
  links: z.array(LinksnapRowSchema),
});

/** `POST /linksnap/api/shorten` (#654): the row a guest's online create made. */
export const LinksnapShortenResponseSchema = z.object({
  link: LinksnapRowSchema,
});

/** A queued create: the idempotency key and the write time travel with it. */
export const LinksnapCreateWriteSchema = z.object({
  originalUrl: z.string(),
  customCode: z.string().nullable(),
  clientId: z.string(),
  expiresAt: z.string().nullable(),
  password: z.string().nullable(),
  updatedAt: z.string(),
});

/**
 * A queued edit. Every field but the code is optional: a replay may carry only
 * what changed, and `deletedAt: null` resurrects a tombstoned row (an undo).
 */
export const LinksnapUpdateWriteSchema = z.object({
  code: z.string(),
  clientId: z.string().nullable().optional(),
  newCode: z.string().nullable().optional(),
  originalUrl: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});

/** A queued delete: the row's identity, its slug, and when the delete was decided. */
export const LinksnapDeleteWriteSchema = z.object({
  code: z.string(),
  clientId: z.string().nullable().optional(),
  updatedAt: z.string(),
});

/** `POST /linksnap/api/unlock`: the password a visitor typed for a protected slug. */
export const LinksnapUnlockRequestSchema = z.object({
  code: z.string(),
  password: z.string(),
});

/** The destination an unlock resolves to, which the caller opens. */
export const LinksnapUnlockResponseSchema = z.object({
  originalUrl: z.string(),
});

/**
 * Whether a custom code can be taken (#654).
 *
 * The site asks this while a signed-in member types a code, and the answer is
 * `{ availability: { code, available, error? } }` rather than a bare boolean:
 * a code the server refuses for its shape comes back with the sentence to show,
 * which is why `error` exists and is optional.
 */
export const LinksnapAvailabilitySchema = z.object({
  code: z.string(),
  available: z.boolean(),
  error: z.string().optional(),
});

export const LinksnapAvailabilityResponseSchema = z.object({
  availability: LinksnapAvailabilitySchema,
});

/** One device, OS or browser group as the analytics drawer draws it (#962). */
export const LinksnapDeviceStatSchema = z.object({
  name: z.string(),
  count: z.number().int(),
  percent: z.number().int(),
});

/** One click in the drawer's recent-activity list. */
export const LinksnapAnalyticsEventSchema = z.object({
  id: z.string(),
  linkCode: z.string(),
  clickedAt: z.string(),
  referrer: z.string().nullable(),
  userAgent: z.string().nullable(),
  ipCountry: z.string().nullable(),
});

/**
 * `GET /linksnap/api/analytics/[code]` (#962): the body the page's analytics
 * drawer reads, decoded by the app from the same schema.
 *
 * The route serialises the repository's `Date` fields as ISO strings and wraps
 * the summary in `analytics`, so this is the wire shape rather than the domain
 * interface. `clicksByDate` is the next slice's chart (#963) but travels in the
 * same body, which is why the app decodes it even though this drawer does not
 * draw it.
 */
export const LinksnapAnalyticsResponseSchema = z.object({
  analytics: z.object({
    totalClicks: z.number().int(),
    recentClicks: z.array(LinksnapAnalyticsEventSchema),
    clicksByDate: z.array(z.object({ date: z.string(), clicks: z.number().int() })),
    topReferrers: z.array(z.object({ name: z.string(), count: z.number().int() })),
    device: z.object({
      devices: z.array(LinksnapDeviceStatSchema),
      os: z.array(LinksnapDeviceStatSchema),
      browsers: z.array(LinksnapDeviceStatSchema),
    }),
  }),
});

/** One click in the export's CSV row, as the route serialises it. */
export const LinksnapAnalyticsExportRowSchema = z.object({
  clickedAt: z.string(),
  referrer: z.string().nullable(),
  ipCountry: z.string().nullable(),
  device: z.string(),
  os: z.string(),
  browser: z.string(),
});

/**
 * `GET /linksnap/api/analytics/[code]/export` (#964): one row per click, the
 * columns the page writes into its CSV. The app decodes this body and builds
 * the file with the page's header and escaping, so the two clients hand over
 * the same rows and columns from the same route.
 */
export const LinksnapAnalyticsExportResponseSchema = z.object({
  rows: z.array(LinksnapAnalyticsExportRowSchema),
});
