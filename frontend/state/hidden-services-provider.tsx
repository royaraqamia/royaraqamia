'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { getHiddenServices, replaceHiddenServices } from '@/frontend/api/hidden-services';
import { useSession } from '@/frontend/state/session-provider';
import type { HiddenServiceKey } from '@/shared/contracts/hidden-services';

/** Where the read stands. The menu only cares whether it has an answer. */
export type HiddenServicesStatus = 'loading' | 'ready' | 'failed';

interface HiddenServicesContextValue {
  /** The routes this member hid. Empty is the whole menu, which is the default. */
  hidden: ReadonlySet<string>;
  status: HiddenServicesStatus;
  /** Re-read the set, for the settings page's retry. */
  reload: () => Promise<void>;
  /** Write the whole set; resolves `null` or the message to show. */
  save: (next: readonly HiddenServiceKey[]) => Promise<string | null>;
}

const NO_HIDDEN: ReadonlySet<string> = new Set();

const HiddenServicesContext = createContext<HiddenServicesContextValue>({
  hidden: NO_HIDDEN,
  status: 'ready',
  reload: async () => {},
  save: async () => null,
});

export function useHiddenServices() {
  return useContext(HiddenServicesContext);
}

/**
 * The account's hidden services, read once per session and shared by the two
 * surfaces that list them: the `خدماتنا` menu and the home row (ADR-0112).
 *
 * Guests get an empty set — the whole menu — because the preference lives on the
 * account: there is nothing to read without one, and hiding must not become a
 * second, device-local truth that disagrees with the phone.
 *
 * A read that fails also answers the empty set. An empty set is the *safe*
 * failure: it shows today's menu, so a network blip costs a user nothing but the
 * absence of their trimming, whereas a failed read painted as "everything hidden"
 * would look like the product had lost its services. The settings page is the one
 * place that says a read failed, because there the user is trying to change it.
 */
export function HiddenServicesProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NO_HIDDEN);
  const [status, setStatus] = useState<HiddenServicesStatus>('loading');
  const userId = user?.id ?? null;

  const load = useCallback(async (active?: () => boolean) => {
    try {
      const keys = await getHiddenServices();
      if (active && !active()) return;
      setHidden(new Set(keys));
      setStatus('ready');
    } catch {
      if (active && !active()) return;
      setHidden(NO_HIDDEN);
      setStatus('failed');
    }
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (!userId) {
      setHidden(NO_HIDDEN);
      setStatus('ready');
      return;
    }

    let active = true;
    setStatus('loading');
    void load(() => active);

    return () => {
      active = false;
    };
  }, [isLoading, userId, load]);

  const reload = useCallback(async () => {
    setStatus('loading');
    await load();
  }, [load]);

  /**
   * The switch moves before the server answers, and moves back if it refuses:
   * a toggle that waits on a round trip feels broken, and a toggle that stays
   * moved after a refusal is a lie about what the menu will show next load.
   */
  const save = useCallback(
    async (next: readonly HiddenServiceKey[]) => {
      const previous = hidden;
      setHidden(new Set(next));

      const result = await replaceHiddenServices(next);
      if (!result.success) {
        setHidden(previous);
        return result.error ?? '';
      }

      setHidden(new Set(result.data ?? next));
      return null;
    },
    [hidden]
  );

  const value = useMemo(() => ({ hidden, status, reload, save }), [hidden, status, reload, save]);

  return <HiddenServicesContext.Provider value={value}>{children}</HiddenServicesContext.Provider>;
}
