package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.CommunityPostResponse
import java.net.URLEncoder

/**
 * One published community post, on the route the page serves (#922).
 *
 * The page reads the post through `loadCommunityPost` in its server component;
 * this is that read as a body on the same slug (`GET /api/community/{slug}`), so
 * the app draws the post, its public publisher and its tags rather than a
 * narrower projection of the same row. Like the feed, a post is public — a guest
 * reads it with no account — so the read carries no bearer.
 *
 * A slug the server knows nothing about is a `404`, and that is translated to
 * [CommunityPostResult.NotFound] here rather than in the screen: the difference
 * between "this post is not there" and "the read did not happen" is the route's
 * answer, not a rendering choice.
 */
class CommunityPostRepository(private val client: ApiClient) {
    suspend fun post(slug: String): CommunityPostResult =
        when (val result = client.getPublic<CommunityPostResponse>(pathOf(slug))) {
            is ApiResult.Success -> CommunityPostResult.Live(result.value)
            is ApiResult.Failure ->
                if (result.error is ApiError.Server && result.error.status == NOT_FOUND) {
                    CommunityPostResult.NotFound
                } else {
                    CommunityPostResult.Unavailable(result.error)
                }
        }

    companion object {
        const val NOT_FOUND = 404

        /** The route one post lives at, with the slug encoded the way the page spells it. */
        fun pathOf(slug: String): String = "/api/community/${URLEncoder.encode(slug, "UTF-8")}"
    }
}

/** What one read of a post came to. */
sealed interface CommunityPostResult {
    /** The server answered with the post. */
    data class Live(val post: CommunityPostResponse) : CommunityPostResult

    /** The server answered, and has no published post under this slug. */
    data object NotFound : CommunityPostResult

    /** The read never reached an answer, or the answer was not the contract. */
    data class Unavailable(val error: ApiError) : CommunityPostResult
}
