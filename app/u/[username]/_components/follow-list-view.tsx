import Link from 'next/link';
import { Users } from 'lucide-react';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { FollowButton } from '@/frontend/ui/shared/follow-button';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Button } from '@/frontend/ui/primitives/button';
import type { FollowListEntry } from '@/shared/contracts/follows';
import { FOLLOW_COPY } from '@/frontend/ui/shared/follow-copy';

interface FollowListViewProps {
  kind: 'followers' | 'following';
  members: FollowListEntry[];
  total: number;
  page: number;
  pageSize: number;
}

function displayName(member: FollowListEntry): string {
  return member.name?.trim() || `@${member.username}`;
}

/**
 * The owner's own follower or following list.
 *
 * A row is three things - who, their handle, and the way to their profile - and
 * the one control that belongs to a list of people: follow or unfollow, in the
 * state the server already returned for this row (`FollowListEntry.following`).
 * The lists are private, so the state is the owner's own edge and needs no read
 * of its own; the page renders one row per member instead of one button per row
 * fetched later.
 *
 * The other member's list is not a 404 here: the page is only ever rendered for
 * its owner (the route refuses anyone else), so a visitor who reaches this
 * address has already been answered elsewhere.
 */
export function FollowListView({ kind, members, total, page, pageSize }: FollowListViewProps) {
  const title =
    kind === 'followers' ? FOLLOW_COPY.followersListTitle : FOLLOW_COPY.followingListTitle;
  const emptyCopy = kind === 'followers' ? FOLLOW_COPY.followersEmpty : FOLLOW_COPY.followingEmpty;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
        <SectionTitle as="h1">
          <SectionTitleHighlight>{title}</SectionTitleHighlight>
        </SectionTitle>
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} variant="card" title={emptyCopy} />
      ) : (
        <ul className="flex flex-col gap-1 rounded-3xl border border-border/60 bg-card/40 p-3 shadow-sm">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-2">
              <Link
                href={`/u/${encodeURIComponent(member.username)}`}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 transition-safe duration-200 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <MemberAvatar
                  name={member.name}
                  avatarUrl={member.avatar_url}
                  size="md"
                  sizes="40px"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">
                    {displayName(member)}
                  </span>
                  {/* `dir="ltr"` keeps a Latin handle in its own order; `text-end`
                      puts it under the start of the name, where the eye reads it,
                      instead of at the far edge of the row. */}
                  <span className="block truncate text-end text-xs text-muted-foreground" dir="ltr">
                    @{member.username}
                  </span>
                </span>
              </Link>
              <FollowButton
                username={member.username}
                name={member.name}
                memberId={member.id}
                initialState={member.following ? 'following' : 'not_following'}
                signedIn
                className="shrink-0 pe-2"
              />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <nav
          className="mt-6 flex items-center justify-center gap-3"
          aria-label="تصفّح صفحات القائمة"
        >
          {page > 1 && (
            <Link href={`?page=${page - 1}`}>
              <Button variant="outline" size="sm" className="rounded-full px-4">
                السابق
              </Button>
            </Link>
          )}
          <span className="text-xs font-bold text-muted-foreground">
            {page} من {pageCount}
          </span>
          {page < pageCount && (
            <Link href={`?page=${page + 1}`}>
              <Button variant="outline" size="sm" className="rounded-full px-4">
                التالي
              </Button>
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
