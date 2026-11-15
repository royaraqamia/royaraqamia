'use client';

import { usePathname } from 'next/navigation';

import { useScreenScope } from '@/frontend/state/use-screen-scope';
import { accountScreenScope } from '@/frontend/ui/account/account-screen-scope';

/**
 * The account page the member is on, registered for the turn (ADR-0181, #1421).
 *
 * It sits in the subtree's layout because the layout is the one component the
 * nine pages share; the pathname is what picks the row, so a page added under
 * `/account` is one line in the table and nothing here.
 */
export function AccountScreenScope() {
  useScreenScope(accountScreenScope(usePathname()));
  return null;
}
