import {
  ShortLinkRepository,
  type AnonymousLinkOwner,
  type ShortLinkWriteMeta,
} from '@/backend/repositories/linksnap/short-link-repository';
import { AppError } from '@/backend/shared/errors';
import { ShortLink } from '@/shared/contracts/linksnap';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

// Database row interface matching public.short_links in supabase_schema.sql
interface ShortLinkDbRow {
  code: string;
  original_url: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  is_blocked: boolean;
  expires_at: string | null;
  password_hash: string | null;
  client_id: string | null;
  deleted_at: string | null;
}

export class SupabaseShortLinkRepository implements ShortLinkRepository {
  constructor(private readonly adminClient: SupabaseClient<Database>) {}

  private toDomain(row: ShortLinkDbRow): ShortLink {
    return {
      code: row.code,
      originalUrl: row.original_url,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      isBlocked: row.is_blocked,
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      passwordHash: row.password_hash,
      clientId: row.client_id,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
    };
  }

  private toDb(domain: ShortLink): ShortLinkDbRow {
    return {
      code: domain.code,
      original_url: domain.originalUrl,
      user_id: domain.userId,
      created_at: domain.createdAt.toISOString(),
      updated_at: domain.updatedAt.toISOString(),
      is_blocked: domain.isBlocked,
      expires_at: domain.expiresAt ? domain.expiresAt.toISOString() : null,
      password_hash: domain.passwordHash,
      client_id: domain.clientId ?? null,
      deleted_at: domain.deletedAt ? domain.deletedAt.toISOString() : null,
    };
  }

