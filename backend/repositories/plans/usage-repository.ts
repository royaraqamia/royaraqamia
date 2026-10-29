import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  ActivationPayloadSchema,
  AdminPlansQuerySchema,
  AdminUserUsagePayloadSchema,
  UsageOutcomePayloadSchema,
  UsageStatePayloadSchema,
  type ActivatePlanInput,
  type ActivationResult,
  type AdminPlansQuery,
  type AdminUserUsagePage,
  type OwnedItemKey,
  type PlanLimit,
  type PlanQuota,
  type PlanSettings,
  type PlanActivationRecord,
  type UsageCounterKey,
  type UsageLimit,
  type UsageOutcome,
  type UsageState,
} from '@/shared/contracts/plans';

type PlanSettingsRow = Database['public']['Tables']['plan_settings']['Row'];
type PlanLimitRow = Database['public']['Tables']['plan_limits']['Row'];
type PlanQuotaRow = Database['public']['Tables']['plan_quotas']['Row'];
type UsageLimitRow = Database['public']['Tables']['usage_limits']['Row'];
type ActivationRow = Database['public']['Tables']['plan_activations']['Row'];

/** One counted action, as the caller knows it before the database resolves the subject. */
export interface RecordUsageInput {
  actionKey: UsageCounterKey;
  userId: string | null;
  visitorKey?: string | null;
  ipHash?: string | null;
  clientEventId?: string | null;
  dedupeKey?: string | null;
}

/**
 * Everything the app knows about plans and allowances. The count, the cap and
 * the insert live in Postgres (ADR-0093), so this port is a set of calls rather
 * than an aggregate: a count computed in Node could not be serialised against a
 * concurrent request.
 */
export interface UsageRepository {
  getSettings(): Promise<PlanSettings>;
  listLimits(): Promise<PlanLimit[]>;
  listCounters(): Promise<UsageLimit[]>;
  listQuotas(): Promise<PlanQuota[]>;
  /** How many news cards this reader's plan may show. */
  newsCardCap(userId: string): Promise<number>;
  getState(userId: string): Promise<UsageState>;
  listActivations(userId: string): Promise<PlanActivationRecord[]>;
  /** Count one action, or answer that the allowance is used up. */
  record(input: RecordUsageInput): Promise<UsageOutcome>;
  /** Delete an event a failed action wrote. Scoped to its subject. */
  release(userId: string | null, eventId: string): Promise<boolean>;
  /** How many of an owned item the account currently holds (tombstones excluded). */
  countOwned(item: OwnedItemKey, userId: string): Promise<number>;
  activate(input: ActivatePlanInput & { activatedBy: string }): Promise<ActivationResult>;
  userExists(userId: string): Promise<boolean>;
  listUsers(query: AdminPlansQuery): Promise<AdminUserUsagePage>;
}

function toSettings(row: PlanSettingsRow): PlanSettings {
  return {
    priceCents: row.price_cents,
    currency: row.currency,
    durationDays: row.duration_days,
  };
}

function toLimit(row: PlanLimitRow): PlanLimit {
  return {
    key: row.key,
    label: row.label_ar,
    visitorCap: row.visitor_cap,
    freeCap: row.free_cap,
    proCap: row.pro_cap,
    sortOrder: row.sort_order,
  };
}

function toQuota(row: PlanQuotaRow): PlanQuota {
  return {
    key: row.key,
    label: row.label_ar,
    visitorCap: row.visitor_cap,
    freeCap: row.free_cap,
    proCap: row.pro_cap,
    sortOrder: row.sort_order,
  };
}

function toUsageLimit(row: UsageLimitRow): UsageLimit {
  return {
    key: row.key,
    label: row.label_ar,
    window: row.window === 'daily' ? 'daily' : 'lifetime',
    visitorCap: row.visitor_cap,
    freeCap: row.free_cap,
    proCap: row.pro_cap,
    sortOrder: row.sort_order,
  };
}

function toActivation(row: ActivationRow): PlanActivationRecord {
  return {
    id: row.id,
    plan: row.plan === 'pro' ? 'pro' : 'free',
    amountCents: row.amount_cents,
    currency: row.currency,
    method:
      row.method === 'shamcash' || row.method === 'efendim' || row.method === 'other'
        ? row.method
        : 'other',
    note: row.note,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
  };
}

export class SupabaseUsageRepository implements UsageRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getSettings(): Promise<PlanSettings> {
    const { data, error } = await this.supabase
      .from('plan_settings')
      .select('*')
      .eq('id', true)
      .single();

