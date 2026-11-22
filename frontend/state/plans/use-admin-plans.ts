'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import { activatePlan as activatePlanRequest, fetchPlanUsers } from '@/frontend/api/admin/plans';
import { logger } from '@/frontend/shared/logger';
import {
  adminPlansInitialState,
  adminPlansReducer,
} from '@/frontend/state/plans/use-admin-plans.reducer';
import type { ActivatePlanInput, AdminPlansQuery } from '@/shared/contracts/plans';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAdminPlans(query: AdminPlansQuery) {
  const { page, pageSize, search } = query;
  const [state, dispatch] = useReducer(adminPlansReducer, undefined, adminPlansInitialState);
  const { result, loading, error } = state;

  const reload = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      dispatch({ type: 'loadSucceeded', result: await fetchPlanUsers({ page, pageSize, search }) });
    } catch (err) {
      logger.error('Failed to load plan usage', { error: String(err) });
      dispatch({ type: 'loadFailed', message: messageOf(err, 'تعذّر تحميل قائمة الاشتراكات.') });
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { result, loading, error, reload };
}

export function useActivatePlan() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = useCallback(async (input: ActivatePlanInput) => {
    setBusy(true);
    setError(null);
    try {
      return await activatePlanRequest(input);
    } catch (err) {
      setError(messageOf(err, 'تعذّر تفعيل الاشتراك.'));
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, activate };
}
