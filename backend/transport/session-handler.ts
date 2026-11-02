import { identity } from '@/backend/config/identity';
import { jsonResult, toNextResponse, type HttpResult } from '@/backend/transport/http-result';
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

/**
 * The streaming half of the same seam.
 *
 * A route that answers an event stream cannot return an `HttpResult`, because
 * the body is written after the response exists. It still owes the caller the
 * same identity: resolved once, with the refusal built here rather than in the
 * route, so a stream that starts is always a stream from a signed-in member.
 */
export async function withAuthenticatedStream(
  run: (identity: SessionIdentity) => Promise<Response>
): Promise<Response> {
  try {
    const { user, client } = await identity.resolveSession();
    if (!user) return toNextResponse(jsonResult(401, { error: 'غير مصرح' }));

    return await run({
      userId: user.id,
      userEmail: user.email ?? '',
      supabase: client,
    });
  } catch {
    return toNextResponse(
      jsonResult(500, {
        success: false,
        error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
      })
    );
  }
}
