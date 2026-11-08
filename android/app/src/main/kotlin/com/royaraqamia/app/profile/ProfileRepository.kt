package com.royaraqamia.app.profile

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CommunityMemberResponse
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

    companion object {
        const val NOT_FOUND = 404

        /** The route one profile lives at, with the handle encoded the way the page spells it. */
        fun pathOf(username: String): String =
            "/api/u/${URLEncoder.encode(username, "UTF-8")}"
    }
}
