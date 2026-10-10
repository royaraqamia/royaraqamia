import { request } from '@/frontend/transport/http';
import {
  PermanentSyncError,
  type SyncTransport,
} from '@/frontend/shared/local-store/sync-transport';

/**
 * Replays LinkSnap Outbox intents against the existing endpoints. `clientId` is
 * the client-minted identity; the server upserts on `(user_id, client_id)`, so a
 * replayed write is idempotent and a replayed delete re-sets the tombstone. The
 * LinkSnap API authenticates with a bearer token (unlike the cookie-scoped
 * product APIs), so the session token is threaded in here.
 */
export function createLinksnapHttpSyncTransport(getToken: () => string | null): SyncTransport {
  const authHeaders = () => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : undefined;
  };

  return {
    async send(entry) {
      const headers = authHeaders();
      switch (entry.type) {
        case 'link.create': {
          const { clientId, code, originalUrl, expiresAt, password, updatedAt } = entry.payload as {
            clientId: string;
            code: string;
            originalUrl: string;
            expiresAt: string | null;
            password?: string | null;
            updatedAt?: string;
          };
          await request('/linksnap/api/shorten', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              originalUrl,
              customCode: code,
              clientId,
              expiresAt,
              password: password ?? undefined,
              updatedAt,
            }),
          });
          return;
        }
        case 'link.update': {
          const { code, newCode, originalUrl, expiresAt, password, updatedAt, deletedAt } =
            entry.payload as {
              code: string;
              newCode?: string;
              originalUrl?: string;
              expiresAt?: string | null;
              password?: string | null;
              updatedAt?: string;
              deletedAt?: string | null;
            };
          await request('/linksnap/api/links', {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
              code,
              newCode,
              originalUrl,
              expiresAt,
              password,
              updatedAt,
              deletedAt,
            }),
          });
          return;
        }
        case 'link.delete': {
          const { code, updatedAt } = entry.payload as { code: string; updatedAt?: string };
          await request(`/linksnap/api/links?code=${encodeURIComponent(code)}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ updatedAt }),
          });
          return;
        }
        default:
          throw new PermanentSyncError(`Unknown outbox intent type: ${entry.type}`);
      }
    },
  };
}
