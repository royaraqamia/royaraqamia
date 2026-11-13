package com.royaraqamia.app.profile

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.ChatOkResponse
import com.royaraqamia.app.contracts.generated.CommunityMemberResponse
import com.royaraqamia.app.contracts.generated.FollowToggleResponse
import java.net.URLEncoder

/** What one read of a member's profile came to (#927). */
sealed interface ProfileResult {
    /** The server answered with the member and their first page of posts. */
    data class Live(val profile: CommunityMemberResponse) : ProfileResult

    /** The server answered, and has no visible member under this handle. */
    data object NotFound : ProfileResult

    /** The read never reached an answer, or the answer was not the contract. */
    data class Unavailable(val error: ApiError) : ProfileResult
}

/**
 * One public member profile, on the handle the page serves (#927).
 *
 * The page reads the member through `loadCommunityMember` in its server
 * component; this is that read as a body on the same handle (`GET /api/u/{username}`),
 * so the app draws the header and posts the visitor sees rather than a narrower
 * projection of the rows. A profile is public — a guest reads it with no account
 * — so the read carries no bearer ([ApiClient.getPublic]).
 *
 * A handle the server refuses is a `404`: the page's `notFound()`, which is also
 * what a hidden member gets (ADR-0127). That is translated to
 * [ProfileResult.NotFound] here rather than in the screen, because the difference
 * between "this member is not there" and "the read did not happen" is the route's
 * answer, not a rendering choice.
 */
class ProfileRepository(private val client: ApiClient) {
    suspend fun profile(username: String): ProfileResult =
        when (val result = client.getPublic<CommunityMemberResponse>(pathOf(username))) {
            is ApiResult.Success -> ProfileResult.Live(result.value)
            is ApiResult.Failure ->
                if (result.error is ApiError.Server && result.error.status == NOT_FOUND) {
                    ProfileResult.NotFound
                } else {
                    ProfileResult.Unavailable(result.error)
                }
        }

    /**
     * The viewer's standing with this member, and the member's two numbers.
     *
     * The page renders the same reading into its header, so the app asks the
     * route that answers it (`GET /api/users/{username}/follow`) rather than
     * folding identity into the public profile read — that body stays one
     * cacheable document for every visitor.
     */
    suspend fun standing(username: String): ApiResult<FollowToggleResponse> =
        client.get(followPath(username))

    /** The write half: the same body the read answers, so a press updates the header. */
    suspend fun follow(username: String): ApiResult<FollowToggleResponse> =
        client.post(followPath(username), null)

    suspend fun unfollow(username: String): ApiResult<FollowToggleResponse> =
        client.delete(followPath(username))

    /**
     * Lift a block, by the member's id.
     *
     * Blocking is the site's own row (`blocks`, one table for chat and the
     * feed), so the unblock face answers the same route the account page's
     * blocked list calls — the app's second caller of it, not a second rule.
     */
    suspend fun unblock(memberId: String): ApiResult<Unit> =
        when (val result = client.delete<ChatOkResponse>("$BLOCKS_PATH/$memberId")) {
            is ApiResult.Success ->
                if (result.value.success) {
                    ApiResult.Success(Unit)
                } else {
                    ApiResult.Failure(ApiError.Server(200, result.value.error.orEmpty()))
                }
            is ApiResult.Failure -> result
        }

    companion object {
        const val NOT_FOUND = 404

        private const val BLOCKS_PATH = "/api/chats/blocks"

        /** The route one profile lives at, with the handle encoded the way the page spells it. */
        fun pathOf(username: String): String =
            "/api/u/${URLEncoder.encode(username, "UTF-8")}"

        /** The follow graph's route for one handle: the same on all three methods. */
        fun followPath(username: String): String =
            "/api/users/${URLEncoder.encode(username, "UTF-8")}/follow"
    }
}
