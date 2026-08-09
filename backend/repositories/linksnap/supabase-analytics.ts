import {
  AnalyticsRepository,
  AnalyticsDateRange,
} from '@/backend/repositories/linksnap/analytics-repository';
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

const MAX_EXPORT_ROWS = 10_000;
const MAX_CHART_DAYS = 366;

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

  async getSummaryForLink(code: string, range?: AnalyticsDateRange): Promise<LinkAnalyticsSummary> {
    const supabase = this.supabase;
    const events = await this.fetchEvents(supabase, code, range);
    const totalClicks = events.length;

    return {
      totalClicks,
      recentClicks: events.slice(0, 10),
      clicksByDate: this.aggregateClicksByDate(events, range),
      topReferrers: this.aggregateTopReferrers(events),
      device: aggregateDeviceBreakdown(events),
    };
  }

  async getExportEvents(code: string, range?: AnalyticsDateRange): Promise<AnalyticsEvent[]> {
    const supabase = this.supabase;
    let query = supabase.from('analytics_events').select('*').eq('link_code', code);

    if (range?.from) {
      query = query.gte('clicked_at', range.from.toISOString());
    }
    if (range?.to) {
      query = query.lte('clicked_at', range.to.toISOString());
    }

    const { data, error } = await query
      .order('clicked_at', { ascending: true })
      .limit(MAX_EXPORT_ROWS);

    if (error) {
      throw new Error(`Failed to retrieve analytics events: ${error.message}`);
    }
    return (data as AnalyticsEventDbRow[]).map((row) => this.toDomain(row));
  }

  private async fetchEvents(
    supabase: SupabaseClient<Database>,
    code: string,
    range?: AnalyticsDateRange
  ): Promise<AnalyticsEvent[]> {
    let query = supabase.from('analytics_events').select('*').eq('link_code', code);

    if (range?.from) {
      query = query.gte('clicked_at', range.from.toISOString());
    }
    if (range?.to) {
      query = query.lte('clicked_at', range.to.toISOString());
    }

    const { data: eventsData, error: eventsError } = await query
      .order('clicked_at', {
        ascending: false,
      })
      .limit(MAX_EXPORT_ROWS);

    if (eventsError) {
      throw new Error(`Failed to retrieve analytics events: ${eventsError.message}`);
    }
    return (eventsData as AnalyticsEventDbRow[]).map((row) => this.toDomain(row));
  }

  private aggregateClicksByDate(
    events: AnalyticsEvent[],
    range?: AnalyticsDateRange
  ): DailyClickStat[] {
    const now = new Date();
    const from = range?.from ?? new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    const to = range?.to ?? now;

    const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    const spanDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
    if (spanDays > MAX_CHART_DAYS) {
      end.setDate(start.getDate() + MAX_CHART_DAYS);
    }

    const dailyMap = new Map<string, number>();
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      dailyMap.set(cursor.toISOString().split('T')[0]!, 0);
      cursor.setDate(cursor.getDate() + 1);
    }

    events.forEach((ev) => {
      const key = ev.clickedAt.toISOString().split('T')[0]!;
      if (dailyMap.has(key)) {
        dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
      }
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
