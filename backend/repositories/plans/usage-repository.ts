import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  ActivationPayloadSchema,
  AdminPlansQuerySchema,
  AdminUserUsagePayloadSchema,
  AnonymousSpendPayloadSchema,
  SpendPayloadSchema,
  UsageStatePayloadSchema,
  type ActivatePlanInput,
  type ActivationResult,
  type AdminPlansQuery,
  type AdminUserUsagePage,
  type AnonymousSpendOutcome,
  type OwnedItemKey,
  type PlanLimit,
  type PlanSettings,
  type PlanActivationRecord,
  type SpendOutcome,
  type UsageActionCost,
  type UsageActionKey,
  type UsageState,
} from '@/shared/contracts/plans';

type PlanSettingsRow = Database['public']['Tables']['plan_settings']['Row'];
type PlanLimitRow = Database['public']['Tables']['plan_limits']['Row'];
type ActionCostRow = Database['public']['Tables']['usage_action_costs']['Row'];
type ActivationRow = Database['public']['Tables']['plan_activations']['Row'];

/**
 * Everything the app knows about plans and allowance. The rolling window, the
 * cap and the atomic spend live in Postgres (ADR-0075), so this port is a set
 * of calls rather than an aggregate: a balance computed in Node could not be
 * serialised against a concurrent request.
 */
export interface UsageRepository {
  getSettings(): Promise<PlanSettings>;
  listLimits(): Promise<PlanLimit[]>;
  listActionCosts(): Promise<UsageActionCost[]>;
  getState(userId: string): Promise<UsageState>;
  listActivations(userId: string): Promise<PlanActivationRecord[]>;
  spend(userId: string, actionKey: UsageActionKey): Promise<SpendOutcome>;
  /** A spend a client-reported counter already has an id for (idempotent). */
  spendOnce(
    userId: string,
    actionKey: UsageActionKey,
    clientEventId: string
  ): Promise<SpendOutcome>;
  spendAnonymous(ipHash: string, actionKey: UsageActionKey): Promise<AnonymousSpendOutcome>;
  /** How many of an owned item the account currently holds (tombstones excluded). */
  countOwned(item: OwnedItemKey, userId: string): Promise<number>;
  /** Give a reserved spend back when the action it preceded failed. */
  refund(userId: string, eventId: string): Promise<boolean>;
  refundAnonymous(ipHash: string, eventId: string): Promise<boolean>;
  activate(input: ActivatePlanInput & { activatedBy: string }): Promise<ActivationResult>;
  userExists(userId: string): Promise<boolean>;
  listUsers(query: AdminPlansQuery): Promise<AdminUserUsagePage>;
}

function toSettings(row: PlanSettingsRow): PlanSettings {
  return {
    priceCents: row.price_cents,
    currency: row.currency,
    durationDays: row.duration_days,
    windowDays: row.window_days,
    freeCredits: row.free_credits,
    proCredits: row.pro_credits,
    anonymousDailyCredits: row.anonymous_daily_credits,
  };
}

function toLimit(row: PlanLimitRow): PlanLimit {
  return {
    key: row.key,
    label: row.label_ar,
    freeCap: row.free_cap,
    proCap: row.pro_cap,
    sortOrder: row.sort_order,
  };
}

function toActionCost(row: ActionCostRow): UsageActionCost {
  return {
    actionKey: row.action_key,
    label: row.label_ar,
    cost: row.cost,
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

  async listActionCosts(): Promise<UsageActionCost[]> {
    const { data, error } = await this.supabase
      .from('usage_action_costs')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toActionCost);
  }

  async getState(userId: string): Promise<UsageState> {
    const { data, error } = await this.supabase.rpc('get_usage_state', {
      p_user_id: userId,
    });

    if (error) throw error;
    return toUsageState(UsageStatePayloadSchema.parse(data));
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

  async spend(userId: string, actionKey: UsageActionKey): Promise<SpendOutcome> {
    const { data, error } = await this.supabase.rpc('spend_credits', {
      p_user_id: userId,
      p_action_key: actionKey,
    });

    if (error) throw error;
    const payload = SpendPayloadSchema.parse(data);
    const state = { ...toUsageState(payload), remaining: payload.remaining };

    return payload.allowed
      ? { allowed: true, state, cost: payload.cost, eventId: payload.eventId }
      : { allowed: false, state, cost: payload.cost, eventId: null };
  }

  async spendOnce(
    userId: string,
    actionKey: UsageActionKey,
    clientEventId: string
  ): Promise<SpendOutcome> {
    const { data, error } = await this.supabase.rpc('spend_credits_once', {
      p_user_id: userId,
      p_action_key: actionKey,
      p_client_event_id: clientEventId,
    });

    if (error) throw error;
    const payload = SpendPayloadSchema.parse(data);
    const state = { ...toUsageState(payload), remaining: payload.remaining };

    return payload.allowed
      ? { allowed: true, state, cost: payload.cost, eventId: payload.eventId }
      : { allowed: false, state, cost: payload.cost, eventId: null };
  }

  /**
   * Counting is a read per table, not an aggregate in Postgres: the caps are a
   * product rule on top of ordinary tables, and a `count` per create keeps the
   * data model untouched. Tombstones are excluded — a deleted habit still grows
   * the history table, but it no longer holds a slot.
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

  async spendAnonymous(ipHash: string, actionKey: UsageActionKey): Promise<AnonymousSpendOutcome> {
    const { data, error } = await this.supabase.rpc('spend_anonymous_credits', {
      p_ip_hash: ipHash,
      p_action_key: actionKey,
    });

    if (error) throw error;
    const payload = AnonymousSpendPayloadSchema.parse(data);

    return payload.allowed
      ? {
          allowed: true,
          cap: payload.cap,
          spent: payload.spent,
          remaining: payload.remaining,
          cost: payload.cost,
          eventId: payload.eventId,
        }
      : {
          allowed: false,
          cap: payload.cap,
          spent: payload.spent,
          remaining: payload.remaining,
          cost: payload.cost,
          eventId: null,
        };
  }

  async refund(userId: string, eventId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('refund_credits', {
      p_user_id: userId,
      p_event_id: eventId,
    });

    if (error) throw error;
    return data === true;
  }

  async refundAnonymous(ipHash: string, eventId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('refund_anonymous_credits', {
      p_ip_hash: ipHash,
      p_event_id: eventId,
    });

    if (error) throw error;
    return data === true;
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
      windowDays: payload.windowDays,
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

function toUsageState(payload: {
  plan: 'free' | 'pro';
  unlimited: boolean;
  cap: number;
  spent: number;
  windowDays: number;
  expiresAt: string | null;
}): UsageState {
  return {
    plan: payload.plan,
    unlimited: payload.unlimited,
    cap: payload.cap,
    spent: payload.spent,
    remaining: Math.max(payload.cap - payload.spent, 0),
    windowDays: payload.windowDays,
    expiresAt: payload.expiresAt,
  };
}
