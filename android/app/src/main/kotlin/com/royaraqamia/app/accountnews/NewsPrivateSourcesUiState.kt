package com.royaraqamia.app.accountnews

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * The private-sources list's three states (#950).
 *
 * A guest sees nothing here rather than a guest prompt: the page's component
 * returns null when there is no session, because the checklist above is the one
 * place that asks them to sign in.
 */
sealed interface NewsPrivateSourcesUiState {
    data object Loading : NewsPrivateSourcesUiState

    data object Failed : NewsPrivateSourcesUiState

    data class Ready(val summary: NewsPrivateSources) : NewsPrivateSourcesUiState

    companion object {
        fun from(result: ApiResult<NewsPrivateSources>): NewsPrivateSourcesUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (result.error) {
                        is ApiError.Network,
                        is ApiError.Server,
                        is ApiError.InvalidContract -> Failed
                        ApiError.NotSignedIn -> Failed
                    }
            }
    }
}
