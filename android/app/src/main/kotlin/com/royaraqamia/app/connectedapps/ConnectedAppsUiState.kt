package com.royaraqamia.app.connectedapps

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the connected-apps card can show (#657, ADR-0098): the four states the site
 * draws — the skeleton, the guest's way in, the failure with its retry, and the
 * list (empty or not).
 *
 * They are separate cases because the card's next move differs in each, and
 * because the site draws them separately: a guest is pointed at sign-in rather
 * than shown an empty list, and a failure that is not a sign-in gets the retry.
 * [Ready] carries the list itself rather than a flag, so "connected" and "none
 * connected" are one state with two renderings, which is what the site's
 * `hasConnectedApps` decides.
 *
 * [from] is the whole decision, in one place, so the card is a rendering of this
 * value and a test can hold every branch without a Compose runtime.
 */
sealed interface ConnectedAppsUiState {
    /** The read is out; the card draws the site's skeleton. */
    data object Loading : ConnectedAppsUiState

    /** There is no session, so there is no list to read. */
    data object SignedOut : ConnectedAppsUiState

    /**
     * The read did not produce a list: no network, a server error, or a drifted
     * body. One state for all three because the site answers all three the same
     * way — the retry is the same action either way.
     */
    data object Failed : ConnectedAppsUiState

    /** The server's list, which may be empty. */
    data class Ready(val apps: List<ConnectedApp>) : ConnectedAppsUiState {
        val isEmpty: Boolean
            get() = apps.isEmpty()
    }

    companion object {
        fun from(result: ApiResult<List<ConnectedApp>>): ConnectedAppsUiState =
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
