import type { ReactNode } from 'react';
import type { Metadata } from 'next';

import { ASSISTANT_HOME_COPY } from '@/frontend/ui/assistant/assistant-home-copy';

export const metadata: Metadata = {
  title: ASSISTANT_HOME_COPY.eyebrow,
  description: ASSISTANT_HOME_COPY.lead,
};

/**
 * The assistant's page frame (ADR-0224).
 *
 * The same shape as `/account`: a full-height column, one `main` and a centred
 * column of content. It is left open to guests on purpose — the view answers a
 * guest with the sign-in card rather than a 404, so a bookmark or a door on a
 * device that signed out still lands somewhere that explains itself.
 */
export default function AssistantLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[var(--roy-page-height)] flex-col bg-background text-foreground">
      <main id="main-content" className="flex-1 pt-6">
        <div className="mx-auto w-full max-w-3xl px-4 pb-16">{children}</div>
      </main>
    </div>
  );
}
