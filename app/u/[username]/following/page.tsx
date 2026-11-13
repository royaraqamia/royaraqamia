import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { loadOwnFollowList } from '@/backend/loaders/follows';
import { FOLLOW_LIST_PAGE_SIZE } from '@/shared/contracts/follows';
import { FollowListView } from '../_components/follow-list-view';

/**
 * The caller's own following list - the same private rule as the follower list
 * beside it: read for the session, checked against the handle, not keyed on it.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'المتابَعون',
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

export default async function FollowingPage(props: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ username }, { page }] = await Promise.all([props.params, props.searchParams]);
  const handle = decodeHandle(username);
  const requested = parsePage(page);

  const data = await loadOwnFollowList('following', requested);

  if (!data.signedIn) {
    redirect(`/auth/login?redirect=${encodeURIComponent(`/u/${handle}/following`)}`);
  }
  if (!data.page || data.username !== handle) notFound();

  // Same rule as the follower list: a page past the end is not an empty list,
  // so the reader is sent to the last page that exists rather than shown a
  // sentence about having no rows.
  const lastPage = Math.max(1, Math.ceil(data.page.total / FOLLOW_LIST_PAGE_SIZE));
  if (requested > lastPage) {
    redirect(`/u/${encodeURIComponent(handle)}/following?page=${lastPage}`);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <FollowListView
        kind="following"
        members={data.page.members}
        total={data.page.total}
        page={requested}
        pageSize={FOLLOW_LIST_PAGE_SIZE}
      />
    </div>
  );
}
