import { IShortLinkRepository } from '@/domains/linksnap/domain/interfaces/short-link-repository.interface';
import { ShortLink } from '@/domains/linksnap/domain/entities/short-link.entity';
import { getPublicSupabase, getAdminSupabase } from '../supabase/client';

// Database row interface matching public.short_links in supabase_schema.sql
interface ShortLinkDbRow {
  code: string;
  original_url: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  is_blocked: boolean;
}

export class SupabaseShortLinkRepository implements IShortLinkRepository {
  private toDomain(row: ShortLinkDbRow): ShortLink {
    return {
      code: row.code,
      originalUrl: row.original_url,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      isBlocked: row.is_blocked,
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
    };
  }

  async findByCode(code: string): Promise<ShortLink | null> {
    const supabase = getPublicSupabase();
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

  async create(link: ShortLink): Promise<ShortLink> {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('short_links')
      .insert(this.toDb(link))
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create short link: ${error.message}`);
    }

    return this.toDomain(data as ShortLinkDbRow);
  }

  async listByUserId(userId: string): Promise<ShortLink[]> {
    const supabase = getAdminSupabase(); // Use admin client to load user's specific list safely
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
    updates: Partial<Pick<ShortLink, 'originalUrl' | 'isBlocked'>>
  ): Promise<ShortLink> {
    const supabase = getAdminSupabase();
    const dbUpdates: Partial<ShortLinkDbRow> = {};
    if (updates.originalUrl !== undefined) {
      dbUpdates.original_url = updates.originalUrl;
    }
    if (updates.isBlocked !== undefined) {
      dbUpdates.is_blocked = updates.isBlocked;
    }
    dbUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('short_links')
      .update(dbUpdates)
      .eq('code', code)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update short link: ${error.message}`);
    }

    return this.toDomain(data as ShortLinkDbRow);
  }

  async delete(code: string, userId: string): Promise<boolean> {
    const supabase = getAdminSupabase(); // Admin client verifies ownership/allows direct deletion safely
    const { error } = await supabase
      .from('short_links')
      .delete()
      .eq('code', code)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete short link: ${error.message}`);
    }

    return true;
  }

  async exists(code: string): Promise<boolean> {
    const supabase = getPublicSupabase();
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
