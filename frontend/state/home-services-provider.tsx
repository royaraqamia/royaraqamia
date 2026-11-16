'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getHomeServices, replaceHomeServices } from '@/frontend/api/home-services';
import {
  clearGuestHomeServices,
  readGuestHomeServices,
  writeGuestHomeServices,
} from '@/frontend/shared/home-services-local';
import { useSession } from '@/frontend/state/session-provider';
import { HOME_SERVICE_ROUTES, type HomeServiceKey } from '@/shared/contracts/home-services-catalog';

/** Where the read stands. The strip only cares whether it has an answer. */
export type HomeServicesStatus = 'loading' | 'ready' | 'failed';

interface HomeServicesContextValue {
  /** The apps on the homepage, in tab order. Empty is the empty state. */
  order: readonly HomeServiceKey[];
  status: HomeServicesStatus;
  /** Re-read the set, for the empty state's and sheet's retry. */
  reload: () => Promise<void>;
  /** Add an app at the end of the strip; resolves the message to show, or null. */
  add: (key: HomeServiceKey) => Promise<string | null>;
  /** Remove an app; resolves the message to show, or null. */
  remove: (key: HomeServiceKey) => Promise<string | null>;
  /**
   * Replace the strip's order with `next` (ADR-0202). The drag and the keyboard
   * both land here, and both hand over the whole list rather than a delta.
   */
  reorder: (next: readonly HomeServiceKey[]) => Promise<string | null>;
}

const NO_APPS: readonly HomeServiceKey[] = [];

const HomeServicesContext = createContext<HomeServicesContextValue>({
  order: NO_APPS,
  status: 'ready',
  reload: async () => {},
  add: async () => null,
  remove: async () => null,
  reorder: async () => null,
});

export function useHomeServices() {
  return useContext(HomeServicesContext);
}

/** The catalog's order, with the member's order applied; unknown keys dropped. */
function sanitize(value: unknown): HomeServiceKey[] {
  if (!Array.isArray(value)) return [];

  const known = new Set<string>(HOME_SERVICE_ROUTES);
  const seen = new Set<string>();

  return value.filter((key): key is HomeServiceKey => {
    if (typeof key !== 'string' || !known.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The guest's tabs follow the account's, so a merge never shuffles what is already there. */
function merge(account: readonly HomeServiceKey[], guest: readonly HomeServiceKey[]) {
  return [...account, ...guest.filter((key) => !account.includes(key))];
}

/**
 * The homepage's apps (ADR-0146): the account's set when signed in, the
 * device's list for a guest, and a union of the two on sign-in.
 *
 * A guest's list lives in `localStorage` and is cleared after it has been
 * written to the account, so the next sign-in does not re-merge a stale strip.
 * A failed account read keeps the device's list and marks the status failed:
 * the sheet can retry, and the homepage shows what the device knows rather than
 * pretending the member has no apps.
 *
 * Writes move the strip before the server answers and move it back if the
 * server refuses: a toggle that waits on a round trip feels broken, and one that
 * stays moved after a refusal is a lie about what the next load will show.
 *
 * Writes are also serialised (ADR-0202). Every write is the whole ordered list,
 * so two of them in flight can land out of order and leave the server on the
 * older list — a drag that crosses two slots quickly used to be exactly that
 * race. One write at a time, in the order the member made them, and the last
 * accepted list is the one a refusal rolls back to.
 */
export function HomeServicesProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const userId = user?.id ?? null;
  const [order, setOrder] = useState<readonly HomeServiceKey[]>(NO_APPS);
  const [status, setStatus] = useState<HomeServicesStatus>('loading');

  /** The order the member sees, readable from callbacks without a stale render. */
  const orderRef = useRef<readonly HomeServiceKey[]>(NO_APPS);
  /** The last list the account accepted (or the device holds); the rollback target. */
  const confirmedRef = useRef<readonly HomeServiceKey[]>(NO_APPS);
  /** The tail of the write chain: one PUT at a time, in the order they were made. */
  const writesRef = useRef<Promise<unknown>>(Promise.resolve());

  const apply = useCallback((next: readonly HomeServiceKey[]) => {
    orderRef.current = next;
    setOrder(next);
  }, []);

  const load = useCallback(
    async (active?: () => boolean) => {
      if (!userId) {
        const guest = sanitize(readGuestHomeServices());
        if (active && !active()) return;
        confirmedRef.current = guest;
        apply(guest);
        setStatus('ready');
        return;
      }

      try {
        const account = sanitize(await getHomeServices());
        const guest = sanitize(readGuestHomeServices());
        let next = account;

        if (guest.length > 0) {
          next = merge(account, guest);
          const result = await replaceHomeServices(next);
          if (result.success) {
            next = sanitize(result.data ?? next);
            clearGuestHomeServices();
          }
        }

        if (active && !active()) return;
        confirmedRef.current = next;
        apply(next);
        setStatus('ready');
      } catch {
        if (active && !active()) return;
        const guest = sanitize(readGuestHomeServices());
        confirmedRef.current = guest;
        apply(guest);
        setStatus('failed');
      }
    },
    [apply, userId]
  );

  useEffect(() => {
    if (isLoading) return;

    let active = true;
    setStatus('loading');
    void load(() => active);

    return () => {
      active = false;
    };
  }, [isLoading, load]);

  const reload = useCallback(async () => {
    setStatus('loading');
    await load();
  }, [load]);

  const save = useCallback(
    async (next: readonly HomeServiceKey[]) => {
      const previous = orderRef.current;
      const target = sanitize(next);
      apply(target);

      if (!userId) {
        if (!writeGuestHomeServices(target)) {
          apply(previous);
          return 'تعذَّر حفظ تطبيقاتك على هذا الجهاز.';
        }
        confirmedRef.current = target;
        return null;
      }

      const run = writesRef.current.then(async () => {
        const result = await replaceHomeServices(target);

        if (!result.success) {
          // Only the newest write owns the strip: a rollback from an older one
          // would undo the move the member has already made.
          if (orderRef.current === target) apply(confirmedRef.current);
          return result.error ?? '';
        }

        const landed = sanitize(result.data ?? target);
        confirmedRef.current = landed;
        if (orderRef.current === target) apply(landed);
        return null;
      });

      writesRef.current = run.catch(() => null);
      return run;
    },
    [apply, userId]
  );

  const add = useCallback(
    async (key: HomeServiceKey) => {
      const current = orderRef.current;
      if (current.includes(key)) return null;
      return save([...current, key]);
    },
    [save]
  );

  const remove = useCallback(
    async (key: HomeServiceKey) => {
      const current = orderRef.current;
      if (!current.includes(key)) return null;
      return save(current.filter((item) => item !== key));
    },
    [save]
  );

  const reorder = useCallback(
    async (next: readonly HomeServiceKey[]) => {
      const target = sanitize(next);
      const current = orderRef.current;
      if (
        target.length === current.length &&
        target.every((key, index) => key === current[index])
      ) {
        return null;
      }
      return save(target);
    },
    [save]
  );

  const value = useMemo(
    () => ({ order, status, reload, add, remove, reorder }),
    [order, status, reload, add, remove, reorder]
  );

  return <HomeServicesContext.Provider value={value}>{children}</HomeServicesContext.Provider>;
}
