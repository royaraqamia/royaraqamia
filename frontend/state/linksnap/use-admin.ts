'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchAdminStats, moderateLink, type AdminStats } from '@/frontend/api/linksnap';
import { logger } from '@/shared/logger';

export function useAdminLinks(token: string) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  const [moderateError, setModerateError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAdminStats(token));
    } catch (err: unknown) {
      logger.error('Failed to fetch admin stats', { error: String(err) });
      setError(err instanceof Error ? err.message : 'فشل في جلب البيانات الإدارية.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadStats]);

  const toggleModerationBlock = useCallback(
    async (code: string, currentBlockedState: boolean) => {
      setActionLoadingCode(code);
      setModerateError(null);
      try {
        const targetState = !currentBlockedState;
        await moderateLink(code, targetState, token);
        setStats((prev) => {
          if (!prev) return prev;
          const updatedLinks = (prev.links || []).map((link) =>
            link.code === code ? { ...link, isBlocked: targetState } : link
          );
          const blockedDiff = targetState ? 1 : -1;
          return {
            ...prev,
            blockedLinksCount: prev.blockedLinksCount + blockedDiff,
            links: updatedLinks,
          };
        });
        toast.success(targetState ? 'تم حظر الرابط بنجاح' : 'تم إلغاء حظر الرابط بنجاح');
      } catch (err: unknown) {
        setModerateError(err instanceof Error ? err.message : 'حدث خطأ أثناء إجراء المراقبة.');
      } finally {
        setActionLoadingCode(null);
      }
    },
    [token]
  );

  return {
    stats,
    loading,
    error,
    fetchAdminStats: loadStats,
    toggleModerationBlock,
    actionLoadingCode,
    moderateError,
    setModerateError,
  };
}
