package com.royaraqamia.app.account

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the account page's allowance card can show (#947).
 *
 * The four faces are the ones the page's `UsageCard` has: the card at rest with
 * the plan in force, the skeleton while the read is out, the one sentence and
 * retry when the read cannot be trusted, and `Hidden`, which is a visitor — the
 * page renders nothing at all for a guest.
 *
 * They are separate cases because the card's next move differs in each, and
 * because `docs/mobile/parity.json` holds this list against the page's faces so
 * `npm run check:parity` fails a state that exists on one client only.
 */
sealed interface AccountUsageUiState {
    /** The read is out; the header shows the page's skeleton pill. */
    data object Loading : AccountUsageUiState

    /** The plan is known: the badge names it and the two links are drawn. */
    data class Ready(val plan: String, val unlimited: Boolean) : AccountUsageUiState

    /** The read did not produce a plan, so the card says so and offers a retry. */
    data object Failed : AccountUsageUiState

    /** There is no session: the page draws no card at all, so neither does the app. */
    data object Hidden : AccountUsageUiState

    companion object {
        /** A settled read as a card state, in one place a test can hold. */
        fun from(result: ApiResult<AccountUsage>): AccountUsageUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value.plan, result.value.unlimited)
                is ApiResult.Failure ->
                    when (result.error) {
                        ApiError.NotSignedIn -> Hidden
                        is ApiError.Network,
                        is ApiError.Server,
                        is ApiError.InvalidContract -> Failed
                    }
            }
    }
}
