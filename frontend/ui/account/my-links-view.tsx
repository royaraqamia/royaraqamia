'use client';

import { useSession } from '@/frontend/state/session-provider';
import { LinkDashboard } from '@/frontend/ui/linksnap/link-dashboard';
import { DashboardSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { LinksnapProvider } from '@/frontend/state/linksnap/linksnap-context';

/**
 * The signed-in visitor's own LinkSnap shortcuts and their per-link analytics.
 * The list renders from the identity-scoped Local Store (offline-first); the
 * per-link analytics stay server-only and require a connection.
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

  return (
    <LinksnapProvider token={token} user={session?.user ?? null}>
      <LinkDashboard token={token} refreshTrigger={0} />
    </LinksnapProvider>
  );
}
