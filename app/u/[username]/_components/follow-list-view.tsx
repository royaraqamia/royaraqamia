import Link from 'next/link';
import { Users } from 'lucide-react';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { Button } from '@/frontend/ui/primitives/button';
import type { FollowListEntry } from '@/shared/contracts/follows';
import { FOLLOW_COPY } from '@/frontend/ui/shared/follow-copy';

interface FollowListViewProps {
  username: string;
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
 * no control of its own: the lists exist to be read, and the follow button lives
 * on the profile it belongs to. That keeps one button per member on the site
 * instead of one per surface.
 *
 * The other member's list is not a 404 here: the page is only ever rendered for
 * its owner (the route refuses anyone else), so a visitor who reaches this
 * address has already been answered elsewhere.
 */
export function FollowListView({
  username,
  kind,
  members,
  total,
  page,
  pageSize,
}: FollowListViewProps) {
  const title =
    kind === 'followers' ? FOLLOW_COPY.followersListTitle : FOLLOW_COPY.followingListTitle;
  const emptyCopy = kind === 'followers' ? FOLLOW_COPY.followersEmpty : FOLLOW_COPY.followingEmpty;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        <Link
          href={`/u/${encodeURIComponent(username)}`}
          className="text-sm font-bold text-muted-foreground transition-safe duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-full px-2 py-1"
        >
          عودة إلى الملف
        </Link>
      </header>

      {members.length === 0 ? (
        <EmptyState icon={Users} variant="card" title={emptyCopy} />
      ) : (
        <ul className="flex flex-col gap-1 rounded-3xl border border-border/60 bg-card/40 p-3 shadow-sm">
          {members.map((member) => (
            <li key={member.id}>
              <Link
                href={`/u/${encodeURIComponent(member.username)}`}
                className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-safe duration-200 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
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
                  <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                    @{member.username}
                  </span>
                </span>
              </Link>
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
