import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { loadOwnFollowList } from '@/backend/loaders/follows';
import { FOLLOW_LIST_PAGE_SIZE } from '@/shared/contracts/follows';
import { FollowListView } from '../_components/follow-list-view';

/**
 * The caller's own followers.
 *
 * Private by construction: the list is read for the session's own member, never
 * for the handle in the address, so the handle is a check rather than a key - a
 * visitor who edits it to another member's name gets not-found, and a visitor
 * with no session is sent to sign in with the way back attached.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'المتابِعون',
  robots: { index: false, follow: false },
};

function decodeHandle(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return Math.min(parsed, 1000);
}

export default async function FollowersPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ username }, { page }] = await Promise.all([props.params, props.searchParams]);
  const handle = decodeHandle(username);
  const requested = parsePage(page);

  const data = await loadOwnFollowList('followers', requested);

  if (!data.signedIn) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/u/${handle}/followers`)}`);
  }
  if (!data.page || data.username !== handle) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <FollowListView
        username={handle}
        kind="followers"
        members={data.page.members}
        total={data.page.total}
        page={requested}
        pageSize={FOLLOW_LIST_PAGE_SIZE}
      />
    </div>
  );
}
