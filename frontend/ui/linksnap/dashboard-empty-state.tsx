import { Link2 } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { HeroCtaButton, HeroCtaSheen } from '@/frontend/ui/shared/hero-cta-button';
import { LINKSNAP_COPY } from './linksnap-copy';

export function DashboardEmptyState() {
  return (
    <EmptyState
      icon={Link2}
      variant="card"
      title={LINKSNAP_COPY.emptyTitle}
      description={LINKSNAP_COPY.emptyBody}
      action={
        <HeroCtaButton asChild>
          <Link href="/linksnap">
            <HeroCtaSheen />
            <span className="relative z-10">{LINKSNAP_COPY.emptyAction}</span>
          </Link>
        </HeroCtaButton>
      }
    />
  );
}
