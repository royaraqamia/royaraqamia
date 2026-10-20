import type { LinkRecord, LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { listLinksIncludingDeleted, type ShortenedLink } from '@/frontend/api/linksnap';

/**
 * The server half of LinkSnap's reconciliation, as a plain function (ADR-0060).
 *
 * Two callers, one implementation: the surface pulls with it on mount, focus,
 * reconnect and a Realtime hint, and the background tier pulls with it when
 * nobody is looking (`refresh-products.ts`). The read authenticates with the
 * session cookie, so a worker or the shell's drain page can run it without a
 * token it could never read. The merge is the store's own last-write-wins,
 * pending-aware one, so a pull cannot overwrite an undelivered write.
 *
 * Returns how many rows the server sent, which is all a refresh can report.
 */
export async function pullLinksnapData(store: LinksnapLocalStore): Promise<number> {
  const server = await listLinksIncludingDeleted();
  await store.mergeServerData(server.map(serverToRecord));
  return server.length;
}

function serverToRecord(link: ShortenedLink): LinkRecord {
  return {
    clientId: link.clientId ?? link.code,
    code: link.code,
    originalUrl: link.originalUrl,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt ?? link.createdAt,
    expiresAt: link.expiresAt,
    isBlocked: link.isBlocked,
    passwordProtected: Boolean(link.passwordProtected),
    deletedAt: link.deletedAt ?? null,
  };
}
