'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { toast } from 'sonner';
import { fetchAdminStats, moderateLink } from '@/frontend/api/linksnap';
import { logger } from '@/frontend/shared/logger';
import {
  adminLinksInitialState,
  adminLinksReducer,
} from '@/frontend/state/linksnap/use-admin.reducer';

export function useAdminLinks(token: string) {
  const [state, dispatch] = useReducer(adminLinksReducer, undefined, adminLinksInitialState);
  const { stats, loading, error, actionLoadingCode, moderateError } = state;

  const loadStats = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      dispatch({ type: 'loaded', stats: await fetchAdminStats(token) });
    } catch (err: unknown) {
      logger.error('Failed to fetch admin stats', { error: String(err) });
      dispatch({
        type: 'loadFailed',
        message: err instanceof Error ? err.message : 'فشل في جلب البيانات الإدارية.',
      });
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadStats();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadStats]);

  const setModerateError = useCallback((message: string | null) => {
    dispatch({ type: 'moderateErrorSet', message });
  }, []);

  const toggleModerationBlock = useCallback(
    async (code: string, currentBlockedState: boolean) => {
      dispatch({ type: 'moderationStarted', code });
      try {
        const targetState = !currentBlockedState;
        await moderateLink(code, targetState, token);
        dispatch({ type: 'moderationSucceeded', code, blocked: targetState });
        toast.success(targetState ? 'تم حظر الرَّابط بنجاح' : 'تم إلغاء حظر الرَّابط بنجاح');
      } catch (err: unknown) {
        dispatch({
          type: 'moderationFailed',
          message: err instanceof Error ? err.message : 'حدث خطأ أثناء إجراء المراقبة.',
        });
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
