import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

import { PROFILE_CHAT_COPY } from './profile-chat-copy';

/**
 * The «مراسلة» button on a public profile.
 *
 * A member has nothing to say to themselves, so the button is absent on their
 * own page. The page knows: it resolves the viewer's standing with this member
 * for the follow control anyway, and hands the answer down. So the decision is
 * in the first paint — no session to wait on, and nothing that appears and then
 * disappears once `/api/me` answers (#1375).
 *
 * A guest is `false` here and gets the button; the chat route asks them to sign
 * in and brings them back to the member they picked.
 */
export function MemberChatCta({ username, isSelf }: { username: string; isSelf: boolean }) {
  if (isSelf) return null;

  return (
    <Link
      href={`/chats/new?to=${encodeURIComponent(username)}`}
      className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold text-muted-foreground transition-safe duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
      {PROFILE_CHAT_COPY.message}
    </Link>
  );
}
