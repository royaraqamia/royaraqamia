import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ChatThreadView } from '@/frontend/ui/chats/chat-thread-view';

export const metadata: Metadata = {
  title: 'محادثة',
  description: 'محادثة في رؤيَة رَقَميَّة.',
  robots: { index: false, follow: false },
};

/**
 * A conversation is account-scoped and answered per request: the thread is read
 * on the client, where the session's own client is the reader RLS expects. The
 * route is a data-free shell, like the account area's pages.
 *
 * A phone gets the whole screen: no page padding, no centred column, so the
 * header meets the app's chrome and the composer meets the keyboard the way a
 * messaging app does. The centred column returns from `sm` up.
 */
export const dynamic = 'force-dynamic';

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main
      id="main-content"
      className="w-full pb-0 pt-0 sm:mx-auto sm:max-w-3xl sm:px-6 sm:pb-16 sm:pt-6"
    >
      <Suspense fallback={<ThreadFallback />}>
        <ChatThreadView conversationId={id} />
      </Suspense>
    </main>
  );
}

/** What the route paints while the thread's chunk resolves. */
function ThreadFallback() {
  return (
    <div className="flex flex-col items-center justify-center border-y border-border/70 bg-card/60 px-4 py-14 text-center sm:rounded-2xl sm:border sm:shadow-xs">
      <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
    </div>
  );
}
