'use client';

import { useCallback, useEffect, useReducer } from 'react';
import { getMyPlan, getMyUsage } from '@/frontend/api/plans';
import { logger } from '@/frontend/shared/logger';
import {
  planResourceInitialState,
  planResourceReducer,
} from '@/frontend/state/plans/plan-resource.reducer';
import type { MyPlan, UsageState } from '@/shared/contracts/plans';

/**
 * The signed-in account's allowance. `enabled` is false for a visitor and while
 * the session is resolving, so the card never issues a request it knows will be
 * answered 401 and never flashes an empty state at a guest.
 */
export function useMyUsage(enabled: boolean) {
  const [state, dispatch] = useReducer(
    planResourceReducer<UsageState>,
    enabled,
    planResourceInitialState<UsageState>
  );

  const reload = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      dispatch({ type: 'loadSucceeded', value: await getMyUsage() });
    } catch (error) {
      logger.error('Failed to load usage state', { error: String(error) });
      dispatch({ type: 'loadFailed' });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'disabled' });
      return;
    }
    void reload();
  }, [enabled, reload]);

  return { state: state.value, loading: state.loading, failed: state.failed, reload };
}

/** The plan page's data: allowance plus the grant history. */
export function useMyPlan(enabled: boolean) {
  const [state, dispatch] = useReducer(
    planResourceReducer<MyPlan>,
    enabled,
    planResourceInitialState<MyPlan>
  );

  const reload = useCallback(async () => {
    dispatch({ type: 'loadStarted' });
    try {
      dispatch({ type: 'loadSucceeded', value: await getMyPlan() });
    } catch (error) {
      logger.error('Failed to load plan details', { error: String(error) });
      dispatch({ type: 'loadFailed' });
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      dispatch({ type: 'disabled' });
      return;
    }
    void reload();
  }, [enabled, reload]);

  return { plan: state.value, loading: state.loading, failed: state.failed, reload };
}

/**
 * The plan page's two reads: the plan body and the counted actions body. They
 * fail apart, so one hook hands both to the page without tying the plan's one
 * door to the counters request. A failed counters read leaves `usage` null and
 * the page draws the plan and its standing bar without a daily block.
 */
export function usePlanPage(enabled: boolean) {
  const plan = useMyPlan(enabled);
  const usage = useMyUsage(enabled);

  return {
    plan: plan.plan,
    loading: plan.loading,
    failed: plan.failed,
    reload: plan.reload,
    usage: usage.state,
  };
}
