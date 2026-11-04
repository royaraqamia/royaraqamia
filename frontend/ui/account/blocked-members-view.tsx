'use client';

import { useCallback, useEffect, useState } from 'react';

import { getBlockedChatMembers, unblockChatUser } from '@/frontend/api/chats';
import { useSession } from '@/frontend/state/session-provider';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import type { ChatPeer } from '@/shared/contracts/chat';

import { BLOCKED_MEMBERS_COPY } from './blocked-members-copy';

/** `/account/blocked`: the members the account has blocked, and the action that lifts it. */
const BLOCKED_ROUTE = '/account/blocked';

/** The name a row shows: the member's own, or their handle when they have none. */
function memberName(member: ChatPeer): string {
  return member.name ?? member.username;
}

/**
 * The members the account has blocked, and the one action that lifts it.
 *
 * Blocking lives in the thread's menu, where the member is; this page is the
 * place it can be undone without finding that thread again — a blocked member
 * may not appear anywhere else in the product.
 *
 * The list is account data, so the page is a data-free shell like the rest of
 * `/account` (#448): a guest is pointed at sign-in, and the read runs on the
 * client.
 *
 * The page's heading lives here rather than in `page.tsx` so the app's screen
 * can draw the same sentence from the same generated copy (ADR-0098).
 */
export function BlockedMembersView() {
  const { user, isLoading: isSessionLoading } = useSession();
  const [members, setMembers] = useState<ChatPeer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lifting, setLifting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await getBlockedChatMembers());
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error && cause.message ? cause.message : BLOCKED_MEMBERS_COPY.loadFailed
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    void load();
  }, [load, user]);

  async function unblock(peer: ChatPeer) {
    setLifting(peer.id);
    try {
      await unblockChatUser(peer.id);
      setMembers((current) => current.filter((member) => member.id !== peer.id));
      setActionError(null);
    } catch (cause) {
      setActionError(
        cause instanceof Error && cause.message ? cause.message : BLOCKED_MEMBERS_COPY.unblockFailed
      );
    } finally {
      setLifting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div
        className="text-center flex flex-col items-center mb-8 sm:mb-10 lg:mb-12"
        data-visual="blocked-title"
      >
        <SectionTitle as="h1">
          <SectionTitleHighlight>{BLOCKED_MEMBERS_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </div>

      {isSessionLoading ? (
        <div
          data-visual="blocked-loading"
          aria-busy="true"
          className="rounded-2xl border border-border/70 bg-card/60 px-4 py-6 text-center"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          />
          <p className="text-xs font-medium text-muted-foreground">
            {BLOCKED_MEMBERS_COPY.loadingLabel}
          </p>
        </div>
      ) : !user ? (
        <div
          data-visual="blocked-signed-out"
          className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs"
        >
          <p className="text-sm font-bold text-foreground">{BLOCKED_MEMBERS_COPY.signedOutTitle}</p>
          <SignInCta
            href={`/auth/login?redirect=${encodeURIComponent(BLOCKED_ROUTE)}`}
            className="mt-4"
          >
            {BLOCKED_MEMBERS_COPY.signIn}
          </SignInCta>
        </div>
      ) : isLoading ? (
        <div
          data-visual="blocked-loading"
          aria-busy="true"
          className="rounded-2xl border border-border/70 bg-card/60 px-4 py-6 text-center"
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
          />
          <p className="text-xs font-medium text-muted-foreground">
            {BLOCKED_MEMBERS_COPY.loadingLabel}
          </p>
        </div>
      ) : loadError ? (
        <p
          role="alert"
          data-visual="blocked-error"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
        >
          {loadError}
        </p>
      ) : (
        <>
          {actionError ? (
            <p
              role="alert"
              data-visual="blocked-error"
              className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
            >
              {actionError}
            </p>
          ) : null}
          {members.length === 0 ? (
            <p
              data-visual="blocked-empty"
              className="rounded-2xl border border-border/70 bg-card/60 px-4 py-5 text-center text-xs text-muted-foreground/80"
            >
              {BLOCKED_MEMBERS_COPY.empty}
            </p>
          ) : (
            <ul
              data-visual="blocked-list"
              className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card/60"
            >
              {members.map((member, index) => {
                const name = memberName(member);
                return (
                  <li
                    key={member.id}
                    data-visual={`blocked-row-${index}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <MemberAvatar name={name} avatarUrl={member.avatarUrl} size="sm" ring={false} />
                    <div className="min-w-0 flex-1">
                      <p
                        data-visual={`blocked-name-${index}`}
                        className="truncate text-sm font-bold text-foreground"
                      >
                        {name}
                      </p>
                      <p
                        data-visual={`blocked-handle-${index}`}
                        className="truncate text-xs text-muted-foreground/70 text-end"
                        dir="ltr"
                      >
                        @{member.username}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-visual={`blocked-unblock-${index}`}
                      onClick={() => void unblock(member)}
                      disabled={lifting === member.id}
                      aria-label={BLOCKED_MEMBERS_COPY.unblockAria.replace('{name}', name)}
                      className="shrink-0 rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-foreground transition-safe hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
                    >
                      {BLOCKED_MEMBERS_COPY.unblock}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
