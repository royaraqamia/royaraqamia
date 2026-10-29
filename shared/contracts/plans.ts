import { z } from 'zod';

/**
 * Plans, owned-item caps and counted actions (ADR-0075, amended by ADR-0093).
 *
 * A plan decides two different allowances, and they are deliberately kept
 * apart:
 *
 *   * owned-item caps — a standing limit on how many things an account holds
 *     (habits, links, bookmarks, notes). Deleting one frees its slot; nothing
 *     is rented and nothing resets.
 *   * counted actions — how many times an account may do something that leaves
 *     no row to count (a download, a digest opened, a scan, a surah read). A
 *     lifetime count never refills; a daily count resets at Damascus midnight.
 *
 * There is no credit pool: an allowance is a number of items or a number of
 * actions, never a shared balance that trades one for another.
 */

export type PlanId = 'free' | 'pro';

export const PLAN_IDS = ['free', 'pro'] as const satisfies readonly PlanId[];

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
 * The counted actions, mirrored by `public.usage_limits`. An action that leaves
 * no row to count is counted in `usage_events` instead, and the enforcement code
 * names it through this object so a typo is a type error, not a runtime refusal
 * for an action that does not exist.
 */
export const USAGE_COUNTERS = {
  downloads: 'downloader.job.create',
  newsDigests: 'news.digest.open',
  scannerScans: 'scanner.scan',
  quranSurahs: 'quran.surah.read',
} as const;

export type UsageCounterKey = (typeof USAGE_COUNTERS)[keyof typeof USAGE_COUNTERS];

/** A lifetime count never refills; a daily count resets at Damascus midnight. */
export type UsageWindow = 'lifetime' | 'daily';

export const USAGE_WINDOWS = ['lifetime', 'daily'] as const satisfies readonly UsageWindow[];

/**
 * The caps a visitor gets, mirrored from the seeded `usage_limits` rows. A
 * visitor has no account to read a cap for, so the device carries these numbers
 * to refuse a scan or a surah read offline; the server always reads the table.
 */
export const VISITOR_COUNTER_CAPS: Record<UsageCounterKey, number> = {
  'downloader.job.create': 1,
  'news.digest.open': 1,
  'scanner.scan': 1,
  'quran.surah.read': 1,
};

/**
 * The counted actions a client performs with no server in the loop, reported
 * afterwards for reconciliation (ADR-0075). A scan never leaves the device
 * except as this counter (ADR-0034), and reading a surah is counted locally so
 * the reader works offline.
 */
export const LOCAL_USAGE_ACTIONS = [
  USAGE_COUNTERS.scannerScans,
  USAGE_COUNTERS.quranSurahs,
] as const;

export type LocalUsageActionKey = (typeof LOCAL_USAGE_ACTIONS)[number];

/** One counted action's allowance, as the offline client caches it. */
export interface CounterAllowance {
  window: UsageWindow;
  cap: number;
}

/**
 * The allowances for one account, as the offline client caches them: a cap
 * check that has to hit the network could not refuse a write while offline, and
 * the queue would then carry an intent the server is certain to reject.
 */
export interface PlanCaps {
  plan: PlanId;
  unlimited: boolean;
  caps: Record<OwnedItemKey, number>;
  counters: Record<UsageCounterKey, CounterAllowance>;
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

/** The single row of plan numbers: price, currency and duration. */
export interface PlanSettings {
  priceCents: number;
  currency: string;
  durationDays: number;
}

export interface PlanLimit {
  key: string;
  label: string;
  freeCap: number;
  proCap: number;
  sortOrder: number;
}

/** One counted action's catalogue row. */
export interface UsageLimit {
  key: string;
  label: string;
  window: UsageWindow;
  visitorCap: number;
  freeCap: number;
  proCap: number;
  sortOrder: number;
}

/** Where one counted action stands for one account. */
export interface UsageCounterState {
  key: UsageCounterKey;
  label: string;
  window: UsageWindow;
  cap: number;
  used: number;
  remaining: number;
}

/** What the account card renders. `unlimited` is an Admin. */
export interface UsageState {
  plan: PlanId;
  unlimited: boolean;
  expiresAt: string | null;
  counters: UsageCounterState[];
}

/**
 * A counted action either happened or did not. A refusal still carries the
 * state, because the upgrade nudge needs to say what is left. A success carries
 * the ledger event, which is what a failed action releases.
 */
export interface UsageOutcome {
  allowed: boolean;
  state: UsageCounterState;
  eventId: string | null;
  /** The same action was already counted for this subject (a replayed open). */
  duplicate: boolean;
}

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

/** One counted action as the Admin Console's plans table shows it. */
export interface AdminCounterUsage {
  key: string;
  label: string;
  used: number;
  cap: number;
}

/** One row of the Admin Console's plans table. */
export interface AdminUserUsage {
  userId: string;
  name: string | null;
  email: string;
  plan: PlanId;
  expiresAt: string | null;
  unlimited: boolean;
  counters: AdminCounterUsage[];
}

export interface AdminUserUsagePage {
  users: AdminUserUsage[];
  total: number;
  page: number;
  pageSize: number;
}

/** Everything the public pricing page renders, read from the catalog. */
export interface PlanCatalog {
  settings: PlanSettings;
  limits: PlanLimit[];
  counters: UsageLimit[];
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

export const UsageCounterStatePayloadSchema = z.object({
  key: z.string(),
  label: z.string(),
  window: z.enum(USAGE_WINDOWS),
  cap: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
});

export const UsageStatePayloadSchema = z.object({
  plan: z.enum(PLAN_IDS),
  unlimited: z.boolean(),
  expiresAt: z.string().nullable(),
  counters: z.array(UsageCounterStatePayloadSchema),
});

export const UsageOutcomePayloadSchema = z.object({
  allowed: z.boolean(),
  duplicate: z.boolean(),
  eventId: z.string().uuid().nullable(),
  counter: UsageCounterStatePayloadSchema,
});

export const ActivationPayloadSchema = z.object({
  plan: z.literal('pro'),
  expiresAt: z.string(),
  days: z.number().int().positive(),
});

export const AdminCounterUsagePayloadSchema = z.object({
  key: z.string(),
  label: z.string(),
  used: z.number().int().nonnegative(),
  cap: z.number().int().nonnegative(),
});

export const AdminUserUsagePayloadSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  users: z.array(
    z.object({
      userId: z.string().uuid(),
      name: z.string().nullable(),
      email: z.string(),
      plan: z.enum(PLAN_IDS),
      expiresAt: z.string().nullable(),
      unlimited: z.boolean(),
      counters: z.array(AdminCounterUsagePayloadSchema),
    })
  ),
});

export type ActivationResult = z.infer<typeof ActivationPayloadSchema>;