    if (error) throw error;
    return toSettings(data);
  }

  async listLimits(): Promise<PlanLimit[]> {
    const { data, error } = await this.supabase
      .from('plan_limits')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toLimit);
  }

  async listCounters(): Promise<UsageLimit[]> {
    const { data, error } = await this.supabase
      .from('usage_limits')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toUsageLimit);
  }

  async listQuotas(): Promise<PlanQuota[]> {
    const { data, error } = await this.supabase
      .from('plan_quotas')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toQuota);
  }

  /**
   * The card allowance for one reader. Resolved in Postgres because the number
   * depends on the effective plan (an expired Pro is Free) and the Admin
   * exemption; a visitor has no account and never reaches this.
   */
  async newsCardCap(userId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('news_card_cap', { p_user_id: userId });

    if (error) throw error;
    return typeof data === 'number' ? data : 5;
  }

  async getState(userId: string): Promise<UsageState> {
    const { data, error } = await this.supabase.rpc('get_usage_counters', {
      p_user_id: userId,
    });

    if (error) throw error;
    const payload = UsageStatePayloadSchema.parse(data);

    return {
      plan: payload.plan,
      unlimited: payload.unlimited,
      expiresAt: payload.expiresAt,
      counters: payload.counters.map((counter) => ({
        ...counter,
        key: counter.key as UsageCounterKey,
      })),
    };
  }

  async listActivations(userId: string): Promise<PlanActivationRecord[]> {
    const { data, error } = await this.supabase
      .from('plan_activations')
      .select('*')
      .eq('user_id', userId)
      .order('activated_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return (data ?? []).map(toActivation);
  }

  async record(input: RecordUsageInput): Promise<UsageOutcome> {
    const { data, error } = await this.supabase.rpc('record_usage', {
      p_action_key: input.actionKey,
      p_user_id: input.userId,
      p_visitor_key: input.visitorKey ?? null,
      p_ip_hash: input.ipHash ?? null,
      p_client_event_id: input.clientEventId ?? null,
      p_dedupe_key: input.dedupeKey ?? null,
    });

    if (error) throw error;
    const payload = UsageOutcomePayloadSchema.parse(data);

    return {
      allowed: payload.allowed,
      duplicate: payload.duplicate,
      eventId: payload.eventId,
      state: { ...payload.counter, key: payload.counter.key as UsageCounterKey },
    };
  }

  async release(userId: string | null, eventId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('release_usage', {
      p_event_id: eventId,
      p_user_id: userId,
    });

    if (error) throw error;
    return data === true;
  }

  /**
   * Counting is a read per table, not an aggregate in Postgres: the caps are a
   * product rule on top of ordinary tables, and a `count` per create keeps the
   * data model untouched. Tombstones are excluded — a deleted habit still grows
   * the history table, but it no longer holds a slot.
   *
   * This count feeds the fast pre-check only. The enforcement is the row-level
   * trigger in Postgres (`private.assert_owned_item_cap`, #526), which counts and
   * writes in one transaction; the two agree on every case listed here because
   * `private.owned_item_count` is the same map.
   */
  async countOwned(item: OwnedItemKey, userId: string): Promise<number> {
    switch (item) {
      case 'habits':
        return this.headCount(
          this.supabase
            .from('habits')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'expenses':
        return this.headCount(
          this.supabase
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'expense_categories':
        return this.headCount(
          this.supabase
            .from('categories')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'budgets':
        return this.headCount(
          this.supabase
            .from('budgets')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'short_links':
        // `short_links` is keyed by the code, not by an `id` column: selecting
        // `id` is a PostgREST 42703, and the cap check turned that into a 500 on
        // every signed-in create (#518 regression).
        return this.headCount(
          this.supabase
            .from('short_links')
            .select('code', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'community_drafts':
        return this.headCount(
          this.supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('author_id', userId)
            .is('deleted_at', null)
            .in('status', ['draft', 'scheduled'])
        );
      case 'community_published':
        return this.headCount(
          this.supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('author_id', userId)
            .is('deleted_at', null)
            .eq('status', 'published')
        );
      case 'community_tags':
        return this.headCount(
          this.supabase
            .from('community_tags')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
        );
      case 'community_categories':
        return this.headCount(
          this.supabase
            .from('community_categories')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
        );
      case 'quran_bookmarks':
        return this.headCount(
          this.supabase
            .from('quran_bookmarks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'notes':
        return this.headCount(
          this.supabase
            .from('notes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('deleted_at', null)
        );
      case 'mcp_connected_apps': {
        // One grant may hold an access and a refresh row for the same app, so the
        // cap counts the app, not the token.
        const { data, error } = await this.supabase
          .from('mcp_oauth_tokens')
          .select('client_id')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .gt('expires_at', new Date().toISOString());

        if (error) throw error;
        return new Set((data ?? []).map((row) => row.client_id)).size;
      }
    }
  }

  async activate(input: ActivatePlanInput & { activatedBy: string }): Promise<ActivationResult> {
    const { data, error } = await this.supabase.rpc('activate_plan', {
      p_user_id: input.userId,
      p_activated_by: input.activatedBy,
      p_amount_cents: input.amountCents,
      p_method: input.method,
      p_note: input.note ?? null,
    });

    if (error) throw error;
    return ActivationPayloadSchema.parse(data);
  }

  async userExists(userId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data !== null;
  }

  async listUsers(query: AdminPlansQuery): Promise<AdminUserUsagePage> {
    const parsed = AdminPlansQuerySchema.parse(query);
    const { data, error } = await this.supabase.rpc('list_user_usage', {
      p_search: parsed.search ?? null,
      p_page: parsed.page,
      p_page_size: parsed.pageSize,
    });

    if (error) throw error;
    const payload = AdminUserUsagePayloadSchema.parse(data);

    return {
      users: payload.users,
      total: payload.total,
      page: payload.page,
      pageSize: payload.pageSize,
    };
  }

  private async headCount(
    query: PromiseLike<{ count: number | null; error: unknown }>
  ): Promise<number> {
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }
}
