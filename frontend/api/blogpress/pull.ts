import type { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { getSyncSnapshot } from '@/frontend/api/blogpress';

/**
 * The server half of BlogPress's reconciliation, as a plain function (ADR-0060).
 *
 * Two callers, one implementation: the editor surface pulls with it on open,
 * focus, reconnect and a Realtime hint, and the background tier pulls with it
 * when nobody is looking (`refresh-products.ts`). The merge is the store's own
 * last-write-wins, pending-aware one (ADR-0029), so a pull can never overwrite
 * a write that has not been delivered yet, and it is idempotent — a whole-set
 * re-read costs a request, never state.
 *
 * The read is a full snapshot, like HabitFlow's and LinkSnap's: the counts are
 * author-scale, and the store's tombstone-aware merge makes "everything once"
 * simpler and safer than a cursor the store would have to advance carefully.
 *
 * Returns how many rows the server sent. That is all a refresh can honestly
 * report: it cannot know which of them were new.
 */
export async function pullBlogpressData(store: BlogpressLocalStore): Promise<number> {
  const snapshot = await getSyncSnapshot();
  await store.mergeServerData(snapshot.posts);
  return snapshot.posts.length;
}
