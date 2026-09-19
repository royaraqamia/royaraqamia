import { getAuthenticatedUser } from '@/backend/middleware/bearer-auth';
import type { HttpResult } from '@/backend/transport/http-result';
import {
  handleAuthenticated,
  type BearerIdentity,
  type HandlerPolicy,
} from '@/backend/transport/authenticated-handler';

/** Handler adapter for `Authorization: Bearer <token>` clients. */
export function withBearerUser(
  authorization: string | null,
  run: (identity: BearerIdentity) => Promise<HttpResult>,
  policy: HandlerPolicy = {}
): Promise<HttpResult> {
  return handleAuthenticated(
    async () => {
      const user = await getAuthenticatedUser(authorization);
      if (!user) return null;
      return { userId: user.id, userEmail: user.email ?? '' };
    },
    run,
    policy
  );
}
