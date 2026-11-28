import { createSupabaseAssistantIdentityService } from '@/backend/config/chat';
import { avatarUploadRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { AppError } from '@/backend/shared/errors';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { AvatarValidationError } from '@/backend/services/users/avatar-file';
import type { AssistantIdentityResult } from '@/shared/contracts/assistant-identity';

/**
 * The member's own assistant identity (ADR-0224, ADR-0228).
 *
 * Three handlers over one row — read it, replace it, reset it — and two over its
 * face. The rules — the name's alphabet and length, the voice's closed set, the
 * tone's closed set, the reservation on the site's names — are the contract's and
 * are re-run here, so a request written by hand is refused exactly as the form's
 * would be. The answer is never cached: a name is the member's, and a shared
 * cache would hand it to the next reader.
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

/**
 * `POST /api/account/assistant/avatar`: store a face for the member's assistant
 * and answer the whole identity, so the page needs no second read (ADR-0228).
 * The bucket and the size limits are the member avatar's, not a second policy.
 */
export async function uploadAssistantAvatar(
  formData: FormData,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }

      const rateLimitResult = await checkRateLimitApi(avatarUploadRateLimitPolicy(userId));
      if (rateLimitResult) return rateLimitResult;

      const file = formData.get('file');
      if (!(file instanceof File)) {
        return jsonResult(400, { success: false, error: 'لم يتم توفير صورة' });
      }

      try {
        const identity = await createSupabaseAssistantIdentityService(supabase).updateAvatar(
          userId,
          file
        );
        const answer: AssistantIdentityResult = { success: true, identity };
        return jsonResult(200, answer, { headers: NO_STORE });
      } catch (error) {
        if (error instanceof AvatarValidationError) {
          return jsonResult(400, { success: false, error: error.message }, { headers: NO_STORE });
        }
        throw error;
      }
    },
    { mapError: identityFailure(FAILED) }
  );
}

/** `DELETE /api/account/assistant/avatar`: back to the orb. */
export async function removeAssistantAvatar(headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }

      const identity = await createSupabaseAssistantIdentityService(supabase).removeAvatar(userId);
      const answer: AssistantIdentityResult = { success: true, identity };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: identityFailure(FAILED) }
  );
}
