'use client';

import { Link2 } from 'lucide-react';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { HeroCtaButton, HeroCtaSheen } from '@/frontend/ui/shared/hero-cta-button';
import { LINKSNAP_COPY } from './linksnap-copy';

/** The field the app's first action fills, on the shortener card above the list. */
const URL_FIELD_ID = 'original-url';

/**
 * The links list has nothing in it, so the only useful thing on screen is the
 * form that fills it.
 *
 * The button used to leave for `/linksnap`; that page is gone and the surface is
 * a tab of the door now (ADR-0156), so leaving would be a no-op on the only page
 * that draws it. It takes the member to the field instead — the card is already
 * above the list, so this is a scroll and a focus, not a second screen.
 */
function startFirstLink() {
  const field = document.getElementById(URL_FIELD_ID);
  if (!(field instanceof HTMLInputElement)) return;

  field.scrollIntoView({ behavior: 'smooth', block: 'center' });
  field.focus({ preventScroll: true });
}

export function DashboardEmptyState() {
  return (
    <EmptyState
      icon={Link2}
      variant="card"
      title={LINKSNAP_COPY.emptyTitle}
      description={LINKSNAP_COPY.emptyBody}
      action={
        <HeroCtaButton type="button" onClick={startFirstLink}>
          <HeroCtaSheen />
          <span className="relative z-10">{LINKSNAP_COPY.emptyAction}</span>
        </HeroCtaButton>
      }
    />
  );
}
