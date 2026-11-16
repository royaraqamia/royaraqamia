import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NewChatView } from '@/frontend/ui/chats/new-chat-view';
import { LoadingThread } from '@/frontend/ui/shared/loading-skeletons';

export const metadata: Metadata = {
  title: 'محادثة جديدة',
  description: 'ابدأ محادثة مع عضو.',
  robots: { index: false, follow: false },
};

/** Account-scoped and resolved per request, like the thread it leads to. */
export const dynamic = 'force-dynamic';

export default function NewChatPage() {
  return (
    <main
      id="main-content"
      className="flex h-[calc(100dvh-var(--roy-keyboard-cover,0px))] w-full flex-col overflow-hidden pb-0 pt-[var(--roy-safe-top)] sm:mx-auto sm:max-w-3xl sm:p-6"
    >
      <Suspense fallback={<NewChatFallback />}>
        <NewChatView />
      </Suspense>
    </main>
  );
}

/**
 * What the route paints while the view's chunk resolves: the thread's own
 * fallback, because this screen is that surface before the request is sent.
 */
function NewChatFallback() {
  return <LoadingThread label="جاري التَّحميل..." />;
}
