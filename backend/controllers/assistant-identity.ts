import { createSupabaseAssistantIdentityService } from '@/backend/config/chat';
import { AppError } from '@/backend/shared/errors';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type { AssistantIdentityResult } from '@/shared/contracts/assistant-identity';

/**
 * The member's own assistant identity (ADR-0224).
 *
 * Three handlers over one row: read it, replace it, reset it. The rules — the
 * name's alphabet and length, the tone's closed set, the reservation on the
 * site's names — are the contract's and are re-run here, so a request written by
 * hand is refused exactly as the form's would be. The answer is never cached:
 * a name is the member's, and a shared cache would hand it to the next reader.
 */

const CROSS_ORIGIN_REFUSAL = 'طلب من أصل غير معروف.';
const FAILED = 'تعذّر إتمام الطلب. الرجاء المحاولة مرة أخرى.';

function identityFailure(fallback: string) {
  return (error: unknown): HttpResult => {
    if (error instanceof AppError) {
      return jsonResult(error.statusCode, { success: false, error: error.message });
    }
    return jsonResult(500, { success: false, error: fallback });
  };
}

export async function readAssistantIdentity(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const identity = await createSupabaseAssistantIdentityService(supabase).read(userId);
      const body: AssistantIdentityResult = { success: true, identity };
      return jsonResult(200, body, { headers: NO_STORE });
    },
    { mapError: identityFailure(FAILED) }
  );
}

export async function saveAssistantIdentity(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }

      const identity = await createSupabaseAssistantIdentityService(supabase).save(userId, body);
      const answer: AssistantIdentityResult = { success: true, identity };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: identityFailure(FAILED) }
  );
}

export async function resetAssistantIdentity(headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }

      const identity = await createSupabaseAssistantIdentityService(supabase).reset(userId);
      const answer: AssistantIdentityResult = { success: true, identity };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: identityFailure(FAILED) }
  );
}
