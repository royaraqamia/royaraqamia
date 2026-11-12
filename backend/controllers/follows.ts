import { createFollowsService } from '@/backend/config/follows';
import { identity } from '@/backend/config/identity';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { FollowRefusedError } from '@/backend/services/users/follows-service';
import { UsernameSchema } from '@/shared/contracts/users';
import type { FollowToggleResponse } from '@/shared/contracts/follows';
import { COMMUNITY_TAGS } from '@/backend/shared/community-cache-tags';

/**
 * Follow and unfollow, one handle at a time.
 *
 * Both routes answer the same shape (`FollowToggleResponse`) so a client can
 * decode one contract whether it pressed the button or released it, and the
 * counts it returns are the member's numbers after the write - the header does
 * not need a second read to stay honest.
 *
 * The profile pages are cached (300s), and their counts are part of the cached
 * document, so a write revalidates the two tags those pages carry. A stale
 * count for a few minutes would be worse than the cost of one re-render.
 */
export async function followMember(username: string, headers: Headers): Promise<HttpResult> {
  return write(username, headers, 'follow');
}

export async function unfollowMember(username: string, headers: Headers): Promise<HttpResult> {
  return write(username, headers, 'unfollow');
}

/**
 * The profile header's one read: the member's public counts and the viewer's
 * standing. Open to guests on purpose - the numbers are public, and a guest's
 * standing is `not_following`, which is a fact rather than a refusal.
 *
 * `no-store`: the counts are shared, but the standing is not, and one response
 * carrying both must not be cached for the next visitor.
 */
export async function getFollowProfile(username: string): Promise<HttpResult> {
  const parsed = UsernameSchema.safeParse(username);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      state: 'not_following',
      error: parsed.error.issues[0]?.message ?? 'معرِّف غير صالح',
    });
  }

  const { user } = await identity.resolveSession();

  try {
    const { state, counts, memberId } = await createFollowsService().profile(
      parsed.data,
      user?.id ?? null
    );
    return jsonResult(
      200,
      { success: true, state, counts, memberId },
      { headers: { 'Cache-Control': 'no-store' } }
    );
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

        return jsonResult(result.state === 'blocked' ? 403 : 200, body, {
          tags: [COMMUNITY_TAGS.members, COMMUNITY_TAGS.memberByUsername],
        });
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
