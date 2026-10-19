'use client';

import { SyncStatusPill } from '@/frontend/ui/shared/sync-status-pill';
import type { QuranReaderState } from '@/frontend/state/quran/use-quran-reader';

/**
 * The reader's sync state (ADR-0027), rendered by the components that already
 * hold the store rather than by a second call to the hook.
 *
 * A guest sees nothing here: with no account there is nothing to send, and a
 * pill reading "offline — 2 waiting" would describe a queue that does not exist.
 *
 * The element itself is always rendered, with the three facts the offline suite
 * needs to wait on rather than guess: the store is open (a press before that
 * cannot be queued), the session has arrived (before that the write would land in
 * the guest database and never reach the account), and how many intents are still
 * owed. They are attributes rather than the pill's Arabic, which is a message to
 * a reader and free to change.
 */
export function QuranSyncStatus({ reader }: { reader: QuranReaderState }) {
  return (
    <div
      data-quran-ready={reader.ready ? 'true' : 'false'}
      data-quran-signed-in={reader.isSignedIn ? 'true' : 'false'}
      data-quran-pending={reader.pending}
      className="flex justify-center"
    >
      {reader.isSignedIn ? <SyncStatusPill status={reader} /> : null}
    </div>
  );
}
