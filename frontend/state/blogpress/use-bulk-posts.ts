'use client';

import { useCallback, useMemo, useState } from 'react';
import { bulkPostAction, type BulkPostAction } from '@/frontend/api/blogpress';

export function useBulkPosts(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = ids.length > 0 && selected.size === ids.length;

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === ids.length && prev.size > 0) {
        return new Set();
      }
      return new Set(ids);
    });
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const run = useCallback(
    async (action: BulkPostAction, categoryId?: string | null): Promise<number | null> => {
      setBusy(true);
      setError(null);
      try {
        const result = await bulkPostAction(action, selectedIds, categoryId);
        return result.affected;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'فشل تنفيذ الإجراء على المقالات.');
        return null;
      } finally {
        setBusy(false);
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
