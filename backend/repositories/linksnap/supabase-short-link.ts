import {
  ShortLinkRepository,
  type ShortLinkWriteMeta,
} from '@/backend/repositories/linksnap/short-link-repository';
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
  constructor(
    private readonly adminClient: SupabaseClient<Database>,
    private readonly publicClient: SupabaseClient<Database>
  ) {}

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
    const supabase = this.publicClient;
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

  async create(link: ShortLink): Promise<ShortLink> {
    const supabase = this.adminClient;
    const row = this.toDb(link);

    // A client-minted id makes a replayed write an idempotent upsert keyed on
    // (user_id, client_id) (ADR-0029, ticket #167). A legacy/online create with
    // no client id falls back to a plain insert.
    if (link.clientId && link.userId) {
      const { data, error } = await supabase
        .from('short_links')
        .upsert(row, { onConflict: 'user_id,client_id' })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create short link: ${error.message}`);
      }

      return this.toDomain(data as ShortLinkDbRow);
    }

    const { data, error } = await supabase.from('short_links').insert(row).select().single();

    if (error) {
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
    dbUpdates.updated_at = meta?.updatedAt ?? new Date().toISOString();
    // `deletedAt: null` from an outbox replay is a resurrect (undo of a delete).
    const resurrect = meta?.deletedAt === null;
    if (meta?.deletedAt !== undefined) {
      dbUpdates.deleted_at = meta.deletedAt;
    }

    const supabase = this.adminClient;
    let query = supabase.from('short_links').update(dbUpdates).eq('code', code);
    if (!resurrect) query = query.is('deleted_at', null);
    const { data, error } = await query.select().single();

    if (error) {
      throw new Error(`Failed to update short link: ${error.message}`);
    }

    // analytics_events.link_code references short_links.code with ON UPDATE
    // CASCADE (see migration), so changing the slug re-points click history
    // automatically.

    return this.toDomain(data as ShortLinkDbRow);
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
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to delete short link: ${error.message}`);
    }

    return true;
  }

  async deleteMany(codes: string[], userId: string): Promise<void> {
    if (codes.length === 0) return;
    const supabase = this.adminClient;
    const { error } = await supabase
      .from('short_links')
      .delete()
      .in('code', codes)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete short links: ${error.message}`);
    }
  }

  async setExpiryMany(codes: string[], expiresAt: Date | null, userId: string): Promise<void> {
    if (codes.length === 0) return;
    const supabase = this.adminClient;
    const { error } = await supabase
      .from('short_links')
      .update({ expires_at: expiresAt ? expiresAt.toISOString() : null })
      .in('code', codes)
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) {
      throw new Error(`Failed to update short links expiry: ${error.message}`);
    }
  }

  async exists(code: string): Promise<boolean> {
    const supabase = this.publicClient;
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
