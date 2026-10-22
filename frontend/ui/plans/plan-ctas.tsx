'use client';

import { createContext, useContext, useMemo } from 'react';
import Link from 'next/link';

import { HeroCtaButton, HeroCtaSheen } from '@/frontend/ui/shared/hero-cta-button';
import { useMyUsage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { getWhatsAppUrl } from '@/frontend/shared/constants';
import { cn } from '@/frontend/shared/cn';
import type { PlanId } from '@/shared/contracts/plans';

const CURRENT_PLAN_LABEL = 'الخطَّة الحاليَّة';

/**
 * The two plan cards' calls to action.
 *
 * What each pill may do depends on a fact only the browser holds — whether the
 * reader is a member, and on which plan — so it resolves here instead of in the
 * cached page shell. One provider wraps both cards so the page makes a single
 * allowance read, and both pills wait behind a placeholder until it answers:
 * no layout shift, and no wrong label (or wrong destination) flashing first.
 *
 * A guest's free card sends them to `/auth/login` rather than `/auth/signup`:
 * the middleware bounces a signed-in session off every auth page to the home
 * page, and sign-up is one tap from the login form.
 */
type Viewer =
  | { status: 'pending' }
  | { status: 'guest' }
  | { status: 'member'; plan: PlanId; unlimited: boolean };

const PlanViewerContext = createContext<Viewer | null>(null);

export function PlanViewerProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useSession();
  const { state, loading } = useMyUsage(Boolean(user));

  const viewer = useMemo<Viewer>(() => {
    if (isLoading) return { status: 'pending' };
    if (!user) return { status: 'guest' };
    if (loading || !state) return { status: 'pending' };
    return { status: 'member', plan: state.plan, unlimited: state.unlimited };
  }, [isLoading, user, loading, state]);

  return <PlanViewerContext.Provider value={viewer}>{children}</PlanViewerContext.Provider>;
}

function usePlanViewer(): Viewer {
  const viewer = useContext(PlanViewerContext);
  if (!viewer) throw new Error('the plan pills render inside PlanViewerProvider');
  return viewer;
}

export function FreePlanCta() {
  const viewer = usePlanViewer();

  if (viewer.status === 'pending') return <PendingPill className="h-12" />;

  if (viewer.status === 'guest') {
    return (
      <Link
        href="/auth/login"
        className="mt-6 inline-flex h-12 items-center justify-center rounded-full border border-input/80 bg-background/80 px-6 text-sm font-bold text-foreground transition-safe hover:bg-accent/80"
      >
        ابدأ مجَّانًا
      </Link>
    );
  }

  // A member on the paid plan has nothing to do with the free card.
  if (viewer.unlimited || viewer.plan === 'pro') return null;

  return <CurrentPlanPill className="h-12">{CURRENT_PLAN_LABEL}</CurrentPlanPill>;
}

/** The paid card's WhatsApp action, or the current-plan label for a member. */
export function PaidPlanCta({ message }: { message: string }) {
  const viewer = usePlanViewer();

  if (viewer.status === 'pending') return <PendingPill className="h-13 sm:h-14" />;

  if (viewer.status === 'member' && (viewer.unlimited || viewer.plan === 'pro')) {
    return (
      <CurrentPlanPill className="h-13 text-base sm:h-14">{CURRENT_PLAN_LABEL}</CurrentPlanPill>
    );
  }

  return (
    <HeroCtaButton asChild className="mt-6 w-full">
      <a href={getWhatsAppUrl(message)} target="_blank" rel="noopener noreferrer">
        <HeroCtaSheen />
        <span className="relative z-10">اشترِك الآن</span>
      </a>
    </HeroCtaButton>
  );
}

/** The pill a member sees where the action would be: present, but dead. */
function CurrentPlanPill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-disabled="true"
      className={cn(
        'mt-6 inline-flex w-full cursor-not-allowed items-center justify-center rounded-full border border-border/60 bg-muted/40 px-6 text-sm font-bold text-muted-foreground',
        className
      )}
    >
      {children}
    </span>
  );
}

/** Reserves the pill's footprint while the browser works out who is reading. */
function PendingPill({ className }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="جاري تحديد خطَّتك"
      className={cn('mt-6 w-full animate-pulse rounded-full bg-muted/30', className)}
    />
  );
}
