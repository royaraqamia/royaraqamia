package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem

/**
 * What the community feed is showing (#658).
 *
 * The site's feed has the same faces: a list, an empty feed, a list this device
 * kept with a banner saying so, and a failed read. The app keeps the last two
 * apart for the reason ADR-0031 gives — an unreachable server is not an empty
 * feed, and neither is a server that refused — so `Unavailable` carries which of
 * the two answers the request got rather than flattening them into one sentence.
 *
 * The loading face is not a state: it is "null" in the screen, drawn as the
 * recipe's skeleton, because there is no sentence to say while nothing is known.
 */
sealed interface CommunityFeedUiState {
    /** The rows the server answered just now, and the cursor after them. */
    data class Live(
        val posts: List<CommunityIndexResponsePostsItem>,
        val nextCursor: String?,
    ) : CommunityFeedUiState

    /** The rows this device last saw, because this read could not be answered. */
    data class Snapshot(val posts: List<CommunityIndexResponsePostsItem>) : CommunityFeedUiState

    /** The server answered, and there are no posts to show. */
    data object Empty : CommunityFeedUiState

    /** Nothing to show: no answer and nothing kept. [offline] is which answer failed. */
    data class Unavailable(val offline: Boolean) : CommunityFeedUiState

    companion object {
        /** One read as a state, with an empty page folded into [Empty]. */
        fun of(result: CommunityFeedResult): CommunityFeedUiState =
            when (result) {
                is CommunityFeedResult.Live ->
                    if (result.page.posts.isEmpty()) {
                        Empty
                    } else {
                        Live(result.page.posts, result.page.nextCursor)
                    }
                is CommunityFeedResult.Snapshot ->
                    if (result.page.posts.isEmpty()) Empty else Snapshot(result.page.posts)
                is CommunityFeedResult.Unavailable -> Unavailable(offline = result.error is ApiError.Network)
            }
    }
}
