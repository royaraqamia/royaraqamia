'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMyPlan, getMyUsage } from '@/frontend/api/plans';
import { logger } from '@/frontend/shared/logger';
import type { MyPlan, UsageState } from '@/shared/contracts/plans';

/**
 * The signed-in account's allowance. `enabled` is false for a visitor and while
 * the session is resolving, so the card never issues a request it knows will be
 * answered 401 and never flashes an empty state at a guest.
 */
export function useMyUsage(enabled: boolean) {
  const [state, setState] = useState<UsageState | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setState(await getMyUsage());
    } catch (error) {
      logger.error('Failed to load usage state', { error: String(error) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, reload]);

  return { state, loading, failed, reload };
}

/** The plan page's data: allowance plus the grant history. */
export function useMyPlan(enabled: boolean) {
  const [plan, setPlan] = useState<MyPlan | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setPlan(await getMyPlan());
    } catch (error) {
      logger.error('Failed to load plan details', { error: String(error) });
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setPlan(null);
      setLoading(false);
      return;
    }
    void reload();
  }, [enabled, reload]);

  return { plan, loading, failed, reload };
}
