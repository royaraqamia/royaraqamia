'use client';

import { useCallback, useMemo, useReducer } from 'react';
import { bulkPostAction, type BulkPostAction } from '@/frontend/api/blogpress';
import { bulkPostsInitialState, bulkPostsReducer } from './use-bulk-posts.reducer';

export function useBulkPosts(ids: string[]) {
  const [state, dispatch] = useReducer(bulkPostsReducer, undefined, bulkPostsInitialState);
  const { selected, busy, error } = state;

  const allSelected = ids.length > 0 && selected.size === ids.length;

  const toggle = useCallback((id: string) => dispatch({ type: 'toggled', id }), []);

  const toggleAll = useCallback(() => dispatch({ type: 'allToggled', ids }), [ids]);

  const clear = useCallback(() => dispatch({ type: 'cleared' }), []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const run = useCallback(
    async (action: BulkPostAction, categoryId?: string | null): Promise<number | null> => {
      dispatch({ type: 'runStarted' });
      try {
        const result = await bulkPostAction(action, selectedIds, categoryId);
        return result.affected;
      } catch (err: unknown) {
        dispatch({
          type: 'runFailed',
          message: err instanceof Error ? err.message : 'فشل تنفيذ الإجراء على المنشورات.',
        });
        return null;
      } finally {
        dispatch({ type: 'runFinished' });
      }
    },
    [selectedIds]
  );

  return {
    selected,
    selectedIds,
    selectedCount: selected.size,
    allSelected,
    busy,
    error,
    toggle,
    toggleAll,
    clear,
    run,
  };
}
