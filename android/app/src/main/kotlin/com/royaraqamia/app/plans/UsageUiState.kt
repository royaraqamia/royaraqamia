package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the plan card can show (#647, #501, ADR-0098).
 *
 * The four states are the four things a member can actually experience, and they
 * are separate cases because the card's next move differs in each: a skeleton
 * while the read is out, the counters, a sign-in when there is no session, and a
 * retry when the read failed. Folding "signed out" into a generic error would
 * leave a guest reading the failure sentence for a condition they can fix in one
 * tap — the site draws that state as a prompt, and so does the card.
 *
 * [Failed] carries no message: the words are [PlanCardCopy.FAILED], the same ones
 * the site renders, and a state that could carry a different sentence is a state
 * `npm run check:parity` could no longer prove is the site's.
 *
 * [from] is the whole decision, in one place, so a screen is a rendering of this
 * value and a test can hold every branch without a Compose runtime.
 */
sealed interface UsageUiState {
    /** The read is out; the card draws the site's skeleton. */
    data object Loading : UsageUiState

    /** The server answered and the rows are ready to draw. */
    data class Ready(val model: UsageScreenModel) : UsageUiState

    /** There is no session, so there is no usage to read. */
    data object SignedOut : UsageUiState

    /**
     * The read did not produce usage: no network, a server error, or a drifted
     * body. One state for all three because the site answers all three the same
     * way — a member cannot act on the difference, and the retry is the same
     * button either way. [ApiError.NotSignedIn] is the one failure that is not
     * this state.
     */
    data object Failed : UsageUiState

    companion object {
        /** A settled read as a card state. */
        fun from(result: ApiResult<UsageScreenModel>): UsageUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (result.error) {
                        ApiError.NotSignedIn -> SignedOut
                        is ApiError.Network,
                        is ApiError.Server,
                        is ApiError.InvalidContract -> Failed
                    }
            }
    }
}
