package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.generated.CommunityPostResponse

/**
 * What one community post is showing (#922).
 *
 * The site's post page has two faces the server decides: the post, or the root
 * not-found page when the slug has no published row. The app keeps the same two.
 * A read that did not reach an answer is not a third face of the post — it is the
 * shared read-failure/needs-connection notice, drawn over the same screen — so it
 * is kept out of this interface rather than given a sentence the page never says
 * (ADR-0031).
 *
 * A sealed interface so `docs/mobile/parity.json` can hold the two states against
 * the page's, and `check:parity` fails one the other side does not draw.
 */
sealed interface CommunityPostUiState {
    /** The server answered with the post, its publisher and its tags. */
    data class AtRest(val post: CommunityPostResponse) : CommunityPostUiState

    /** The server answered, and has no published post under the slug. */
    data class NotFound(val slug: String) : CommunityPostUiState

    companion object {
        /** One read as a state; `null` is a read that did not reach an answer. */
        fun of(result: CommunityPostResult, slug: String): CommunityPostUiState? =
            when (result) {
                is CommunityPostResult.Live -> AtRest(result.post)
                CommunityPostResult.NotFound -> NotFound(slug)
                is CommunityPostResult.Unavailable -> null
            }
    }
}
