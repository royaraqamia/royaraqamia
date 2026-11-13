import { createFollowsService } from '@/backend/config/follows';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { FollowRefusedError } from '@/backend/services/users/follows-service';
import { UsernameSchema } from '@/shared/contracts/users';
import type { FollowToggleResponse } from '@/shared/contracts/follows';

/**
 * Follow and unfollow, one handle at a time.
 *
 * Both routes answer the same shape (`FollowToggleResponse`) so a client can
 * decode one contract whether it pressed the button or released it, and the
 * counts it returns are the member's numbers after the write - the header
 * updates from this answer instead of asking again.
 *
 * Nothing is revalidated. The numbers and the viewer's standing are rendered by
 * the page for the viewer who asked (a dynamic profile, a dynamic feed), so there
 * is no cached document holding a count that this write could make stale. The
 * roster's names live under their own tag and a follow does not change a name.
 */
export async function followMember(username: string, headers: Headers): Promise<HttpResult> {
  return write(username, headers, 'follow');
}

export async function unfollowMember(username: string, headers: Headers): Promise<HttpResult> {
  return write(username, headers, 'unfollow');
}

/**
 * The viewer's standing with one member, for the client that draws its own
 * header.
 *
 * This route had no `GET` while the site was its only reader: the page renders
 * the standing for the viewer who asked, so a second read would only make the
 * header settle after paint. The app has no server render, so this is that
 * read. It answers the same body the two writes do, which is why the app
 * decodes one contract for all three calls, and it is never cached: the answer
 * is one viewer's edge.
 */
export async function getFollowState(username: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const parsed = UsernameSchema.safeParse(username);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          state: 'not_following',
          error: parsed.error.issues[0]?.message ?? 'معرِّف غير صالح',
        });
      }

      try {
        const { state, counts } = await createFollowsService().standingOf(userId, parsed.data);
        const body: FollowToggleResponse = { success: true, state, counts };
        return jsonResult(200, body, { headers: { 'cache-control': 'no-store' } });
      } catch (error) {
        if (error instanceof FollowRefusedError) {
          return jsonResult(error.status, {
            success: false,
            state: 'not_following',
            error: error.message,
          });
        }
        throw error;
      }
    },
    {
      mapError: () =>
        jsonResult(500, {
          success: false,
          state: 'not_following',
          error: 'تعذّرت قراءة حالة المتابعة. حاول مرة أخرى.',
        }),
    }
  );
}

async function write(
  username: string,
  headers: Headers,
  action: 'follow' | 'unfollow'
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, state: 'not_following', error: 'طلب غير مسموح' });
      }

      const parsed = UsernameSchema.safeParse(username);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          state: 'not_following',
          error: parsed.error.issues[0]?.message ?? 'معرِّف غير صالح',
        });
      }

      const service = createFollowsService();

      try {
        const result =
          action === 'follow'
            ? await service.follow(userId, parsed.data)
            : await service.unfollow(userId, parsed.data);

        const body: FollowToggleResponse = {
          success: result.state !== 'blocked',
          state: result.state,
          counts: result.counts,
          error: result.state === 'blocked' ? 'لا يمكن متابعة هذا العضو.' : undefined,
        };

        return jsonResult(result.state === 'blocked' ? 403 : 200, body);
      } catch (error) {
        if (error instanceof FollowRefusedError) {
          return jsonResult(error.status, {
            success: false,
            state: 'not_following',
            error: error.message,
          });
        }
        throw error;
      }
    },
    {
      mapError: () =>
        jsonResult(500, {
          success: false,
          state: 'not_following',
          error: 'تعذَّر تحديث المتابعة. حاول مرة أخرى.',
        }),
    }
  );
}
