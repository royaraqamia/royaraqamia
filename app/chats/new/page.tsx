import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NewChatView } from '@/frontend/ui/chats/new-chat-view';

export const metadata: Metadata = {
  title: 'محادثة جديدة',
  description: 'ابدأ محادثة مع عضو.',
  robots: { index: false, follow: false },
};

/** Account-scoped and resolved per request, like the thread it leads to. */
export const dynamic = 'force-dynamic';

export default function NewChatPage() {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:px-6">
      <Suspense fallback={<NewChatFallback />}>
        <NewChatView />
      </Suspense>
    </main>
  );
}

function NewChatFallback() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs">
      <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      <p className="text-sm font-medium text-muted-foreground">جاري التَّحميل...</p>
    </div>
  );
}
