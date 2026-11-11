'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Globe, Smartphone, Monitor, Cpu } from 'lucide-react';
import { AnalyticsSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { LINK_ANALYTICS_COPY } from './link-analytics-content-copy';
import type { LinkStatus } from '@/shared/contracts/linksnap';
import type { AnalyticsRangeFilter } from '@/frontend/api/linksnap';

/**
 * The analytics drawer's content (#962), split from its page-only shell.
 *
 * `link-analytics-drawer.tsx` owns the CSV export (#964) and the chart (#963).
 * This component is the half both clients draw: the
 * range presets, the click total, the top referrer, the link status, the device,
 * OS and browser breakdowns, the top referrers and the recent activity - plus
 * the three faces the drawer has while it loads, while the radio is off and when
 * the read fails. The app's `LinksnapAnalyticsDrawer.kt` is its pair, and every
 * visible word comes from `shared/copy/account-links-analytics.json`.
 */

export type AnalyticsRangePreset = '7d' | '30d' | '90d';

export const ANALYTICS_RANGE_PRESETS: {
  value: AnalyticsRangePreset;
  label: string;
  days: number;
}[] = [
  { value: '7d', label: LINK_ANALYTICS_COPY.range7, days: 7 },
  { value: '30d', label: LINK_ANALYTICS_COPY.range30, days: 30 },
  { value: '90d', label: LINK_ANALYTICS_COPY.range90, days: 90 },
];

export function analyticsRangeToFilter(preset: AnalyticsRangePreset): AnalyticsRangeFilter {
  const now = new Date();
  const presetConfig = ANALYTICS_RANGE_PRESETS.find((p) => p.value === preset);
  const from = new Date(now.getTime() - (presetConfig?.days ?? 7) * 24 * 60 * 60 * 1000);
  return { from: from.toISOString() };
}

const STATUS_META: Record<LinkStatus, { label: string; className: string }> = {
  active: {
    label: LINK_ANALYTICS_COPY.statusActive,
    className: 'text-success bg-success/10 border-success/30',
  },
  expired: {
    label: LINK_ANALYTICS_COPY.statusExpired,
    className: 'text-muted-foreground bg-muted/50 border-border/40',
  },
  blocked: {
    label: LINK_ANALYTICS_COPY.statusBlocked,
    className: 'text-destructive bg-destructive/10 border-destructive/30',
  },
};

export interface AnalyticsData {
  totalClicks: number;
  clicksByDate: { date: string; clicks: number }[];
  topReferrers: { name: string; count: number }[];
  recentClicks: {
    id: string;
    clickedAt: string;
    referrer: string | null;
    userAgent: string | null;
    ipCountry: string | null;
  }[];
  device: {
    devices: { name: string; count: number; percent: number }[];
    os: { name: string; count: number; percent: number }[];
    browsers: { name: string; count: number; percent: number }[];
  };
}

interface LinkAnalyticsContentProps {
  loading: boolean;
  error: string | null;
  analytics: AnalyticsData | null;
  status: LinkStatus;
  range: AnalyticsRangePreset;
  onRange: (range: AnalyticsRangePreset) => void;
  /** The page-only controls that sit beside the presets, such as the CSV action. */
  actions?: ReactNode;
}

/** Online at first paint and on every change, so the drawer can name its state. */
function useOnline(): boolean {
  // True until the effect reads the browser: the server has no `navigator`, and
  // an offline first render would differ from its markup during hydration.
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  return online;
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center gap-1.5"
    >
      <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function BreakdownRows({
  rows,
  total,
  emptyLabel,
}: {
  rows: { name: string; count: number; percent: number }[];
  total: number;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground/70 text-center py-3">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.name} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground/85 truncate">{row.name}</span>
            <span className="font-mono text-muted-foreground shrink-0 ms-2">
              {row.count} · {row.percent}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/70 transition-safe duration-500 ease-out"
              style={{ width: `${total > 0 ? (row.count / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LinkAnalyticsContent({
  loading,
  error,
  analytics,
  status,
  range,
  onRange,
  actions,
}: LinkAnalyticsContentProps) {
  const online = useOnline();

  if (!online) {
    return <Notice>{LINK_ANALYTICS_COPY.offline}</Notice>;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <span className="sr-only">{LINK_ANALYTICS_COPY.loading}</span>
        <AnalyticsSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <Notice>
        {LINK_ANALYTICS_COPY.failed} {error}
      </Notice>
    );
  }

  if (!analytics) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div
          data-visual="link-analytics-presets"
          className="flex items-center gap-1 bg-muted/70 rounded-lg p-1"
          role="group"
          aria-label={LINK_ANALYTICS_COPY.rangeLabel}
        >
          {ANALYTICS_RANGE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              data-visual={`link-analytics-preset-${preset.days}`}
              onClick={() => onRange(preset.value)}
              aria-pressed={range === preset.value}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                range === preset.value
                  ? 'bg-selected text-selected-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {actions}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div
          data-visual="link-analytics-total"
          className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between card-lift"
        >
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {LINK_ANALYTICS_COPY.totalClicks}
          </span>
          <span className="text-2xl font-bold text-foreground font-display mt-1">
            {analytics.totalClicks}
          </span>
        </div>
        <div
          data-visual="link-analytics-top-referrer"
          className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between card-lift"
        >
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {LINK_ANALYTICS_COPY.topReferrer}
          </span>
          <span className="text-sm font-bold text-foreground truncate mt-2">
            {analytics.topReferrers[0]?.name || LINK_ANALYTICS_COPY.directUnknown}
          </span>
        </div>
        <div
          data-visual="link-analytics-status"
          className="bg-card p-4 rounded-xl border border-border shadow-sm flex flex-col justify-between col-span-2 md:col-span-1 card-lift"
        >
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {LINK_ANALYTICS_COPY.linkStatus}
          </span>
          <span
            className={`text-xs font-bold border px-2 py-0.5 rounded-full w-max mt-2 flex items-center gap-1 ${
              STATUS_META[status]?.className ?? STATUS_META.active.className
            }`}
          >
            <span aria-hidden="true" className="w-1.5 h-1.5 bg-current rounded-full" />
            {STATUS_META[status]?.label ?? LINK_ANALYTICS_COPY.statusActive}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-primary" />
            {LINK_ANALYTICS_COPY.devices}
          </p>
          <BreakdownRows
            rows={analytics.device.devices}
            total={analytics.totalClicks}
            emptyLabel={LINK_ANALYTICS_COPY.emptyDevices}
          />
        </div>
        <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-primary" />
            {LINK_ANALYTICS_COPY.os}
          </p>
          <BreakdownRows
            rows={analytics.device.os}
            total={analytics.totalClicks}
            emptyLabel={LINK_ANALYTICS_COPY.emptyOs}
          />
        </div>
        <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Monitor className="w-4 h-4 text-primary" />
            {LINK_ANALYTICS_COPY.browsers}
          </p>
          <BreakdownRows
            rows={analytics.device.browsers}
            total={analytics.totalClicks}
            emptyLabel={LINK_ANALYTICS_COPY.emptyBrowsers}
          />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Globe aria-hidden="true" className="w-4 h-4 text-primary" />
            {LINK_ANALYTICS_COPY.topReferrers}
          </p>
          {analytics.topReferrers.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {LINK_ANALYTICS_COPY.emptyReferrers}
            </p>
          ) : (
            <div className="space-y-2">
              {analytics.topReferrers.map((ref, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <span
                    className="text-muted-foreground font-mono truncate max-w-45"
                    title={ref.name}
                  >
                    {ref.name}
                  </span>
                  <span className="font-mono font-bold text-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                    {LINK_ANALYTICS_COPY.referrerClicks.replace('{count}', String(ref.count))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card p-5 rounded-xl border border-border shadow-sm space-y-3.5 card-lift">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Smartphone aria-hidden="true" className="w-4 h-4 text-primary" />
            {LINK_ANALYTICS_COPY.recentActivity}
          </p>
          {analytics.recentClicks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {LINK_ANALYTICS_COPY.emptyActivity}
            </p>
          ) : (
            <div className="space-y-2 max-h-35 overflow-y-auto pr-1">
              {analytics.recentClicks.map((click) => (
                <div
                  key={click.id}
                  className="flex items-center justify-between text-xs border-b border-border/50 pb-1.5 last:border-none"
                >
                  <span
                    className="text-muted-foreground truncate max-w-37.5"
                    title={click.userAgent || LINK_ANALYTICS_COPY.unknownDevice}
                  >
                    {click.userAgent
                      ? click.userAgent.length > 30
                        ? click.userAgent.substring(0, 30) + '...'
                        : click.userAgent
                      : LINK_ANALYTICS_COPY.unknownBrowser}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {new Date(click.clickedAt).toLocaleTimeString('ar-EG-u-nu-latn', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
