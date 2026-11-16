'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { FollowButton } from '@/frontend/ui/shared/follow-button';
import { FOLLOW_BUTTON_COPY } from '@/frontend/ui/shared/follow-button-copy';
import { useSession } from '@/frontend/state/session-provider';
import type { PublicUser } from '@/shared/contracts/users';
import type { FollowState } from '@/shared/contracts/follows';
import { withPinnedSelf, type PinnedRoster, type ViewerMember } from './member-pin';

interface CommunityMembersProps {
  members: PublicUser[];
  /**
   * The viewer's standing with the members in this list, resolved by the page.
   *
   * `undefined` means the page had no per-viewer read to attach: the public hub
   * is one cached document for every visitor, and a signed-in visitor's button
   * there would have to be fetched in the browser - which is the round trip and
   * the skeleton this shape exists to avoid. A guest is the exception the cache
   * already covers: a guest follows nobody, so the control is the same for all
   * of them and opens the sign-in prompt instead of a write.
   */
  states?: Record<string, FollowState>;
  /** The page a guest returns to after signing in. Defaults to the member's page. */
  signInReturnTo?: string;
}

function displayName(member: PublicUser): string {
  return member.name?.trim() || `@${member.username}`;
}

/**
 * The roster with the viewer's own row pinned to the head.
 *
 * The list arrives from a cached, viewer-agnostic read, so who "you" are can
 * only be answered here, from the session; a guest gets the roster untouched.
 * `guest` waits for the session to settle, so a signed-in visitor never sees
 * the guest control flash on a page that has no states to replace it.
 */
function useRoster(members: PublicUser[]): { roster: PinnedRoster; guest: boolean } {
  const { user, isLoading, profileUsername, profileName, profileAvatarUrl } = useSession();

  const roster = useMemo(() => {
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

  return { roster, guest: !isLoading && !user };
}

/**
 * The viewer's own row carries no control to press, so the slot that holds the
 * follow button everywhere else holds this label instead. It is the button's
 * own footprint — 40px tall, the same sideways padding — so the row keeps the
 * rhythm of the list and the name it used to sit beside is free to truncate.
 */
function SelfBadge() {
  return (
    <span className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 px-4 text-xs font-bold text-primary">
      {FOLLOW_BUTTON_COPY.you}
    </span>
  );
}

/**
 * The row's one control.
 *
 * A resolved state is the whole answer. Without one, the only viewer the cached
 * roster can word correctly is a guest — a guest follows nobody — so their
 * press opens the site's sign-in prompt instead of writing, and returns them to
 * the page they were reading. A signed-in visitor with no states is left
 * undrawn rather than shown a guess.
 *
 * The viewer's own row is the exception the session already answers: nobody
 * follows themselves, so that slot holds the «أنت» label.
 */
function MemberFollowControl({
  member,
  state,
  guest,
  self,
  signInReturnTo,
}: {
  member: PublicUser;
  state?: FollowState;
  guest: boolean;
  self: boolean;
  signInReturnTo?: string;
}) {
  if (self) return <SelfBadge />;

  if (state) {
    return (
      <FollowButton
        username={member.username}
        name={member.name}
        memberId={member.id}
        initialState={state}
        signedIn
      />
    );
  }

  if (!guest) return null;

  return (
    <FollowButton
      username={member.username}
      name={member.name}
      memberId={member.id}
      initialState="not_following"
      signedIn={false}
      signInReturnTo={signInReturnTo}
    />
  );
}

/**
 * Desktop rail of members. Reads as part of the feed's right column —
 * deliberately quiet chrome so the gradient avatars carry the identity.
 */
export function CommunityMembersPanel({ members, states, signInReturnTo }: CommunityMembersProps) {
  const { roster, guest } = useRoster(members);
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
                  <span className="block truncate text-sm font-bold text-foreground">
                    {displayName(member)}
                  </span>
                  <span className="block truncate text-end text-xs text-muted-foreground" dir="ltr">
                    @{member.username}
                  </span>
                </span>
                {member.id !== roster.selfId && (
                  <ArrowLeft
                    className="size-4 shrink-0 text-primary opacity-0 transition-safe duration-200 group-hover:translate-x-[-2px] group-hover:opacity-100"
                    aria-hidden="true"
                  />
                )}
              </Link>
              {/* One control per row, and its state arrived with the document.
                  The viewer's own row has nothing to follow, so that slot is
                  where «أنت» lands - the row reads like the others. */}
              <div className="shrink-0 pe-2">
                <MemberFollowControl
                  member={member}
                  state={state}
                  guest={guest}
                  self={member.id === roster.selfId}
                  signInReturnTo={signInReturnTo}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Mobile counterpart: a snap-scrolling row of member chips above the feed. */
export function CommunityMembersStrip({ members, states, signInReturnTo }: CommunityMembersProps) {
  const { roster, guest } = useRoster(members);
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
                  <span className="block w-full truncate text-xs font-bold text-foreground">
                    {displayName(member)}
                  </span>
                  <span className="w-full truncate text-[10px] text-muted-foreground" dir="ltr">
                    @{member.username}
                  </span>
                </Link>
                <MemberFollowControl
                  member={member}
                  state={state}
                  guest={guest}
                  self={member.id === roster.selfId}
                  signInReturnTo={signInReturnTo}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
