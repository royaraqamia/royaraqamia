'use client';

import { useCallback, useMemo, useState } from 'react';
import { bulkLinkAction } from '@/frontend/api/linksnap';

export function useBulkLinks(codes: string[], token: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = codes.length > 0 && selected.size === codes.length;

  const toggle = useCallback((code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === codes.length && prev.size > 0) {
        return new Set();
      }
      return new Set(codes);
    });
  }, [codes]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectedCodes = useMemo(() => Array.from(selected), [selected]);

  const runDelete = useCallback(async (): Promise<{ deleted: number } | null> => {
    setBusy(true);
    setError(null);
    try {
      const affected = await bulkLinkAction(token, 'delete', selectedCodes);
      return { deleted: affected };
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'فشل تنفيذ الإجراء على الروابط.');
      return null;
    } finally {
      setBusy(false);
    }
  }, [token, selectedCodes]);

  const runSetExpiry = useCallback(
    async (expiresAt: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        await bulkLinkAction(token, 'setExpiry', selectedCodes, expiresAt);
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'فشل تعيين تاريخ الانتهاء.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [token, selectedCodes]
  );

  return {
    selected,
    selectedCodes,
    selectedCount: selected.size,
    allSelected,
    busy,
    error,
    toggle,
    toggleAll,
    clear,
    runDelete,
    runSetExpiry,
  };
}
