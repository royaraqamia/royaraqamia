'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  activatePlan as activatePlanRequest,
  fetchPlanUsers,
  type AdminPlansResult,
} from '@/frontend/api/admin/plans';
import { logger } from '@/frontend/shared/logger';
import type { ActivatePlanInput, AdminPlansQuery } from '@/shared/contracts/plans';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAdminPlans(query: AdminPlansQuery) {
  const { page, pageSize, search } = query;
  const [result, setResult] = useState<AdminPlansResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await fetchPlanUsers({ page, pageSize, search }));
    } catch (err) {
      logger.error('Failed to load plan usage', { error: String(err) });
      setError(messageOf(err, 'تعذّر تحميل قائمة الاشتراكات.'));
    } finally {
      setLoading(false);
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
