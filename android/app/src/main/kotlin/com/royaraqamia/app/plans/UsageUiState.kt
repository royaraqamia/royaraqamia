package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the plan card can show (#647, #501).
 *
 * The four states are the four things a member can actually experience, and they
 * are separate cases because the card's next move differs in each: a skeleton
 * while the read is out, the counters, a sign-in when there is no session, and a
 * retry when the read failed. Folding "signed out" into a generic error would
 * leave a guest reading "تعذّر تحميل بيانات اشتراكك" for a condition they can
 * fix in one tap.
 *
 * [from] is the whole decision, in one place, so a screen is a rendering of this
 * value and a test can hold every branch without a Compose runtime.
 */
sealed interface UsageUiState {
    /** The read is out; the card draws its skeleton. */
    data object Loading : UsageUiState

    /** The server answered and the counters are ready to draw. */
    data class Ready(val model: UsageScreenModel) : UsageUiState

    /** There is no session, so there is no usage to read. */
    data object SignedOut : UsageUiState

    /** The read did not produce usage: no network, a server error, or a drifted body. */
    data class Failed(val message: String) : UsageUiState

    companion object {
        /**
         * A settled read as a card state.
         *
         * The three failure kinds that are not a missing session share one
         * message because the site shares one: a member cannot act on the
         * difference between a 500 and an unreadable body, and the retry is the
         * same button either way. [ApiError.NotSignedIn] is the one failure with
         * a different answer.
         */
        fun from(result: ApiResult<UsageScreenModel>): UsageUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (result.error) {
                        ApiError.NotSignedIn -> SignedOut
                        is ApiError.Network,
                        is ApiError.Server,
                        is ApiError.InvalidContract -> Failed(UsageCopy.FAILED)
                    }
            }
    }
}
