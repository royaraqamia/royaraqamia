import { createProfileService } from '@/backend/config/users';
import { usernameAvailabilityRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { UsernameTakenError } from '@/backend/services/users/profile-service';
import { UpdateUsernameSchema, UsernameSchema } from '@/shared/contracts/users';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';

/**
 * Live availability probe for the handle-editor. A 200 with `available: false`
 * (never a 4xx) so the client can distinguish "taken" from a transport failure;
 * the message is the same taken/invalid copy the PATCH path returns.
 */
export async function checkUsernameAvailability(username: string | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const rateLimitResult = await checkRateLimitApi(usernameAvailabilityRateLimitPolicy(userId));
      if (rateLimitResult) return rateLimitResult;

      if (typeof username !== 'string') {
        return jsonResult(200, { success: true, available: false, error: 'معرِّف غير صالح' });
      }

      const parsed = UsernameSchema.safeParse(username);
      if (!parsed.success) {
        return jsonResult(200, {
          success: true,
          available: false,
          error: parsed.error.issues[0]?.message ?? 'معرِّف غير صالح',
        });
      }

      const { available } = await createProfileService().checkUsername(userId, parsed.data);
      return jsonResult(200, {
        success: true,
        available,
        error: available ? undefined : 'المعرِّف مستخدم بالفعل',
      });
    },
    {
      mapError: () => jsonResult(500, { success: false, error: 'تعذَّر التحقق من المعرِّف' }),
    }
  );
}

/** Change the caller's public handle. Unique-violation maps to 409, not 500. */
export async function updateUsername(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const parsed = UpdateUsernameSchema.safeParse(body);
      if (!parsed.success) {
        const { fieldErrors, formErrors } = parsed.error.flatten();
        return jsonResult(400, {
          success: false,
          error: formErrors[0] ?? 'معرِّف غير صالح',
          errors: fieldErrors,
        });
      }

      try {
        const { username } = await createProfileService().updateUsername(
          userId,
          parsed.data.username
        );
        return jsonResult(
          200,
          { success: true, username },
          { tags: [COMMUNITY_TAGS.members, COMMUNITY_TAGS.memberByUsername] }
        );
      } catch (error) {
        if (error instanceof UsernameTakenError) {
          return jsonResult(409, {
            success: false,
            error: error.message,
            errors: { username: [error.message] },
          });
        }
        throw error;
      }
    },
    {
      mapError: () => jsonResult(500, { success: false, error: 'تعذَّر تحديث المعرِّف' }),
    }
  );
}
