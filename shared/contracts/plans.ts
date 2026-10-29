import { z } from 'zod';

/**
 * Plans, credits and owned-item caps (ADR-0075).
 *
 * A plan decides two different allowances, and they are deliberately kept
 * apart:
 *
 *   * the credit pool — a rolling 30-day spend, reported by the account's
 *     usage card;
 *   * owned-item caps — a standing limit on how many things an account holds
 *     (habits, links, bookmarks), never a monthly rent on saved data.
 */

export type PlanId = 'free' | 'pro';

export const PLAN_IDS = ['free', 'pro'] as const satisfies readonly PlanId[];

/**
 * The metered action keys, mirrored by `public.usage_action_costs` in the
 * migration. Enforcement code names an action through this object so a typo is
 * a type error, not a runtime refusal for an action that does not exist.
 */
export const USAGE_ACTIONS = {
  communityPostPublish: 'community.post.publish',
  communityPostEdit: 'community.post.edit',
  communityPostDuplicate: 'community.post.duplicate',
  communityMediaUpload: 'community.media.upload',
  shortLinkCreate: 'linksnap.link.create',
  downloaderJobCreate: 'downloader.job.create',
  mcpToolWrite: 'mcp.tool.write',
  consultationBookingCreate: 'consultation.booking.create',
  trainingApplicationSubmit: 'training.application.submit',
  projectRequestSubmit: 'project_request.submit',
  retainerSubmit: 'retainer.submit',
  scannerScan: 'scanner.scan',
  quranSurahRead: 'quran.surah.read',
  newsDigestGenerate: 'news.digest.generate',
} as const;

export type UsageActionKey = (typeof USAGE_ACTIONS)[keyof typeof USAGE_ACTIONS];

/**
 * The standing caps, mirrored by `public.plan_limits`. The key is what a cap
 * check asks about; the label and numbers live in the database so the pricing
 * page and the enforcement read one source.
 */
export const OWNED_ITEMS = {
  habits: 'habits',
  expenses: 'expenses',
  expenseCategories: 'expense_categories',
  budgets: 'budgets',
  shortLinks: 'short_links',
  communityDrafts: 'community_drafts',
  communityPublished: 'community_published',
  communityTags: 'community_tags',
  communityCategories: 'community_categories',
  quranBookmarks: 'quran_bookmarks',
  notes: 'notes',
  mcpConnectedApps: 'mcp_connected_apps',
} as const;

export type OwnedItemKey = (typeof OWNED_ITEMS)[keyof typeof OWNED_ITEMS];

/**
 * The metered actions a client performs with no server in the loop, reported
 * afterwards for reconciliation (ADR-0075). A scan never leaves the device
 * except as this counter (ADR-0034), and reading a surah is counted locally so
 * the reader works offline.
 */
export const LOCAL_USAGE_ACTIONS = [
  USAGE_ACTIONS.scannerScan,
  USAGE_ACTIONS.quranSurahRead,
] as const;

export type LocalUsageActionKey = (typeof LOCAL_USAGE_ACTIONS)[number];

/**
 * The standing caps for one account, as the offline client caches them: a cap
 * check that has to hit the network could not refuse a write while offline, and
 * the queue would then carry an intent the server is certain to reject.
 */
export interface PlanCaps {
  plan: PlanId;
  unlimited: boolean;
  caps: Record<OwnedItemKey, number>;
}

/**
 * A local counter report. `clientEventId` is minted once per counted action and
 * is what makes a replayed report idempotent: the ledger refuses to record the
 * same event twice (ADR-0075).
 */
export const LocalUsageReportSchema = z.object({
  events: z
    .array(
      z.object({
        clientEventId: z.string().uuid(),
        actionKey: z.enum(LOCAL_USAGE_ACTIONS),
      })
    )
    .min(1)
    .max(50),
});

export type LocalUsageReportInput = z.infer<typeof LocalUsageReportSchema>;

/** What a report recorded, and where the allowance stands afterwards. */
export interface LocalUsageReportResult {
  recorded: number;
  alreadyRecorded: number;
  refused: number;
  state: UsageState;
}

/** The single row of plan numbers: price, duration, window and pools. */
export interface PlanSettings {
  priceCents: number;
  currency: string;
  durationDays: number;
  windowDays: number;
  freeCredits: number;
  proCredits: number;
  anonymousDailyCredits: number;
}

export interface PlanLimit {
  key: string;
  label: string;
  freeCap: number;
  proCap: number;
  sortOrder: number;
}

export interface UsageActionCost {
  actionKey: string;
  label: string;
  cost: number;
  sortOrder: number;
}

