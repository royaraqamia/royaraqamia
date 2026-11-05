package com.royaraqamia.app.accountnews

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * The four states the source checklist draws (#950, ADR-0098): the same skeleton,
 * guest prompt, failure and list the page's `news-preferences.tsx` draws.
 *
 * [SignedOut] is separate from [Failed] because a guest can act on it in one tap
 * and cannot act on a 500. The digest that reads the selection is on for every
 * account (ADR-0131), so there is nothing left to switch on here.
 */
sealed interface NewsPreferencesUiState {
    data object Loading : NewsPreferencesUiState

    data object SignedOut : NewsPreferencesUiState

    data object Failed : NewsPreferencesUiState

    data class Ready(
        val sources: List<NewsSource>,
        val selected: Set<String>,
    ) : NewsPreferencesUiState

    companion object {
        fun from(result: ApiResult<NewsSelection>): NewsPreferencesUiState =
            when (result) {
                is ApiResult.Success ->
                    Ready(
                        sources = result.value.sources,
                        selected = result.value.selected,
                    )
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
