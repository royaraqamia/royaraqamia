import { verifyKeyboardCredential } from '@/backend/services/keyboard/rewrite-credential';
import type { HttpResult } from '@/backend/transport/http-result';
import {
  handleAuthenticated,
  type BearerIdentity,
  type HandlerPolicy,
} from '@/backend/transport/authenticated-handler';

/**
 * The IME's own identity adapter (ADR-0220). It deliberately does not use
 * `withBearerUser`: that reader accepts a Supabase access token, and this
 * endpoint must accept only the short-lived rewrite credential minted from a
 * signed-in web session. A cookie on the request is ignored here as well.
 */
export function withKeyboardCredential(
  authorization: string | null,
  run: (identity: BearerIdentity) => Promise<HttpResult>,
  policy: HandlerPolicy = {}
): Promise<HttpResult> {
  return handleAuthenticated(
    async () => {
      const credential = verifyKeyboardCredential(authorization);
      if (!credential) return null;
      return { userId: credential.userId, userEmail: '' };
    },
    run,
    policy
  );
}
