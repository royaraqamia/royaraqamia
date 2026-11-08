package com.royaraqamia.app.news

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoard

/**
 * What the news digest is showing (#926).
 *
 * The site's page has the same faces: a digest, the last digest this device saw
 * under a banner saying so, and a read that failed. The app keeps the two
 * failures apart for the reason ADR-0031 gives — an unreachable server is not an
 * empty digest, and neither is a server that refused — so [Unavailable] carries
 * which answer the request got.
 *
 * A day with no digest is not a separate state: it is a live board whose `day`
 * is null, and the screen says which kind of empty it is from the board's own
 * `hasAnyDigest`.
 *
 * The loading face is "null" in the screen and is drawn as the recipe's
 * skeleton, because there is no sentence to say while nothing is known.
 */
sealed interface NewsDigestUiState {
    /** The board the server answered just now. */
    data class Live(val board: NewsBoardResponseBoard) : NewsDigestUiState

    /** The last board this device saw, because this read could not be answered. */
    data class Snapshot(val board: NewsBoardResponseBoard) : NewsDigestUiState

    /** Nothing to show: no answer and nothing kept. [offline] is which answer failed. */
    data class Unavailable(val offline: Boolean) : NewsDigestUiState

    companion object {
        /** One read as a state. */
        fun of(result: NewsDigestResult): NewsDigestUiState =
            when (result) {
                is NewsDigestResult.Live -> Live(result.board)
                is NewsDigestResult.Snapshot -> Snapshot(result.board)
                is NewsDigestResult.Unavailable ->
                    Unavailable(offline = result.error is ApiError.Network)
            }
    }
}
