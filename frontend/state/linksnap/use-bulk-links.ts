'use client';

import { useCallback, useMemo, useReducer } from 'react';
import { bulkLinkAction } from '@/frontend/api/linksnap';
import { useLinksnapContext } from '@/frontend/state/linksnap/linksnap-context';
import {
  bulkLinksInitialState,
  bulkLinksReducer,
} from '@/frontend/state/linksnap/use-bulk-links.reducer';

/**
 * The bulk actions. Inside a `LinksnapProvider` they run through the Local Store
 * and the Outbox — the same per-link intents an offline delete or edit queues —
 * so the dashboard list and the server agree instead of diverging (ADR-0028 /
 * ADR-0029). Outside one they fall back to the bulk endpoint, which serves the
 * admin console and legacy callers.
 */
export function useBulkLinks(codes: string[], token: string) {
  const linksnap = useLinksnapContext();
  const [state, dispatch] = useReducer(bulkLinksReducer, undefined, bulkLinksInitialState);
  const { selected, busy, error } = state;

  const allSelected = codes.length > 0 && selected.size === codes.length;

  const toggle = useCallback((code: string) => {
    dispatch({ type: 'toggled', code });
  }, []);

  const toggleAll = useCallback(() => {
    dispatch({ type: 'allToggled', codes });
  }, [codes]);

  const clear = useCallback(() => dispatch({ type: 'cleared' }), []);

  const selectedCodes = useMemo(() => Array.from(selected), [selected]);

  /** The selected rows the caller can address by identity (Local Store path). */
  const selectedLinks = useMemo(
    () => (linksnap ? linksnap.links.filter((link) => selected.has(link.code)) : []),
    [linksnap, selected]
  );

  const runDelete = useCallback(async (): Promise<{ deleted: number } | null> => {
    dispatch({ type: 'runStarted' });
    try {
      if (linksnap) {
        // One tombstone intent per link, exactly what the single-link delete
        // queues: the row stays in the store as deleted, so the list drops it
        // and another device receives the tombstone on its next pull.
        let deleted = 0;
        for (const link of selectedLinks) {
          if (!link.clientId) continue;
          await linksnap.deleteLink(link.clientId);
          deleted += 1;
        }
        return { deleted };
      }
      const affected = await bulkLinkAction(token, 'delete', selectedCodes);
      return { deleted: affected };
    } catch (err: unknown) {
      dispatch({
        type: 'runFailed',
        message: err instanceof Error ? err.message : 'فشل تنفيذ الإجراء على الروابط.',
      });
      return null;
    } finally {
      dispatch({ type: 'runFinished' });
    }
  }, [linksnap, selectedLinks, token, selectedCodes]);

  const runSetExpiry = useCallback(
    async (expiresAt: string): Promise<boolean> => {
      dispatch({ type: 'runStarted' });
      try {
        if (linksnap) {
          // The store's edit bumps `updatedAt` and queues the same `link.update`
          // an offline edit would, which is what makes the expiry win the merge
          // on another device.
          for (const link of selectedLinks) {
            if (!link.clientId) continue;
            await linksnap.updateLink(link.clientId, { expiresAt });
          }
          return true;
        }
        await bulkLinkAction(token, 'setExpiry', selectedCodes, expiresAt);
        return true;
      } catch (err: unknown) {
        dispatch({
          type: 'runFailed',
          message: err instanceof Error ? err.message : 'فشل تعيين تاريخ الانتهاء.',
        });
        return false;
      } finally {
        dispatch({ type: 'runFinished' });
      }
    },
    [linksnap, selectedLinks, token, selectedCodes]
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
