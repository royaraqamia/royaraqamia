'use client';

import { useSession } from '@/frontend/state/session-provider';
import { LinkDashboard } from '@/frontend/ui/linksnap/link-dashboard';
import { DashboardSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';

/**
 * The signed-in visitor's own LinkSnap shortcuts and their per-link analytics.
 * The dashboard talks to the LinkSnap API with the session token, so ownership
 * is enforced server-side; guests only ever see the sign-in prompt.
 */
export function MyLinksView() {
  const { session, isLoading } = useSession();
  const token = session?.access_token ?? '';

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (!token) {
    return <SignInCta href="/auth/login?redirect=/account/links" />;
  }

  return <LinkDashboard token={token} refreshTrigger={0} />;
}
