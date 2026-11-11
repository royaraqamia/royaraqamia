'use client';

import { Link2 } from 'lucide-react';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { LINKSNAP_COPY } from './linksnap-copy';

/**
 * The links list has nothing in it, so the screen says what is missing and stops
 * there — the shortener card above the list is the one control that fills it, and
 * a second button that only scrolled to it was a duplicate door.
 */
export function DashboardEmptyState() {
  return (
    <EmptyState
      icon={Link2}
      variant="card"
      title={LINKSNAP_COPY.emptyTitle}
      description={LINKSNAP_COPY.emptyBody}
    />
  );
}
