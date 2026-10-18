'use client';

import dynamic from 'next/dynamic';
import { useSession } from '@/frontend/state/session-provider';
import { AdminSkeleton } from '@/frontend/ui/linksnap/loading-skeletons';
import { tolerateChunkFailure } from '@/frontend/ui/shared/lazy-chunk';

// The panel is client-side because it calls the LinkSnap admin API with the
// session bearer token. Route-level admin enforcement lives in the Admin Console
// layout, so this page can stay a plain client component.
const AdminPanel = dynamic(
  tolerateChunkFailure('LinkSnap admin panel', () =>
    import('@/frontend/ui/linksnap/admin-panel').then((m) => ({ default: m.AdminPanel }))
  ),
  {
    ssr: false,
    loading: () => <AdminSkeleton />,
  }
);

export default function AdminLinkSnapPage() {
  const { session, isLoading } = useSession();

  if (isLoading) {
    return <AdminSkeleton />;
  }

  return <AdminPanel token={session?.access_token ?? ''} />;
}
