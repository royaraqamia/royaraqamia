'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';
import { PROFILE_CHAT_COPY } from './profile-chat-copy';

/**
 * The «مراسلة» button on a public profile.
 *
 * A member has nothing to say to themselves, so the button is absent on their
 * own page. It is decided on the client on purpose: `/u/[username]` is a shared,
 * revalidated document (ISR), and reading the session on the server would make
 * it per-visitor for everyone.
 */
export function MemberChatCta({ username }: { username: string }) {
  const { profileUsername, isLoading } = useSession();

  // Undecided while the session resolves — and it renders nothing on the server
  // for the same reason, so the first client paint matches the document.
  if (isLoading) return null;

  const mine = profileUsername?.trim().toLowerCase() === username.trim().toLowerCase();
  if (mine) return null;

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
