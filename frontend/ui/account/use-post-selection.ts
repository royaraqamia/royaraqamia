'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Post } from '@/shared/contracts/blogpress';

import type { PostFilter } from './use-post-filters';

/** The list a selection was made on: the status chip and the search box. */
export interface SelectionScope {
  filter: PostFilter;
  query: string;
}

/**
 * The ids a bulk action would reach, and the ways they change.
 *
 * A selection belongs to the list it was made on: changing `scope` drops it, so
 * filtering a row away can never leave an id a bulk action would still reach.
 * A repaint after a delete or a publish prunes ids that are no longer rows for
 * the same reason. The reset is a render after the new rows, never a guard
 * inside `toggle` — the ids are the list's, not the set's.
 */
export function usePostSelection(rows: Post[], scope: SelectionScope) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  useEffect(() => {
    setSelected(new Set());
  }, [scope.filter, scope.query]);

  useEffect(() => {
    const present = new Set(rows.map((row) => row.id));
    setSelected((current) => {
      let next: Set<string> | null = null;
      for (const id of current) {
        if (!present.has(id)) {
          next ??= new Set(current);
          next.delete(id);
        }
      }
      return next ?? current;
    });
  }, [rows]);

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set<string>() : new Set(rows.map((row) => row.id)));
  }, [allSelected, rows]);

  const clear = useCallback(() => {
    setSelected(new Set<string>());
  }, []);

  return { selected, allSelected, toggle, toggleAll, clear };
}
