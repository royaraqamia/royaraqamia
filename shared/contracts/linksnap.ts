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
