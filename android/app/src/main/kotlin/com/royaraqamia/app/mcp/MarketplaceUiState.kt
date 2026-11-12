package com.royaraqamia.app.mcp

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * The store tab's answer, in the six shapes the page draws (#1256).
 *
 * The names are the parity row's states, so a state one client can draw and the
 * other cannot is a failing check rather than a member's surprise. Two of them
 * are the same "nothing here" told apart: [Empty] is a store nobody has
 * published to yet (ADR-0162's launch set is seeded daily), and [NoMatch] is a
 * search that found nothing — the page words them differently because the
 * member's next step is different.
 */
sealed interface MarketplaceUiState {
    /** A read is out and no cache answered it. */
    data object Loading : MarketplaceUiState

    /** The server refused, or answered a body the app could not read. */
    data object Failed : MarketplaceUiState

    /** The request never reached the server: the member's connection, not ours. */
    data object Offline : MarketplaceUiState

    /** The store has no published row at all. */
    data object Empty : MarketplaceUiState

    /** The term matched nothing. */
    data object NoMatch : MarketplaceUiState

    /** The rows the answer carried. */
    data class Ready(val servers: List<MarketplaceServer>) : MarketplaceUiState

    companion object {
        /** The page's rule: no rows is an empty store only when nothing was typed. */
        fun from(result: ApiResult<List<MarketplaceServer>>, term: String): MarketplaceUiState =
            when (result) {
                is ApiResult.Success ->
                    when {
                        result.value.isNotEmpty() -> Ready(result.value)
                        term.isBlank() -> Empty
                        else -> NoMatch
                    }
                is ApiResult.Failure ->
                    when (result.error) {
                        ApiError.NotSignedIn -> Failed
                        is ApiError.Network -> Offline
                        else -> Failed
                    }
            }
    }
}