/** What the account card renders. `unlimited` is an Admin. */
export interface UsageState {
  plan: PlanId;
  unlimited: boolean;
  cap: number;
  spent: number;
  remaining: number;
  windowDays: number;
  expiresAt: string | null;
}

/**
 * A metered action either happened or did not. A refusal still carries the
 * state, because the upgrade nudge needs to say what is left. A success carries
 * the ledger event, which is what a failed action refunds.
 */
export type SpendOutcome =
  | { allowed: true; state: UsageState; cost: number; eventId: string | null }
  | { allowed: false; state: UsageState; cost: number; eventId: null };

/** The anonymous allowance (a rolling 24 hours, keyed on a salted IP hash). */
export type AnonymousSpendOutcome =
  | {
      allowed: true;
      cap: number;
      spent: number;
      remaining: number;
      cost: number;
      eventId: string | null;
    }
  | {
      allowed: false;
      cap: number;
      spent: number;
      remaining: number;
      cost: number;
      eventId: null;
    };

export type PlanActivationMethod = 'shamcash' | 'efendim' | 'other';

export const PlanActivationMethodSchema = z.enum(['shamcash', 'efendim', 'other']);

/** An operator's manual grant; the amount is a record, not a charge. */
export const ActivatePlanSchema = z.object({
  userId: z.string().uuid('معرِّف مستخدم غير صالح'),
  amountCents: z.coerce.number().int('المبلغ يجب أن يكون عددًا صحيحًا').min(0).max(10_000_000),
  method: PlanActivationMethodSchema.default('other'),
  note: z.string().trim().max(500, 'الملاحظة طويلة جدًا').optional(),
});

export type ActivatePlanInput = z.infer<typeof ActivatePlanSchema>;

export const AdminPlansQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AdminPlansQuery = z.infer<typeof AdminPlansQuerySchema>;

/** One row of the Admin Console's plans table. */
export interface AdminUserUsage {
  userId: string;
  name: string | null;
  email: string;
  plan: PlanId;
  expiresAt: string | null;
  cap: number;
  spent: number;
  remaining: number;
  unlimited: boolean;
}

export interface AdminUserUsagePage {
  users: AdminUserUsage[];
  total: number;
  page: number;
  pageSize: number;
  windowDays: number;
}

/** Everything the public pricing page renders, read from the catalog. */
export interface PlanCatalog {
  settings: PlanSettings;
  limits: PlanLimit[];
  costs: UsageActionCost[];
}

/** One manual grant, as the user's own history shows it. */
export interface PlanActivationRecord {
  id: string;
  plan: PlanId;
  amountCents: number;
  currency: string;
  method: PlanActivationMethod;
  note: string | null;
  activatedAt: string;
  expiresAt: string;
}

/** The account's plan page: the current allowance plus every grant. */
export interface MyPlan {
  state: UsageState;
  activations: PlanActivationRecord[];
}

// ---------------------------------------------------------------------------
// RPC payloads. The repository validates what Postgres returns instead of
// casting it: a drifted function body would otherwise reach the UI as
// `undefined` numbers.
// ---------------------------------------------------------------------------

export const UsageStatePayloadSchema = z.object({
  plan: z.enum(PLAN_IDS),
  unlimited: z.boolean(),
  cap: z.number().int().nonnegative(),
  spent: z.number().int().nonnegative(),
  windowDays: z.number().int().positive(),
  expiresAt: z.string().nullable(),
});

export const SpendPayloadSchema = UsageStatePayloadSchema.extend({
  allowed: z.boolean(),
  remaining: z.number().int().nonnegative(),
  cost: z.number().int().positive(),
  eventId: z.string().uuid().nullable(),
});

export const AnonymousSpendPayloadSchema = z.object({
  allowed: z.boolean(),
  cap: z.number().int().nonnegative(),
  spent: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  cost: z.number().int().positive(),
  eventId: z.string().uuid().nullable(),
  windowHours: z.number().int().positive(),
});

export const ActivationPayloadSchema = z.object({
  plan: z.literal('pro'),
  expiresAt: z.string(),
  days: z.number().int().positive(),
});

export const AdminUserUsagePayloadSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  windowDays: z.number().int().positive(),
  users: z.array(
    z.object({
      userId: z.string().uuid(),
      name: z.string().nullable(),
      email: z.string(),
      plan: z.enum(PLAN_IDS),
      expiresAt: z.string().nullable(),
      cap: z.number().int().nonnegative(),
      spent: z.number().int().nonnegative(),
      remaining: z.number().int().nonnegative(),
      unlimited: z.boolean(),
    })
  ),
});

export type ActivationResult = z.infer<typeof ActivationPayloadSchema>;
