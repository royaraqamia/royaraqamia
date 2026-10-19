'use client';

import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import type { QuranReaderState } from '@/frontend/state/quran/use-quran-reader';

/**
 * The reader's sync state (ADR-0027), rendered by the components that already
 * hold the store rather than by a second call to the hook.
 *
 * A guest sees nothing here: with no account there is nothing to send, and a
 * pill reading "offline — 2 waiting" would describe a queue that does not exist.
 * The `data-quran-ready` marker is rendered either way, because the offline
 * suite waits on it before it drives a write (a store that is still opening
 * cannot queue one).
 */
export function QuranSyncStatus({ reader }: { reader: QuranReaderState }) {
  return (
    <div data-quran-ready={reader.ready ? 'true' : 'false'} className="flex justify-center">
      {reader.isSignedIn ? <SyncStatusPill status={reader} /> : null}
    </div>
  );
}
