'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { FollowButton } from '@/frontend/ui/shared/follow-button';
import { useSession } from '@/frontend/state/session-provider';
import type { PublicUser } from '@/shared/contracts/users';
import type { FollowState } from '@/shared/contracts/follows';
import { withPinnedSelf, type PinnedRoster, type ViewerMember } from './member-pin';

interface CommunityMembersProps {
  members: PublicUser[];
  /**
   * The viewer's standing with the members in this list, resolved by the page.
   *
   * `undefined` means no control is drawn: the public hub is one cached document
   * for every visitor, and a per-viewer button there would have to be fetched in
   * the browser - which is the round trip and the skeleton this shape exists to
   * avoid. The member's own feed passes it, because that page is already theirs.
   */
  states?: Record<string, FollowState>;
}

function displayName(member: PublicUser): string {
  return member.name?.trim() || `@${member.username}`;
}

/**
 * The roster with the viewer's own row pinned to the head.
 *
 * The list arrives from a cached, viewer-agnostic read, so who "you" are can
 * only be answered here, from the session; a guest gets the roster untouched.
 */
function usePinnedRoster(members: PublicUser[]): PinnedRoster {
  const { user, profileUsername, profileName, profileAvatarUrl } = useSession();

  return useMemo(() => {
    const viewer: ViewerMember | null =
      user && profileUsername
        ? {
            id: user.id,
            username: profileUsername,
            name: profileName,
            avatarUrl: profileAvatarUrl,
          }
        : null;

    return withPinnedSelf(members, viewer);
  }, [members, user, profileUsername, profileName, profileAvatarUrl]);
}

/**
 * The one difference the pinned row carries: a label, not a second card style.
 * It sits inside the name line so it never pushes the handle it shares a column
 * with, and it is `shrink-0` so a long name truncates instead of the label.
 */
function YouBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-1.5 text-[10px] font-bold leading-[14px] text-primary">
      أنت
    </span>
  );
}

/**
 * Desktop rail of members. Reads as part of the feed's right column —
 * deliberately quiet chrome so the gradient avatars carry the identity.
 */
export function CommunityMembersPanel({ members, states }: CommunityMembersProps) {
  const roster = usePinnedRoster(members);
  if (roster.members.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/40 shadow-sm">
      <header className="flex items-center gap-2 px-5 pt-5 pb-3">
        <Users className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground">أعضاء المجتمع</h2>
      </header>

      <ul className="dialog-scrollbar flex max-h-[60vh] flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {roster.members.map((member) => {
          const state = states?.[member.id];

          return (
            <li key={member.id} className="flex items-center gap-1">
              <Link
                href={`/u/${encodeURIComponent(member.username)}`}
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3 py-2.5 transition-safe duration-200 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <MemberAvatar
                  name={member.name}
                  avatarUrl={member.avatar_url}
                  size="sm"
                  sizes="36px"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">
                      {displayName(member)}
                    </span>
                    {member.id === roster.selfId && <YouBadge />}
                  </span>
                  <span className="block truncate text-end text-xs text-muted-foreground" dir="ltr">
                    @{member.username}
                  </span>
                </span>
                <ArrowLeft
                  className="size-4 shrink-0 text-primary opacity-0 transition-safe duration-200 group-hover:translate-x-[-2px] group-hover:opacity-100"
                  aria-hidden="true"
                />
              </Link>
              {/* One control per row, and its state arrived with the document.
                  The viewer's own row already carries «أنت» beside the name;
                  a follow button there would say the same thing twice. */}
              {state && member.id !== roster.selfId ? (
                <FollowButton
                  username={member.username}
                  name={member.name}
                  memberId={member.id}
                  initialState={state}
                  signedIn
                  className="shrink-0 pe-2"
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Mobile counterpart: a snap-scrolling row of member chips above the feed. */
export function CommunityMembersStrip({ members, states }: CommunityMembersProps) {
  const roster = usePinnedRoster(members);
  const listRef = useRef<HTMLUListElement>(null);

  // The pin lands after paint, on a scroller that was already laid out without
  // it: a run snapped a strip forward by one chip and left the pinned card off
  // screen to the right. Re-aim at the writing start (`scrollLeft` 0 is the
  // right edge in `rtl`) whenever a viewer's row is freshly pinned.
  useEffect(() => {
    if (roster.selfId && listRef.current) listRef.current.scrollLeft = 0;
  }, [roster.selfId]);

  if (roster.members.length === 0) return null;

  return (
    <section className="mb-8 lg:hidden" aria-label="أعضاء المجتمع">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Users className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-bold text-foreground">أعضاء المجتمع</h2>
      </div>
      <ul
        ref={listRef}
        className="scrollbar-none flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2"
      >
        {roster.members.map((member) => {
          const state = states?.[member.id];

          return (
            <li key={member.id} className="snap-start">
              <div className="flex w-24 flex-col items-center gap-1.5">
                <Link
                  href={`/u/${encodeURIComponent(member.username)}`}
                  className="group flex w-full flex-col items-center gap-2 rounded-2xl border border-transparent p-2.5 text-center transition-safe duration-200 hover:border-border/60 hover:bg-muted/30 focus-visible:border-border/60 focus-visible:outline-none"
                >
                  <MemberAvatar
                    name={member.name}
                    avatarUrl={member.avatar_url}
                    size="lg"
                    sizes="56px"
                  />
                  <span className="flex w-full min-w-0 items-center justify-center gap-1">
                    <span className="truncate text-xs font-bold text-foreground">
                      {displayName(member)}
                    </span>
                    {member.id === roster.selfId && <YouBadge />}
                  </span>
                  <span className="w-full truncate text-[10px] text-muted-foreground" dir="ltr">
                    @{member.username}
                  </span>
                </Link>
                {state && member.id !== roster.selfId ? (
                  <FollowButton
                    username={member.username}
                    name={member.name}
                    memberId={member.id}
                    initialState={state}
                    signedIn
                  />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
