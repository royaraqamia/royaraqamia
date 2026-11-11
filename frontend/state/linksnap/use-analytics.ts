'use client';

import { useCallback, useState } from 'react';
import {
  exportAnalyticsCsv,
  fetchAnalytics,
  type AnalyticsRangeFilter,
  type LinkAnalyticsSummary,
} from '@/frontend/api/linksnap';
import { buildCsv } from '@/frontend/ui/linksnap/csv-export';

export function useLinkAnalytics(code: string, token: string) {
  const [analytics, setAnalytics] = useState<LinkAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportCsvFailed, setExportCsvFailed] = useState(false);

  const loadAnalytics = useCallback(
    async (range?: AnalyticsRangeFilter) => {
      setAnalytics(null);
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        setAnalytics(await fetchAnalytics(code, token, range));
      } catch (err: unknown) {
        setAnalyticsError(err instanceof Error ? err.message : 'فشل في تحميل التَّحليلات.');
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [code, token]
  );

  const exportCsv = useCallback(
    async (range: AnalyticsRangeFilter | undefined): Promise<string | null> => {
      setExportingCsv(true);
      setExportCsvFailed(false);
      try {
        const rows = await exportAnalyticsCsv(code, token, range);
        return buildCsv(rows);
      } catch {
        setExportCsvFailed(true);
        return null;
      } finally {
        setExportingCsv(false);
      }
    },
    [code, token]
  );

  const resetAnalytics = useCallback(() => setAnalytics(null), []);

  return {
    analytics,
    analyticsLoading,
    analyticsError,
    exportingCsv,
    exportCsvFailed,
    loadAnalytics,
    exportCsv,
    resetAnalytics,
  };
}
