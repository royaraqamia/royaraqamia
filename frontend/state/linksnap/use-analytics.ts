'use client';

import { useCallback, useState } from 'react';
import { LinksnapApiClient, type LinkAnalyticsSummary } from '@/frontend/api/linksnap';

export function useLinkAnalytics(code: string, token: string) {
  const [analytics, setAnalytics] = useState<LinkAnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      setAnalytics(await LinksnapApiClient.fetchAnalytics(code, token));
    } catch (err: unknown) {
      setAnalyticsError(err instanceof Error ? err.message : 'فشل في تحميل التَّحليلات.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [code, token]);

  const resetAnalytics = useCallback(() => setAnalytics(null), []);

  return { analytics, analyticsLoading, analyticsError, loadAnalytics, resetAnalytics };
}
