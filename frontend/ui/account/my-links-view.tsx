'use client';

import { useSession } from '@/frontend/state/session-provider';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { GUEST_IDENTITY } from '@/frontend/shared/local-store/identity';
import { LinkDashboard } from '@/frontend/ui/linksnap/link-dashboard';
import { DashboardSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { LinksnapProvider } from '@/frontend/state/linksnap/linksnap-context';

/**
 * The signed-in visitor's own LinkSnap shortcuts and their per-link analytics.
 * The list renders from the identity-scoped Local Store (offline-first); the
 * per-link analytics stay server-only and require a connection.
 *
 * The account's namespace is remembered on this device, so the list no longer
 * waits for `getSession()` to know whose it is (#493): only a device with no
 * remembered account has nothing to paint, and it is told to sign in. The token
 * is still the session's — the store's rows need none, but the write paths do.
 */
export function MyLinksView() {
  const { session, isLoading } = useSession();
  const { identity } = useLocalIdentity();
  const token = session?.access_token ?? '';

  if (identity === GUEST_IDENTITY) {
    return isLoading ? (
      <DashboardSkeleton />
    ) : (
      <SignInCta href="/auth/login?redirect=/account/links" />
    );
  }

  return (
    <LinksnapProvider identity={identity}>
      <LinkDashboard token={token} refreshTrigger={0} />
    </LinksnapProvider>
  );
}
