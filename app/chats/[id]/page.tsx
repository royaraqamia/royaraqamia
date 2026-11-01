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
 */
export const dynamic = 'force-dynamic';

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <Suspense fallback={<ThreadFallback />}>
        <ChatThreadView conversationId={id} />
      </Suspense>
    </main>
  );
}

/** What the route paints while the thread's chunk resolves. */
function ThreadFallback() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
      <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
    </div>
  );
}
