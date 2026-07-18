import {
  IAdminRepository,
  SystemStatsReportData,
} from '@/domains/linksnap/domain/interfaces/admin-repository.interface';
import { getAdminSupabase } from '../supabase/client';

export class SupabaseAdminRepository implements IAdminRepository {
  async getSystemStats(): Promise<SystemStatsReportData> {
    const supabase = getAdminSupabase();

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
      .order('created_at', { ascending: false });

    if (linksErr) {
      throw new Error(`Failed to retrieve master links: ${linksErr.message}`);
    }

    const links = (rawLinks || []).map((lnk: any) => {
      const countData = lnk.analytics_events;
      let clickCount = 0;
      if (Array.isArray(countData) && countData.length > 0) {
        clickCount = countData[0].count || 0;
      } else if (countData && typeof countData === 'object') {
        clickCount = (countData as any).count || 0;
      }

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
