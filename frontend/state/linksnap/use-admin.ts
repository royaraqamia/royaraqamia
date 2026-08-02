'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LinksnapApiClient, type AdminStats } from '@/frontend/api/linksnap';

export function useAdminLinks(token: string) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingCode, setActionLoadingCode] = useState<string | null>(null);
  const [moderateError, setModerateError] = useState<string | null>(null);

  const fetchAdminStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await LinksnapApiClient.fetchAdminStats(token));
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'فشل في جلب البيانات الإدارية.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAdminStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAdminStats]);

  const toggleModerationBlock = useCallback(
    async (code: string, currentBlockedState: boolean) => {
      setActionLoadingCode(code);
      setModerateError(null);
      try {
        const targetState = !currentBlockedState;
        await LinksnapApiClient.moderateLink(code, targetState, token);
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
    fetchAdminStats,
    toggleModerationBlock,
    actionLoadingCode,
    moderateError,
    setModerateError,
  };
}
