'use client';

import { useMemo } from 'react';

import { useHiddenServices } from '@/frontend/state/hidden-services-provider';
import type { NavLink } from './NavDropdown';
import { SERVICES_LINK } from './services-link';

/**
 * `خدماتنا` without the rows this member hid (ADR-0112).
 *
 * One hook for the three surfaces that list the menu — the navbar dropdown, the
 * hero's sheet and the home row — so they cannot filter differently, and the
 * empty case is answered once: `isEmpty` says the member hid every row, which is
 * the caller's cue to draw no trigger and no section heading rather than an
 * affordance that opens nothing.
 *
 * The link keeps its identity when nothing is hidden, so a guest's render is the
 * same object the menu always had.
 */
export function useVisibleServices(): { link: NavLink; isEmpty: boolean } {
  const { hidden } = useHiddenServices();

  return useMemo(() => {
    const all = SERVICES_LINK.subItems ?? [];
    const subItems = all.filter((item) => !hidden.has(item.href));

    return {
      link: subItems.length === all.length ? SERVICES_LINK : { ...SERVICES_LINK, subItems },
      isEmpty: subItems.length === 0,
    };
  }, [hidden]);
}
