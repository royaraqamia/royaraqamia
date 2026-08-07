'use client';

import { useCallback, useState } from 'react';
import {
  exportAnalyticsCsv,
  fetchAnalytics,
  type AnalyticsRangeFilter,
  type LinkAnalyticsSummary,
} from '@/frontend/api/linksnap';
import { buildCsv, downloadCsv } from '@/frontend/ui/linksnap/csv-export';

export function useLinkAnalytics(code: string, token: string) {
  const [analytics, setAnalytics] = useState<LinkAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportCsvError, setExportCsvError] = useState<string | null>(null);

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
    async (range: AnalyticsRangeFilter | undefined, filename: string): Promise<boolean> => {
      setExportingCsv(true);
      setExportCsvError(null);
      try {
        const rows = await exportAnalyticsCsv(code, token, range);
        downloadCsv(filename, buildCsv(rows));
        return true;
      } catch (err: unknown) {
        setExportCsvError(err instanceof Error ? err.message : 'فشل في تصدير البيانات.');
        return false;
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
    exportCsvError,
    loadAnalytics,
    exportCsv,
    resetAnalytics,
  };
}
