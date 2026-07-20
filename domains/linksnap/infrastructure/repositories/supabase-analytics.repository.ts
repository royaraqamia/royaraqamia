import { IAnalyticsRepository } from '@/domains/linksnap/domain/interfaces/analytics-repository.interface';
import {
  AnalyticsEvent,
  LinkAnalyticsSummary,
  DailyClickStat,
} from '@/domains/linksnap/domain/entities/analytics-event.entity';
import { getAdminSupabase } from '../supabase/client';

interface AnalyticsEventDbRow {
  id: string;
  link_code: string;
  clicked_at: string;
  referrer: string | null;
  user_agent: string | null;
  ip_country: string | null;
}

interface ReferrerEntry {
  name: string;
  count: number;
}

export class SupabaseAnalyticsRepository implements IAnalyticsRepository {
  private toDomain(row: AnalyticsEventDbRow): AnalyticsEvent {
    return {
      id: row.id,
      linkCode: row.link_code,
      clickedAt: new Date(row.clicked_at),
      referrer: row.referrer,
      userAgent: row.user_agent,
      ipCountry: row.ip_country,
    };
  }

  async recordClick(event: Omit<AnalyticsEvent, 'id' | 'clickedAt'>): Promise<AnalyticsEvent> {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from('analytics_events')
      .insert({
        link_code: event.linkCode,
        referrer: event.referrer,
        user_agent: event.userAgent,
        ip_country: event.ipCountry,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record click: ${error.message}`);
    }

    return this.toDomain(data as AnalyticsEventDbRow);
  }

  async getSummaryForLink(code: string, userId: string): Promise<LinkAnalyticsSummary> {
    const supabase = getAdminSupabase();
    await this.verifyOwnership(supabase, code, userId);
    const events = await this.fetchEvents(supabase, code);
    const totalClicks = events.length;

    return {
      totalClicks,
      recentClicks: events.slice(0, 10),
      clicksByDate: this.aggregateClicksByDate(events),
      topReferrers: this.aggregateTopReferrers(events),
    };
  }

  private async verifyOwnership(
    supabase: ReturnType<typeof getAdminSupabase>,
    code: string,
    userId: string
  ): Promise<void> {
    const { data: linkData, error: linkError } = await supabase
      .from('short_links')
      .select('user_id')
      .eq('code', code)
      .single();

    if (linkError) {
      throw new Error(`Failed to verify short link owner: ${linkError.message}`);
    }
    if (linkData.user_id !== userId) {
      throw new Error('Unauthorized: You do not own this link.');
    }
  }

  private async fetchEvents(
    supabase: ReturnType<typeof getAdminSupabase>,
    code: string
  ): Promise<AnalyticsEvent[]> {
    const { data: eventsData, error: eventsError } = await supabase
      .from('analytics_events')
      .select('*')
      .eq('link_code', code)
      .order('clicked_at', { ascending: false });

    if (eventsError) {
      throw new Error(`Failed to retrieve analytics events: ${eventsError.message}`);
    }
    return (eventsData as AnalyticsEventDbRow[]).map((row) => this.toDomain(row));
  }

  private aggregateClicksByDate(events: AnalyticsEvent[]): DailyClickStat[] {
    const dailyMap = new Map<string, number>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap.set(d.toISOString().split('T')[0]!, 0);
    }

    events.forEach((ev) => {
      const key = ev.clickedAt.toISOString().split('T')[0]!;
      dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
    });

    return Array.from(dailyMap.entries())
      .map(([date, clicks]) => ({ date, clicks }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private aggregateTopReferrers(events: AnalyticsEvent[]): ReferrerEntry[] {
    const referrerMap = new Map<string, number>();
    events.forEach((ev) => {
      let ref = 'Direct / Email / QR';
      if (ev.referrer) {
        try {
          ref = new URL(ev.referrer).hostname || ev.referrer;
        } catch {
          ref = ev.referrer;
        }
      }
      referrerMap.set(ref, (referrerMap.get(ref) || 0) + 1);
    });

    return Array.from(referrerMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
}
