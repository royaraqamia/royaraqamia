'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

import { useSignInPrompt } from '@/frontend/ui/shared/use-sign-in-prompt';

import { PROFILE_CHAT_COPY } from './profile-chat-copy';

const CTA_CLASSES =
  'inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold text-muted-foreground transition-safe duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40';

/**
 * The «مراسلة» button on a public profile.
 *
 * A member has nothing to say to themselves, so the button is absent on their
 * own page. The page knows: it resolves the viewer's standing with this member
 * for the follow control anyway, and hands the answer down. So the decision is
 * in the first paint — no session to wait on, and nothing that appears and then
 * disappears once `/api/me` answers (#1375).
 *
 * A guest gets the same button, and pressing it opens the site's sign-in prompt
 * with this member's chat as the destination — the visitor stays on the profile
 * instead of being bounced through a route that would only ask the same
 * question (#1500).
 */
export function MemberChatCta({
  username,
  isSelf,
  signedIn,
}: {
  username: string;
  isSelf: boolean;
  /** Resolved by the page, so the button never waits on a session to decide. */
  signedIn: boolean;
}) {
  const { requireSignIn, dialog } = useSignInPrompt();

  if (isSelf) return null;

  const chatHref = `/chats/new?to=${encodeURIComponent(username)}`;
  const body = (
    <>
      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
      {PROFILE_CHAT_COPY.message}
    </>
  );

  if (!signedIn) {
    return (
      <>
        <button type="button" onClick={() => requireSignIn(chatHref)} className={CTA_CLASSES}>
          {body}
        </button>
        {dialog}
      </>
    );
  }

  return (
    <Link href={chatHref} className={CTA_CLASSES}>
      {body}
    </Link>
  );
}
