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
 * The page is the surface's whole height, and it does not scroll: the thread's
 * own header and composer are its two fixed edges and only the messages move —
 * WhatsApp and Telegram's shape, at every width (#1021). `dvh` is what makes a
 * phone's collapsing URL bar and its on-screen keyboard shrink the surface
 * instead of drawing the composer underneath them, and the keyboard cover it
 * subtracts is Safari's, which shrinks only the visual viewport
 * (`frontend/ui/shared/keyboard-inset.ts`).
 */
export const dynamic = 'force-dynamic';

export default async function ChatThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main
      id="main-content"
      className="flex h-[calc(100dvh-var(--roy-keyboard-cover,0px))] w-full flex-col overflow-hidden pb-0 pt-[var(--roy-safe-top)] sm:mx-auto sm:max-w-3xl sm:p-6"
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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center border-border/70 bg-card/60 px-4 py-14 text-center sm:rounded-2xl sm:border sm:shadow-xs">
      <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
    </div>
  );
}
