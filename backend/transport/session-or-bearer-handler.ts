import { identity } from '@/backend/config/identity';
import type { AuthUser } from '@/backend/identity';
import type { HttpResult } from '@/backend/transport/http-result';
import {
  handleAuthenticated,
  type BearerIdentity,
  type HandlerPolicy,
} from '@/backend/transport/authenticated-handler';

/**
 * The forked credential seam: `Authorization: Bearer` when the request carries
 * one, else the session cookie.
 *
 * A page can name an identity with a token it holds in state; a background
 * realm cannot read that token, and does not need to — the browser attaches the
 * httpOnly session cookie to its same-origin fetches. Resolving both here keeps
 * the one implementation of "who is this?" in the identity module (ADR-0058,
 * ADR-0059) instead of teaching a product to re-authenticate itself.
 *
 * A rejected token falls through to the cookie rather than failing the request:
 * a stale token in page state is not evidence that the session is gone. The
 * optional reader is what keeps an unauthenticated public call (LinkSnap's
 * anonymous shorten) from paying for an auth round-trip it cannot use.
 */
export async function resolveBearerOrSessionUser(
  authorization: string | null
): Promise<AuthUser | null> {
  const bearer = await identity.resolveBearer(authorization);
  if (bearer) return bearer;

  const { user } = await identity.resolveOptional();
  return user;
}

/** Handler adapter for a route that accepts either credential. */
export function withSessionOrBearerUser(
  authorization: string | null,
  run: (identity: BearerIdentity) => Promise<HttpResult>,
  policy: HandlerPolicy = {}
): Promise<HttpResult> {
  return handleAuthenticated(
    async () => {
      const user = await resolveBearerOrSessionUser(authorization);
      if (!user) return null;
      return { userId: user.id, userEmail: user.email ?? '' };
    },
    run,
    policy
  );
}
