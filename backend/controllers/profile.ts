import { createProfileService } from '@/backend/config/users';
import { UsernameTakenError } from '@/backend/services/users/profile-service';
import { UpdateUsernameSchema } from '@/shared/contracts/users';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';

/** Change the caller's public handle. Unique-violation maps to 409, not 500. */
export async function updateUsername(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const parsed = UpdateUsernameSchema.safeParse(body);
      if (!parsed.success) {
        const { fieldErrors, formErrors } = parsed.error.flatten();
        return jsonResult(400, {
          success: false,
          error: formErrors[0] ?? 'معرّف غير صالح',
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
      mapError: () => jsonResult(500, { success: false, error: 'تعذَّر تحديث المعرّف' }),
    }
  );
}
