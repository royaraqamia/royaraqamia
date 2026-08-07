import { AnalyticsRepository } from '@/backend/repositories/linksnap/analytics-repository';
import { AnalyticsEvent, LinkAnalyticsSummary, DailyClickStat } from '@/shared/contracts/linksnap';
import { aggregateDeviceBreakdown } from '@/backend/services/linksnap/device-breakdown';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

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

export class SupabaseAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

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
    const supabase = this.supabase;
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

  async getLinkOwner(code: string): Promise<string> {
    const supabase = this.supabase;
    const { data, error } = await supabase
      .from('short_links')
      .select('user_id')
      .eq('code', code)
      .single();

    if (error) {
      throw new Error(`Failed to verify short link owner: ${error.message}`);
    }
    return data.user_id ?? '';
  }

  async getSummaryForLink(code: string): Promise<LinkAnalyticsSummary> {
    const supabase = this.supabase;
    const events = await this.fetchEvents(supabase, code);
    const totalClicks = events.length;

    return {
      totalClicks,
      recentClicks: events.slice(0, 10),
      clicksByDate: this.aggregateClicksByDate(events),
      topReferrers: this.aggregateTopReferrers(events),
      device: aggregateDeviceBreakdown(events),
    };
  }

  private async fetchEvents(
    supabase: SupabaseClient<Database>,
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
