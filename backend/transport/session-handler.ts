import { identity } from '@/backend/config/identity';
import type { HttpResult } from '@/backend/transport/http-result';
import {
  handleAuthenticated,
  type HandlerPolicy,
  type SessionIdentity,
} from '@/backend/transport/authenticated-handler';

/** Handler adapter for the session cookie: handlers receive the user and a scoped client. */
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