  async findByCode(code: string): Promise<ShortLink | null> {
    // The anonymous redirect and the password unlock resolve through the service
    // role: `anon` has no SELECT on short_links (the hash and owner must never
    // leave the server), and the redirect needs the owner id for the click
    // notification while the unlock needs the hash to verify in-process
    // (scrypt cannot be checked in Postgres). See
    // supabase/migrations/*_narrow_short_links_public_read.sql.
    const supabase = this.adminClient;
    const { data, error } = await supabase
      .from('short_links')
      .select('*')
      .eq('code', code)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to find short link: ${error.message}`);
    }

    return this.toDomain(data as ShortLinkDbRow);
  }

  async findByClientId(userId: string, clientId: string): Promise<ShortLink | null> {
    const supabase = this.adminClient;
    const { data, error } = await supabase
      .from('short_links')
      .select('*')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to find short link by client id: ${error.message}`);
    }

    return data ? this.toDomain(data as ShortLinkDbRow) : null;
  }

  async create(link: ShortLink, owner?: AnonymousLinkOwner): Promise<ShortLink> {
    const supabase = this.adminClient;
    const row = this.toDb(link);

    // A client-minted id makes a replayed write an idempotent upsert keyed on
    // (user_id, client_id) (ADR-0029, ticket #167). A legacy/online create with
    // no client id falls back to a plain insert.
    //
    // `upsert_short_link` applies last-write-wins (ADR-0033): a replay older
    // than the stored row returns no row and leaves it untouched, so a lost
    // create response cannot clobber a newer edit made on another device.
    if (link.clientId && link.userId) {
      const { data, error } = await supabase.rpc('upsert_short_link', {
        p_code: row.code,
        p_original_url: row.original_url,
        p_user_id: link.userId,
        p_created_at: row.created_at,
        p_updated_at: row.updated_at,
        p_is_blocked: row.is_blocked,
        p_expires_at: row.expires_at,
        p_password_hash: row.password_hash,
        p_client_id: link.clientId,
        p_deleted_at: row.deleted_at,
      });

      if (error) {
        throw new Error(`Failed to create short link: ${error.message}`);
      }

      const inserted = data?.[0];
      if (inserted) {
        return this.toDomain(inserted as ShortLinkDbRow);
      }

      // Stale replay: read the stored winner so the replay is a success.
      const current = await this.findByClientId(link.userId, link.clientId);
      if (!current) {
        throw new Error('Failed to create short link: not found after replay');
      }
      return current;
    }

    // A visitor's row records its own subject, which is what the one-link cap
    // counts. An account row is owned by `user_id` and carries neither.
    const payload: Database['public']['Tables']['short_links']['Insert'] = {
      ...row,
      visitor_key: link.userId || !owner ? null : owner.visitorKey,
      ip_hash: link.userId || !owner ? null : owner.ipHash,
    };

    const { data, error } = await supabase.from('short_links').insert(payload).select().single();

    if (error) {
      // `assert_anonymous_link_cap` refused a second anonymous link for this
      // visitor. The trigger is the enforcement; this turns its SQLSTATE into
      // the refusal the page knows how to explain.
      if (error.code === 'PL001') {
        throw new AppError(
          'الزُّوّار ينشئون رابطًا واحدًا فقط. سجِّل الدُّخول لإنشاء المزيد.',
          402,
          'visitor_limit'
        );
      }

      throw new Error(`Failed to create short link: ${error.message}`);
    }

    return this.toDomain(data as ShortLinkDbRow);
  }

  async listByUserId(userId: string): Promise<ShortLink[]> {
    const supabase = this.adminClient; // Use admin client to load user's specific list safely
    const { data, error } = await supabase
      .from('short_links')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list short links: ${error.message}`);
    }

    return (data as ShortLinkDbRow[]).map((row) => this.toDomain(row));
  }

  /**
   * The sync snapshot: like `listByUserId`, but deliberately unfiltered by
   * `deleted_at`, so tombstones travel to other devices and a delete made
   * elsewhere removes the row locally (ADR-0029). Display reads keep excluding
   * them via `listByUserId`.
   */
  async listByUserIdIncludingDeleted(userId: string): Promise<ShortLink[]> {
    const supabase = this.adminClient;
    const { data, error } = await supabase
      .from('short_links')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list short links: ${error.message}`);
    }

    return (data as ShortLinkDbRow[]).map((row) => this.toDomain(row));
  }

  async update(
    code: string,
    updates: Partial<
      Pick<ShortLink, 'code' | 'originalUrl' | 'isBlocked' | 'expiresAt' | 'passwordHash'>
    >,
    meta?: ShortLinkWriteMeta
  ): Promise<ShortLink> {
    const dbUpdates: Partial<ShortLinkDbRow> = {};
    if (updates.code !== undefined) {
      dbUpdates.code = updates.code;
    }
    if (updates.originalUrl !== undefined) {
      dbUpdates.original_url = updates.originalUrl;
    }
    if (updates.isBlocked !== undefined) {
      dbUpdates.is_blocked = updates.isBlocked;
    }
    if (updates.expiresAt !== undefined) {
      dbUpdates.expires_at = updates.expiresAt ? updates.expiresAt.toISOString() : null;
    }
    if (updates.passwordHash !== undefined) {
      dbUpdates.password_hash = updates.passwordHash;
    }
    const updatedAt = meta?.updatedAt ?? new Date().toISOString();
    dbUpdates.updated_at = updatedAt;
    // `deletedAt: null` from an outbox replay is a resurrect (undo of a delete).
    const resurrect = meta?.deletedAt === null;
    if (meta?.deletedAt !== undefined) {
      dbUpdates.deleted_at = meta.deletedAt;
    }

    const supabase = this.adminClient;

    // Last-write-wins on the client write time (ADR-0029): a replayed older
    // edit must not clobber a newer one — in particular a stale resurrect must
    // not revive a row a newer delete tombstoned.
    let query = supabase
      .from('short_links')
      .update(dbUpdates)
      .eq('code', code)
      .lte('updated_at', updatedAt);
    if (!resurrect) query = query.is('deleted_at', null);
    const { data, error } = await query.select();

    if (error) {
      throw new Error(`Failed to update short link: ${error.message}`);
    }
    if (data && data.length > 0) {
      // analytics_events.link_code references short_links.code with ON UPDATE
      // CASCADE (see migration), so changing the slug re-points click history
      // automatically.
      return this.toDomain(data[0] as ShortLinkDbRow);
    }

    // No-op (filtered by LWW / already in the target state): return the current
    // row so a stale replay is a success, not an error.
    const { data: current } = await supabase
      .from('short_links')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (!current) {
      throw new Error('Failed to update short link: not found');
    }
    return this.toDomain(current as ShortLinkDbRow);
  }

  async delete(code: string, userId: string, meta?: ShortLinkWriteMeta): Promise<boolean> {
    // Tombstone, not a hard delete: a replayed delete is idempotent, and reads
    // exclude the row via `deleted_at is null` (ADR-0029, ticket #167).
    const stamp = meta?.updatedAt ?? new Date().toISOString();
    const supabase = this.adminClient;
    const { error } = await supabase
      .from('short_links')
      .update({ deleted_at: stamp, updated_at: stamp })
      .eq('code', code)
      .eq('user_id', userId)
      // LWW: apply only when this delete is not older than the row's last write,
      // so a later delete re-stamps and still beats an older replayed edit/undo.
      .lte('updated_at', stamp);

    if (error) {
      throw new Error(`Failed to delete short link: ${error.message}`);
    }

    return true;
  }

  /**
   * Bulk delete is the same tombstone `delete` writes, just for a set: a hard
   * `DELETE` would cascade into `analytics_events` and destroy the rows' click
   * history. Already-tombstoned rows are left as they are, and the returned
   * count is the rows actually matched — a foreign or nonexistent code is not a
   * delete (ADR-0029).
   */
  async deleteMany(codes: string[], userId: string): Promise<number> {
    if (codes.length === 0) return 0;
    const stamp = new Date().toISOString();
    const supabase = this.adminClient;
    const { data, error } = await supabase
      .from('short_links')
      .update({ deleted_at: stamp, updated_at: stamp })
      .in('code', codes)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('code');

    if (error) {
      throw new Error(`Failed to delete short links: ${error.message}`);
    }

    return data?.length ?? 0;
  }

  /**
   * Bulk expiry advances `updated_at` so the change wins the last-write-wins
   * merge on another device's next pull (ADR-0029); without it the local copy
   * and the server look equally new and the expiry never lands.
   */
  async setExpiryMany(codes: string[], expiresAt: Date | null, userId: string): Promise<number> {
    if (codes.length === 0) return 0;
    const stamp = new Date().toISOString();
    const supabase = this.adminClient;
    const { data, error } = await supabase
      .from('short_links')
      .update({ expires_at: expiresAt ? expiresAt.toISOString() : null, updated_at: stamp })
      .in('code', codes)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .select('code');

    if (error) {
      throw new Error(`Failed to update short links expiry: ${error.message}`);
    }

    return data?.length ?? 0;
  }

  async exists(code: string): Promise<boolean> {
    const supabase = this.adminClient;
    const { count, error } = await supabase
      .from('short_links')
      .select('*', { count: 'exact', head: true })
      .eq('code', code);

    if (error) {
      throw new Error(`Failed to check existence: ${error.message}`);
    }

    return (count ?? 0) > 0;
  }
}
