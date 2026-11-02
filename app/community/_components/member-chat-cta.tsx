'use client';

import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

import { useSession } from '@/frontend/state/session-provider';

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
      className="group/hc relative mt-5 inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-full border border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-6 text-sm font-bold text-white shadow-[0_10px_30px_-10px_rgba(147,51,234,0.5)] transition-safe duration-300 hover:from-purple-500 hover:via-violet-500 hover:to-indigo-500"
    >
      <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
      مراسلة
    </Link>
  );
}
