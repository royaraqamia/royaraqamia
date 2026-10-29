import { identity } from '@/backend/config/identity';
import type { HttpResult } from '@/backend/transport/http-result';
import {
  handleAuthenticated,
  type HandlerPolicy,
  type SessionIdentity,
} from '@/backend/transport/authenticated-handler';

/**
 * Handler adapter for a request-scoped identity. A request that carried
 * `Authorization: Bearer` is resolved from that token and receives a client
 * carrying it; a request without one follows the session cookie exactly as
 * before. Handlers only ever see the user and a client scoped to that user.
 */
export function withAuthenticatedUser(
  run: (identity: SessionIdentity) => Promise<HttpResult>,
  policy: HandlerPolicy = {}
): Promise<HttpResult> {
  return handleAuthenticated(
    async () => {
      const { user, client } = await identity.resolveSession();
      if (!user) return null;
      return {
        userId: user.id,
        userEmail: user.email ?? '',
        supabase: client,
      };
    },
    run,
    policy
  );
}
