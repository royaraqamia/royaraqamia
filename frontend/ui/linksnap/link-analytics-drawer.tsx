'use client';

import { useEffect, useState, memo } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'motion/react';
import { LoaderCircle, Share2 } from 'lucide-react';
import { AnalyticsChart } from './analytics-chart';
import { LINK_ANALYTICS_EXPORT_COPY } from './analytics-export-copy';
import { shareOrDownloadCsv } from './csv-export';
import {
  analyticsRangeLabel,
  analyticsRangeToFilter,
  LinkAnalyticsContent,
  type AnalyticsData,
  type AnalyticsRangePreset,
} from './link-analytics-content';
import type { LinkStatus } from '@/shared/contracts/linksnap';
import type { AnalyticsRangeFilter } from '@/frontend/api/linksnap';

interface LinkAnalyticsDrawerProps {
  isExpanded: boolean;
  analyticsLoading: boolean;
  analyticsError: string | null;
  analytics: AnalyticsData | null;
  status: LinkStatus;
  loadAnalytics: (range?: AnalyticsRangeFilter) => Promise<void>;
  exportCsv: (range: AnalyticsRangeFilter | undefined) => Promise<string | null>;
  exportingCsv: boolean;
  exportCsvFailed: boolean;
  code: string;
}

export const LinkAnalyticsDrawer = memo(function LinkAnalyticsDrawer({
  isExpanded,
  analyticsLoading,
  analyticsError,
  analytics,
  status,
  loadAnalytics,
  exportCsv,
  exportingCsv,
  exportCsvFailed,
  code,
}: LinkAnalyticsDrawerProps) {
  const reducedMotion = useReducedMotion();
  const [range, setRange] = useState<AnalyticsRangePreset>('7d');

  useEffect(() => {
    if (isExpanded) {
      void loadAnalytics(analyticsRangeToFilter(range));
    }
  }, [isExpanded, range, loadAnalytics]);

  const handleExport = async () => {
    const content = await exportCsv(analyticsRangeToFilter(range));
    if (content === null) return;
    await shareOrDownloadCsv(
      `linksnap-${code}-${range}.csv`,
      content,
      LINK_ANALYTICS_EXPORT_COPY.exportTitle
    );
  };

  return (
    <AnimatePresence>
      {isExpanded && (
        <m.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={reducedMotion ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
          className="border-t border-border/50 bg-muted/30"
        >
          <div className="p-6 space-y-6" aria-live="polite">
            <LinkAnalyticsContent
              loading={analyticsLoading}
              error={analyticsError}
              analytics={analytics}
              status={status}
              range={range}
              onRange={setRange}
              actions={
                <button
                  type="button"
                  onClick={() => void handleExport()}
                  disabled={exportingCsv || (analytics?.totalClicks ?? 0) === 0}
                  aria-busy={exportingCsv}
                  className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {exportingCsv ? (
                    <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 aria-hidden="true" className="w-4 h-4" />
                  )}
                  {exportingCsv
                    ? LINK_ANALYTICS_EXPORT_COPY.exporting
                    : LINK_ANALYTICS_EXPORT_COPY.exportAction}
                </button>
              }
            />

            {exportCsvFailed ? (
              <div
                role="alert"
                className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-xs rounded-lg flex items-center gap-1.5"
              >
                <span>{LINK_ANALYTICS_EXPORT_COPY.exportFailed}</span>
              </div>
            ) : null}

            {!analyticsLoading && !analyticsError && analytics ? (
              <AnalyticsChart
                stats={analytics.clicksByDate}
                rangeLabel={analyticsRangeLabel(range)}
              />
            ) : null}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  );
});
