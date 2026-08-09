import {
  AdminRepository,
  SystemStatsReportData,
} from '@/backend/repositories/linksnap/admin-repository';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

const ADMIN_LINKS_PAGE = 100;

export class SupabaseAdminRepository implements AdminRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async getSystemStats(): Promise<SystemStatsReportData> {
    const supabase = this.supabase;

    // 1. Total Links count
    const { count: totalLinks, error: countErr } = await supabase
      .from('short_links')
      .select('*', { count: 'exact', head: true });

    if (countErr) {
      throw new Error(`Failed to fetch total links: ${countErr.message}`);
    }

    // 2. Blocked Links count
    const { count: blockedLinks, error: blockedErr } = await supabase
      .from('short_links')
      .select('*', { count: 'exact', head: true })
      .eq('is_blocked', true);

    if (blockedErr) {
      throw new Error(`Failed to fetch blocked links: ${blockedErr.message}`);
    }

    // 3. Total clicks count
    const { count: totalClicks, error: clicksErr } = await supabase
      .from('analytics_events')
      .select('*', { count: 'exact', head: true });

    if (clicksErr) {
      throw new Error(`Failed to fetch total clicks: ${clicksErr.message}`);
    }

    // 4. Retrieve all links with nested click count aggregated
    const { data: rawLinks, error: linksErr } = await supabase
      .from('short_links')
      .select(
        `
        code,
        original_url,
        user_id,
        created_at,
        is_blocked,
        analytics_events (count)
      `
      )
      .order('created_at', { ascending: false })
      .range(0, ADMIN_LINKS_PAGE - 1);

    if (linksErr) {
      throw new Error(`Failed to retrieve master links: ${linksErr.message}`);
    }

    const links = (rawLinks || []).map((lnk) => {
      const countData = lnk.analytics_events;
      const clickCount =
        Array.isArray(countData) && countData.length > 0 ? countData[0]?.count || 0 : 0;

      return {
        code: lnk.code || '',
        originalUrl: lnk.original_url || '',
        userId: lnk.user_id,
        createdAt: lnk.created_at || new Date().toISOString(),
        isBlocked: !!lnk.is_blocked,
        clickCount,
      };
    });

    return {
      totalLinks: totalLinks || 0,
      totalClicks: totalClicks || 0,
      blockedLinksCount: blockedLinks || 0,
      links,
    };
  }
}
