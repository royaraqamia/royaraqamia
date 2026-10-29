/**
 * Plans' runtime vocabulary, apart from `plans.ts` so a client module can name
 * a cap without dragging the schemas in.
 *
 * `plans.ts` imports `zod` to validate the API's payloads, and it is imported by
 * the shell (`frontend/state/session-provider.tsx` → `plan-limits`), so a single
 * value import from there puts zod in the initial bundle of every route —
 * measured at about 31 KB gzip per route when `VISITOR_COUNTER_CAPS` was first
 * imported this way. Constants live here instead; `plans.ts` re-exports them, so
 * server and route code keeps importing one module.
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
 * A per-plan number that is neither a row an account owns nor an action it
 * takes: how many news cards a page may show, how many sources a selection may
 * hold. Kept in its own catalog so `plan_limits` stays "one cap per table".
 */
export interface PlanQuota {
  key: string;
  label: string;
  visitorCap: number;
  freeCap: number;
  proCap: number;
  sortOrder: number;
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
 * The owned-item cap a visitor gets, mirrored from `plan_limits.visitor_cap`.
 *
 * A visitor owns no rows on the server, so this number only ever binds on the
 * device: the local-first products (HabitFlow, SpendTrack, Notes, Quran
 * bookmarks) count their own items and refuse the second one. It is friction,
 * not enforcement — clearing site data starts again — and the products that
 * need an account (Community, MCP) have no visitor allowance at all, which is
 * what the zeroes say.
 */
export const VISITOR_ITEM_CAPS: Record<OwnedItemKey, number> = {
  habits: 1,
  expenses: 1,
  expense_categories: 1,
  budgets: 1,
  notes: 1,
  quran_bookmarks: 1,
  short_links: 1,
  community_drafts: 0,
  community_published: 0,
  community_tags: 0,
  community_categories: 0,
  mcp_connected_apps: 0,
};

/** The quota keys the code names; the numbers live in `plan_quotas`. */
export const PLAN_QUOTAS = {
  newsCards: 'news.story.cards',
  newsSources: 'news.sources',
} as const;

export type PlanQuotaKey = (typeof PLAN_QUOTAS)[keyof typeof PLAN_QUOTAS];
